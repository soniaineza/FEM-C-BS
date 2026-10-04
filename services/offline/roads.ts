// Real road geometry for the standalone build. When the phone is online it asks
// an OSRM-compatible routing service directly (no Kimu server involved) for the
// street-following path between two points; offline, or if the service fails,
// callers keep the local curve from geo.ts, so nothing ever depends on it.
//
// The default service, the public OSRM demo, is free and needs no key but is
// meant for light, non-commercial use (about one request per second): fine for
// a single tester, not for a public launch, where you would host your own OSRM
// (the regular backend already requires that). Point EXPO_PUBLIC_OSRM_URL at it.

import { Path, hasRoad, rememberRoad, type LatLng } from './geo';

const TIMEOUT_MS = 5_000;
/** After a failure (offline, throttled) skip the network for this long instead of stalling every request. */
const BACKOFF_MS = 60_000;

let baseUrl: string | null = null;
let minGapMs = 1_100;
let failedUntil = 0;
let lastCall = 0;
let foreground: Promise<unknown> = Promise.resolve();
let foregroundPending = 0;
const backgroundTasks: (() => Promise<void>)[] = [];
let draining = false;

/** Pass null to disable. `minGapMs` is the pause between requests (tests use 0). */
export function setRoutingService(url: string | null, options: { minGapMs?: number } = {}): void {
  baseUrl = url ? url.replace(/\/+$/, '') : null;
  minGapMs = options.minGapMs ?? 1_100;
  failedUntil = 0;
  lastCall = 0;
}

export function roadServiceEnabled(): boolean {
  return baseUrl != null;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function request(from: LatLng, to: LatLng): Promise<Path | null> {
  if (!baseUrl || Date.now() < failedUntil) return null;
  // Reserve a slot so overlapping callers don't burst past the service's rate limit.
  const at = Math.max(Date.now(), lastCall + minGapMs);
  lastCall = at;
  if (at > Date.now()) await sleep(at - Date.now());

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const url = `${baseUrl}/${from.longitude},${from.latitude};${to.longitude},${to.latitude}?overview=full&geometries=geojson`;
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`routing ${res.status}`);
    const coords = ((await res.json()) as any)?.routes?.[0]?.geometry?.coordinates;
    // "No route" is an answer, not an outage.
    return Array.isArray(coords) && coords.length >= 2 ? new Path(coords) : null;
  } catch {
    failedUntil = Date.now() + BACKOFF_MS;
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** A road a person is waiting on (a quote, a booking): served in order, ahead of background work. */
export function fetchRoad(from: LatLng, to: LatLng): Promise<Path | null> {
  if (!baseUrl) return Promise.resolve(null);
  foregroundPending += 1;
  const run = foreground.then(() => request(from, to)).finally(() => {
    foregroundPending -= 1;
  });
  foreground = run.catch(() => null);
  return run;
}

async function drain(): Promise<void> {
  if (draining) return;
  draining = true;
  while (backgroundTasks.length) {
    while (foregroundPending > 0) await sleep(150);
    await backgroundTasks.shift()!();
  }
  draining = false;
}

/** A road nobody is waiting on (ambient traffic): only runs while no foreground request is pending. */
export function fetchRoadInBackground(from: LatLng, to: LatLng): Promise<Path | null> {
  if (!baseUrl) return Promise.resolve(null);
  return new Promise((resolve) => {
    backgroundTasks.push(async () => resolve(await request(from, to)));
    void drain();
  });
}

/** Makes sure the road between two points is known if it can be. True when real geometry is available. */
export async function ensureRoad(from: LatLng, to: LatLng): Promise<boolean> {
  if (hasRoad(from, to)) return true;
  const path = await fetchRoad(from, to);
  if (!path) return false;
  rememberRoad(from, to, path);
  return true;
}
