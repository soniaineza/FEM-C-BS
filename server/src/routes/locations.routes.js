const express = require('express');

const { config } = require('../config');
const { asyncHandler, ApiError } = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const { getRoadRoute } = require('../services/routing');
const { haversineKm } = require('../utils/distance');

const router = express.Router();
router.use(requireAuth);

const PHOTON_BASE = config.photonUrl;
const PHOTON_REVERSE_BASE = config.photonReverseUrl;

// Rwanda's bounding box (minLon, minLat, maxLon, maxLat). Applied to every
// forward-geocoding query so results stay inside the country the app serves —
// without it, Photon matches same-named places across the whole planet first
// (e.g. "Kimironko" → South Africa, "Remera" → Tanzania), which is the
// reported "can't find places in Rwanda" bug.
const RWANDA_BBOX = '28.8617,-2.8407,30.8990,-1.0475';

/**
 * Proxies Photon (the OpenStreetMap geocoder) so the Flutter app never needs
 * a maps API key. Photon is used instead of Nominatim directly because
 * Nominatim's public instance blocks/soft-rate-limits requests coming from
 * shared cloud-hosting IP ranges (like Render's), which made search silently
 * fail for real users while working fine from a home network.
 */
async function photon(url, timeoutMs = 8000) {
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new ApiError(502, 'Location service unavailable.');
  return res.json();
}

