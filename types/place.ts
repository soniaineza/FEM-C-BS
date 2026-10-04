export interface Place {
  id?: string;
  address: string;
  latitude?: number;
  longitude?: number;
  isCurrentLocation?: boolean;
  accuracyMeters?: number;
  measuredAt?: number;
  locationSource?: 'gps' | 'seed' | 'manual';
}

export function placeHasCoordinates(p: Place): boolean {
  return Number.isFinite(p.latitude) && Number.isFinite(p.longitude) &&
    Math.abs(p.latitude!) <= 90 && Math.abs(p.longitude!) <= 180;
}

export function placeFromBackendJson(json: any): Place {
  return {
    id: json.id,
    address: json.address ?? '',
    latitude: json.latitude ?? json.lat ?? undefined,
    longitude: json.longitude ?? json.lng ?? undefined,
  };
}
