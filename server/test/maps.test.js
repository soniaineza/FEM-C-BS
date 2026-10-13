process.env.DATABASE_URL = 'postgres://user:pass@db.example.com:5432/kimu';
process.env.MAP_ROUTING_API_KEY = 'test-routing-key';
process.env.MAP_GEOCODING_API_KEY = 'test-geocoding-key';

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { config } = require('../src/config');
const routing = require('../src/services/routing');
const geocoding = require('../src/services/maps/geocoding');
const { MapProviderError } = require('../src/services/maps/providers');
const { isValidCoordinate, inServiceArea, parsePoint, assessLocationSample } = require('../src/services/maps/geo');

const KIGALI = { latitude: -1.9441, longitude: 30.0619 };
const NYAMIRAMBO = { latitude: -1.9586, longitude: 30.0205 };

let calls = [];
let respond = () => { throw new Error('no stub'); };
const realFetch = global.fetch;
global.fetch = async (url, options) => {
  calls.push({ url: String(url), options });
  return respond(String(url), options);
};
const json = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

beforeEach(() => {
  calls = [];
  routing.clearRouteCache();
  geocoding.clearGeocodingCaches();
  config.mapRoutingProvider = 'osrm';
  config.mapGeocodingProvider = 'photon';
  config.localDatabase = false;
});
test.after(() => { global.fetch = realFetch; });

const OSRM_ROUTE = { routes: [{ distance: 4200, duration: 780, geometry: { coordinates: [[30.0619, -1.9441], [30.04, -1.95], [30.0205, -1.9586]] } }] };
const GEOAPIFY_ROUTE = {
  features: [{
    properties: { distance: 5100, distance_units: 'meters', time: 900 },
    geometry: { type: 'MultiLineString', coordinates: [[[30.0619, -1.9441], [30.04, -1.95]], [[30.04, -1.95], [30.0205, -1.9586]]] },
  }],
};

test('valid coordinates are accepted', () => {
  assert.equal(isValidCoordinate(-1.9441, 30.0619), true);
  assert.equal(inServiceArea(-1.9441, 30.0619), true);
  assert.deepEqual(parsePoint('-1.9441,30.0619', 'origin'), KIGALI);
});

test('invalid coordinates are rejected', () => {
  for (const [lat, lng] of [[91, 30], [-1.9, 181], [NaN, 30], ['-1.9', 30], [null, undefined], [Infinity, 30]]) {
    assert.equal(isValidCoordinate(lat, lng), false, `${lat},${lng}`);
  }
  assert.throws(() => parsePoint('abc,def', 'origin'), { status: 400, code: 'INVALID_COORDINATES' });
  assert.throws(() => parsePoint('', 'origin'), { status: 400, code: 'INVALID_COORDINATES' });
  assert.throws(() => parsePoint('-1.9441', 'origin'), { status: 400, code: 'INVALID_COORDINATES' });
});

test('coordinates outside the service area are rejected', () => {
  assert.equal(inServiceArea(48.8566, 2.3522), false); // Paris
  assert.throws(() => parsePoint('48.8566,2.3522', 'destination'), { status: 400, code: 'OUTSIDE_SERVICE_AREA' });
});

// ---- routing ----
test('routing success (OSRM): distance, duration, geometry and provider', async () => {
  respond = () => json(OSRM_ROUTE);
  const route = await routing.getRoadRoute(KIGALI, NYAMIRAMBO, { strict: true });
  assert.equal(route.distanceMeters, 4200);
  assert.equal(route.durationSeconds, 780);
  assert.equal(route.coordinates.length, 3);
  assert.equal(route.provider, 'osrm');
  assert.equal(route.source, 'provider');
  assert.match(calls[0].url, /30\.0619,-1\.9441;30\.0205,-1\.9586/); // OSRM takes lng,lat
});

test('routing success (Geoapify): legs are joined and the key stays in the request only', async () => {
  config.mapRoutingProvider = 'geoapify';
  respond = () => json(GEOAPIFY_ROUTE);
  const route = await routing.getRoadRoute(KIGALI, NYAMIRAMBO, { strict: true });
  assert.equal(route.distanceMeters, 5100);
  assert.equal(route.durationSeconds, 900);
  assert.equal(route.coordinates.length, 4);
  assert.equal(route.provider, 'geoapify');
  assert.match(calls[0].url, /waypoints=-1\.9441,30\.0619\|-1\.9586,30\.0205/); // Geoapify takes lat,lon
  assert.match(calls[0].url, /apiKey=test-routing-key/);
  assert.equal(JSON.stringify(route).includes('test-routing-key'), false);
});

