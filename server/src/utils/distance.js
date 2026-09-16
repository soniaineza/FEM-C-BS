const { config } = require('../config');

/** Great-circle distance in km between two coordinates (haversine). */
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371.0;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/** Initial compass bearing (degrees, 0-360) travelling from point 1 to point 2. */
function bearingDegrees(lat1, lng1, lat2, lng2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const toDeg = (r) => (r * 180) / Math.PI;
  const dLng = toRad(lng2 - lng1);
  const y = Math.sin(dLng) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Smallest angle (0-180) between two compass bearings. */
function bearingDiffDegrees(a, b) {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

/** Mirrors the client-side estimate: average-speed based duration (minutes). */
function estimateDurationMinutes(distanceKm) {
  const minutes = Math.round(
    (distanceKm / config.estimateAverageSpeedKmh) * 60
  );
  return Math.min(600, Math.max(2, minutes));
}

/** Shared rides are discounted ~30% vs the same private trip. */
const SHARED_RIDE_FARE_FACTOR = 0.7;

function estimateFare(vehicle, distanceKm, rideType = 'private') {
  const baseFare = vehicle.base_fare + distanceKm * vehicle.fare_per_km;
  if (rideType === 'shared') return baseFare * SHARED_RIDE_FARE_FACTOR;
  return baseFare;
}

module.exports = {
  haversineKm,
  bearingDegrees,
  bearingDiffDegrees,
  estimateDurationMinutes,
  estimateFare,
};
