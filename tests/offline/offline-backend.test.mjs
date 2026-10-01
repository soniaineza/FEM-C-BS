// End-to-end scenarios for the on-device backend (services/offline/), run
// against the real route table with a fake clock: no network, no server, no
// React Native. The TypeScript sources are transpiled into a temp directory
// and loaded as CommonJS.
//
//   npm run test:offline

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../services/offline');
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'femcabs-offline-'));
// device.ts / mode.ts import React Native; everything else is plain TypeScript.
for (const file of fs.readdirSync(root)) {
  if (!file.endsWith('.ts') || file === 'device.ts' || file === 'mode.ts') continue;
  const js = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  fs.writeFileSync(path.join(out, file.replace(/\.ts$/, '.js')), js);
}
const require = createRequire(import.meta.url);
const load = (name) => require(path.join(out, name));
const { dispatch } = load('http.js');
load('index.js'); // registers every route
const dbModule = load('db.js');
const sim = load('sim.js');
const geo = load('geo.js');
const smsModule = load('sms.js');
const roads = load('roads.js');
const { createPindoSender } = load('pindo.js');
const { createTwilioSender, createTwilioVerifier } = load('twilio.js');

// ---- harness -------------------------------------------------------------

const memory = new Map();
const memoryStore = {
  getItem: async (k) => memory.get(k) ?? null,
  setItem: async (k, v) => void memory.set(k, v),
  removeItem: async (k) => void memory.delete(k),
};
const realNow = Date.now;
let clock = Date.parse('2026-09-30T08:00:00Z');
const advance = (ms) => {
  clock += ms;
};

const KIGALI = { latitude: -1.9441, longitude: 30.0619 };
const call = async (method, url, body, token) => {
  const res = await dispatch(method, url, body, token ?? null);
  return { status: res.status, ...res.body, body: res.body };
};

before(() => {
  Date.now = () => clock;
  dbModule.setStore(memoryStore);
});
after(() => {
  Date.now = realNow;
  fs.rmSync(out, { recursive: true, force: true });
});

async function newPassenger(tag) {
  const signup = await call('POST', '/auth/signup', {
    fullName: `Test ${tag}`,
    phone: `+25078${String(Math.abs(hashCode(tag))).padStart(7, '0').slice(0, 7)}`,
    email: `${tag}@example.com`,
    password: 'secret1',
  });
  assert.equal(signup.status, 201);
  assert.match(signup.devCode, /^\d{6}$/);
  const verify = await call('POST', '/auth/verify-otp', { passengerId: signup.passenger.id, code: signup.devCode });
  assert.equal(verify.status, 200);
  await call('PUT', '/auth/profile', { fullName: `Test ${tag}`, phone: signup.passenger.phone }, signup.token);
  return { token: signup.token, id: signup.passenger.id };
}

function hashCode(s) {
  let h = 0;
  for (const c of s) h = (Math.imul(31, h) + c.charCodeAt(0)) | 0;
  return h;
}

const pickup = { address: 'Kigali City Tower, Kigali, Rwanda', latitude: -1.9447, longitude: 30.0612 };
const destination = { address: 'Kimironko Market, Kigali, Rwanda', latitude: -1.9492, longitude: 30.1262 };

async function book(token, paymentMethodId = 'cash', vehicleId = 'fem_economy') {
  const quote = await call(
    'GET',
    `/rides/quote?rideType=private&pickup=${pickup.latitude},${pickup.longitude}&destination=${destination.latitude},${destination.longitude}`,
    undefined,
    token
  );
  const option = quote.quote.options.find((o) => o.vehicleId === vehicleId);
  const res = await call('POST', '/rides', { pickup, destination, vehicleId, paymentMethodId, rideType: 'private', quoteId: option.quoteId }, token);
  return { res, option };
}

async function playToPaymentPending(token, rideId) {
  advance(sim.TIMING.assignMs + sim.TIMING.acceptMs + sim.TIMING.approachMs + sim.TIMING.waitAtPickupMs + sim.TIMING.pinMs + sim.TIMING.maxTripMs + 1000);
  const r = await call('GET', `/rides/${rideId}`, undefined, token);
  return r.ride;
}

// ---- scenarios -------------------------------------------------------------

describe('accounts', () => {
  it('signs up, verifies with the on-screen code, logs in and rejects a wrong password', async () => {
    const { token, id } = await newPassenger('alice');
    const me = await call('GET', '/auth/me', undefined, token);
    assert.equal(me.passenger.id, id);
    assert.equal(me.passenger.isVerified, true);

    const login = await call('POST', '/auth/login', { identifier: 'ALICE@example.com', password: 'secret1' });
    assert.equal(login.status, 200);
    const bad = await call('POST', '/auth/login', { identifier: 'alice@example.com', password: 'nope-nope' });
    assert.equal(bad.status, 401);
    const dup = await call('POST', '/auth/signup', { fullName: 'A', phone: '+250780000001', email: 'alice@example.com', password: 'secret1' });
    assert.equal(dup.status, 409);
    const unauth = await call('GET', '/auth/me');
    assert.equal(unauth.status, 401);
  });

  it('rejects a wrong or reused OTP', async () => {
    const s = await call('POST', '/auth/signup', { fullName: 'Bob', phone: '+250781111111', email: 'bob@example.com', password: 'secret1' });
    const wrong = await call('POST', '/auth/verify-otp', { passengerId: s.passenger.id, code: '000000' });
    assert.equal(wrong.status, s.devCode === '000000' ? 200 : 400);
    if (wrong.status === 400) {
      assert.equal((await call('POST', '/auth/verify-otp', { passengerId: s.passenger.id, code: s.devCode })).status, 200);
      assert.equal((await call('POST', '/auth/verify-otp', { passengerId: s.passenger.id, code: s.devCode })).status, 400);
    }
  });

  it('resets a password with the code', async () => {
    await newPassenger('carol');
    const req = await call('POST', '/auth/reset-password/request', { identifier: 'carol@example.com' });
    assert.match(req.devCode, /^\d{6}$/);
    const done = await call('POST', '/auth/reset-password/confirm', { identifier: 'carol@example.com', code: req.devCode, newPassword: 'brand-new' });
    assert.equal(done.status, 200);
    assert.equal((await call('POST', '/auth/login', { identifier: 'carol@example.com', password: 'brand-new' })).status, 200);
  });

  it('gives a verified account the demo wallet credit', async () => {
    const { token } = await newPassenger('dave');
    const wallet = await call('GET', '/wallet', undefined, token);
    assert.equal(wallet.wallet.balance, 10_000);
    const top = await call('POST', '/wallet/topup', { phone: '+250781234567', amount: 5000 }, token);
    assert.equal(top.topup.status, 'succeeded');
    assert.equal((await call('GET', '/wallet', undefined, token)).wallet.balance, 15_000);
  });
});

