import * as Location from 'expo-location';

import { apiClient } from './api-client';
import { Place, placeHasCoordinates } from '../types/place';
import { usableFix, FIX_MAX_AGE_MS, FIX_MAX_ACCURACY_M } from '../utils/location-quality';

// Simple in-memory cache for last known location (survives component remounts)
let cachedPlace: Place | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 15_000;

// Direct TS port of lib/services/location_service.dart, minus its
// dev-fallback path that called Photon directly when no backend was
// configured (the RN app always has a real backend). Unlike the Dart
// client, getRoute() goes through the backend's new GET /locations/route
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
// Age limit for the instant seed. Long enough to be useful on a warm start,
// short enough that it is still roughly where the rider is standing.
const SEED_MAX_AGE_MS = 2 * 60 * 1000;

export function clearCachedPlace(): void {
  cachedPlace = null;
  cachedAt = 0;
}

export async function getCurrentPlace(options?: { force?: boolean }): Promise<Place> {
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

  if (!options?.force && cachedPlace && Date.now() - cachedAt < CACHE_TTL_MS &&
      Date.now() - (cachedPlace.measuredAt ?? 0) < FIX_MAX_AGE_MS) return cachedPlace;

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
    const lastKnown = await Location.getLastKnownPositionAsync({ maxAge: SEED_MAX_AGE_MS, requiredAccuracy: FIX_MAX_ACCURACY_M });
    return lastKnown && usableFix(lastKnown, SEED_MAX_AGE_MS) ? placeFromPosition(lastKnown, 'seed') : null;
  } catch {
    return null;
  }
}

// Escalating attempts, each individually timed out because expo-location's
// getCurrentPositionAsync has no timeout option of its own and will otherwise
// wait indefinitely for a fix that may never arrive indoors.
export async function acquirePosition(): Promise<Location.LocationObject | null> {
  // A temporary watch is removable: unlike timing out getCurrentPositionAsync,
  // this does not leave native acquisition requests running after the deadline.
  return new Promise((resolve) => {
    let subscription: Location.LocationSubscription | undefined;
    let finished = false;
    const finish = (fix: Location.LocationObject | null) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      subscription?.remove();
      resolve(fix);
    };
    const timer = setTimeout(() => finish(null), 15_000);
    Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, timeInterval: 1000, distanceInterval: 0 },
      (fix) => { if (usableFix(fix)) finish(fix); },
      () => finish(null)
    ).then((watch) => {
      if (finished) watch.remove();
      else subscription = watch;
    }).catch(() => finish(null));
  });
}

function placeFromPosition(position: Location.LocationObject, source: 'gps' | 'seed'): Place {
  return { address: 'Current location', latitude: position.coords.latitude,
    longitude: position.coords.longitude, isCurrentLocation: source === 'gps',
    accuracyMeters: position.coords.accuracy!, measuredAt: position.timestamp, locationSource: source };
}

function cachePlace(position: Location.LocationObject): Place {
  const { latitude, longitude } = position.coords;
  const place = placeFromPosition(position, 'gps');
  cachedPlace = place;
  cachedAt = Date.now();

  apiClient
    .get<{ address: string }>(`/locations/reverse?lat=${latitude}&lng=${longitude}`)
    .then((json) => {
      if (cachedPlace && cachedPlace.latitude === latitude && cachedPlace.longitude === longitude) {
        cachedPlace = { ...cachedPlace, address: json.address };
      }
    })
    .catch(() => {});

  return place;
}

export async function searchLocations(query: string): Promise<Place[]> {
  if (query.trim().length < 2) return [];
  const json = await apiClient.get<{ results: any[] }>(`/locations/search?q=${encodeURIComponent(query)}`);
  return json.results.filter((r) => placeHasCoordinates(r)).map((r) => ({ address: r.address, latitude: r.latitude, longitude: r.longitude }));
}

export async function reverseGeocode(params: { latitude: number; longitude: number }): Promise<Place> {
  const json = await apiClient.get<{ address: string; latitude: number; longitude: number }>(
    `/locations/reverse?lat=${params.latitude}&lng=${params.longitude}`
  );
  return { address: json.address, latitude: json.latitude, longitude: json.longitude };
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

export async function getRoute(params: { from: Place; to: Place }): Promise<RouteResult | null> {
  if (!placeHasCoordinates(params.from) || !placeHasCoordinates(params.to)) {
    return null;
  }
  try {
    const json = await apiClient.get<RouteResult>(
      `/locations/route?fromLat=${params.from.latitude}&fromLng=${params.from.longitude}` +
        `&toLat=${params.to.latitude}&toLng=${params.to.longitude}`
    );
    if (json && Array.isArray(json.points) && json.points.length > 1 && json.points.every((p) => placeHasCoordinates({ address: '', ...p })) && Number.isFinite(json.distanceMeters) && json.distanceMeters >= 0 && Number.isFinite(json.durationSeconds) && json.durationSeconds >= 0) {
      return json;
    }
    // Backend returned an empty route (e.g. OSRM found nothing) — fall through
    // to the straight-line fallback so the map still shows the way.
  } catch {
    // fall through to the straight-line fallback below
  }

  // Always return a usable route: a simple great-circle line between pickup
  // and destination. OSRM's public demo instance has spotty road coverage in
  // Rwanda, so a booking map must never be left without any path drawn —
  // the green line is the "this is where we're going" signal the fare
  // estimate, tracking and pickup screens all rely on.
  const [latA, lngA] = [params.from.latitude!, params.from.longitude!];
  const [latB, lngB] = [params.to.latitude!, params.to.longitude!];
  const steps = 12;
  const points: RoutePoint[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    points.push({
      latitude: latA + (latB - latA) * t,
      longitude: lngA + (lngB - lngA) * t,
    });
  }
  const distanceMeters = Math.round(haversineM(latA, lngA, latB, lngB));
  const durationSeconds = Math.round((distanceMeters / 1000 / 25) * 3600); // ~25 km/h city speed
  return { points, distanceMeters, durationSeconds };
}

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
