/**
 * Pair Ride end to end against a server this test starts on the local DB:
 * a real match (driver online at Huye), the driver arrives, the rider scans
 * the driver's code (POST /rides/pair), then the driver taps Start
 * (POST /drivers/rides/:id/start). Checks the code is driver-only, a wrong
 * code is refused, and the ordering rules hold.
 *
 * Usage: node test/pair-ride-flow.js
 */
const path = require('path');
const { spawn } = require('child_process');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const PORT = 3330;
const ADMIN_KEY = 'pair-ride-admin-key';
process.env.TEST_API_URL = `http://localhost:${PORT}/api`;
process.env.ADMIN_API_KEY = ADMIN_KEY;
const { request, createVerifiedDriver, uniquePhone } = require('./fixtures');

const HUYE = { latitude: -2.5967, longitude: 29.7394 };
const HUYE_DEST = { latitude: -2.6090, longitude: 29.7440 };

let passed = 0, failed = 0;
function check(name, cond, detail = '') { if (cond) { passed++; console.log(`  ok   ${name}`); } else { failed++; console.log(`  FAIL ${name} ${detail}`); } }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const api = (m, p, b, t) => request(m, p, b, t);

async function createPassenger() {
  const phone = uniquePhone();
  const email = `pair${phone.slice(-9)}@example.com`;
  const su = await api('POST', '/auth/signup', { fullName: 'Pair Rider', phone, email, password: 'secret123' });
  if (su.status !== 201) throw new Error(`signup ${su.status}: ${JSON.stringify(su.data)}`);
  await api('POST', '/auth/verify-otp', { passengerId: su.data.passenger.id, code: su.data.devCode }, su.data.token);
  await api('PUT', '/auth/profile', { fullName: 'Pair Rider', phone }, su.data.token);
  return { id: su.data.passenger.id, token: su.data.token, phone };
}

async function waitForStatus(rideId, token, want, timeoutMs = 20000) {
  const until = Date.now() + timeoutMs;
  let last = '';
  while (Date.now() < until) {
    const r = await api('GET', `/rides/${rideId}`, null, token);
    last = r.data?.ride?.status;
    if (last === want) return r.data.ride;
    await sleep(500);
  }
  throw new Error(`ride stuck at ${last}, wanted ${want}`);
}

