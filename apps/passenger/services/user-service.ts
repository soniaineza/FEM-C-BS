import { apiClient } from './api-client';
import { Place } from '@kimu/shared/types/place';
import { SavedPlace, savedPlaceFromBackendJson } from '../types/saved-place';

// Response envelopes verified against server/src/routes/places.routes.js.
// Deviation from the migration plan: recent places are server-tracked
// (GET/POST /api/places/recent, backed by the recent_destinations table),
// not local-only AsyncStorage as originally assumed from the old Dart
// client's behavior — the backend clearly supports real cross-device
// tracking, so use it.

export async function getSavedPlaces(): Promise<SavedPlace[]> {
  const json = await apiClient.get<{ savedPlaces: any[] }>('/places/saved');
  return json.savedPlaces.map(savedPlaceFromBackendJson);
}

export async function savePlace(params: {
  type: 'home' | 'work' | 'other';
  name: string;
  place: Place;
}): Promise<SavedPlace> {
  const json = await apiClient.post<{ savedPlace: any }>('/places/saved', {
    type: params.type,
    name: params.name,
    address: params.place.address,
    latitude: params.place.latitude,
    longitude: params.place.longitude,
  });
  return savedPlaceFromBackendJson(json.savedPlace);
}

export async function deleteSavedPlace(id: string): Promise<void> {
  await apiClient.delete(`/places/saved/${id}`);
}

export interface RecentPlace {
  address: string;
  latitude: number;
  longitude: number;
  timesUsed: number;
  lastUsedAt: string;
}

export async function getRecentPlaces(): Promise<RecentPlace[]> {
  try {
    const json = await apiClient.get<{ recent: RecentPlace[] }>('/places/recent');
    return json.recent;
  } catch {
    return [];
  }
}

// Fire-and-forget: called whenever a destination is chosen so it can surface
// as a recent place next time, without blocking the booking flow on it.
export function recordRecentPlace(place: Place): void {
  if (!place.latitude || !place.longitude) return;
  apiClient
    .post('/places/recent', { address: place.address, latitude: place.latitude, longitude: place.longitude })
    .catch(() => {});
}
