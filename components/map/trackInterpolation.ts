import type { TrailSample } from './map-types';

// Smooth car motion from sparse, jittery updates ("entity interpolation", as
// used in networked games): every car keeps a short timeline of server-
// timestamped samples and is drawn RENDER_DELAY_MS in the past, always
// between two real samples. Because the server sends the last few seconds of
// its trail on every poll, consecutive samples are ~1s apart along the actual
// road, so the car follows the street geometry instead of cutting corners
// between two distant fixes. Pure functions: no DOM, no map, easy to test.

export const RENDER_DELAY_MS = 2500;
const KEEP_MS = 20_000;
/** When updates stop, hold the last position rather than guess ahead. */
const MAX_EXTRAPOLATE_MS = 600;
/** Faster than this between two samples is a relocation, not driving: snap. */
const TELEPORT_MPS = 45;

export interface TrackPoint {
  t: number;
  lat: number;
  lng: number;
  heading: number | null;
}

export interface TrackState {
  lat: number;
  lng: number;
  heading: number;
  moving: boolean;
}

export class Track {
  points: TrackPoint[] = [];
  lastHeading = 0;

  /** Merges new samples (any order, possibly overlapping earlier ones). */
  add(samples: TrailSample[], now: number): void {
    for (const [t, lat, lng, heading] of samples) {
      if (!Number.isFinite(t) || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      const i = this.points.findIndex((p) => p.t >= t);
      if (i >= 0 && this.points[i].t === t) continue; // already have it
      const point = { t, lat, lng, heading };
      if (i < 0) this.points.push(point);
      else this.points.splice(i, 0, point);
    }
    const cutoff = now - KEEP_MS;
    while (this.points.length > 2 && this.points[1].t < cutoff) this.points.shift();
  }

  get lastSampleAt(): number {
    return this.points.length ? this.points[this.points.length - 1].t : 0;
  }

  /** Position at server time `t`. */
  sample(t: number): TrackState | null {
    const pts = this.points;
    if (!pts.length) return null;
    if (pts.length === 1 || t <= pts[0].t) {
      return this.state(pts[0], pts[0], 0);
    }
    const last = pts[pts.length - 1];
    if (t >= last.t) {
      const prev = pts[pts.length - 2];
      const span = last.t - prev.t;
      const ahead = Math.min(t - last.t, MAX_EXTRAPOLATE_MS);
      if (span > 0 && span < 5000 && ahead > 0) {
        // Brief extrapolation along the last segment to hide a late packet.
        return this.state(prev, last, 1 + ahead / span, true);
      }
      return this.state(last, last, 0);
    }
    let hi = pts.findIndex((p) => p.t > t);
    if (hi <= 0) hi = 1;
    const a = pts[hi - 1];
    const b = pts[hi];
    const f = b.t === a.t ? 1 : (t - a.t) / (b.t - a.t);
    return this.state(a, b, f);
  }

  private state(a: TrackPoint, b: TrackPoint, f: number, extrapolating = false): TrackState {
    const movedM = distanceM(a.lat, a.lng, b.lat, b.lng);
    const spanS = Math.abs(b.t - a.t) / 1000;
    if (movedM > 25 && spanS > 0 && movedM / spanS > TELEPORT_MPS) {
      // Never glide a car across blocks: jump at the midpoint in time.
      const p = f < 0.5 ? a : b;
      this.lastHeading = p.heading ?? this.lastHeading;
      return { lat: p.lat, lng: p.lng, heading: this.lastHeading, moving: false };
    }
    const lat = a.lat + (b.lat - a.lat) * f;
    const lng = a.lng + (b.lng - a.lng) * f;
    const moving = movedM > 0.8 && f > 0 && (f < 1 || extrapolating);
    let heading: number;
    if (movedM > 0.8) {
      // Direction of travel is the most honest heading when moving.
      heading = bearing(a.lat, a.lng, b.lat, b.lng);
    } else {
      heading = b.heading ?? a.heading ?? this.lastHeading;
    }
    this.lastHeading = heading;
    return { lat, lng, heading, moving };
  }
}

/** Shortest-arc angle interpolation, degrees. */
export function lerpAngle(from: number, to: number, f: number): number {
  const diff = ((((to - from) % 360) + 540) % 360) - 180;
  return (from + diff * f + 360) % 360;
}

export function bearing(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const y = Math.sin(toRad(lng2 - lng1)) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lng2 - lng1));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export function distanceM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * Index of the route vertex nearest to a point plus the projected point, so
 * the route behind a moving car can be trimmed off.
 */
export function projectOnRoute(
  coords: [number, number][],
  lat: number,
  lng: number
): { index: number; point: [number, number] } | null {
  if (coords.length < 2) return null;
  // Local equirectangular projection is plenty accurate at city scale.
  const kx = Math.cos((lat * Math.PI) / 180);
  let best = { index: 0, point: coords[0], d: Infinity };
  for (let i = 0; i < coords.length - 1; i++) {
    const [ax, ay] = coords[i];
    const [bx, by] = coords[i + 1];
    const dx = (bx - ax) * kx;
    const dy = by - ay;
    const px = (lng - ax) * kx;
    const py = lat - ay;
    const len2 = dx * dx + dy * dy;
    const f = len2 ? Math.max(0, Math.min(1, (px * dx + py * dy) / len2)) : 0;
    const qx = px - dx * f;
    const qy = py - dy * f;
    const d = qx * qx + qy * qy;
    if (d < best.d) best = { index: i, point: [ax + (bx - ax) * f, ay + (by - ay) * f], d };
  }
  return { index: best.index, point: best.point };
}
