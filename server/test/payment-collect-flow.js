/**
 * The new collect-the-fare flow: the driver completes the trip, then either
 * sends a mobile-money prompt to the passenger's number, or confirms cash.
 * Runs against the API on :3000 (DEV_REVEAL + ADMIN_API_KEY, local DB).
 *   node test/payment-collect-flow.js
 */
const path = require('path');
process.env.TEST_API_URL = process.env.TEST_API_URL || 'http://localhost:3000/api';
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { request, createVerifiedDriver, uniquePhone } = require('./fixtures');
// Three far-apart towns, so each ride matches only its own nearby driver.
const RUN_OFF = (Date.now() % 900) * 0.0003; // unique per run, keeps driver+ride together
const SPOTS = [
  { pickup: { latitude: -2.5967 + RUN_OFF, longitude: 29.7394 }, dest: { latitude: -2.6090 + RUN_OFF, longitude: 29.7440 } }, // Huye
  { pickup: { latitude: -1.4998 + RUN_OFF, longitude: 29.6339 }, dest: { latitude: -1.5100 + RUN_OFF, longitude: 29.6400 } }, // Musanze
  { pickup: { latitude: -1.6777 + RUN_OFF, longitude: 29.2587 }, dest: { latitude: -1.6850 + RUN_OFF, longitude: 29.2650 } }, // Rubavu
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let passed = 0, failed = 0;
const check = (n, c, d = '') => { if (c) { passed++; console.log('  ok  ', n); } else { failed++; console.log('  FAIL', n, d); } };
const api = (m, p, b, t) => request(m, p, b, t);
async function rider() { const phone = uniquePhone(); const su = await api('POST', '/auth/signup', { fullName: 'Pay Rider', phone, email: `pc${phone.slice(-9)}@example.com`, password: 'secret123' }); await api('POST', '/auth/verify-otp', { passengerId: su.data.passenger.id, code: su.data.devCode }, su.data.token); await api('PUT', '/auth/profile', { fullName: 'Pay Rider', phone }, su.data.token); return { id: su.data.passenger.id, token: su.data.token, phone }; }
async function waitStatus(id, tok, want) { for (let i = 0; i < 60; i++) { const r = await api('GET', `/rides/${id}`, null, tok); if (r.data?.ride?.status === want) return r.data.ride; await sleep(400); } throw new Error('never ' + want); }
async function toInProgress(driver, r, spot) {
  const b = await api('POST', '/rides', { pickup: { address: 'A', ...spot.pickup }, destination: { address: 'B', ...spot.dest }, vehicleId: 'fem_economy', paymentMethodId: 'cash' }, r.token);
  const id = b.data.ride.id; await waitStatus(id, r.token, 'driverAssigned');
  await api('POST', `/drivers/rides/${id}/accept`, null, driver.token);
  await api('POST', `/drivers/rides/${id}/arrived`, null, driver.token);
  const code = (await api('GET', `/driver/rides/${id}`, null, driver.token)).data.ride.pairCode;
  await api('POST', '/rides/pair', { code }, r.token);
  await api('POST', `/drivers/rides/${id}/start`, null, driver.token);
  await waitStatus(id, r.token, 'inProgress');
  return id;
}

(async () => {
  const d1 = await createVerifiedDriver({ at: SPOTS[0].pickup, online: true });
  const r1 = await rider();
  const id1 = await toInProgress(d1, r1, SPOTS[0]);
  const done = await api('POST', `/drivers/rides/${id1}/complete-trip`, null, d1.token);
  check('complete-trip returns the ride without a payment', done.status === 200 && done.data.ride && done.data.payment === undefined, JSON.stringify(done.data).slice(0, 120));
  const pp = await api('GET', `/rides/${id1}`, null, r1.token);
  check('ride is paymentPending with no payment yet', pp.data.ride.status === 'paymentPending', pp.data.ride.status);
  const noPay = await api('GET', `/rides/${id1}/payment`, null, r1.token);
  check('no payment exists until the driver collects it', !noPay.data || !noPay.data.payment, JSON.stringify(noPay.data));
  const badNum = await api('POST', `/drivers/rides/${id1}/charge`, { phone: '12345' }, d1.token);
  check('a non-MTN/Airtel number is refused', badNum.status === 400, `status=${badNum.status}`);
  const charge = await api('POST', `/drivers/rides/${id1}/charge`, { phone: r1.phone }, d1.token);
  check('charging an MTN number creates an mtn_momo payment', charge.status === 200 && charge.data.method === 'mtn_momo' && charge.data.payment.method === 'mtn_momo', JSON.stringify(charge.data));
  const nowPay = await api('GET', `/rides/${id1}/payment`, null, r1.token);
  check('the rider now sees a mobile-money payment (pending to approve, or a provider result)', nowPay.data.payment && nowPay.data.payment.method === 'mtn_momo' && ['pending','failed'].includes(nowPay.data.payment.status), JSON.stringify(nowPay.data.payment));

  // Airtel detection + cash path on a second ride/driver.
  const d2 = await createVerifiedDriver({ at: SPOTS[1].pickup, online: true });
  const r2 = await rider();
  const id2 = await toInProgress(d2, r2, SPOTS[1]);
  await api('POST', `/drivers/rides/${id2}/complete-trip`, null, d2.token);
  const airtel = await api('POST', `/drivers/rides/${id2}/charge`, { phone: '+250730000000' }, d2.token);
  check('an Airtel number is detected as airtel_money', airtel.status === 200 && airtel.data.method === 'airtel_money', JSON.stringify(airtel.data));

  const d3 = await createVerifiedDriver({ at: SPOTS[2].pickup, online: true });
  const r3 = await rider();
  const id3 = await toInProgress(d3, r3, SPOTS[2]);
  await api('POST', `/drivers/rides/${id3}/complete-trip`, null, d3.token);
  const cash = await api('POST', `/drivers/rides/${id3}/confirm-cash`, null, d3.token);
  const after = await api('GET', `/rides/${id3}`, null, r3.token);
  check('the cash path confirms and completes the trip', cash.status === 200 && after.data.ride.status === 'completed', `cash=${cash.status} ride=${after.data.ride.status}`);
  const chargeBefore = await api('POST', `/drivers/rides/${id3}/charge`, { phone: r3.phone }, d3.token);
  check('charging is refused once the ride is no longer paymentPending', [400,404].includes(chargeBefore.status), `status=${chargeBefore.status}`);

  console.log(`\nPAYMENT-COLLECT: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('crashed:', e); process.exit(1); });