describe('places and routes work with no geocoder', () => {
  it('searches and reverse-geocodes the built-in gazetteer', async () => {
    const found = await call('GET', '/locations/search?q=kimironko');
    assert.ok(found.results.length > 0);
    assert.match(found.results[0].address, /Kimironko/);
    const rev = await call('GET', `/locations/reverse?lat=${pickup.latitude}&lng=${pickup.longitude}`);
    assert.match(rev.address, /Kigali City Tower/);
    const far = await call('GET', '/locations/reverse?lat=37.42&lng=-122.08');
    assert.match(far.address, /Pinned location/);
    const route = await call('GET', `/locations/route?fromLat=${pickup.latitude}&fromLng=${pickup.longitude}&toLat=${destination.latitude}&toLng=${destination.longitude}`);
    assert.ok(route.points.length > 10);
    assert.ok(route.distanceMeters > 6000);
  });

  it('shows ambient cars with a smooth trail wherever the phone is', async () => {
    for (const where of [KIGALI, { latitude: 37.42, longitude: -122.08 }]) {
      const near = await call('GET', `/drivers/nearby?lat=${where.latitude}&lng=${where.longitude}`, undefined, (await newPassenger(`n${where.latitude}`)).token);
      assert.ok(near.drivers.length >= 3, 'cars near the phone');
      const car = near.drivers[0];
      assert.ok(car.trail.length >= 10);
      assert.ok(geo.haversineKm(where, car) <= 5);
      assert.ok(car.trail.every((s, i, a) => i === 0 || s[0] > a[i - 1][0]));
    }
  });
});

describe('a passenger ride from request to receipt', () => {
  it('quotes the same fares the server would', async () => {
    const { token } = await newPassenger('erin');
    const q = await call('GET', `/rides/quote?rideType=private&pickup=${pickup.latitude},${pickup.longitude}&destination=${destination.latitude},${destination.longitude}`, undefined, token);
    assert.deepEqual(q.quote.options.map((o) => o.vehicleId), ['fem_economy', 'fem_comfort', 'fem_xl']);
    const [eco, comfort, xl] = q.quote.options.map((o) => o.fare.total);
    // One tariff for every class (utils/tariff.ts), so the three prices match.
    assert.ok(eco === comfort && comfort === xl && eco >= 1800);
    assert.ok(q.quote.options.every((o) => o.fare.total % 100 === 0 && o.fare.total >= o.fare.minimumFare));
    assert.equal(q.quote.route.source, 'estimate');
  });

  it('plays through every state, moves the car, and settles cash', async () => {
    const { token } = await newPassenger('frank');
    const { res, option } = await book(token, 'cash');
    assert.equal(res.status, 201);
    assert.equal(res.ride.status, 'searchingDriver');
    assert.equal(res.ride.estimatedFare, option.fare.total, 'the quoted price is the charged price');
    assert.match(res.ride.pin, /^\d{4}$/);
    const id = res.ride.id;

    assert.equal((await call('POST', '/rides', { pickup, destination, vehicleId: 'fem_economy', paymentMethodId: 'cash' }, token)).status, 409, 'one active ride at a time');

    const seen = [];
    const step = async (ms) => {
      advance(ms);
      const r = (await call('GET', `/rides/${id}`, undefined, token)).ride;
      if (seen[seen.length - 1] !== r.status) seen.push(r.status);
      return r;
    };
    await step(1000);
    const assigned = await step(sim.TIMING.assignMs);
    assert.equal(assigned.status, 'driverAssigned');
    assert.ok(assigned.driver.name && assigned.driver.licensePlate);
    await step(sim.TIMING.acceptMs);

    const midApproach = await step(sim.TIMING.approachMs / 2);
    assert.equal(midApproach.status, 'driverArriving');
    const early = (await call('GET', `/rides/${id}/driver-location`, undefined, token)).location;
    advance(4000);
    const later = (await call('GET', `/rides/${id}/driver-location`, undefined, token)).location;
    assert.ok(early && later);
    assert.ok(geo.haversineKm(early, later) > 0, 'the car moves toward the pickup');
    assert.ok(later.trail.length > 5);

    await step(sim.TIMING.approachMs / 2 + 500);
    assert.equal(seen.at(-1), 'driverArrived');
    await step(sim.TIMING.waitAtPickupMs);
    await step(sim.TIMING.pinMs);
    const trip = await step(1000);
    assert.equal(trip.status, 'inProgress');
    assert.ok(trip.startedAt);

    const end = await playToPaymentPending(token, id);
    assert.equal(end.status, 'paymentPending');
    assert.equal(end.finalFare, end.estimatedFare);
    assert.deepEqual(seen.slice(0, 3), ['searchingDriver', 'driverAssigned', 'driverArriving']);

    const pay = await call('POST', '/payments', { rideId: id }, token);
    assert.equal(pay.status, 201);
    assert.equal(pay.payment.method, 'cash');
    assert.equal(pay.payment.status, 'pending');
    advance(sim.TIMING.cashConfirmMs + 500);
    const done = (await call('GET', `/rides/${id}`, undefined, token)).ride;
    assert.equal(done.status, 'completed');
    assert.equal((await call('GET', `/rides/${id}/payment`, undefined, token)).payment.status, 'succeeded');

    const rated = await call('POST', `/rides/${id}/rate`, { rating: 5, comment: 'Great' }, token);
    assert.equal(rated.ride.rating, 5);
    const history = await call('GET', '/rides', undefined, token);
    assert.equal(history.rides.length, 1);
    assert.equal((await call('GET', '/rides/current', undefined, token)).ride, null);
    const notes = await call('GET', '/notifications', undefined, token);
    assert.ok(notes.notifications.some((n) => n.title === 'Driver found'));
    assert.ok(notes.notifications.some((n) => n.title === 'Trip completed'));
    const route = await call('GET', `/rides/${id}/route`, undefined, token);
    assert.ok(route.points.length > 5);
  });

  it('charges the wallet, and falls back to cash when the balance is too low', async () => {
    const { token } = await newPassenger('gina');
    const { res } = await book(token, 'wallet', 'fem_xl');
    const ride = await playToPaymentPending(token, res.ride.id);
    const fare = ride.estimatedFare;
    const pay = await call('POST', '/payments', { rideId: ride.id }, token);
    const balance = (await call('GET', '/wallet', undefined, token)).wallet.balance;
    if (fare > 10_000) {
      assert.equal(pay.payment.status, 'failed');
      assert.equal(balance, 10_000);
      const cash = await call('POST', '/payments', { rideId: ride.id, method: 'cash' }, token);
      assert.equal(cash.payment.method, 'cash');
    } else {
      assert.equal(pay.payment.status, 'succeeded');
      assert.equal(balance, 10_000 - fare);
    }
  });

  it('completes instantly on mobile money', async () => {
    const { token } = await newPassenger('hana');
    const { res } = await book(token, 'mtn_momo');
    const ride = await playToPaymentPending(token, res.ride.id);
    const pay = await call('POST', '/payments', { rideId: ride.id }, token);
    assert.equal(pay.payment.status, 'succeeded');
    assert.equal((await call('GET', `/rides/${ride.id}`, undefined, token)).ride.status, 'completed');
  });

  it('cancels while searching, but not once the trip is under way', async () => {
    const { token } = await newPassenger('ivan');
    const a = await book(token);
    const cancelled = await call('POST', `/rides/${a.res.ride.id}/cancel`, { reason: 'Changed my mind' }, token);
    assert.equal(cancelled.ride.status, 'cancelled');
    assert.equal(cancelled.ride.cancelledBy, 'passenger');

    const b = await book(token);
    advance(sim.TIMING.assignMs + sim.TIMING.acceptMs + sim.TIMING.approachMs + sim.TIMING.waitAtPickupMs + sim.TIMING.pinMs + 2000);
    assert.equal((await call('GET', `/rides/${b.res.ride.id}`, undefined, token)).ride.status, 'inProgress');
    assert.equal((await call('POST', `/rides/${b.res.ride.id}/cancel`, {}, token)).status, 400);
  });

  it('re-prices when the destination changes', async () => {
    const { token } = await newPassenger('jo');
    const { res } = await book(token);
    const moved = await call('POST', `/rides/${res.ride.id}/change-destination`, { destination: { address: 'Kigali International Airport, Kigali, Rwanda', latitude: -1.9686, longitude: 30.1395 } }, token);
    assert.equal(moved.ride.destination.address, 'Kigali International Airport, Kigali, Rwanda');
    assert.notEqual(moved.ride.estimatedFare, res.ride.estimatedFare);
  });

  it('holds a scheduled ride until its time', async () => {
    const { token } = await newPassenger('kim');
    const when = new Date(clock + 60 * 60 * 1000).toISOString();
    const res = await call('POST', '/rides', { pickup, destination, vehicleId: 'fem_economy', paymentMethodId: 'cash', scheduledFor: when }, token);
    assert.equal(res.ride.status, 'scheduled');
    advance(59 * 60 * 1000);
    assert.equal((await call('GET', `/rides/${res.ride.id}`, undefined, token)).ride.status, 'scheduled');
    advance(60 * 1000 + sim.TIMING.assignMs + 500);
    assert.equal((await call('GET', `/rides/${res.ride.id}`, undefined, token)).ride.status, 'driverAssigned');
  });
});

