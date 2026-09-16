const express = require('express');

const { config } = require('../config');
const { asyncHandler, ApiError } = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

/** Proxies Nominatim so the Flutter app never needs a maps API key. */
async function nominatim(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'FEM-CABS/1.0 (passenger mobile app)',
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new ApiError(502, 'Location service unavailable.');
  return res.json();
}

// GET /api/locations/search?q=... — forward geocoding.
router.get(
  '/search',
  asyncHandler(async (req, res) => {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) throw new ApiError(400, 'Provide at least 2 characters.');
    const url = `${
      config.nominatimUrl
    }?format=jsonv2&limit=5&addressdetails=1&accept-language=rw,fr,en&q=${encodeURIComponent(
      q
    )}`;
    const results = await nominatim(url);
    res.json({
      results: results.slice(0, 5).map((r) => ({
        address: r.display_name,
        latitude: Number(r.lat),
        longitude: Number(r.lon),
      })),
    });
  })
);

// GET /api/locations/reverse?lat=&lng=&address= — reverse geocoding for the
// pick-up "use current location" action (the address text is sent along so
// the pair stays consistent).
router.get(
  '/reverse',
  asyncHandler(async (req, res) => {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      throw new ApiError(400, 'lat and lng are required.');
    }
    const url = `${
      config.nominatimReverseUrl
    }?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=rw,fr,en`;
    const result = await nominatim(url);
    res.json({
      address: (result && result.display_name) || 'Current location',
      latitude: lat,
      longitude: lng,
    });
  })
);

module.exports = router;