// Property tests for the map's pure motion/geometry helpers
// (packages/shared/components/map/trackInterpolation.ts).
//
//   node --experimental-strip-types --test tests/map/
//
// Each property runs on a few hundred seeded random cases around Kigali, so a
// failure prints a seed that reproduces it.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  Track,
  lerpAngle,
  bearing,
  distanceM,
  projectOnRoute,
} from '../../packages/shared/components/map/trackInterpolation.ts';

const RUNS = 300;

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

/** A plausible drive: ~1 s samples, up to ~20 m/s, around central Kigali. */
function randomDrive(r, n = 2 + Math.floor(r() * 14), t0 = 1_700_000_000_000) {
  let lat = -1.95 + r() * 0.02;
  let lng = 30.05 + r() * 0.02;
  let t = t0;
  let dir = r() * 360;
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push([t, lat, lng, r() < 0.2 ? null : Math.round(dir)]);
    t += 700 + Math.floor(r() * 900);
    dir = (dir + (r() - 0.5) * 60 + 360) % 360;
    const step = r() * 20 / 111_320;
    lat += Math.cos((dir * Math.PI) / 180) * step;
    lng += Math.sin((dir * Math.PI) / 180) * step;
  }
  return out;
}

function shuffle(r, a) {
  const b = a.slice();
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

function forAll(name, fn) {
  test(name, () => {
    for (let seed = 1; seed <= RUNS; seed++) {
      try {
        fn(rng(seed), seed);
      } catch (err) {
        err.message = `[seed ${seed}] ${err.message}`;
        throw err;
      }
    }
  });
}

// ---------------------------------------------------------------- Track

forAll('track: points stay strictly ordered by time with no duplicates, whatever the arrival order', (r) => {
  const drive = randomDrive(r);
  const track = new Track();
  // Overlapping, out-of-order polls, as the server sends the last few seconds each time.
  for (let k = 0; k < 4; k++) track.add(shuffle(r, drive.slice(Math.floor(r() * drive.length))), drive.at(-1)[0]);
  for (let i = 1; i < track.points.length; i++) assert.ok(track.points[i].t > track.points[i - 1].t);
});

forAll('track: adding the same samples in any order yields the same timeline', (r) => {
  const drive = randomDrive(r);
  const now = drive.at(-1)[0];
  const a = new Track();
  a.add(drive, now);
  const b = new Track();
  b.add(shuffle(r, drive), now);
  assert.deepEqual(b.points, a.points);
});

forAll('track: adding samples twice is a no-op (idempotent)', (r) => {
  const drive = randomDrive(r);
  const now = drive.at(-1)[0];
  const a = new Track();
  a.add(drive, now);
  const before = JSON.stringify(a.points);
  a.add(drive, now);
  assert.equal(JSON.stringify(a.points), before);
});

forAll('track: between two samples the car is on the segment joining them', (r) => {
  const drive = randomDrive(r);
  const track = new Track();
  track.add(drive, drive.at(-1)[0]);
  const pts = track.points;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const t = a.t + r() * (b.t - a.t);
    const s = track.sample(t);
    const eps = 1e-9;
    assert.ok(s.lat >= Math.min(a.lat, b.lat) - eps && s.lat <= Math.max(a.lat, b.lat) + eps);
    assert.ok(s.lng >= Math.min(a.lng, b.lng) - eps && s.lng <= Math.max(a.lng, b.lng) + eps);
  }
});

forAll('track: motion is continuous (no jumps between frames ~33 ms apart)', (r) => {
  const drive = randomDrive(r);
  const track = new Track();
  track.add(drive, drive.at(-1)[0]);
  const start = track.points[0].t - 500;
  const end = track.points.at(-1).t + 1500;
  let prev = track.sample(start);
  for (let t = start + 33; t <= end; t += 33) {
    const s = track.sample(t);
    // 20 m/s max in the generator: a frame never moves the car more than a
    // few metres.
    assert.ok(distanceM(prev.lat, prev.lng, s.lat, s.lng) < 5, `jumped at t=${t - start}`);
    prev = s;
  }
});