describe('support, places and safety', () => {
  it('keeps tickets, saved places and SOS records', async () => {
    const { token } = await newPassenger('lena');
    const t = await call('POST', '/support', { category: 'general', subject: 'Hello', message: 'Need help' }, token);
    assert.equal(t.status, 201);
    const detail = await call('GET', `/support/${t.ticket.id}`, undefined, token);
    assert.equal(detail.messages[0].message, 'Need help');
    assert.ok(detail.messages.some((m) => m.senderRole === 'support'));
    const reply = await call('POST', `/support/${t.ticket.id}/messages`, { message: 'More info' }, token);
    assert.equal(reply.status, 201);
    assert.equal((await call('POST', `/support/${t.ticket.id}/close`, {}, token)).ticket.status, 'closed');

    const saved = await call('POST', '/places/saved', { type: 'home', name: 'Home', address: pickup.address, latitude: pickup.latitude, longitude: pickup.longitude }, token);
    assert.equal(saved.status, 201);
    assert.equal((await call('GET', '/places/saved', undefined, token)).savedPlaces.length, 1);
    await call('DELETE', `/places/saved/${saved.savedPlace.id}`, undefined, token);
    assert.equal((await call('GET', '/places/saved', undefined, token)).savedPlaces.length, 0);

    const sos = await call('POST', '/emergency', { latitude: pickup.latitude, longitude: pickup.longitude }, token);
    assert.equal(sos.status, 201);
    assert.match(sos.emergency.reference, /^EM-/);
    assert.ok(sos.emergency.callCenterPhone);
    assert.equal((await call('GET', '/emergency/config')).callCenterPhone, sos.emergency.callCenterPhone);
  });
});

