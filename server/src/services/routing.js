const { config } = require('../config');
const { haversineKm } = require('../utils/distance');

// Road routing through OSRM (OpenStreetMap data), shared by pricing, the
// /api/locations/route proxy and the demo fleet so they all agree on the
// same road distance/duration. Results are cached (routes don't change
// minute to minute) and a failed/slow OSRM call degrades to a straight-line
// estimate instead of failing the request.

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
  };
}

/**
 * Road route between two points.
 * @returns {Promise<{coordinates: [number, number][], distanceMeters: number,
 *   durationSeconds: number, source: 'osrm'|'estimate', speeds?: number[]}>}
 *   coordinates are [lng, lat]; speeds only with `speeds: true` from OSRM.
 */
async function getRoadRoute(from, to, { timeoutMs = 6000, cacheTtlMs = CACHE_TTL_MS, speeds = false } = {}) {
  const key = keyFor(from, to) + (speeds ? ':s' : '');
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < cacheTtlMs) return hit.value;

  try {
    const url = `${config.osrmUrl}/${from.longitude},${from.latitude};${to.longitude},${to.latitude}` +
      '?overview=full&geometries=geojson' + (speeds ? '&annotations=speed' : '');
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) throw new Error(`OSRM ${res.status}`);
    const data = await res.json();
    const route = Array.isArray(data.routes) ? data.routes[0] : null;
    const coordinates = route?.geometry?.coordinates;
    if (!route || !Array.isArray(coordinates) || coordinates.length < 2) throw new Error('no route');
    const value = {
      coordinates,
      distanceMeters: route.distance,
      durationSeconds: route.duration,
      source: 'osrm',
    };
    // Per-segment road speeds (m/s, one per coordinate pair) when asked for;
    // the demo fleet drives faster on main roads than in side streets.
    const legSpeeds = route.legs?.[0]?.annotation?.speed;
    if (speeds && Array.isArray(legSpeeds) && legSpeeds.length === coordinates.length - 1) value.speeds = legSpeeds;
    remember(key, value);
    return value;
  } catch {
    // Not cached: OSRM may be back on the next request.
    return straightLine(from, to);
  }
}

/**
 * Road travel time (seconds) from each origin to one destination, in a
 * single OSRM table request. Returns null when OSRM is unavailable, so
 * callers fall back to straight-line estimates.
 */
async function getTravelTimes(origins, destination, { timeoutMs = 4000 } = {}) {
  if (!origins.length) return [];
  const coords = [...origins, destination].map((p) => `${p.longitude},${p.latitude}`).join(';');
  const sources = origins.map((_, i) => i).join(';');
  try {
    const url = `${config.osrmUrl.replace('/route/', '/table/')}/${coords}` +
      `?sources=${sources}&destinations=${origins.length}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) throw new Error(`OSRM table ${res.status}`);
    const data = await res.json();
    if (data.code !== 'Ok' || !Array.isArray(data.durations)) throw new Error('bad table');
    return data.durations.map((row) => (row && Number.isFinite(row[0]) ? row[0] : null));
  } catch {
    return null;
  }
}

/** Straight-line fallback for a travel time, in seconds. */
function estimateSeconds(from, to) {
  const km = haversineKm(from.latitude, from.longitude, to.latitude, to.longitude) * ROAD_DETOUR_FACTOR;
  return (km / FALLBACK_SPEED_KMH) * 3600;
}

module.exports = { getRoadRoute, getTravelTimes, estimateSeconds };
