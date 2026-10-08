import { Place } from '@kimu/shared/types/place';

export type SavedPlaceType = 'home' | 'work' | 'other';

export interface SavedPlace {
  id: string;
  type: SavedPlaceType;
  name: string;
  place: Place;
}

// Backend's savedPlaceToJson() nests place: { address, latitude, longitude,
// isCurrentLocation }.
export function savedPlaceFromBackendJson(json: any): SavedPlace {
  return {
    id: json.id,
    type: (json.type as SavedPlaceType) ?? 'other',
    name: json.name,
    place: {
      address: json.place?.address ?? '',
      latitude: json.place?.latitude ?? undefined,
      longitude: json.place?.longitude ?? undefined,
    },
  };
}