describe('a driver working a shift', () => {
  it('goes online, gets a request, drives it and gets paid', async () => {
    const reg = await call('POST', '/drivers/register', { fullName: 'Didier Driver', phone: '+250782222222', password: 'secret1', licenseNumber: 'RW123' });
    assert.equal(reg.status, 201);
    const token = reg.token;
    await call('PUT', '/driver/me', { email: 'didier@example.com' }, token);
    await call('PUT', '/driver/vehicle', { vehicleMake: 'Toyota', vehicleModel: 'Corolla', vehicleYear: 2018, vehicleColor: 'White', vehiclePlate: 'RAB 123 C' }, token);
    assert.equal((await call('GET', '/driver/me', undefined, token)).driver.isProfileComplete, true);
    assert.equal((await call('POST', '/driver/documents', { docType: 'license', fileName: 'license.jpg' }, token)).status, 201);
    await call('POST', '/drivers/location', KIGALI, token);

    assert.equal((await call('PUT', '/driver/status', { status: 'active' }, token)).driver.status, 'active');
    assert.equal((await call('GET', '/drivers/rides/active', undefined, token)).rides.length, 0, 'no request yet');
    advance(sim.TIMING.offerDelayMs + 500);
    const offers = (await call('GET', '/drivers/rides/active', undefined, token)).rides;
    assert.equal(offers.length, 1);
    const offer = offers[0];
    assert.equal(offer.status, 'driverAssigned');
    assert.ok(offer.rider.name);
    assert.equal(offer.pin, null, 'drivers never see the trip PIN field');

    assert.equal((await call('POST', `/drivers/rides/${offer.id}/accept`, {}, token)).status, 200);
    assert.equal((await call('PUT', '/driver/status', { status: 'offline' }, token)).status, 400, 'cannot go offline mid-trip');
    assert.equal((await call('POST', `/drivers/rides/${offer.id}/arrived`, {}, token)).status, 200);
    const wrong = await call('POST', `/drivers/rides/${offer.id}/verify-pin`, { pin: '9999' }, token);
    assert.equal(wrong.status, 400);
    assert.match(wrong.error, /1234/, 'the wrong-code error names the demo code');
    assert.equal((await call('POST', `/drivers/rides/${offer.id}/verify-pin`, { pin: '1234' }, token)).status, 200);
    const done = await call('POST', `/drivers/rides/${offer.id}/complete-trip`, {}, token);
    assert.equal(done.status, 200);

    let net = 0;
    if (done.payment.method === 'cash') {
      assert.equal(done.payment.status, 'pending');
      assert.equal((await call('POST', `/drivers/rides/${offer.id}/confirm-cash`, {}, token)).status, 200);
    } else {
      assert.equal(done.payment.status, 'succeeded');
    }
    const fare = done.ride.finalFare;
    net = fare - Math.round(fare * 0.15 * 100) / 100;

    const earnings = (await call('GET', '/driver/earnings', undefined, token)).earnings;
    assert.equal(earnings.today.rides, 1);
    assert.ok(Math.abs(earnings.today.amount - net) < 0.01);
    assert.equal(earnings.totalTrips, 1);
    assert.equal((await call('GET', '/driver/earnings/history', undefined, token)).earnings.length, 1);
    const ratings = (await call('GET', '/driver/ratings', undefined, token));
    assert.equal(ratings.summary.total, 1);
    assert.ok(ratings.summary.average >= 4);
    assert.equal((await call('GET', '/driver/rides', undefined, token)).rides[0].status, 'completed');
    assert.equal((await call('GET', '/driver/me', undefined, token)).driver.status, 'active');

    // Free again, and the next request comes after the gap.
    assert.equal((await call('GET', '/drivers/rides/active', undefined, token)).rides.length, 0);
    advance(sim.TIMING.offerGapMs + 500);
    const next = (await call('GET', '/drivers/rides/active', undefined, token)).rides;
    assert.equal(next.length, 1);
    assert.equal((await call('POST', `/drivers/rides/${next[0].id}/decline`, {}, token)).status, 200);
    assert.equal((await call('GET', '/drivers/rides/active', undefined, token)).rides.length, 0);
    assert.equal((await call('GET', '/driver/rides', undefined, token)).rides.length, 1, 'a declined request leaves no history');
  });

  it('keeps a request open for a long time, and keeps offering shared riders on a shared trip', async () => {
    const { token } = await call('POST', '/drivers/login', { phone: '+250782222222', password: 'secret1' });
    advance(sim.TIMING.offerGapMs + 500);
    const first = (await call('GET', '/drivers/rides/active', undefined, token)).rides;
    assert.equal(first.length, 1);
    // Far beyond the old 45 s cut-off the same request is still waiting for the driver.
    advance(5 * 60_000);
    const later = (await call('GET', '/drivers/rides/active', undefined, token)).rides;
    assert.deepEqual(later.map((r) => r.id), [first[0].id]);

    // Decline until a shared (pooled) request comes up, accept it, and a second shared one follows.
    let shared = later[0];
    for (let i = 0; i < 40 && shared.rideType !== 'shared'; i++) {
      await call('POST', `/drivers/rides/${shared.id}/decline`, {}, token);
      advance(sim.TIMING.offerGapMs + 500);
      shared = (await call('GET', '/drivers/rides/active', undefined, token)).rides[0];
    }
    assert.equal(shared.rideType, 'shared');
    assert.equal(shared.isPooled, true);
    assert.equal((await call('POST', `/drivers/rides/${shared.id}/accept`, {}, token)).status, 200);
    advance(sim.TIMING.offerGapMs + 500);
    const pooled = (await call('GET', '/drivers/rides/active', undefined, token)).rides;
    assert.equal(pooled.length, 2, 'a second shared rider is offered while the first is on board');
    const waiting = pooled.find((r) => r.status === 'driverAssigned');
    assert.equal(waiting.rideType, 'shared');

    // Declining the extra rider leaves the first trip untouched; cancelling it frees the driver.
    assert.equal((await call('POST', `/drivers/rides/${waiting.id}/decline`, {}, token)).status, 200);
    assert.equal((await call('POST', `/drivers/rides/${shared.id}/cancel`, { reason: 'test' }, token)).status, 200);
    assert.equal((await call('GET', '/driver/me', undefined, token)).driver.status, 'active');
  });

  it('lets a request lapse when unanswered and rejects other roles', async () => {
    const reg = await call('POST', '/drivers/login', { phone: '+250782222222', password: 'secret1' });
    const token = reg.token;
    advance(sim.TIMING.offerGapMs + 500);
    assert.equal((await call('GET', '/drivers/rides/active', undefined, token)).rides.length, 1);
    advance(sim.TIMING.offerExpireMs + 1000);
    const after = (await call('GET', '/drivers/rides/active', undefined, token)).rides;
    assert.equal(after.filter((r) => Date.parse(r.createdAt) < clock - sim.TIMING.offerExpireMs).length, 0);

    const passenger = await newPassenger('mia');
    assert.equal((await call('GET', '/driver/me', undefined, passenger.token)).status, 401);
    assert.equal((await call('GET', '/auth/me', undefined, token)).status, 401);
  });

  it('charges for waiting beyond the free 15 minutes and records the e-bill number', async () => {
    const reg = await call('POST', '/drivers/register', { fullName: 'Wendy Waits', phone: '+250783333333', password: 'secret1', licenseNumber: 'RW456' });
    const token = reg.token;
    await call('PUT', '/driver/vehicle', { vehicleMake: 'Toyota', vehicleModel: 'Vitz', vehicleYear: 2019, vehicleColor: 'Blue', vehiclePlate: 'RAC 456 D' }, token);
    await call('POST', '/drivers/location', KIGALI, token);
    await call('PUT', '/driver/status', { status: 'active' }, token);
    advance(sim.TIMING.offerDelayMs + 500);
    const [offer] = (await call('GET', '/drivers/rides/active', undefined, token)).rides;
    assert.ok(offer, 'a request arrives');
    await call('POST', `/drivers/rides/${offer.id}/accept`, {}, token);
    await call('POST', `/drivers/rides/${offer.id}/arrived`, {}, token);

    assert.equal((await call('POST', `/drivers/rides/${offer.id}/ebill`, { phone: 'nope' }, token)).status, 400);
    assert.equal((await call('POST', `/drivers/rides/${offer.id}/ebill`, { phone: '+250788123456' }, token)).ebillPhone, '+250788123456');

    advance(40 * 60_000); // 40 min at the pickup: 25 chargeable -> two 15-minute blocks
    await call('POST', `/drivers/rides/${offer.id}/verify-pin`, { pin: '1234' }, token);
    const done = await call('POST', `/drivers/rides/${offer.id}/complete-trip`, {}, token);
    assert.equal(done.ride.finalFare, done.ride.estimatedFare + 3000);
    assert.equal(done.payment.amount, done.ride.finalFare);
  });
});

