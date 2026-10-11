// Property tests for the server's map rules and for the places where the app
// and the server must agree. No database or network needed.
//
//   node --experimental-strip-types --test tests/map/
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import { SERVICE_AREA_BOUNDS, KIGALI_CENTER } from '../../packages/shared/components/map/map-types.ts';

const require = createRequire(import.meta.url);
const { parsePoint, inServiceArea, SERVICE_AREA, assessLocationSample, cleanHeading } = require('../../server/src/services/maps/geo.js');
const { rankPlaces } = require('../../server/src/services/maps/geocoding.js');
const { recordSample, recentTrail, forget } = require('../../server/src/services/driverTrails.js');
const { getRoadRoute } = require('../../server/src/services/routing.js');

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- app ⇄ server agreement

test('agreement: every point the map lets a rider pan to (and drop a pin on) is one the server accepts', () => {
  // The pin-drop screen reports the map centre; the map is fenced to
  // SERVICE_AREA_BOUNDS. A centre the server rejects makes the address
  // lookup fail and, later, the ride request.
  const [[west, south], [east, north]] = SERVICE_AREA_BOUNDS;
  const corners = { 'south-west': [south, west], 'north-west': [north, west], 'south-east': [south, east], 'north-east': [north, east] };
  const rejected = Object.entries(corners).filter(([, [lat, lng]]) => !inServiceArea(lat, lng)).map(([k, [lat, lng]]) => `${k} (${lat}, ${lng})`);
  assert.deepEqual(
    rejected,
    [],
    `map fence [${SERVICE_AREA_BOUNDS}] is larger than the server's service area ` +
      `lat ${SERVICE_AREA.minLat}..${SERVICE_AREA.maxLat}, lng ${SERVICE_AREA.minLng}..${SERVICE_AREA.maxLng}`
  );
});

test("agreement: the map's default centre is inside the service area", () => {
  assert.ok(inServiceArea(KIGALI_CENTER.latitude, KIGALI_CENTER.longitude));
});

// ---------------------------------------------------------------- coordinates

test('parsePoint: accepts exactly the points inside the service area, in both input shapes', () => {
  const r = rng(7);
  for (let i = 0; i < 2000; i++) {
    const lat = -4 + r() * 4;
    const lng = 28 + r() * 4;
    const inside = inServiceArea(lat, lng);
    for (const input of [`${lat},${lng}`, [String(lat), String(lng)], ` ${lat} , ${lng} `]) {
      if (inside) assert.deepEqual(parsePoint(input, 'p'), { latitude: lat, longitude: lng });
      else assert.throws(() => parsePoint(input, 'p'), (e) => e.status === 400 || e.statusCode === 400);
    }
  }
});

test('parsePoint: rejects malformed input with a 400, never a crash or a bogus point', () => {
  const bad = ['', ',', '-1.9', '-1.9,', ',30', 'abc,def', 'NaN,NaN', 'Infinity,30', '-1.9,30,5x', null, undefined, [], ['-1.9'], ['', ''], '0x10,30', '1e400,30'];
  for (const v of bad) {
    assert.throws(() => parsePoint(v, 'p'), (e) => (e.status ?? e.statusCode) === 400, `accepted ${JSON.stringify(v)}`);
  }
});

test('parsePoint: "lat,lng" with an extra component is not silently truncated', () => {
  assert.throws(() => parsePoint('-1.95,30.06,99', 'p'), (e) => (e.status ?? e.statusCode) === 400);
});

// ---------------------------------------------------------------- GPS sample screening

test('assessLocationSample: a believable drive is never rejected; a teleport always is', () => {
  const limits = { maxAccuracyMeters: 100, maxSampleAgeSeconds: 30, minIntervalMs: 1000 };
  const r = rng(11);
  for (let run = 0; run < 200; run++) {
    let prev = { latitude: -1.95, longitude: 30.06, at: 1_700_000_000_000 };
    for (let i = 0; i < 20; i++) {
      const dt = 1000 + Math.floor(r() * 15000);
      const speed = r() * 30; // up to 108 km/h
      const meters = (speed * dt) / 1000;
      const next = { latitude: prev.latitude + meters / 111_320, longitude: prev.longitude, accuracy: r() * 50, recordedAt: prev.at + dt };
      const res = assessLocationSample(prev, next, prev.at + dt, limits);
      assert.ok(res.accepted, `rejected ${speed.toFixed(1)} m/s over ${dt} ms: ${res.reason}`);
      prev = { latitude: next.latitude, longitude: next.longitude, at: prev.at + dt };
    }
    const teleport = { latitude: prev.latitude + 0.05, longitude: prev.longitude };
    assert.equal(assessLocationSample(prev, teleport, prev.at + 5000, limits).reason, 'jump');
  }
});

// ---------------------------------------------------------------- headings

test('cleanHeading: only a real direction of travel is stored', () => {
  const here = { latitude: -1.95, longitude: 30.06 };
  const moved = { latitude: -1.9495, longitude: 30.06 }; // ~55 m north
  const parked = { latitude: -1.95, longitude: 30.06001 }; // ~1 m
  // Phone placeholders and garbage are "unknown".
  for (const h of [-1, -0.5, 361, NaN, Infinity, 'north', null, undefined, '']) {
    assert.equal(cleanHeading(h, here, moved), null, `kept ${String(h)}`);
  }
  // Android reports bearing 0 when standing still: no direction.
  assert.equal(cleanHeading(0, here, parked), null);
  assert.equal(cleanHeading(270, here, parked), null);
  // A real direction while moving is kept, normalised to [0, 360).
  assert.equal(cleanHeading(0, here, moved), 0);
  assert.equal(cleanHeading('90', here, moved), 90);
  assert.equal(cleanHeading(360, here, moved), 0);
  // The very first fix has nothing to compare with: trust a valid value.
  assert.equal(cleanHeading(45, null, here), 45);
});

