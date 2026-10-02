
export interface LngLat {
  latitude: number;
  longitude: number;
}

/** A recent position sample: [serverEpochMs, lat, lng, heading | null]. */
export type TrailSample = [number, number, number, number | null];

export type CarClass = 'fem_economy' | 'fem_comfort' | 'fem_xl' | string;

export interface MapCar {
  id: string;
  latitude: number;
  longitude: number;
  heading: number | null;
  vehicleClass?: CarClass | null;
  /** Server samples covering the last few seconds, oldest first. */
  trail?: TrailSample[];
  /** The rider's own car: drawn highlighted and never faded out. */
  assigned?: boolean;
  /** Paint colour (CSS hex), e.g. the matched driver's real car colour. */
  color?: string | null;
}

export type MarkerKind = 'pickup' | 'destination' | 'me' | 'radar';

export interface MapMarker {
  id: string;
  kind: MarkerKind;
  latitude: number;
  longitude: number;
  label?: string;
}

export interface MapRoute {
  /** [lng, lat] pairs along the road. */
  coordinates: [number, number][];
  /** Trim the part already driven by this car (Uber-style). */
  trimBehindCarId?: string;
  /** Draw the line progressively once when the route first appears. */
  animateIn?: boolean;
  style?: 'primary' | 'secondary';
}

export interface MapPadding {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export type CameraMode =
  /** Fit everything relevant (route, markers, assigned car). */
  | 'fit'
  /** Keep the assigned car (and the next stop) in view as it moves. */
  | 'follow'
  /** Centre on a point (e.g. the pickup pin screen). */
  | 'center';

export interface MapCamera {
  mode: CameraMode;
  center?: LngLat;
  zoom?: number;
  pitch?: number;
  bearing?: number;
  padding?: MapPadding;
  /** Change this to re-apply the camera after the user has panned away. */
  token?: number;
}

export interface MapScene {
  camera: MapCamera;
  markers?: MapMarker[];
  cars?: MapCar[];
  routes?: MapRoute[];
  /** Client clock offset: serverNow ≈ Date.now() + serverTimeOffsetMs. */
  serverTimeOffsetMs?: number;
  /** Report the map centre when the user stops panning (pin-drop screens). */
  reportCenter?: boolean;
  interactive?: boolean;
  /** Render at most this devicePixelRatio (battery/perf on low-end phones). */
  maxPixelRatio?: number;
  /** Zoom by `delta` levels; a new `token` triggers it (the +/− map buttons). */
  zoomCommand?: { delta: number; token: number };
}

export const KIGALI_CENTER: LngLat = { latitude: -1.9441, longitude: 30.0619 };

/** Hex for a car colour name as drivers enter it ("Red", "Silver"...). */
export const CAR_COLOR_NAMES: Record<string, string> = {
  white: '#f8fafc', black: '#1f2937', silver: '#c0c4ca', grey: '#8b9098', gray: '#8b9098',
  red: '#c8102e', blue: '#1d4ed8', green: '#15803d', yellow: '#eab308', orange: '#ea580c',
  brown: '#78350f', beige: '#d6c7a1', gold: '#b8923a', maroon: '#7f1d1d', navy: '#1e3a8a',
};

/** Paint hex for a colour name, or null when unknown. */
export function carColorHex(name?: string | null): string | null {
  return CAR_COLOR_NAMES[(name ?? '').trim().toLowerCase()] ?? null;
}