describe('pairing a ride with the driver device', () => {
  it('links the scanned terminal to an active ride', async () => {
    const { token } = await newPassenger('paula');
    const { res } = await book(token, 'cash');
    assert.equal((await call('POST', `/rides/${res.ride.id}/pair`, {}, token)).status, 400);
    const paired = await call('POST', `/rides/${res.ride.id}/pair`, { terminalId: 'T-123' }, token);
    assert.equal(paired.paired, true);
    assert.equal(paired.terminalId, 'T-123');
  });
});

describe('persistence', () => {
  it('survives an app restart', async () => {
    const { token, id } = await newPassenger('nora');
    await dbModule.flushDb();
    dbModule.setStore(memoryStore); // drops the in-memory copy, reloads from "the phone"
    const me = await call('GET', '/auth/me', undefined, token);
    assert.equal(me.passenger.id, id);
    assert.equal((await call('GET', '/wallet', undefined, token)).wallet.balance, 10_000);
  });
});

describe('text messages through the SMS gateway', () => {
  const texts = [];
  const okSender = { send: async (to, text) => void texts.push({ to, text }) };
  const brokenSender = {
    send: async () => {
      throw new Error('no signal');
    },
  };
  const lastText = () => texts.at(-1);
  after(() => smsModule.setSmsSender(null));

  it('normalises Rwandan numbers like the server does', () => {
    assert.equal(smsModule.toE164('0781234567'), '+250781234567');
    assert.equal(smsModule.toE164('781234567'), '+250781234567');
    assert.equal(smsModule.toE164('250781234567'), '+250781234567');
    assert.equal(smsModule.toE164('+250 781 234 567'), '+250781234567');
  });

  it('texts the sign-up code instead of showing it, and the texted code verifies', async () => {
    smsModule.setSmsSender(okSender);
    texts.length = 0;
    const s = await call('POST', '/auth/signup', { fullName: 'Sms Sam', phone: '0783334444', email: 'sam@example.com', password: 'secret1' });
    assert.equal(s.status, 201);
    assert.equal(s.devCode, undefined, 'a delivered code is not also shown on screen');
    assert.equal(lastText().to, '+250783334444');
    const code = /code is (\d{6})/.exec(lastText().text)[1];
    assert.match(lastText().text, /^FEM CABS: your verification code is/);
    assert.equal((await call('POST', '/auth/verify-otp', { passengerId: s.passenger.id, code })).status, 200);
  });

  it('falls back to showing the code when the text cannot be sent', async () => {
    smsModule.setSmsSender(brokenSender);
    const s = await call('POST', '/auth/signup', { fullName: 'Offline Olga', phone: '0785556666', email: 'olga@example.com', password: 'secret1' });
    assert.match(s.devCode, /^\d{6}$/);
    assert.equal((await call('POST', '/auth/verify-otp', { passengerId: s.passenger.id, code: s.devCode })).status, 200);
  });

  it('shows the code on resend (the first text did not arrive) and texts reset codes', async () => {
    smsModule.setSmsSender(okSender);
    texts.length = 0;
    const s = await call('POST', '/auth/signup', { fullName: 'Resend Rita', phone: '0787778888', email: 'rita@example.com', password: 'secret1' });
    const resent = await call('POST', '/auth/resend-otp', { purpose: 'signup' }, s.token);
    assert.match(resent.devCode, /^\d{6}$/);
    assert.equal(texts.length, 2);
    assert.ok(lastText().text.includes(resent.devCode));

    const reset = await call('POST', '/auth/reset-password/request', { identifier: 'rita@example.com' });
    assert.equal(reset.devCode, undefined);
    assert.match(lastText().text, /password reset code is \d{6}/);
    const unknown = await call('POST', '/auth/reset-password/request', { identifier: 'nobody@example.com' });
    assert.equal(unknown.devCode, undefined);
  });

  it('texts the emergency contact a map link on SOS', async () => {
    smsModule.setSmsSender(null); // the helper signs up via the on-screen code
    const { token } = await newPassenger('sosie');
    smsModule.setSmsSender(okSender);
    await call('PUT', '/auth/profile', { emergencyContactName: 'Mum', emergencyContactPhone: '0788889999' }, token);
    texts.length = 0;
    const sos = await call('POST', '/emergency', { latitude: -1.9447, longitude: 30.0612 }, token);
    assert.equal(sos.status, 201);
    assert.equal(lastText().to, '+250788889999');
    assert.match(lastText().text, /SOS EM-[A-Z0-9]+.*https:\/\/maps\.google\.com\/\?q=-1\.9447,30\.0612/);

    smsModule.setSmsSender(brokenSender);
    assert.equal((await call('POST', '/emergency', { latitude: -1.9447, longitude: 30.0612 }, token)).status, 201, 'SOS is still recorded when texting fails');
  });

  it('texts the passenger when a driver is found and when the trip is paid', async () => {
    smsModule.setSmsSender(null);
    const { token } = await newPassenger('rosa');
    smsModule.setSmsSender(okSender);
    texts.length = 0;
    const { res } = await book(token, 'mtn_momo');
    advance(sim.TIMING.assignMs + 500);
    const ride = (await call('GET', `/rides/${res.ride.id}`, undefined, token)).ride;
    assert.equal(ride.status, 'driverAssigned');
    const found = texts.find((t) => /is on the way/.test(t.text));
    assert.ok(found, 'driver-found text');
    assert.ok(found.text.includes(`Your trip PIN is ${res.ride.pin}`));
    await call('GET', `/rides/${res.ride.id}`, undefined, token);
    assert.equal(texts.filter((t) => /is on the way/.test(t.text)).length, 1, 'one text per milestone, not per poll');

    await playToPaymentPending(token, res.ride.id);
    await call('POST', '/payments', { rideId: res.ride.id }, token);
    assert.match(lastText().text, /trip completed\. RWF [\d,]+ paid by mtn momo/);
  });

  it('sends nothing for a switched-off event', async () => {
    smsModule.setSmsSender(null);
    const { token } = await newPassenger('quiet');
    smsModule.setSmsSender(okSender, ['otp']);
    texts.length = 0;
    await call('PUT', '/auth/profile', { emergencyContactPhone: '0788889999' }, token);
    await call('POST', '/emergency', {}, token);
    assert.equal(texts.length, 0);
    smsModule.setSmsSender(null);
  });
});

