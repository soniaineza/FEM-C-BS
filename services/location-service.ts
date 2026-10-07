import * as Location from 'expo-location';

import { apiClient } from './api-client';
import { driverApiClient } from './driver-api-client';
import { useAppModeStore } from '../stores/useAppModeStore';
import { Place } from '../types/place';

// Simple in-memory cache for last known location (survives component remounts)
let cachedPlace: Place | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Direct TS port of lib/services/location_service.dart, minus its
// dev-fallback path that called Photon directly when no backend was
// configured (the RN app always has a real backend). Unlike the Dart
// client, getRoute() goes through the backend's GET /maps/route
// proxy instead of calling OSRM directly (approved deviation — see the
// migration plan's "Geocoding/routing" section).

export const MapDefaults = {
  latitude: -1.9441,
  longitude: 30.0619,
  zoom: 15,
};

export async function isLocationServiceEnabled(): Promise<boolean> {
  return Location.hasServicesEnabledAsync();
}

export async function checkPermission(): Promise<Location.PermissionStatus> {
  const { status } = await Location.getForegroundPermissionsAsync();
  return status;
}

export async function requestPermission(): Promise<Location.PermissionStatus> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  return status;
}

// Why getCurrentPlace can fail matters to the caller: a missing permission is
// recoverable by asking, a dead GPS fix is not, and only one of them should
// ever send the user to Settings.
export type LocationFailureReason = 'services-off' | 'permission' | 'no-fix';

export class LocationUnavailableError extends Error {
  readonly reason: LocationFailureReason;
  constructor(reason: LocationFailureReason, message: string) {
    super(message);
    this.name = 'LocationUnavailableError';
    this.reason = reason;
  }
}

// A cached fix is only worth reusing if it was good; a 2 km-accurate cell-tower
// read should not pin the pickup marker for five minutes.
const GOOD_ACCURACY_M = 100;
// Age limit for the instant seed. Long enough to be useful on a warm start,
// short enough that it is still roughly where the rider is standing.
const SEED_MAX_AGE_MS = 2 * 60 * 1000;

export function clearCachedPlace(): void {
  cachedPlace = null;
  cachedAt = 0;
}

export async function getCurrentPlace(options?: { force?: boolean }): Promise<Place> {
  const now = Date.now();
  if (!options?.force && cachedPlace && now - cachedAt < CACHE_TTL_MS) {
    return cachedPlace;
  }

  const enabled = await isLocationServiceEnabled();
  if (!enabled) {
    throw new LocationUnavailableError(
      'services-off',
      'Location services are turned off on this device.'
    );
  }

  const { status } = await Location.getForegroundPermissionsAsync();
  if (status !== Location.PermissionStatus.GRANTED) {
    throw new LocationUnavailableError('permission', 'Location permission was not granted.');
  }

  const position = await acquirePosition();
  if (!position) {
    throw new LocationUnavailableError(
      'no-fix',
      "Couldn't get a GPS fix. Try again outdoors or with a clearer view of the sky, or enter your pickup location manually."
    );
  }

  return cachePlace(position);
}

// A fast, cheap, possibly-stale fix with no GPS wait, so the map can move off
// the Kigali default immediately instead of sitting there for five seconds.
// Returns null when the device has nothing recent enough.
export async function getSeedPlace(): Promise<Place | null> {
  try {
    if (!(await isLocationServiceEnabled())) return null;
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== Location.PermissionStatus.GRANTED) return null;
    const lastKnown = await Location.getLastKnownPositionAsync({ maxAge: SEED_MAX_AGE_MS });
    return lastKnown ? cachePlace(lastKnown) : null;
  } catch {
    return null;
  }
}

