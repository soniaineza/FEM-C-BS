const { config } = require('../config');
const { haversineKm } = require('../utils/distance');
const { routingProvider, MapProviderError } = require('./maps/providers');

// The routing service: road routes and travel times for the whole backend
// (pricing, the /api/maps/route endpoint, matching, shared-ride planning,
// the demo fleet), on whichever provider MAP_ROUTING_PROVIDER selects, so
// everything agrees on the same road distance and duration. The mobile apps
// never call a routing provider themselves.
//
// Routes are cached (roads don't change minute to minute). When the provider
// cannot answer there are two behaviours:
//  - strict (anything a fare is computed from): the failure is raised, so
//    no price is ever built on a guessed distance
//  - lenient (ranking nearby cars, ETAs, shared-ride planning): a
//    straight-line estimate, clearly marked source: 'estimate'

const CACHE_MAX = 1000;
const cache = new Map(); // key -> { value, at }
const CACHE_TTL_MS = 30 * 60 * 1000;

// Straight-line fallback: city roads are ~35% longer than the crow flies,
// at Kigali's typical ~22 km/h door-to-door speed.
const ROAD_DETOUR_FACTOR = 1.35;
const FALLBACK_SPEED_KMH = 22;

function keyFor(from, to) {
  const r = (n) => Number(n).toFixed(4); // ~11 m
  return `${r(from.latitude)},${r(from.longitude)};${r(to.latitude)},${r(to.longitude)}`;
}

function remember(key, value) {
  cache.set(key, { value, at: Date.now() });
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
}

function straightLine(from, to) {
  const km = haversineKm(from.latitude, from.longitude, to.latitude, to.longitude);
  const steps = Math.max(2, Math.ceil(km * 10));
  const coordinates = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    coordinates.push([
      from.longitude + (to.longitude - from.longitude) * t,
      from.latitude + (to.latitude - from.latitude) * t,
    ]);
  }
  const distanceMeters = km * ROAD_DETOUR_FACTOR * 1000;
  return {
    coordinates,
    distanceMeters,
    durationSeconds: (distanceMeters / 1000 / FALLBACK_SPEED_KMH) * 3600,
    source: 'estimate',
    provider: 'estimate',
  };
}

/**
 * Road route between two points.
 * @param {{strict?: boolean, cacheTtlMs?: number}} [options] strict: raise a
 *   MapProviderError instead of estimating (used wherever a fare depends on it).
 * @returns {Promise<{coordinates: [number, number][], distanceMeters: number,
 *   durationSeconds: number, source: 'provider'|'estimate', provider: string}>}
 *   coordinates are [lng, lat].
 */
async function getRoadRoute(from, to, { strict = false, cacheTtlMs = CACHE_TTL_MS } = {}) {
  const key = keyFor(from, to);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < cacheTtlMs) return hit.value;

  try {
    const provider = routingProvider();
    const route = await provider.route(from, to);
    const value = { ...route, source: 'provider', provider: provider.name };
    remember(key, value);
    return value;
  } catch (err) {
    if (!(err instanceof MapProviderError)) throw err;
    console.error(`[routing] ${err.provider} route failed (${err.reason}${err.detail ? `: ${err.detail}` : ''})`);
    if (strict) throw err;
    // Not cached: the provider may be back on the next request.
    return straightLine(from, to);
  }
}

/**
 * A route that a fare may be computed from. On a hosted server a provider
 * failure is raised (the rider retries; no price is built on a guess). On a
 * developer's local database the straight-line estimate is allowed so work
 * can continue offline.
 */
function getFareRoute(from, to) {
  return getRoadRoute(from, to, { strict: !config.localDatabase });
}

/**
 * Road travel time (seconds) between every pair of [points], as a square
 * matrix. Used only for ranking and planning, so cells the provider cannot
 * answer — or the whole matrix when it is unavailable or has no matrix
 * service — use the straight-line estimate.
 */
async function getTravelMatrix(points) {
  const fallback = () => points.map((a) => points.map((b) => (a === b ? 0 : estimateSeconds(a, b))));
  if (points.length < 2) return fallback();
  try {
    const provider = routingProvider();
    if (!provider.matrix) return fallback();
    const durations = await provider.matrix(points);
    return points.map((_, i) =>
      points.map((__, j) => (Number.isFinite(durations?.[i]?.[j]) ? durations[i][j] : estimateSeconds(points[i], points[j])))
    );
  } catch {
    return fallback();
  }
}

/**
 * Road travel time (seconds) from each origin to one destination. Returns
 * null when the provider is unavailable or has no matrix service, so callers
 * fall back to straight-line estimates.
 */
async function getTravelTimes(origins, destination) {
  if (!origins.length) return [];
  try {
    const provider = routingProvider();
    if (!provider.matrix) return null;
    const durations = await provider.matrix([...origins, destination]);
    return origins.map((_, i) => (Number.isFinite(durations?.[i]?.[origins.length]) ? durations[i][origins.length] : null));
  } catch {
    return null;
  }
}

/** Straight-line fallback for a travel time, in seconds. */
function estimateSeconds(from, to) {
  const km = haversineKm(from.latitude, from.longitude, to.latitude, to.longitude) * ROAD_DETOUR_FACTOR;
  return (km / FALLBACK_SPEED_KMH) * 3600;
}

/** Test hook: forget cached routes. */
function clearRouteCache() {
  cache.clear();
}

module.exports = { getRoadRoute, getFareRoute, getTravelTimes, getTravelMatrix, estimateSeconds, clearRouteCache };