forAll('track: past the last sample the car holds its position (no guessing ahead)', (r) => {
  const drive = randomDrive(r, 3 + Math.floor(r() * 5));
  const track = new Track();
  track.add(drive, drive.at(-1)[0]);
  const last = track.points.at(-1);
  const far = track.sample(last.t + 60_000);
  assert.deepEqual([far.lat, far.lng], [last.lat, last.lng]);
});

forAll('track: retention keeps at least two points and drops old history', (r) => {
  const drive = randomDrive(r, 40);
  const track = new Track();
  for (const s of drive) track.add([s], s[0]);
  assert.ok(track.points.length >= 2);
  const now = drive.at(-1)[0];
  // Everything but the one point bracketing the cutoff is within 50 s
  // (the longest playback delay plus margin).
  assert.ok(track.points.slice(1).every((p) => now - p.t <= 50_000));
});

test('track: a stopped car keeps facing the way it was driving', () => {
  // Drive east for a few seconds, then stop. Phones report a heading for a
  // stationary fix that means "unknown": iOS sends course -1, Android sends
  // bearing 0 when it has none (expo-location passes both through).
  const t0 = 1_700_000_000_000;
  const east = (i) => [t0 + i * 1000, -1.95, 30.06 + i * 0.0001, 90];
  for (const unknownHeading of [null, -1, 0]) {
    const track = new Track();
    const stop = east(4);
    track.add([east(0), east(1), east(2), east(3), stop, [stop[0] + 1000, stop[1], stop[2], unknownHeading], [stop[0] + 2000, stop[1], stop[2], unknownHeading]], t0 + 6000);
    const moving = track.sample(t0 + 2500);
    assert.ok(Math.abs(moving.heading - 90) < 1);
    const parked = track.sample(t0 + 5500);
    assert.ok(
      Math.abs(parked.heading - 90) < 1,
      `parked car turned to ${parked.heading.toFixed(0)}° when the phone reported heading ${unknownHeading}`
    );
  }
});

// ---------------------------------------------------------------- angles

forAll('lerpAngle: stays in [0, 360), hits both ends, and turns the short way', (r) => {
  const from = r() * 360;
  const to = r() * 360;
  const f = r();
  const v = lerpAngle(from, to, f);
  assert.ok(v >= 0 && v < 360, `got ${v}`);
  const near = (a, b) => Math.abs(((a - b + 540) % 360) - 180) < 1e-9;
  assert.ok(near(lerpAngle(from, to, 0), from));
  assert.ok(near(lerpAngle(from, to, 1), to));
  const arc = Math.abs(((to - from + 540) % 360) - 180);
  const moved = Math.abs(((v - from + 540) % 360) - 180);
  assert.ok(moved <= arc * f + 1e-9);
});

test('lerpAngle: copes with the -1 "no course" heading iOS reports', () => {
  for (const to of [0, 90, 359, -1]) {
    const v = lerpAngle(-1, to, 0.18);
    assert.ok(v >= 0 && v < 360, `lerpAngle(-1, ${to}) = ${v}`);
  }
});

forAll('bearing: in [0, 360) and reverses by 180° over short distances', (r) => {
  const lat = -2 + r() * 0.2;
  const lng = 30 + r() * 0.2;
  const lat2 = lat + (r() - 0.5) * 0.01;
  const lng2 = lng + (r() - 0.5) * 0.01;
  const b = bearing(lat, lng, lat2, lng2);
  const back = bearing(lat2, lng2, lat, lng);
  assert.ok(b >= 0 && b < 360);
  const diff = Math.abs(((b - back + 540) % 360) - 180); // smallest angle between them
  assert.ok(Math.abs(diff - 180) < 0.01, `${b} vs ${back}`);
});

// ---------------------------------------------------------------- distance

forAll('distanceM: a metric (zero, symmetric, triangle inequality)', (r) => {
  const p = () => [-2 + r() * 0.5, 29.8 + r() * 0.6];
  const [a, b, c] = [p(), p(), p()];
  assert.equal(distanceM(...a, ...a), 0);
  assert.ok(Math.abs(distanceM(...a, ...b) - distanceM(...b, ...a)) < 1e-6);
  assert.ok(distanceM(...a, ...c) <= distanceM(...a, ...b) + distanceM(...b, ...c) + 1e-6);
});

