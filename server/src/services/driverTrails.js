// Short in-memory history of each driver's recent positions. Clients poll
// every ~2s; sending the last few seconds of samples (not just the latest
// point) lets the map replay the car along the actual road path with a small
// render delay, instead of cutting corners between two distant fixes.
//
// Process-local by design: it is a smoothing aid, not a source of truth
// (drivers.current_latitude/longitude are). A cold instance simply serves
// single-point trails until it has samples.

const MAX_AGE_MS = 12_000;
const MAX_SAMPLES = 16;

const trails = new Map(); // driverId -> [{ t, lat, lng, heading }]

function recordSample(driverId, { latitude, longitude, heading }, t = Date.now()) {
  let list = trails.get(driverId);
  if (!list) {
    list = [];
    trails.set(driverId, list);
  }
  const last = list[list.length - 1];
  if (last && last.t === t) list.pop();
  list.push({ t, lat: latitude, lng: longitude, heading: heading ?? null });
  while (list.length > MAX_SAMPLES || (list.length && t - list[0].t > MAX_AGE_MS)) list.shift();
}

/** Samples as compact [epochMs, lat, lng, heading] tuples, oldest first. */
function recentTrail(driverId, now = Date.now()) {
  const list = trails.get(driverId) || [];
  return list
    .filter((s) => now - s.t <= MAX_AGE_MS)
    .map((s) => [s.t, round6(s.lat), round6(s.lng), s.heading == null ? null : Math.round(s.heading)]);
}

function round6(n) {
  return Math.round(n * 1e6) / 1e6;
}

function forget(driverId) {
  trails.delete(driverId);
}

module.exports = { recordSample, recentTrail, forget };
