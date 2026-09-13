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

/** Mirrors the client-side estimate: average-speed based duration (minutes). */
function estimateDurationMinutes(distanceKm) {
  const minutes = Math.round(
    (distanceKm / config.estimateAverageSpeedKmh) * 60
  );
  return Math.min(600, Math.max(2, minutes));
}

function estimateFare(vehicle, distanceKm) {
  return vehicle.base_fare + distanceKm * vehicle.fare_per_km;
}

module.exports = { haversineKm, estimateDurationMinutes, estimateFare };