test('distanceM: one degree of latitude is ~111 km', () => {
  assert.ok(Math.abs(distanceM(-2, 30, -1, 30) - 111_195) < 50);
});

// ---------------------------------------------------------------- route projection

function randomRoute(r) {
  const n = 2 + Math.floor(r() * 30);
  const pts = [];
  let lng = 30.05 + r() * 0.05;
  let lat = -1.96 + r() * 0.05;
  for (let i = 0; i < n; i++) {
    pts.push([lng, lat]);
    lng += (r() - 0.3) * 0.002;
    lat += (r() - 0.5) * 0.002;
  }
  return pts;
}

function lengthM(coords) {
  let m = 0;
  for (let i = 1; i < coords.length; i++) m += distanceM(coords[i - 1][1], coords[i - 1][0], coords[i][1], coords[i][0]);
  return m;
}

forAll('projectOnRoute: the projection is on the route, at least as close as any vertex', (r) => {
  const route = randomRoute(r);
  const lat = -1.96 + r() * 0.06;
  const lng = 30.05 + r() * 0.06;
  const { index, point } = projectOnRoute(route, lat, lng);
  assert.ok(index >= 0 && index < route.length - 1);
  const [a, b] = [route[index], route[index + 1]];
  const eps = 1e-12;
  assert.ok(point[0] >= Math.min(a[0], b[0]) - eps && point[0] <= Math.max(a[0], b[0]) + eps);
  assert.ok(point[1] >= Math.min(a[1], b[1]) - eps && point[1] <= Math.max(a[1], b[1]) + eps);
  const dProj = distanceM(lat, lng, point[1], point[0]);
  for (const v of route) assert.ok(dProj <= distanceM(lat, lng, v[1], v[0]) + 0.5);
});

forAll('projectOnRoute: what is left to drive is never longer than the route (ETA never grows past the plan)', (r) => {
  const route = randomRoute(r);
  const i = Math.floor(r() * (route.length - 1));
  const f = r();
  const on = [route[i][0] + (route[i + 1][0] - route[i][0]) * f, route[i][1] + (route[i + 1][1] - route[i][1]) * f];
  const { index, point } = projectOnRoute(route, on[1], on[0]);
  const rest = [point, ...route.slice(index + 1)];
  assert.ok(lengthM(rest) <= lengthM(route) + 0.01);
});

test('projectOnRoute: fewer than two points has no projection', () => {
  assert.equal(projectOnRoute([], -1.95, 30.06), null);
  assert.equal(projectOnRoute([[30.06, -1.95]], -1.95, 30.06), null);
});

// ---------------------------------------------------------------- end to end cadence

/**
 * Replays the real pipeline for a car driving a straight road at constant
 * speed: the driver app reports every `reportMs` (DRIVER_LOCATION_INTERVAL_MS
 * in apps/driver/utils/driver-background-location.ts), the server timestamps
 * each fix on arrival and keeps 12 s of trail (server/src/services/driverTrails.js),
 * the rider polls every 2 s (apps/passenger/hooks/useNearbyCars.ts) with
 * `latencyMs` of network delay, and the map samples the track at ~30 fps.
 * Returns the largest single-frame move and whether the car ever went backwards.
 */