async function main() {
  const driver = await createVerifiedDriver({ at: HUYE, online: true });
  const rider = await createPassenger();

  const booked = await api('POST', '/rides', {
    pickup: { address: 'Huye Stadium', ...HUYE },
    destination: { address: 'Huye Market', ...HUYE_DEST },
    vehicleId: 'fem_economy', paymentMethodId: 'cash',
  }, rider.token);
  check('ride booked', booked.status === 201, `status=${booked.status} ${JSON.stringify(booked.data)}`);
  const rideId = booked.data.ride.id;
  const assigned = await waitForStatus(rideId, rider.token, 'driverAssigned');
  check('ride matched to the driver', assigned.status === 'driverAssigned', assigned.status);

  await api('POST', `/drivers/rides/${rideId}/accept`, null, driver.token);

  // Pairing before the driver arrives is refused (nothing to pair yet).
  const early = await api('POST', '/rides/pair', { code: 'ABCDEFGH' }, rider.token);
  check('pairing before arrival is refused', early.status === 404, `status=${early.status}`);

  await api('POST', `/drivers/rides/${rideId}/arrived`, null, driver.token);

  // The driver's view of the ride carries the pair code; the rider's never does.
  const driverRide = await api('GET', `/driver/rides/${rideId}`, null, driver.token);
  const code = driverRide.data?.ride?.pairCode;
  check('the driver sees the pair code', /^[A-Z0-9]{8}$/.test(code || ''), JSON.stringify(driverRide.data?.ride?.pairCode));
  const riderRide = await api('GET', `/rides/${rideId}`, null, rider.token);
  check('the rider never sees the pair code, but has the PIN', riderRide.data.ride.pairCode == null && /^\d{4}$/.test(riderRide.data.ride.pin || ''), JSON.stringify({ pairCode: riderRide.data.ride.pairCode, pin: riderRide.data.ride.pin }));

  // Start before pairing is refused.
  const earlyStart = await api('POST', `/drivers/rides/${rideId}/start`, null, driver.token);
  check('the driver cannot start before the rider pairs', earlyStart.status === 400, `status=${earlyStart.status}`);

  // A wrong code is refused; the right code pairs (pinVerified), not started yet.
  const wrong = await api('POST', '/rides/pair', { code: code === 'AAAAAAAA' ? 'BBBBBBBB' : 'AAAAAAAA' }, rider.token);
  check('a wrong pair code is refused', wrong.status === 400, `status=${wrong.status}`);
  const paired = await api('POST', '/rides/pair', { code }, rider.token);
  check('the right code pairs the ride (pinVerified, not yet started)', paired.status === 200 && paired.data.ride.status === 'pinVerified', `status=${paired.status} ride=${paired.data?.ride?.status}`);
  const pairedAgainByWrong = await api('POST', '/rides/pair', { code: 'ZZZZZZZZ' }, rider.token);
  check('once paired, the arrived-ride lookup no longer matches (no re-pair)', pairedAgainByWrong.status === 404, `status=${pairedAgainByWrong.status}`);

  // The driver taps Start -> in progress.
  const started = await api('POST', `/drivers/rides/${rideId}/start`, null, driver.token);
  check('the driver starts the trip', started.status === 200 && started.data.started === true, `status=${started.status} ${JSON.stringify(started.data)}`);
  const running = await api('GET', `/rides/${rideId}`, null, rider.token);
  check('the ride is now in progress', running.data.ride.status === 'inProgress', running.data.ride.status);

  // The PIN fallback still works (a second driver, since the first is now busy).
  const driver2 = await createVerifiedDriver({ at: HUYE, online: true });
  const rider2 = await createPassenger();
  const booked2 = await api('POST', '/rides', { pickup: { address: 'Huye Stadium', ...HUYE }, destination: { address: 'Huye Market', ...HUYE_DEST }, vehicleId: 'fem_economy', paymentMethodId: 'cash' }, rider2.token);
  const rideId2 = booked2.data.ride.id;
  await waitForStatus(rideId2, rider2.token, 'driverAssigned');
  await api('POST', `/drivers/rides/${rideId2}/accept`, null, driver2.token);
  await api('POST', `/drivers/rides/${rideId2}/arrived`, null, driver2.token);
  const pin2 = (await api('GET', `/rides/${rideId2}`, null, rider2.token)).data.ride.pin;
  const pinStart = await api('POST', `/drivers/rides/${rideId2}/verify-pin`, { pin: pin2 }, driver2.token);
  const running2 = await api('GET', `/rides/${rideId2}`, null, rider2.token);
  check('the PIN fallback still starts a trip', pinStart.status === 200 && running2.data.ride.status === 'inProgress', `status=${pinStart.status} ride=${running2.data.ride.status}`);
}

(async () => {
  const env = {
    ...process.env, PORT: String(PORT), DEV_REVEAL_CODES: '1', ADMIN_API_KEY: ADMIN_KEY,
    SMS_PROVIDER: '', SMS_GATEWAY_URL: '', SMS_API_KEY: '', WHATSAPP_ACCESS_TOKEN: '', WHATSAPP_PHONE_NUMBER_ID: '',
    SMTP_HOST: '', SMTP_USER: '', SMTP_PASS: '', OTP_RESEND_COOLDOWN: '0', RATE_LIMIT_MAX: '100000',
    JWT_SECRET: process.env.JWT_SECRET || 'pair-ride-secret',
  };
  const server = spawn(process.execPath, ['src/index.js'], { cwd: path.join(__dirname, '..'), env });
  let log = '';
  server.stdout.on('data', (d) => { log += d; });
  server.stderr.on('data', (d) => { log += d; });
  try {
    let up = false;
    for (let i = 0; i < 160 && !up; i++) { try { up = (await fetch(`http://localhost:${PORT}/api/health`)).ok; } catch {} if (!up) await sleep(250); }
    if (!up) throw new Error(`server did not start:\n${log.slice(-1200)}`);
    await main();
  } finally {
    server.kill();
    await sleep(400);
  }
  console.log(`\nPAIR-RIDE: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('pair-ride-flow crashed:', e); process.exit(1); });
