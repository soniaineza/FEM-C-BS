import * as Location from 'expo-location';

import { apiClient } from './api-client';
import { Place } from '../types/place';

// Simple in-memory cache for last known location (survives component remounts)
let cachedPlace: Place | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

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

export async function getCurrentPlace(): Promise<Place> {
  const now = Date.now();
  if (cachedPlace && now - cachedAt < CACHE_TTL_MS) {
    return cachedPlace;
  }

  const enabled = await isLocationServiceEnabled();
  if (!enabled) throw new Error('Location services are turned off on this device.');

  const { status } = await Location.getForegroundPermissionsAsync();
  if (status !== Location.PermissionStatus.GRANTED) {
    throw new Error('Location permission was not granted.');
  }

  // Without a time limit a poor/no GPS fix hangs this forever — same
  // reasoning as the Flutter app's 10s timeLimit (see the now-deleted
  // location_service.dart, and the diagnostic fix in commit 5fd55b6).
  let position: Location.LocationObject;
  try {
    position = await withTimeout(
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
      8_000 // Reduced from 10s to 8s
    );
  } catch {
    throw new Error(
      "Couldn't get a GPS fix. Try again outdoors or with a clearer view of the sky, or enter your pickup location manually."
    );
  }

  const { latitude, longitude } = position.coords;
  // Return coordinates immediately - don't block on reverse geocoding
  const place: Place = { address: 'Current location', latitude, longitude, isCurrentLocation: true };
  
  // Cache immediately
  cachedPlace = place;
  cachedAt = now;

  // Fire-and-forget reverse geocoding to update address in background
  apiClient.get<{ address: string }>(
    `/locations/reverse?lat=${latitude}&lng=${longitude}`
  ).then((json) => {
    if (cachedPlace && cachedPlace.latitude === latitude && cachedPlace.longitude === longitude) {
      cachedPlace = { ...cachedPlace, address: json.address };
    }
  }).catch(() => {});

  return place;
}

export async function searchLocations(query: string): Promise<Place[]> {
  if (query.trim().length < 2) return [];
  const json = await apiClient.get<{ results: any[] }>(`/locations/search?q=${encodeURIComponent(query)}`);
  return json.results.map((r) => ({ address: r.address, latitude: r.latitude, longitude: r.longitude }));
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
  if (!params.from.latitude || !params.from.longitude || !params.to.latitude || !params.to.longitude) {
    return null;
  }
  try {
    const json = await apiClient.get<RouteResult>(
      `/locations/route?fromLat=${params.from.latitude}&fromLng=${params.from.longitude}` +
        `&toLat=${params.to.latitude}&toLng=${params.to.longitude}`
    );
    if (json && Array.isArray(json.points) && json.points.length > 1) {
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
  const [latA, lngA] = [params.from.latitude, params.from.longitude];
  const [latB, lngB] = [params.to.latitude, params.to.longitude];
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
