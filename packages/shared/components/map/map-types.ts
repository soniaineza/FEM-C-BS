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
}

export const KIGALI_CENTER: LngLat = { latitude: -1.9441, longitude: 30.0619 };

/**
 * Kimu only operates in Rwanda, so every map is fenced to the country plus a
 * small margin: panning stops at the edge instead of drifting off to an empty
 * ocean the rider then has to find their way back from.
 * [[west, south], [east, north]]
 */
export const SERVICE_AREA_BOUNDS: [[number, number], [number, number]] = [
  [28.45, -3.30],
  [31.35, -0.65],
];

/** Zoomed out any further than this, nothing in the service area is legible. */
export const SERVICE_AREA_MIN_ZOOM = 6.5;