// Nominatim fallback for forward geocoding, hard-restricted to Rwanda
// (countrycodes=rw). Returns Photon-shaped JSON ({ features: [...] }) so the
// search handler can post-process it identically. Used when Photon is
// unreachable or returns zero hits. Nominatim has cleaner coverage of some
// Rwandan neighbourhoods/landmarks Photon hasn't indexed.
async function fallbackNominatim(q) {
  const url = `${config.nominatimUrl}?format=jsonv2&limit=8&countrycodes=rw&addressdetails=1&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'KimuTransportApp/1.0 (mobile app; https://kimutransport.rw)',
    },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new ApiError(502, 'Location service unavailable.');
  const rows = await res.json();
  const features = (Array.isArray(rows) ? rows : [])
    .filter((r) => Number.isFinite(Number(r.lat)) && Number.isFinite(Number(r.lon)))
    .map((r) => ({
      properties: {
        name: r.name ?? undefined,
        street: r.address?.road ?? r.address?.pedestrian ?? undefined,
        city:
          r.address?.city ??
          r.address?.town ??
          r.address?.village ??
          r.address?.district ??
          undefined,
        country: r.address?.country ?? undefined,
      },
      geometry: {
        coordinates: [Number(r.lon), Number(r.lat)],
      },
    }));
  return { features };
}

function labelFor(properties) {
  const parts = [
    properties.name,
    properties.street,
    properties.city,
    properties.state,
    properties.country,
  ].filter((p) => p && String(p).trim().length > 0);
  // "KN 4 Avenue, KN 4 Avenue" when a road's name is also its street.
  const unique = parts.filter((p, i) => parts.findIndex((q) => q.toLowerCase() === p.toLowerCase()) === i);
  return unique.length ? unique.join(', ') : 'Unknown location';
}

// GET /api/locations/search?q=... — forward geocoding, biased to Rwanda.
router.get(
  '/search',
  asyncHandler(async (req, res) => {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) throw new ApiError(400, 'Provide at least 2 characters.');

    // Primary: Photon, restricted to Rwanda's bounding box. Also pass the
    // rider's approximate region for a "near me first" ranking on ties.
    const url = `${PHOTON_BASE}?limit=15&lang=en&q=${encodeURIComponent(q)}&bbox=${RWANDA_BBOX}`;
    let data;
    try {
      data = await photon(url);
    } catch {
      // Photon down/rate-limited: fall back to Nominatim with *rw* country
      // codes so search never returns empty-handed because one geocoder is
      // unreachable (the whole reason these calls are proxied server-side).
      data = null;
    }

    // Photon sometimes returns nothing for real Rwandan neighbourhoods it
    // hasn't indexed yet — retry with Nominatim before giving up.
    const features = Array.isArray(data?.features) && data.features.length
      ? data.features
      : (config.env === 'production' && !process.env.NOMINATIM_URL
          ? [] : (await fallbackNominatim(q).catch(() => ({ features: [] }))).features);

    res.json({ results: rankResults(q, features).slice(0, 8) });
  })
);

router.get(
  '/reverse',
  asyncHandler(async (req, res) => {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      throw new ApiError(400, 'lat and lng are required.');
    }
    const key = `${lat.toFixed(4)},${lng.toFixed(4)}`; // ~11 m
    const hit = reverseCache.get(key);
    if (hit && Date.now() - hit.at < REVERSE_CACHE_MS) {
      return res.json({ address: hit.address, latitude: lat, longitude: lng });
    }
    // Photon first (fast when healthy, but it can take 5 s+ or fail); then
    // Nominatim, the same OpenStreetMap data, so pin-drop keeps working.
    let address = null;
    try {
      const data = await photon(`${PHOTON_REVERSE_BASE}?lat=${lat}&lon=${lng}&lang=en`, 3500);
      const feature = Array.isArray(data.features) ? data.features[0] : null;
      if (feature) address = labelFor(feature.properties || {});
    } catch {
      // fall through to Nominatim
    }
    if (!address && (config.env !== 'production' || process.env.NOMINATIM_REVERSE_URL)) {
      address = await nominatimReverse(lat, lng).catch(() => null);
    }
    if (!address) throw new ApiError(502, 'Location service unavailable.');
    reverseCache.set(key, { address, at: Date.now() });
    if (reverseCache.size > 2000) reverseCache.delete(reverseCache.keys().next().value);
    res.json({ address, latitude: lat, longitude: lng });
  })
);

const REVERSE_CACHE_MS = 24 * 60 * 60 * 1000;
const reverseCache = new Map(); // "lat,lng" (4 dp) -> { address, at }

async function nominatimReverse(lat, lng) {
  const url = `${config.nominatimReverseUrl}?format=jsonv2&zoom=18&addressdetails=1&lat=${lat}&lon=${lng}`;
  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'KimuTransportApp/1.0 (mobile app; https://kimutransport.rw)' },
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) return null;
  const r = await res.json();
  if (!r || r.error) return null;
  return labelFor({
    name: r.name || undefined,
    street: r.address?.road ?? r.address?.pedestrian ?? undefined,
    city: r.address?.city ?? r.address?.town ?? r.address?.suburb ?? r.address?.district ?? undefined,
    country: r.address?.country ?? undefined,
  });
}

// GET /api/locations/route?fromLat=&fromLng=&toLat=&toLng= — turn-by-turn
// route (polyline points, distance, duration) for the ride-request fare
// estimate. Proxied through the backend's OSRM_URL for the same reason
// search/reverse are proxied: the RN client should never call a public
// third-party geo service directly (consistency, and outage/rate-limit
// behavior for the public OSRM demo server is controlled in one place).
router.get(
  '/route',
  asyncHandler(async (req, res) => {
    const fromLat = Number(req.query.fromLat);
    const fromLng = Number(req.query.fromLng);
    const toLat = Number(req.query.toLat);
    const toLng = Number(req.query.toLng);
    if (![fromLat, fromLng, toLat, toLng].every(Number.isFinite)) {
      throw new ApiError(400, 'fromLat, fromLng, toLat and toLng are required.');
    }
    const route = await getRoadRoute(
      { latitude: fromLat, longitude: fromLng },
      { latitude: toLat, longitude: toLng }
    );
    res.json({
      points: route.coordinates.map(([lng, lat]) => ({ latitude: lat, longitude: lng })),
      distanceMeters: route.distanceMeters,
      durationSeconds: route.durationSeconds,
      source: route.source,
    });
  })
);

module.exports = router;

// ---- result ranking ----
// Photon's order sometimes puts a partial match above the exact place
// ("MTN Centre Nyarutarama" -> "Nyarutarama Medical Center" first). Results
// are re-ranked by how well the place's NAME matches the query (both ways),
// then by its full label, with a small preference for Kigali. Deterministic and
// instant (it runs on every debounced keystroke); ranking quality is
// measured offline by test/jev-place-search.js.
const KIGALI = { latitude: -1.9441, longitude: 30.0619 };
const STOPWORDS = new Set(['the', 'of', 'de', 'la', 'le', 'na', 'ya', 'and', 'in']);

function normalise(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\bcenter\b/g, 'centre')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tokens(text) {
  return normalise(text).split(' ').filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

function coverage(queryTokens, text) {
  if (!queryTokens.length) return 0;
  const words = new Set(tokens(text));
  const hits = queryTokens.filter((t) => words.has(t) || [...words].some((w) => w.startsWith(t) && t.length >= 3));
  return hits.length / queryTokens.length;
}

function rankResults(query, features) {
  const q = tokens(query);
  const seen = new Set();
  const candidates = [];
  features.forEach((f, order) => {
    const properties = f.properties || {};
    const coords = (f.geometry && f.geometry.coordinates) || [];
    const latitude = coords.length > 1 ? Number(coords[1]) : null;
    const longitude = coords.length > 0 ? Number(coords[0]) : null;
    // The Rwanda bbox is a rectangle that also covers parts of Uganda,
    // Burundi, Tanzania and DR Congo.
    if (properties.country && normalise(properties.country) !== 'rwanda') return;
    const address = labelFor(properties);
    const key = normalise(address);
    if (seen.has(key)) return;
    seen.add(key);
    const inKigali = latitude != null && longitude != null &&
      haversineKm(latitude, longitude, KIGALI.latitude, KIGALI.longitude) <= 20;
    // Recall: how much of the query the name covers. Precision: how much of
    // the name the rider actually typed ("MTN Centre" beats "Nyarutarama
    // Medical Center" for "MTN Centre Nyarutarama").
    const nameTokens = tokens(properties.name);
    const precision = nameTokens.length ? coverage(nameTokens, query) : 0;
    const score = 2 * coverage(q, properties.name) + precision + coverage(q, address) + (inKigali ? 0.3 : 0);
    candidates.push({ address, latitude, longitude, score, order });
  });
  candidates.sort((a, b) => b.score - a.score || a.order - b.order);
  return candidates.map(({ address, latitude, longitude }) => ({ address, latitude, longitude }));
}

module.exports.rankResults = rankResults;
