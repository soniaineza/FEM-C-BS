const express = require('express');

const { config } = require('../config');
const { asyncHandler, ApiError } = require('../utils/asyncHandler');
const { requireAnyUser } = require('../middleware/auth');
const { apiLimiter } = require('../middleware/rateLimit');
const { getRoadRoute } = require('../services/routing');
const { searchPlaces, reverseGeocode } = require('../services/maps/geocoding');
const { parsePoint, isValidCoordinate } = require('../services/maps/geo');

// Map services for the rider and driver apps: place search, reverse
// geocoding and road routes. The apps only ever talk to these endpoints —
// which provider answers, and its API key, stay on the server.
//
// Mounted at /api/maps, and at /api/locations for app builds that predate it.
// Every endpoint needs a signed-in rider or driver and is rate limited per
// account, so the backend cannot be used as an open proxy to the provider.
const router = express.Router();

// GET /api/maps/config — what the app's map needs to draw itself. Contains
// no secret, so the map can load before sign-in.
router.get('/config', (_req, res) => {
  res.json({
    styleUrl: config.mapStyleUrl,
    attribution: config.mapAttribution,
    driverLocationMaxAgeSeconds: config.driverLocationMaxAgeSeconds,
  });
});

router.use(requireAnyUser);
const perUser = (name, max) => apiLimiter({ max, keyGenerator: (req) => `maps:${name}:${req.userKey}` });

// GET /api/maps/search?q=Kimironko[&near=lat,lng]
router.get(
  '/search',
  perUser('search', config.mapsSearchLimit),
  asyncHandler(async (req, res) => {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) throw new ApiError(400, 'Provide at least 2 characters.', 'INVALID_QUERY');
    if (q.length > 80) throw new ApiError(400, 'That search is too long.', 'INVALID_QUERY');
    const near = req.query.near ? parsePoint(req.query.near, 'near') : null;
    res.json({ results: await searchPlaces(q, near) });
  })
);

// GET /api/maps/reverse?lat=&lng=
router.get(
  '/reverse',
  perUser('reverse', config.mapsReverseLimit),
  asyncHandler(async (req, res) => {
    const point = parsePoint([req.query.lat, req.query.lng], 'lat,lng');
    const address = await reverseGeocode(point.latitude, point.longitude);
    // No address known there is not an error: the coordinates still work.
    res.json({ address, latitude: point.latitude, longitude: point.longitude });
  })
);

// GET /api/maps/route?origin=lat,lng&destination=lat,lng
// (older builds send fromLat/fromLng/toLat/toLng)
router.get(
  '/route',
  perUser('route', config.mapsRouteLimit),
  asyncHandler(async (req, res) => {
    const legacy = req.query.fromLat !== undefined;
    const origin = parsePoint(legacy ? [req.query.fromLat, req.query.fromLng] : req.query.origin, 'origin');
    const destination = parsePoint(legacy ? [req.query.toLat, req.query.toLng] : req.query.destination, 'destination');
    // Strict: a route the provider could not compute is an error the app can
    // retry, never a made-up line.
    const route = await getRoadRoute(origin, destination, { strict: true });
    res.json({
      distanceMeters: Math.round(route.distanceMeters),
      durationSeconds: Math.round(route.durationSeconds),
      // GeoJSON LineString coordinates: [longitude, latitude] pairs.
      geometry: route.coordinates,
      points: route.coordinates
        .filter(([lng, lat]) => isValidCoordinate(lat, lng))
        .map(([lng, lat]) => ({ latitude: lat, longitude: lng })),
      provider: route.provider,
      source: route.source,
    });
  })
);

module.exports = router;