describe('the Pindo sender', () => {
  const realFetch = globalThis.fetch;
  after(() => {
    globalThis.fetch = realFetch;
  });

  it('posts the same request the server makes', async () => {
    let seen;
    globalThis.fetch = async (url, init) => {
      seen = { url, init };
      return { ok: true, status: 200 };
    };
    await createPindoSender({ token: 'tok_123', senderName: 'FEM CABS' }).send('+250781234567', 'hello');
    assert.equal(seen.url, 'https://api.pindo.io/v1/sms/');
    assert.equal(seen.init.method, 'POST');
    assert.equal(seen.init.headers.Authorization, 'Bearer tok_123');
    assert.deepEqual(JSON.parse(seen.init.body), { to: '+250781234567', text: 'hello', sender: 'FEM CABS' });
  });

  it('reports a rejected or unreachable gateway as a failure (so callers fall back)', async () => {
    const sender = createPindoSender({ token: 'bad', senderName: 'FEM CABS' });
    globalThis.fetch = async () => ({ ok: false, status: 401 });
    await assert.rejects(sender.send('+250781234567', 'x'), /401/);
    globalThis.fetch = async () => {
      throw new TypeError('Network request failed');
    };
    await assert.rejects(sender.send('+250781234567', 'x'), /Network/);
    smsModule.setSmsSender(sender);
    assert.equal(await smsModule.sendSms('otp', '0781234567', 'x'), false);
    smsModule.setSmsSender(null);
  });
});