test('a repeated route is served from the cache', async () => {
  respond = () => json(OSRM_ROUTE);
  await routing.getRoadRoute(KIGALI, NYAMIRAMBO, { strict: true });
  await routing.getRoadRoute(KIGALI, NYAMIRAMBO, { strict: true });
  assert.equal(calls.length, 1);
});

test('routing failure: strict raises a retryable error, lenient estimates', async () => {
  respond = () => json({ message: 'boom' }, 500);
  await assert.rejects(routing.getRoadRoute(KIGALI, NYAMIRAMBO, { strict: true }), (err) =>
    err instanceof MapProviderError && err.status === 503 && err.code === 'MAP_SERVICE_UNAVAILABLE' && err.reason === 'unavailable');
  const estimate = await routing.getRoadRoute(KIGALI, NYAMIRAMBO);
  assert.equal(estimate.source, 'estimate');
  assert.ok(estimate.distanceMeters > 4000);
});

test('a failed route is not cached: the next request asks the provider again', async () => {
  respond = () => json({}, 500);
  await routing.getRoadRoute(KIGALI, NYAMIRAMBO);
  respond = () => json(OSRM_ROUTE);
  const route = await routing.getRoadRoute(KIGALI, NYAMIRAMBO, { strict: true });
  assert.equal(route.source, 'provider');
});

test('provider timeout is reported as a timeout', async () => {
  respond = () => { const err = new Error('timed out'); err.name = 'TimeoutError'; throw err; };
  await assert.rejects(routing.getRoadRoute(KIGALI, NYAMIRAMBO, { strict: true }), (err) => err.reason === 'timeout');
});

test('provider rate-limit response is reported as rate limited', async () => {
  respond = () => json({ message: 'too many' }, 429);
  await assert.rejects(routing.getRoadRoute(KIGALI, NYAMIRAMBO, { strict: true }), (err) => err.reason === 'rate_limited' && err.status === 503);
});

test('a provider answer with no route is an error, not an empty route', async () => {
  respond = () => json({ routes: [] });
  await assert.rejects(routing.getRoadRoute(KIGALI, NYAMIRAMBO, { strict: true }), (err) => err.reason === 'no_result');
});

test('fare routes: a hosted server never prices a guessed distance; a local one may', async () => {
  respond = () => json({}, 500);
  await assert.rejects(routing.getFareRoute(KIGALI, NYAMIRAMBO), MapProviderError);
  config.localDatabase = true;
  assert.equal((await routing.getFareRoute(KIGALI, NYAMIRAMBO)).source, 'estimate');
});

test('a keyed provider without its key is refused before any request', async () => {
  config.mapRoutingProvider = 'geoapify';
  const key = config.mapRoutingApiKey;
  config.mapRoutingApiKey = '';
  try {
    await assert.rejects(routing.getRoadRoute(KIGALI, NYAMIRAMBO, { strict: true }), (err) => err.reason === 'not_configured');
    assert.equal(calls.length, 0);
  } finally {
    config.mapRoutingApiKey = key;
  }
});

test('travel-time matrix falls back to estimates when the provider has none or fails', async () => {
  config.mapRoutingProvider = 'geoapify'; // no matrix service in this adapter
  const matrix = await routing.getTravelMatrix([KIGALI, NYAMIRAMBO]);
  assert.equal(calls.length, 0);
  assert.equal(matrix[0][0], 0);
  assert.ok(matrix[0][1] > 0);
  config.mapRoutingProvider = 'osrm';
  respond = () => json({}, 500);
  assert.equal(await routing.getTravelTimes([KIGALI], NYAMIRAMBO), null);
});

// ---- geocoding ----
const PHOTON_SEARCH = {
  features: [
    { properties: { name: 'Kimironko Market', street: 'KG 11 Ave', city: 'Kigali', country: 'Rwanda' }, geometry: { coordinates: [30.1267, -1.9497] } },
    { properties: { name: 'Kimironko', city: 'Kampala', country: 'Uganda' }, geometry: { coordinates: [32.58, 0.34] } },
  ],
};

test('geocoding success (Photon): normalised results, other countries dropped', async () => {
  respond = () => json(PHOTON_SEARCH);
  const results = await geocoding.searchPlaces('Kimironko Market');
  assert.deepEqual(results, [{ name: 'Kimironko Market', address: 'Kimironko Market, KG 11 Ave, Kigali, Rwanda', latitude: -1.9497, longitude: 30.1267 }]);
});

