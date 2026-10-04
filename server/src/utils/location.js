const { ApiError } = require('./asyncHandler');
const { config } = require('../config');

function validCoordinates(p) {
  return p && Number.isFinite(p.latitude) && Math.abs(p.latitude) <= 90 &&
    Number.isFinite(p.longitude) && Math.abs(p.longitude) <= 180;
}
function requireCoordinates(p) {
  if (!validCoordinates(p)) throw new ApiError(400, 'Valid latitude and longitude are required.');
  return p;
}
function queryPoint(query, latKey, lngKey) {
  if (typeof query[latKey] !== 'string' || !query[latKey].trim() ||
      typeof query[lngKey] !== 'string' || !query[lngKey].trim()) {
    throw new ApiError(400, 'Latitude and longitude are required.');
  }
  return requireCoordinates({ latitude: Number(query[latKey]), longitude: Number(query[lngKey]) });
}
function locationSample(body) {
  requireCoordinates(body);
  const legacy = config.env !== 'production' && body.measuredAt == null;
  const now = Date.now();
  const reported = legacy ? now : body.measuredAt;
  const accuracy = legacy ? 100 : body.accuracy;
  // Age is measured on the device's own clock when it says when it sent the
  // sample (sentAt), so a phone whose clock is off from ours is not rejected.
  // Older clients send no sentAt and are compared against the server clock.
  const relative = Number.isFinite(body.sentAt);
  const age = (relative ? body.sentAt : now) - reported;
  const measuredAt = relative ? now - Math.max(0, age) : reported;
  if (!Number.isFinite(reported) || age < -5000 || age > 30_000 ||
      !Number.isFinite(accuracy) || accuracy < 0 || accuracy > 100) {
    throw new ApiError(400, 'A recent, accurate location measurement is required.');
  }
  if (body.heading != null && (!Number.isFinite(body.heading) || body.heading < 0 || body.heading >= 360)) {
    throw new ApiError(400, 'Heading must be between 0 and 360 degrees.');
  }
  return { ...body, measuredAt: new Date(measuredAt), accuracy };
}
module.exports = { validCoordinates, requireCoordinates, queryPoint, locationSample };
