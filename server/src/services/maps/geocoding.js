const { haversineKm } = require('../../utils/distance');
const { geocodingProvider } = require('./providers');

// Place search and reverse geocoding for the whole app, on whichever
// provider MAP_GEOCODING_PROVIDER selects. Results are normalised to
// { name, address, latitude, longitude } and cached, so repeated searches
// and pins dropped on (nearly) the same spot cost the provider nothing.

const SEARCH_CACHE_MS = 10 * 60 * 1000;
const REVERSE_CACHE_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX = 2000;
const searchCache = new Map(); // normalised query -> { at, results }
const reverseCache = new Map(); // "lat,lng" at ~11 m -> { at, value }

function remember(cache, key, value) {
  cache.set(key, { at: Date.now(), value });
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
}

function labelFor(place) {
  const parts = [place.name, place.street, place.city, place.state, place.country]
    .filter((p) => p && String(p).trim().length > 0);
  // "KN 4 Avenue, KN 4 Avenue" when a road's name is also its street.
  const unique = parts.filter((p, i) => parts.findIndex((q) => q.toLowerCase() === p.toLowerCase()) === i);
  return unique.length ? unique.join(', ') : null;
}

// ---- result ranking ----
// Providers sometimes put a partial match above the exact place ("MTN Centre
// Nyarutarama" -> "Nyarutarama Medical Center" first). Results are re-ranked
// by how well the place's NAME matches the query (both ways), then by its
// full label, with a small preference for Kigali. Deterministic and instant
// (it runs on every debounced keystroke); ranking quality is measured
// offline by test/jev-place-search.js.
const KIGALI = { latitude: -1.9441, longitude: 30.0619 };
const STOPWORDS = new Set(['the', 'of', 'de', 'la', 'le', 'na', 'ya', 'and', 'in']);

function normalise(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
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

/** Ranks provider places for a query; returns normalised results. */
function rankPlaces(query, places) {
  const q = tokens(query);
  const seen = new Set();
  const candidates = [];
  places.forEach((place, order) => {
    if (!Number.isFinite(place.latitude) || !Number.isFinite(place.longitude)) return;
    // The Rwanda bounding box also covers parts of neighbouring countries.
    if (place.country && normalise(place.country) !== 'rwanda') return;
    const address = labelFor(place) || 'Unknown location';
    const key = normalise(address);
    if (seen.has(key)) return;
    seen.add(key);
    const inKigali = haversineKm(place.latitude, place.longitude, KIGALI.latitude, KIGALI.longitude) <= 20;
    // Recall: how much of the query the name covers. Precision: how much of
    // the name the rider actually typed.
    const nameTokens = tokens(place.name);
    const precision = nameTokens.length ? coverage(nameTokens, query) : 0;
    const score = 2 * coverage(q, place.name) + precision + coverage(q, address) + (inKigali ? 0.3 : 0);
    candidates.push({ name: place.name || address.split(',')[0], address, latitude: place.latitude, longitude: place.longitude, score, order });
  });
  candidates.sort((a, b) => b.score - a.score || a.order - b.order);
  return candidates.map(({ name, address, latitude, longitude }) => ({ name, address, latitude, longitude }));
}

/**
 * Places matching [query] in Rwanda, best first.
 * Throws MapProviderError when the provider cannot answer.
 */
async function searchPlaces(query, near = null) {
  const key = normalise(query);
  const hit = searchCache.get(key);
  if (hit && Date.now() - hit.at < SEARCH_CACHE_MS) return hit.value;
  const places = await geocodingProvider().search(query, near);
  const results = rankPlaces(query, places).slice(0, 8);
  // An empty answer is not cached: the place may simply not be indexed yet.
  if (results.length) remember(searchCache, key, results);
  return results;
}

/**
 * A human-readable address for a coordinate, or null when the provider
 * knows none there. Coordinates are rounded to ~11 m for the cache, so GPS
 * jitter and pins dropped a few metres apart reuse one lookup.
 */
async function reverseGeocode(latitude, longitude) {
  const key = `${latitude.toFixed(4)},${longitude.toFixed(4)}`;
  const hit = reverseCache.get(key);
  if (hit && Date.now() - hit.at < REVERSE_CACHE_MS) return hit.value;
  const place = await geocodingProvider().reverse(latitude, longitude);
  const address = place ? labelFor(place) : null;
  if (address) remember(reverseCache, key, address);
  return address;
}

/** Test hook: forget everything cached. */
function clearGeocodingCaches() {
  searchCache.clear();
  reverseCache.clear();
}

module.exports = { searchPlaces, reverseGeocode, rankPlaces, clearGeocodingCaches };