// Escalating attempts, each individually timed out because expo-location's
// getCurrentPositionAsync has no timeout option of its own and will otherwise
// wait indefinitely for a fix that may never arrive indoors.
async function acquirePosition(): Promise<Location.LocationObject | null> {
  const attempts: Array<() => Promise<Location.LocationObject>> = [
    () =>
      Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
        mayShowUserSettingsDialog: true,
      }),
    () =>
      Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
        mayShowUserSettingsDialog: true,
      }),
    () =>
      Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Lowest,
        mayShowUserSettingsDialog: false,
      }),
  ];

  for (const attempt of attempts) {
    try {
      return await withTimeout(attempt(), 6_000);
    } catch {
      // try the next, cheaper accuracy
    }
  }

  // Nothing fresh available: an old fix still beats stranding the rider on the
  // city-centre default, so accept any age here.
  try {
    return await Location.getLastKnownPositionAsync();
  } catch {
    return null;
  }
}

function cachePlace(position: Location.LocationObject): Place {
  const { latitude, longitude, accuracy } = position.coords;
  const place: Place = {
    address: 'Current location',
    latitude,
    longitude,
    isCurrentLocation: true,
  };

  // Only let a good fix own the cache window; a vague one is returned to the
  // caller but re-read next time rather than held for the full TTL.
  const isGoodFix = accuracy == null || accuracy <= GOOD_ACCURACY_M;
  cachedPlace = place;
  cachedAt = isGoodFix ? Date.now() : 0;

  mapsClient()
    .get<{ address: string | null }>(`/maps/reverse?lat=${latitude}&lng=${longitude}`)
    .then((json) => {
      // No address known there: the coordinates still stand on their own.
      if (json.address && cachedPlace && cachedPlace.latitude === latitude && cachedPlace.longitude === longitude) {
        cachedPlace = { ...cachedPlace, address: json.address };
      }
    })
    .catch(() => {});

  return place;
}

export async function searchLocations(query: string): Promise<Place[]> {
  if (query.trim().length < 2) return [];
  const json = await mapsClient().get<{ results: any[] }>(`/maps/search?q=${encodeURIComponent(query.trim())}`);
  return json.results.map((r) => ({ address: r.address, latitude: r.latitude, longitude: r.longitude }));
}

export async function reverseGeocode(params: { latitude: number; longitude: number }): Promise<Place> {
  const json = await mapsClient().get<{ address: string | null; latitude: number; longitude: number }>(
    `/maps/reverse?lat=${params.latitude}&lng=${params.longitude}`
  );
  // Without an address the pin is still usable: show its coordinates.
  const address = json.address ?? `${json.latitude.toFixed(5)}, ${json.longitude.toFixed(5)}`;
  return { address, latitude: json.latitude, longitude: json.longitude };
}

export interface RoutePoint {
  latitude: number;
  longitude: number;
}

export interface RouteResult {
  points: RoutePoint[];
  distanceMeters: number;
  durationSeconds: number;
}

// Map lookups work for whoever is signed in: the rider client in the rider
// app, the driver client in the driver app.
function mapsClient() {
  return useAppModeStore.getState().mode === 'driver' ? driverApiClient : apiClient;
}

export async function getRoute(params: { from: Place; to: Place }): Promise<RouteResult | null> {
  if (!params.from.latitude || !params.from.longitude || !params.to.latitude || !params.to.longitude) {
    return null;
  }
  try {
    const json = await mapsClient().get<RouteResult>(
      `/maps/route?origin=${params.from.latitude},${params.from.longitude}` +
        `&destination=${params.to.latitude},${params.to.longitude}`
    );
    if (json && Array.isArray(json.points) && json.points.length > 1) {
      return json;
    }
  } catch {
    // No road route available right now: handled below.
  }

  // No route is better than a made-up one. A straight line between the two
  // points is not the way the car will go, and a duration invented from it
  // would be shown to the rider as the driver's ETA. Callers draw the pickup
  // and destination markers alone and show no ETA until the server's road
  // route is available again. Fares never depend on this: the server prices
  // every ride from its own route.
  return null;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      }
    );
  });
}
