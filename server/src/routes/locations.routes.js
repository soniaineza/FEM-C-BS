const express = require('express');

const { asyncHandler, ApiError } = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

const PHOTON_BASE = 'https://photon.komoot.io/api/';
const PHOTON_REVERSE_BASE = 'https://photon.komoot.io/reverse';

/**
 * Proxies Photon (the OpenStreetMap geocoder) so the Flutter app never needs
 * a maps API key. Photon is used instead of Nominatim directly because
 * Nominatim's public instance blocks/soft-rate-limits requests coming from
 * shared cloud-hosting IP ranges (like Render's), which made search silently
 * fail for real users while working fine from a home network.
 */
async function photon(url) {
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new ApiError(502, 'Location service unavailable.');
  return res.json();
}

function labelFor(properties) {
  const parts = [
    properties.name,
    properties.street,
    properties.city,
    properties.state,
    properties.country,
  ].filter((p) => p && String(p).trim().length > 0);
  return parts.length ? parts.join(', ') : 'Unknown location';
}

// GET /api/locations/search?q=... — forward geocoding.
router.get(
  '/search',
  asyncHandler(async (req, res) => {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) throw new ApiError(400, 'Provide at least 2 characters.');
    const url = `${PHOTON_BASE}?limit=5&lang=en&q=${encodeURIComponent(q)}`;
    const data = await photon(url);
    const features = Array.isArray(data.features) ? data.features : [];
    res.json({
      results: features.slice(0, 5).map((f) => {
        const properties = f.properties || {};
        const coords = (f.geometry && f.geometry.coordinates) || [];
        return {
          address: labelFor(properties),
          latitude: coords.length > 1 ? Number(coords[1]) : null,
          longitude: coords.length > 0 ? Number(coords[0]) : null,
        };
      }),
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
    const url = `${PHOTON_REVERSE_BASE}?lat=${lat}&lon=${lng}&lang=en`;
    const data = await photon(url);
    const features = Array.isArray(data.features) ? data.features : [];
    const properties = features.length ? features[0].properties || {} : {};
    res.json({
      address: features.length ? labelFor(properties) : 'Current location',
      latitude: lat,
      longitude: lng,
    });
  })
);

module.exports = router;