test('geocoding success (Geoapify): normalised results, restricted to Rwanda', async () => {
  config.mapGeocodingProvider = 'geoapify';
  respond = () => json({ results: [{ name: 'Kimironko', city: 'Kigali', country: 'Rwanda', lat: -1.944, lon: 30.104 }] });
  const results = await geocoding.searchPlaces('Kimironko');
  assert.deepEqual(results, [{ name: 'Kimironko', address: 'Kimironko, Kigali, Rwanda', latitude: -1.944, longitude: 30.104 }]);
  assert.match(calls[0].url, /filter=countrycode:rw/);
  assert.match(calls[0].url, /apiKey=test-geocoding-key/);
});

test('a repeated search is served from the cache', async () => {
  respond = () => json(PHOTON_SEARCH);
  await geocoding.searchPlaces('Kimironko Market');
  await geocoding.searchPlaces('  kimironko   MARKET ');
  assert.equal(calls.length, 1);
});

test('geocoding failure raises a retryable error', async () => {
  respond = () => json({}, 500);
  await assert.rejects(geocoding.searchPlaces('Kimironko'), (err) => err instanceof MapProviderError && err.status === 503);
});

test('a search with no matches returns an empty list', async () => {
  respond = () => json({ features: [] });
  assert.deepEqual(await geocoding.searchPlaces('zzzzqqqq'), []);
});

test('reverse geocoding returns an address and reuses it for nearly identical coordinates', async () => {
  respond = () => json({ features: [{ properties: { name: 'KG 7 Ave', city: 'Kigali', country: 'Rwanda' } }] });
  assert.equal(await geocoding.reverseGeocode(-1.94410, 30.06190), 'KG 7 Ave, Kigali, Rwanda');
  // A few metres away (same ~11 m cell): no second provider request.
  assert.equal(await geocoding.reverseGeocode(-1.94412, 30.06191), 'KG 7 Ave, Kigali, Rwanda');
  assert.equal(calls.length, 1);
  // Far enough to be a different place: a new request.
  await geocoding.reverseGeocode(-1.9500, 30.0700);
  assert.equal(calls.length, 2);
});

test('reverse geocoding with nothing there is null, not an error', async () => {
  config.mapGeocodingProvider = 'geoapify';
  respond = () => json({ results: [] });
  assert.equal(await geocoding.reverseGeocode(-1.9441, 30.0619), null);
});

// ---- driver GPS samples ----
const LIMITS = { maxAccuracyMeters: 150, maxSampleAgeSeconds: 60, minIntervalMs: 1000 };
const NOW = 1_800_000_000_000;
const at = (secondsAgo) => ({ ...KIGALI, at: NOW - secondsAgo * 1000 });

test('a normal move is accepted', () => {
  assert.deepEqual(assessLocationSample(at(5), { latitude: -1.9445, longitude: 30.0623, accuracy: 12, recordedAt: NOW - 500 }, NOW, LIMITS), { accepted: true });
  assert.deepEqual(assessLocationSample(null, { ...KIGALI }, NOW, LIMITS), { accepted: true });
});

test('driver GPS jump detection: an impossible move is rejected', () => {
  // ~50 km in 5 seconds.
  assert.deepEqual(assessLocationSample(at(5), { latitude: -2.4, longitude: 30.0619 }, NOW, LIMITS), { accepted: false, reason: 'jump' });
  // The same distance after a long gap (phone was off) is plausible driving.
  assert.deepEqual(assessLocationSample(at(3600), { latitude: -2.4, longitude: 30.0619 }, NOW, LIMITS), { accepted: true });
});

test('a fix the phone took long ago is rejected as stale', () => {
  assert.deepEqual(assessLocationSample(at(30), { ...KIGALI, recordedAt: NOW - 10 * 60 * 1000 }, NOW, LIMITS), { accepted: false, reason: 'stale' });
});

test('an inaccurate fix is rejected', () => {
  assert.deepEqual(assessLocationSample(at(30), { ...KIGALI, accuracy: 800 }, NOW, LIMITS), { accepted: false, reason: 'low_accuracy' });
});

test('updates faster than the allowed rate are ignored', () => {
  assert.deepEqual(assessLocationSample(at(0.2), { ...KIGALI }, NOW, LIMITS), { accepted: false, reason: 'too_frequent' });
});

test('a fix outside the service area or malformed is rejected', () => {
  assert.equal(assessLocationSample(null, { latitude: 48.85, longitude: 2.35 }, NOW, LIMITS).reason, 'invalid');
  assert.equal(assessLocationSample(null, { ...KIGALI, accuracy: -5 }, NOW, LIMITS).reason, 'invalid');
  assert.equal(assessLocationSample(null, { ...KIGALI, recordedAt: NaN }, NOW, LIMITS).reason, 'invalid');
});
