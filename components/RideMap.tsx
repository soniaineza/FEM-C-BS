import { useMemo } from 'react';

import { LiveMap } from './map/LiveMap';
import type { MapCar, MapMarker, MapScene } from './map/map-types';

export interface LatLng {
  latitude: number;
  longitude: number;
}

export interface RideMapMarker {
  id: string;
  position: LatLng;
  icon: 'pickup' | 'destination' | 'driver' | 'me';
}

interface RideMapProps {
  center: LatLng;
  zoom?: number;
  markers?: RideMapMarker[];
  routePolyline?: LatLng[];
  onMapPress?: (pos: LatLng) => void;
  // Bump this to re-apply `center`/`zoom` even when unchanged (e.g. a
  // recenter button after the user panned away).
  recenterToken?: number;
  /** Live cars to animate (see hooks/useNearbyCars.ts). */
  cars?: MapCar[];
  serverTimeOffsetMs?: number;
  retryLabel?: string;
  loadingLabel?: string;
  errorLabel?: string;
  rounded?: boolean;
}

/**
 * Embedded, interactive map with the original RideMap API, now drawn by the
 * shared engine (OpenFreeMap vector tiles, 3D buildings, 3D cars) instead of
 * Leaflet raster tiles from tile.openstreetmap.org, whose usage policy
 * doesn't allow heavy use by apps. A 'driver' marker becomes a 3D car.
 */
export function RideMap({
  center,
  zoom = 15,
  markers = [],
  routePolyline,
  onMapPress,
  recenterToken,
  cars,
  serverTimeOffsetMs,
  retryLabel,
  loadingLabel,
  errorLabel,
  rounded = true,
}: RideMapProps) {
  const scene = useMemo<MapScene>(() => {
    const pins: MapMarker[] = [];
    const markerCars: MapCar[] = [];
    for (const m of markers) {
      if (m.icon === 'driver') {
        markerCars.push({ id: m.id, ...m.position, heading: null, assigned: true });
      } else {
        pins.push({ id: m.id, kind: m.icon, ...m.position });
      }
    }
    const route = (routePolyline ?? []).map((p) => [p.longitude, p.latitude] as [number, number]);
    return {
      camera: route.length > 1 || pins.length > 1
        ? { mode: 'fit', token: recenterToken, zoom: Math.max(zoom, 16) }
        : { mode: 'center', center, zoom, token: recenterToken },
      markers: pins,
      routes: route.length > 1 ? [{ coordinates: route }] : [],
      cars: [...markerCars, ...(cars ?? [])],
      serverTimeOffsetMs,
    };
  }, [center.latitude, center.longitude, zoom, markers, routePolyline, recenterToken, cars, serverTimeOffsetMs]);

  return (
    <LiveMap
      scene={scene}
      rounded={rounded}
      onPress={onMapPress ? (latitude, longitude) => onMapPress({ latitude, longitude }) : undefined}
      retryLabel={retryLabel}
      loadingLabel={loadingLabel}
      errorLabel={errorLabel}
    />
  );
}