function replay({ reportMs, latencyMs, speedMps = 10, seconds = 60, warmupMs = 20_000 }) {
  const gapAt = typeof reportMs === 'function' ? reportMs : () => reportMs;
  const t0 = 1_700_000_000_000;
  const at = (t) => [-1.95, 30.0 + ((t - t0) / 1000) * speedMps / 111_320];
  const trail = [];
  const track = new Track();
  let nextReport = t0;
  let nextPoll = t0 + 500;
  const pending = []; // poll responses in flight: { deliverAt, samples }
  let prev = null;
  let maxStepM = 0;
  let backwards = 0;
  let lastRenderT = -Infinity;
  let timeBackwards = 0;
  let maxLagM = 0;
  for (let now = t0; now < t0 + seconds * 1000; now += 33) {
    if (now >= nextReport) {
      const [lat, lng] = at(nextReport);
      trail.push([now, lat, lng, 90]);
      while (trail.length && now - trail[0][0] > 12_000) trail.shift();
      nextReport += gapAt(now - t0);
    }
    if (now >= nextPoll) {
      pending.push({ deliverAt: now + latencyMs, samples: trail.slice() });
      nextPoll = now + latencyMs + 2000;
    }
    while (pending.length && pending[0].deliverAt <= now) track.add(pending.shift().samples, now);
    const renderT = track.renderTime(now); // exactly what the map's CarLayer does
    if (renderT < lastRenderT) timeBackwards++;
    lastRenderT = renderT;
    const s = track.sample(renderT);
    if (!s) continue;
    if (now > t0 + warmupMs) maxLagM = Math.max(maxLagM, distanceM(s.lat, s.lng, ...at(now)));
    if (prev && now > t0 + warmupMs) {
      const step = distanceM(prev.lat, prev.lng, s.lat, s.lng);
      maxStepM = Math.max(maxStepM, step);
      if (s.lng < prev.lng - 1e-9) backwards++;
    }
    prev = s;
  }
  return { maxStepM, backwards, timeBackwards, maxLagM };
}

for (const [label, reportMs] of [['on a trip (4 s reports)', 4000], ['idle on the home map (15 s reports)', 15000]]) {
  test(`cadence: a car driving steadily ${label} glides — no frame jumps more than 3 m, never backwards`, () => {
    for (const latencyMs of [150, 600, 1500]) {
      const { maxStepM, backwards } = replay({ reportMs, latencyMs });
      // 10 m/s is 0.33 m per 33 ms frame; allow 10x for easing.
      assert.ok(
        maxStepM < 3 && backwards === 0,
        `latency ${latencyMs} ms: largest jump ${maxStepM.toFixed(1)} m in one frame, ${backwards} backward frames`
      );
    }
  });
}

test('cadence: switching between waiting (15 s reports) and a trip (4 s reports) never jumps, reverses or rewinds', () => {
  // Idle for 40 s, on a trip for 40 s, idle again: the playback delay has to
  // grow and shrink without the car leaping or sliding backwards.
  const schedule = (ms) => (ms < 40_000 || ms >= 80_000 ? 15_000 : 4_000);
  for (const latencyMs of [150, 600, 1500]) {
    const { maxStepM, backwards, timeBackwards } = replay({ reportMs: schedule, latencyMs, seconds: 120, warmupMs: 1000 });
    assert.equal(timeBackwards, 0, `playback time went backwards (latency ${latencyMs} ms)`);
    assert.equal(backwards, 0, `car slid backwards (latency ${latencyMs} ms)`);
    assert.ok(maxStepM < 3, `largest jump ${maxStepM.toFixed(1)} m (latency ${latencyMs} ms)`);
  }
});

test('cadence: on a trip the drawn car trails the real one by a bounded amount', () => {
  // The price of smooth motion is drawing the car a few seconds late; keep
  // it to about one report gap plus polling (~8 s, ~80 m at 10 m/s).
  const { maxLagM } = replay({ reportMs: 4000, latencyMs: 600 });
  assert.ok(maxLagM < 90, `drawn ${maxLagM.toFixed(0)} m behind`);
});

test('cadence: when reports stop the car waits at its last fix instead of driving on', () => {
  const t0 = 1_700_000_000_000;
  const track = new Track();
  const fixes = [0, 4000, 8000].map((dt, i) => [t0 + dt, -1.95, 30.06 + i * 0.0004, 90]);
  track.add(fixes, t0 + 8000);
  let s;
  for (let now = t0 + 8000; now < t0 + 60_000; now += 33) s = track.sample(track.renderTime(now));
  assert.deepEqual([s.lat, s.lng], [fixes[2][1], fixes[2][2]]);
});
