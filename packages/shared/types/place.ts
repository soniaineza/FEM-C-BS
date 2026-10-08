export interface Place {
  id?: string;
  address: string;
  latitude?: number;
  longitude?: number;
  isCurrentLocation?: boolean;
}

export function placeHasCoordinates(p: Place): boolean {
  return typeof p.latitude === 'number' && typeof p.longitude === 'number';
}

export function placeFromBackendJson(json: any): Place {
  return {
    id: json.id,
    address: json.address ?? '',
    latitude: json.latitude ?? json.lat ?? undefined,
    longitude: json.longitude ?? json.lng ?? undefined,
  };
}