describe('Twilio Verify and Messages', () => {
  const realFetch = globalThis.fetch;
  const AC = 'AC' + 'a'.repeat(32);
  const SK = 'SK' + 'b'.repeat(32);
  const VA = 'VA' + 'c'.repeat(32);
  const creds = { accountSid: AC, keySid: SK, secret: 's3cret' };
  const decode = (h) => Buffer.from(h.replace('Basic ', ''), 'base64').toString();
  after(() => {
    globalThis.fetch = realFetch;
    smsModule.setSmsSender(null);
  });

  it('Messages: posts a form to the Messages endpoint with the API key', async () => {
    let seen;
    globalThis.fetch = async (url, init) => ((seen = { url, init }), { ok: true, status: 201, json: async () => ({}) });
    await createTwilioSender({ ...creds, from: '+15005550006' }).send('+250781234567', 'hi there');
    assert.equal(seen.url, `https://api.twilio.com/2010-04-01/Accounts/${AC}/Messages.json`);
    assert.equal(decode(seen.init.headers.Authorization), `${SK}:s3cret`);
    const form = new URLSearchParams(seen.init.body);
    assert.deepEqual([form.get('To'), form.get('From'), form.get('Body')], ['+250781234567', '+15005550006', 'hi there']);
  });

  it('Messages: auth-token fallback and Messaging Service SID', async () => {
    let seen;
    globalThis.fetch = async (url, init) => ((seen = { url, init }), { ok: true, status: 201, json: async () => ({}) });
    await createTwilioSender({ accountSid: AC, secret: 'tok', from: 'MG' + 'd'.repeat(32) }).send('+250781234567', 'x');
    assert.equal(decode(seen.init.headers.Authorization), `${AC}:tok`);
    const form = new URLSearchParams(seen.init.body);
    assert.equal(form.get('MessagingServiceSid'), 'MG' + 'd'.repeat(32));
    assert.equal(form.get('From'), null);
  });

  it('Messages: a rejection is a failure carrying Twilio\'s code', async () => {
    globalThis.fetch = async () => ({ ok: false, status: 400, json: async () => ({ code: 21608, message: 'unverified number' }) });
    await assert.rejects(createTwilioSender({ ...creds, from: '+1500' }).send('+250781234567', 'x'), /400 \(21608/);
  });

  it('Verify: starts on the sms channel and maps check results', async () => {
    const calls = [];
    let next;
    globalThis.fetch = async (url, init) => (calls.push({ url, body: new URLSearchParams(init.body) }), next());
    const verifier = createTwilioVerifier({ ...creds, verifyServiceSid: VA });

    next = () => ({ ok: true, status: 201, json: async () => ({ status: 'pending' }) });
    await verifier.start('+250781234567');
    assert.equal(calls[0].url, `https://verify.twilio.com/v2/Services/${VA}/Verifications`);
    assert.deepEqual([calls[0].body.get('To'), calls[0].body.get('Channel')], ['+250781234567', 'sms']);

    next = () => ({ ok: true, status: 200, json: async () => ({ status: 'approved', valid: true }) });
    assert.equal(await verifier.check('+250781234567', '123456'), 'approved');
    assert.equal(calls[1].url, `https://verify.twilio.com/v2/Services/${VA}/VerificationCheck`);
    assert.deepEqual([calls[1].body.get('To'), calls[1].body.get('Code')], ['+250781234567', '123456']);

    next = () => ({ ok: true, status: 200, json: async () => ({ status: 'pending', valid: false }) });
    assert.equal(await verifier.check('+250781234567', '000000'), 'rejected');
    next = () => ({ ok: false, status: 404, json: async () => ({ code: 20404 }) });
    assert.equal(await verifier.check('+250781234567', '123456'), 'rejected');
    next = () => ({ ok: false, status: 503, json: async () => null });
    assert.equal(await verifier.check('+250781234567', '123456'), 'unavailable');
    next = () => {
      throw new TypeError('Network request failed');
    };
    assert.equal(await verifier.check('+250781234567', '123456'), 'unavailable');
    next = () => ({ ok: false, status: 400, json: async () => ({ code: 21608 }) });
    await assert.rejects(verifier.start('+250781234567'), /21608/);
  });

  // A stand-in Verify service: remembers the code it "texted" per number.
  const fakeVerify = (opts = {}) => {
    const codes = new Map();
    return {
      codes,
      start: async (to) => {
        if (opts.failStart) throw new Error('unverified number');
        codes.set(to, '424242');
      },
      check: async (to, code) => (opts.down ? 'unavailable' : codes.get(to) === code ? 'approved' : 'rejected'),
    };
  };

  it('signs up with a code only Twilio holds: nothing on screen, right code verifies', async () => {
    const verify = fakeVerify();
    smsModule.setSmsSender(null);
    smsModule.setOtpVerifier(verify);
    const s = await call('POST', '/auth/signup', { fullName: 'Verify Vic', phone: '0781010101', email: 'vic@example.com', password: 'secret1' });
    assert.equal(s.status, 201);
    assert.equal(s.devCode, undefined);
    assert.equal(verify.codes.get('+250781010101'), '424242');
    assert.equal((await call('POST', '/auth/verify-otp', { passengerId: s.passenger.id, code: '000000' })).status, 400);
    assert.equal((await call('POST', '/auth/verify-otp', { passengerId: s.passenger.id, code: '424242' })).status, 200);
    assert.equal((await call('POST', '/auth/verify-otp', { passengerId: s.passenger.id, code: '424242' })).status, 400, 'a used code is spent');
    assert.equal((await call('GET', '/auth/me', undefined, s.token)).passenger.isVerified, true);
  });

  it('cannot check a code offline, and says so without burning it', async () => {
    const verify = fakeVerify();
    smsModule.setSmsSender(null);
    smsModule.setOtpVerifier(verify);
    const s = await call('POST', '/auth/signup', { fullName: 'Offline Ola', phone: '0781020202', email: 'ola@example.com', password: 'secret1' });
    smsModule.setOtpVerifier(fakeVerify({ down: true }));
    const down = await call('POST', '/auth/verify-otp', { passengerId: s.passenger.id, code: '424242' });
    assert.equal(down.status, 503);
    smsModule.setOtpVerifier(verify);
    assert.equal((await call('POST', '/auth/verify-otp', { passengerId: s.passenger.id, code: '424242' })).status, 200, 'still valid once back online');
  });

  it('falls back to an on-screen code when Verify refuses (e.g. an unverified trial number)', async () => {
    smsModule.setSmsSender(null);
    smsModule.setOtpVerifier(fakeVerify({ failStart: true }));
    const s = await call('POST', '/auth/signup', { fullName: 'Trial Tia', phone: '0781030303', email: 'tia@example.com', password: 'secret1' });
    assert.match(s.devCode, /^\d{6}$/);
    smsModule.setOtpVerifier(fakeVerify({ failStart: true })); // still refusing at check time: the local code is what counts
    assert.equal((await call('POST', '/auth/verify-otp', { passengerId: s.passenger.id, code: s.devCode })).status, 200);
  });

  it('resets a password through Verify too', async () => {
    const verify = fakeVerify();
    smsModule.setSmsSender(null);
    smsModule.setOtpVerifier(null);
    const s = await call('POST', '/auth/signup', { fullName: 'Reset Rex', phone: '0781040404', email: 'rex@example.com', password: 'secret1' });
    await call('POST', '/auth/verify-otp', { passengerId: s.passenger.id, code: s.devCode });
    smsModule.setOtpVerifier(verify);
    const req = await call('POST', '/auth/reset-password/request', { identifier: 'rex@example.com' });
    assert.equal(req.devCode, undefined);
    assert.equal((await call('POST', '/auth/reset-password/confirm', { identifier: 'rex@example.com', code: '111111', newPassword: 'brand-new' })).status, 400);
    assert.equal((await call('POST', '/auth/reset-password/confirm', { identifier: 'rex@example.com', code: '424242', newPassword: 'brand-new' })).status, 200);
    assert.equal((await call('POST', '/auth/login', { identifier: 'rex@example.com', password: 'brand-new' })).status, 200);
  });

  it('honours the otp switch: Verify is skipped when otp texts are off', async () => {
    const verify = fakeVerify();
    smsModule.setSmsSender(null, ['sos']); // otp off
    smsModule.setOtpVerifier(verify);
    const s = await call('POST', '/auth/signup', { fullName: 'Off Ollie', phone: '0781050505', email: 'ollie@example.com', password: 'secret1' });
    assert.match(s.devCode, /^\d{6}$/);
    assert.equal(verify.codes.size, 0);
    smsModule.setSmsSender(null, ['otp', 'sos', 'ride']);
  });
});

describe('real road routes', () => {
  const realFetch = globalThis.fetch;
  const M_PER_DEG = 111_250;
  // A stand-in OSRM. 'L': east 3 km then north 2 km. 'diagonal': straight north-east.
  const street = (shape, from) =>
    shape === 'L'
      ? [[from.longitude, from.latitude], [from.longitude + 3000 / M_PER_DEG, from.latitude], [from.longitude + 3000 / M_PER_DEG, from.latitude + 2000 / M_PER_DEG]]
      : [[from.longitude, from.latitude], [from.longitude + 0.02, from.latitude + 0.02]];
  const osrm = (calls, shape) => async (url) => {
    calls.push(url);
    const m = /driving\/([-\d.]+),([-\d.]+);/.exec(url);
    const from = { longitude: +m[1], latitude: +m[2] };
    return { ok: true, status: 200, json: async () => ({ code: 'Ok', routes: [{ geometry: { coordinates: street(shape, from) } }] }) };
  };
  const onEitherLeg = (h) => Math.min(Math.abs(h - 90), Math.min(h, 360 - h)) < 3; // east ~90, north ~0
  const quoteUrl = (token) =>
    call('GET', `/rides/quote?rideType=private&pickup=${pickup.latitude},${pickup.longitude}&destination=${destination.latitude},${destination.longitude}`, undefined, token);

  before(() => {
    geo.forgetRoads();
    sim.resetAmbientRoads();
  });
  after(() => {
    globalThis.fetch = realFetch;
    roads.setRoutingService(null);
    geo.forgetRoads();
    sim.resetAmbientRoads();
  });

  it('quotes over the real streets when a routing service answers, and fetches each road once', async () => {
    const calls = [];
    globalThis.fetch = osrm(calls, 'L');
    roads.setRoutingService('https://osrm.test/route/v1/driving/', { minGapMs: 0 });
    const { token } = await newPassenger('roady');
    const q = await quoteUrl(token);
    assert.equal(q.quote.route.source, 'osrm');
    assert.equal(q.quote.route.coordinates.length, 3, 'the street geometry, not a curve');
    assert.ok(calls.some((u) => u.startsWith('https://osrm.test/route/v1/driving/') && u.includes('geometries=geojson')));
    // ~3 km + ~2 km of streets, counted as driven (no detour factor on top of real roads).
    assert.ok(Math.abs(q.quote.route.distanceKm - 5) < 0.3, `distance ${q.quote.route.distanceKm}`);
    // Count only requests for this trip; ambient traffic fetches its own roads in the background.
    const tripCalls = () => calls.filter((u) => u.includes(`${pickup.longitude},${pickup.latitude};${destination.longitude},${destination.latitude}`)).length;
    assert.equal(tripCalls(), 1);
    await quoteUrl(token);
    assert.equal(tripCalls(), 1, 'a known road is not fetched twice');
  });

  it('drives a booked car along those streets only, before and after an app restart', async () => {
    const { token } = await newPassenger('roady2');
    const { res } = await book(token);
    const id = res.ride.id;
    advance(sim.TIMING.assignMs + sim.TIMING.acceptMs + sim.TIMING.approachMs + sim.TIMING.waitAtPickupMs + sim.TIMING.pinMs + 3000);
    let sampled = 0;
    for (let i = 0; i < 6; i++) {
      advance(4000);
      const ride = (await call('GET', `/rides/${id}`, undefined, token)).ride;
      const loc = (await call('GET', `/rides/${id}/driver-location`, undefined, token)).location;
      assert.equal(ride.status, 'inProgress');
      assert.ok(onEitherLeg(loc.heading), `heading ${loc.heading} is on a street; a curve would show in-between angles`);
      sampled += 1;
    }
    assert.equal(sampled, 6);

    // Restart: the in-memory roads and cached paths are gone, but the ride kept its own geometry.
    await dbModule.flushDb();
    dbModule.setStore(memoryStore);
    geo.forgetRoads();
    sim.forgetRidePaths(id);
    const loc = (await call('GET', `/rides/${id}/driver-location`, undefined, token)).location;
    assert.ok(onEitherLeg(loc.heading), `heading ${loc.heading} after restart`);
    const crumbs = (await call('GET', `/rides/${id}/route`, undefined, token)).points;
    assert.ok(crumbs.length > 5);
  });

  it('falls back to the local curve when the service is unreachable, and stops asking for a while', async () => {
    geo.forgetRoads();
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      throw new TypeError('Network request failed');
    };
    roads.setRoutingService('https://osrm.test/route/v1/driving', { minGapMs: 0 });
    const { token } = await newPassenger('offlinerd');
    const q = await quoteUrl(token);
    assert.equal(q.status, 200);
    assert.equal(q.quote.route.source, 'estimate');
    assert.ok(q.quote.route.coordinates.length > 10, 'the curve');
    const seen = calls;
    assert.ok(seen >= 1);
    await call('GET', '/locations/route?fromLat=-1.95&fromLng=30.05&toLat=-1.96&toLng=30.09');
    assert.equal(calls, seen, 'no more network attempts during the back-off');
  });

  it('puts ambient traffic on the streets once they arrive', async () => {
    geo.forgetRoads();
    sim.resetAmbientRoads();
    const calls = [];
    globalThis.fetch = osrm(calls, 'diagonal');
    roads.setRoutingService('https://osrm.test/route/v1/driving', { minGapMs: 0 });
    const { token } = await newPassenger('traffic');
    const url = '/drivers/nearby?lat=-1.9441&lng=30.0619';
    const first = (await call('GET', url, undefined, token)).drivers;
    assert.ok(first.length >= 3, 'cars show up at once, on block loops');
    await new Promise((resolve) => setTimeout(resolve, 200)); // roads arrive in the background
    assert.ok(calls.length >= 3, `roads were requested (${calls.length})`);
    const cars = (await call('GET', url, undefined, token)).drivers;
    // The mock street runs north-east, so a car on it heads ~45 (or ~225 coming back); a block loop never does.
    const onStreet = cars.filter((c) => Math.abs(c.heading - 45) < 3 || Math.abs(c.heading - 225) < 3);
    assert.ok(onStreet.length >= 2, `${onStreet.length} of ${cars.length} cars are on the street`);
  });
});
