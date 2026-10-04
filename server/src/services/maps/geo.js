const { haversineKm } = require('../../utils/distance');
const { ApiError } = require('../../utils/asyncHandler');

// Coordinate checks shared by every map and location endpoint. Coordinates
// are the source of truth for pickups, destinations and driver positions,
// so anything malformed or outside the area Kimu serves is rejected before
// it is stored, priced or sent to a provider.

// Rwanda with a margin for border towns and GPS error.
const SERVICE_AREA = { minLat: -3.1, maxLat: -0.8, minLng: 28.6, maxLng: 31.2 };

function isValidCoordinate(latitude, longitude) {
  return (
    typeof latitude === 'number' && typeof longitude === 'number' &&
    Number.isFinite(latitude) && Number.isFinite(longitude) &&
    latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180
  );
}

function inServiceArea(latitude, longitude) {
  return (
    isValidCoordinate(latitude, longitude) &&
    latitude >= SERVICE_AREA.minLat && latitude <= SERVICE_AREA.maxLat &&
    longitude >= SERVICE_AREA.minLng && longitude <= SERVICE_AREA.maxLng
  );
}

/** Parses "lat,lng" (or separate values) into a point, or throws a 400. */
function parsePoint(value, name) {
  let latitude;
  let longitude;
  if (Array.isArray(value)) [latitude, longitude] = value.map(Number);
  else [latitude, longitude] = String(value ?? '').split(',').map((part) => (part.trim() === '' ? NaN : Number(part)));
  if (!isValidCoordinate(latitude, longitude)) {
    throw new ApiError(400, `${name} must be "latitude,longitude".`, 'INVALID_COORDINATES');
  }
  if (!inServiceArea(latitude, longitude)) {
    throw new ApiError(400, `${name} is outside the area Kimu serves.`, 'OUTSIDE_SERVICE_AREA');
  }
  return { latitude, longitude };
}

// ---- driver GPS samples ----
// Faster than any car on Rwandan roads: a "move" this fast is a GPS glitch
// or a spoofed position, not driving.
const MAX_SPEED_METERS_PER_SECOND = 55; // ~200 km/h
// Small hops are normal GPS wander even when parked.
const JUMP_MIN_METERS = 300;

/**
 * Decides whether a driver's GPS sample can be trusted, given the last one
 * accepted. Returns { accepted, reason? } with reason one of:
 * invalid, stale, low_accuracy, too_frequent, jump.
 *
 * @param {{latitude:number, longitude:number, at:number}|null} previous last accepted sample (at = ms)
 * @param {{latitude:number, longitude:number, accuracy?:number, recordedAt?:number}} sample recordedAt = device clock, ms
 * @param {number} now server clock, ms
 * @param {{maxAccuracyMeters:number, maxSampleAgeSeconds:number, minIntervalMs:number}} limits
 */
function assessLocationSample(previous, sample, now, limits) {
  if (!inServiceArea(sample.latitude, sample.longitude)) return { accepted: false, reason: 'invalid' };
  if (sample.recordedAt != null) {
    if (!Number.isFinite(sample.recordedAt)) return { accepted: false, reason: 'invalid' };
    // A fix the phone took long ago (queued while offline) is not where the driver is now.
    if (now - sample.recordedAt > limits.maxSampleAgeSeconds * 1000) return { accepted: false, reason: 'stale' };
  }
  if (sample.accuracy != null) {
    if (!Number.isFinite(sample.accuracy) || sample.accuracy < 0) return { accepted: false, reason: 'invalid' };
    if (sample.accuracy > limits.maxAccuracyMeters) return { accepted: false, reason: 'low_accuracy' };
  }
  if (previous) {
    const elapsedMs = now - previous.at;
    if (elapsedMs < limits.minIntervalMs) return { accepted: false, reason: 'too_frequent' };
    const meters = haversineKm(previous.latitude, previous.longitude, sample.latitude, sample.longitude) * 1000;
    if (meters > JUMP_MIN_METERS && meters / (elapsedMs / 1000) > MAX_SPEED_METERS_PER_SECOND) {
      return { accepted: false, reason: 'jump' };
    }
  }
  return { accepted: true };
}

module.exports = { isValidCoordinate, inServiceArea, parsePoint, assessLocationSample, SERVICE_AREA };