// ---------------------------------------------------------------- place ranking

const NAMES = ['Kimironko Market', 'Kigali Heights', 'MTN Centre', 'Nyarutarama Medical Center', 'Kigali Convention Centre', 'Remera', 'KN 4 Avenue', 'Simba Supermarket'];

function randomPlaces(r) {
  const n = Math.floor(r() * 15);
  const out = [];
  for (let i = 0; i < n; i++) {
    const roll = r();
    out.push({
      name: r() < 0.9 ? NAMES[Math.floor(r() * NAMES.length)] : undefined,
      street: r() < 0.5 ? 'KG 11 Ave' : undefined,
      city: r() < 0.7 ? 'Kigali' : undefined,
      country: roll < 0.8 ? 'Rwanda' : roll < 0.9 ? 'Uganda' : undefined,
      latitude: r() < 0.95 ? -1.9 - r() * 0.1 : NaN,
      longitude: 30 + r() * 0.2,
    });
  }
  return out;
}

test('rankPlaces: output is a de-duplicated, Rwanda-only, finite subset of the input, and deterministic', () => {
  const r = rng(3);
  for (let i = 0; i < 500; i++) {
    const places = randomPlaces(r);
    const q = NAMES[Math.floor(r() * NAMES.length)].split(' ').slice(0, 1 + Math.floor(r() * 2)).join(' ');
    const out = rankPlaces(q, places);
    assert.deepEqual(rankPlaces(q, places), out);
    assert.equal(new Set(out.map((p) => p.address.toLowerCase())).size, out.length);
    for (const p of out) {
      assert.ok(Number.isFinite(p.latitude) && Number.isFinite(p.longitude));
      const src = places.find((s) => s.latitude === p.latitude && s.longitude === p.longitude);
      assert.ok(src, 'result not from the provider');
      assert.ok(!src.country || src.country === 'Rwanda', `kept a place in ${src.country}`);
      assert.ok(typeof p.name === 'string' && p.name.length > 0);
    }
  }
});

test('rankPlaces: an exact name match ranks first', () => {
  const r = rng(5);
  for (let i = 0; i < 300; i++) {
    const target = NAMES[Math.floor(r() * NAMES.length)];
    const places = randomPlaces(r).filter((p) => p.name !== target);
    const pos = Math.floor(r() * (places.length + 1));
    places.splice(pos, 0, { name: target, city: 'Kigali', country: 'Rwanda', latitude: -1.95, longitude: 30.06 });
    const out = rankPlaces(target, places);
    assert.equal(out[0].name, target, `"${target}" ranked below ${out[0].name}`);
  }
});

// ---------------------------------------------------------------- driver trails

test('driver trails: oldest first, at most 16 samples, none older than 12 s, rounded to ~11 cm', () => {
  const r = rng(9);
  for (let run = 0; run < 100; run++) {
    const id = `drv-${run}`;
    let t = 1_700_000_000_000;
    for (let i = 0; i < 50; i++) {
      t += Math.floor(r() * 3000);
      recordSample(id, { latitude: -1.95 + r() * 0.01, longitude: 30.06 + r() * 0.01, heading: r() < 0.2 ? null : r() * 360 }, t);
      const trail = recentTrail(id, t);
      assert.ok(trail.length >= 1 && trail.length <= 16);
      for (let k = 1; k < trail.length; k++) assert.ok(trail[k][0] > trail[k - 1][0]);
      for (const [st, lat, lng, h] of trail) {
        assert.ok(t - st <= 12_000);
        assert.equal(Math.round(lat * 1e6) / 1e6, lat);
        assert.equal(Math.round(lng * 1e6) / 1e6, lng);
        assert.ok(h === null || (Number.isInteger(h) && h >= 0 && h <= 360));
      }
    }
    forget(id);
    assert.deepEqual(recentTrail(id, t), []);
  }
});

// ---------------------------------------------------------------- routing fallback

test('routing: when the provider is down, lenient callers get a marked straight-line estimate and strict callers get an error', async () => {
  const realFetch = globalThis.fetch;
  const realError = console.error;
  globalThis.fetch = async () => {
    throw new TypeError('fetch failed');
  };
  console.error = () => {};
  try {
    const r = rng(13);
    for (let i = 0; i < 50; i++) {
      const from = { latitude: -1.99 + r() * 0.1, longitude: 30.0 + r() * 0.1 };
      const to = { latitude: -1.99 + r() * 0.1, longitude: 30.0 + r() * 0.1 };
      const est = await getRoadRoute(from, to);
      assert.equal(est.source, 'estimate');
      assert.deepEqual(est.coordinates[0], [from.longitude, from.latitude]);
      assert.deepEqual(est.coordinates.at(-1), [to.longitude, to.latitude]);
      assert.ok(est.distanceMeters >= 0 && est.durationSeconds >= 0);
      await assert.rejects(getRoadRoute(from, to, { strict: true }), (e) => e.code === 'MAP_SERVICE_UNAVAILABLE');
    }
  } finally {
    globalThis.fetch = realFetch;
    console.error = realError;
  }
});
