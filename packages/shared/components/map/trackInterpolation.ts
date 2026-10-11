import type { TrailSample } from './map-types';

// Smooth car motion from sparse, jittery updates ("entity interpolation", as
// used in networked games): every car keeps a short timeline of server-
// timestamped samples and is drawn a little in the past, always between two
// real samples, so it follows the street geometry from fix to fix instead of
// guessing ahead. Pure functions: no DOM, no map, easy to test.
//
// How far in the past depends on how often that car's fixes arrive. Driver
// phones report every 4 s on a trip and every 15 s while waiting
// (apps/driver/utils/driver-background-location.ts), and riders poll every
// 2 s, so a fixed short delay ran past the newest fix every few seconds and
// the car then jumped tens of metres when the next one landed. Each track
// now plays back far enough behind to stay inside its own timeline.

/** The smallest playback delay, for cars that report often. */
export const RENDER_DELAY_MS = 2500;
/** Rider polling interval (2 s) plus a slow response, on top of a car's report gap. */
const POLL_SLACK_MS = 3500;
/** Playback is never further behind than this; older data is simply stale. */
const MAX_DELAY_MS = 30_000;
/** Playback may run this much faster or slower than real time to change its delay. */
const MAX_RATE_CHANGE = 0.15;
/** Recent report gaps considered when choosing the delay. */
const GAP_WINDOW = 4;
const KEEP_MS = MAX_DELAY_MS + 20_000;

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
  /** True once the car has been seen driving, so its heading is known. */
  private hasMoved = false;
  /** Current playback delay, ms. */
  delayMs = RENDER_DELAY_MS;
  private lastRenderAt: number | null = null;

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

  /** The delay this car's reporting rhythm needs: its recent report gap plus polling slack. */
  private targetDelay(): number {
    const pts = this.points;
    let gap = 0;
    for (let i = Math.max(1, pts.length - GAP_WINDOW); i < pts.length; i++) gap = Math.max(gap, pts[i].t - pts[i - 1].t);
    if (!gap) return this.delayMs;
    return Math.min(MAX_DELAY_MS, Math.max(RENDER_DELAY_MS, gap + POLL_SLACK_MS));
  }

  /**
   * The server time to draw this car at, for a frame drawn at server time
   * `serverNow`. Moves forward every frame (never backwards), eases its delay
   * towards what the car's reporting rhythm needs, and never passes the
   * newest sample: with no newer fix yet the car waits where it was last
   * seen, then carries on from there, instead of guessing ahead and jumping.
   */
  renderTime(serverNow: number): number {
    const target = this.targetDelay();
    if (this.lastRenderAt == null) {
      this.delayMs = target;
    } else {
      const step = Math.max(0, serverNow - this.lastRenderAt) * MAX_RATE_CHANGE;
      this.delayMs += Math.max(-step, Math.min(step, target - this.delayMs));
    }
    const newest = this.lastSampleAt;
    if (this.points.length && serverNow - this.delayMs > newest) {
      this.delayMs = Math.min(MAX_DELAY_MS, serverNow - newest);
    }
    this.lastRenderAt = serverNow;
    return serverNow - this.delayMs;
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
      // Past the newest fix: wait there. Guessing ahead only meant sliding
      // back when the real fix arrived (renderTime() keeps playback inside
      // the timeline, so this is reached only once the data is stale).
      return this.state(last, last, 0);
    }
    let hi = pts.findIndex((p) => p.t > t);
    if (hi <= 0) hi = 1;
    const a = pts[hi - 1];
    const b = pts[hi];
    const f = b.t === a.t ? 1 : (t - a.t) / (b.t - a.t);
    return this.state(a, b, f);
  }

  private state(a: TrackPoint, b: TrackPoint, f: number): TrackState {
    const lat = a.lat + (b.lat - a.lat) * f;
    const lng = a.lng + (b.lng - a.lng) * f;
    const movedM = distanceM(a.lat, a.lng, b.lat, b.lng);
    const moving = movedM > 0.8 && f > 0 && f < 1;
    let heading: number;
    if (movedM > 0.8) {
      // Direction of travel is the most honest heading when moving.
      heading = bearing(a.lat, a.lng, b.lat, b.lng);
      this.hasMoved = true;
    } else if (this.hasMoved) {
      // A parked car keeps facing the way it drove. Phones report "no
      // heading" as -1 (iOS) or 0 (Android), which would turn it north.
      heading = this.lastHeading;
    } else {
      heading = validHeading(b.heading) ?? validHeading(a.heading) ?? this.lastHeading;
    }
    this.lastHeading = heading;
    return { lat, lng, heading, moving };
  }
}

function validHeading(h: number | null): number | null {
  return h != null && Number.isFinite(h) && h >= 0 && h <= 360 ? h % 360 : null;
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
