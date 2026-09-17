import * as Location from 'expo-location';

import { apiClient } from './api-client';
import { Place } from '../types/place';

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
      10_000
    );
  } catch {
    throw new Error(
      "Couldn't get a GPS fix. Try again outdoors or with a clearer view of the sky, or enter your pickup location manually."
    );
  }

  const { latitude, longitude } = position.coords;
  let address = 'Current location';
  try {
    const json = await apiClient.get<{ address: string }>(
      `/locations/reverse?lat=${latitude}&lng=${longitude}`
    );
    address = json.address;
  } catch {
    // Keep the generic fallback address — the coordinates are still usable.
  }

  return { address, latitude, longitude, isCurrentLocation: true };
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
    return json;
  } catch {
    return null;
  }
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
