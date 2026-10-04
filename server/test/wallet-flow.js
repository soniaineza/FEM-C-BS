/**
 * Runtime E2E: wallet payment flows against the real API + database.
 *
 * Covers:
 *   7. wallet payment using the existing real wallet backend
 *   8. insufficient wallet balance — the ride must NOT be marked paid
 *   9. completed rides appear in My Rides with the real fare + payment status
 *   5. active-ride restore contract: GET /rides/current returns the ride at
 *      every lifecycle state, and null after terminal states
 *
 * Usage: node test/wallet-flow.js   (local server on :3000)
 */
const { SEED_DRIVER_PASSWORD } = require('./seedPassword');
const BASE = 'http://localhost:3000/api';
let passed = 0;
let failed = 0;

async function api(method, path, body, token) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  const text = await res.text();
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, data };
}

function check(name, cond, detail = '') {
  if (cond) { passed++; console.log(`  ok   ${name}`); }
  else { failed++; console.log(`  FAIL ${name} ${detail}`); }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function creditWalletDirectly(passengerId, amount, reference) {
  // Test-harness helper: the app has no top-up endpoint yet (that's the next
  // work item), so the seed's direct-credit approach is used here — the same
  // INSERT the seed script performs, on the real database.
  const path = require('path');
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
  const { ensureEmbeddedReady } = require('../src/config');
  const { ensureDatabase, applySchema, initPool, getPool } = require('../src/db');
  ensureEmbeddedReady();
  const url = await ensureDatabase();
  await applySchema(url);
  initPool(url);
  await getPool().query(
    `INSERT INTO wallets (passenger_id, balance) VALUES ($1, $2)
      ON CONFLICT (passenger_id) DO UPDATE SET balance = $2`,
    [passengerId, amount]
  );
  if (reference) {
    await getPool().query(
      `INSERT INTO wallet_transactions (passenger_id, amount, type, source, reference)
       VALUES ($1, $2, 'credit', 'test_setup', $3)`,
      [passengerId, amount, reference]
    );
  }
}

async function waitForAssignment(token, rideId, tries = 12) {
  for (let i = 0; i < tries; i++) {
    const r = await api('GET', `/rides/${rideId}`, null, token);
    if (r.data.ride.status !== 'searchingDriver') return r.data.ride;
    await sleep(1200);
  }
  return null;
}

/** Drives one ride from creation to paymentPending with the given method. */
async function runRideToPayment(token, { paymentMethodId, rideType = 'private' }) {
  const created = await api('POST', '/rides', {
    pickup: { address: 'KN 5 Rd, Kigali', latitude: -1.9441, longitude: 30.0619 },
    destination: { address: 'Kimironko', latitude: -1.9562, longitude: 30.1575 },
    vehicleId: 'fem_economy',
    paymentMethodId,
    rideType,
  }, token);
  if (created.status !== 201) return { error: created };
  const rideId = created.data.ride.id;
  const assigned = await waitForAssignment(token, rideId);
  if (!assigned) return { error: new Error('never matched') };
  const dlogin = await api('POST', '/drivers/login', { phone: assigned.driver.phone, password: SEED_DRIVER_PASSWORD });
  const dt = dlogin.data.token;
  await api('POST', `/drivers/rides/${rideId}/accept`, null, dt);
  await api('POST', `/drivers/rides/${rideId}/arrived`, null, dt);
  const pin = (await api('GET', `/rides/${rideId}`, null, token)).data.ride.pin;
  await api('POST', `/drivers/rides/${rideId}/verify-pin`, { pin }, dt);
  const done = await api('POST', `/drivers/rides/${rideId}/complete-trip`, null, dt);
  return { rideId, dt, done: done.data };
}

(async () => {
  // Fresh passenger, isolated from other tests.
  const ts = Date.now().toString().slice(-8);
  const signup = await api('POST', '/auth/signup', {
    fullName: 'Wallet Rider',
    phone: `+2507${ts}`,
    email: `wallet${ts}@example.com`,
    password: 'secret123',
  });
  check('signup', signup.status === 201 && signup.data.token, `status=${signup.status}`);
  const token = signup.data.token;
  const passengerId = signup.data.passenger.id;
  // Wallet and booking routes require a verified phone.
  await api('POST', '/auth/verify-otp', { passengerId, code: signup.data.devCode });

  // ---- 7. wallet payment, happy path ----
  await creditWalletDirectly(passengerId, 50000, 'test_seed_topup');
  const funded = await api('GET', '/wallet', null, token);
  check('wallet funded (real db)', funded.data.wallet.balance === 50000, `balance=${funded.data.wallet.balance}`);

  const happy = await runRideToPayment(token, { paymentMethodId: 'wallet' });
  // A wallet charge settles synchronously, so complete-trip already ran the
  // full payment: the ride is COMPLETED right away. (complete-trip's response
  // echoes the payment row captured BEFORE settleSucceededPayment flipped it
  // to succeeded — the authoritative state is read back from the DB below.)
  check('wallet ride completes synchronously (charge settled at completion)',
    happy.done?.ride?.status === 'completed',
    `ride=${JSON.stringify(happy.done?.ride?.status)}`);
  const happyPay = await api('GET', `/rides/${happy.rideId}/payment`, null, token);
  check('wallet payment marked succeeded in DB',
    happyPay.data.payment?.status === 'succeeded', JSON.stringify(happyPay.data.payment?.status));

  // chargePayment for wallet debits and settles synchronously — check wallet
  // balance dropped by the final fare and the ride auto-completed.
  const afterPay = await api('GET', `/rides/${happy.rideId}`, null, token);
  const fare = afterPay.data.ride.finalFare ?? afterPay.data.ride.estimatedFare;
  const walletAfter = await api('GET', '/wallet', null, token);
  check('wallet debited by exact fare', walletAfter.data.wallet.balance === 50000 - fare,
    `balance=${walletAfter.data.wallet.balance} fare=${fare}`);
  check('wallet ride auto-completed after debit', afterPay.data.ride.status === 'completed', `status=${afterPay.data.ride.status}`);

  // ride payment must appear as a wallet debit transaction
  const debitTx = walletAfter.data.wallet.transactions.find(
    (t) => t.type === 'debit' && t.source === 'ride_payment' && Number(t.amount) === fare
  );
  check('ride_payment debit transaction recorded', Boolean(debitTx), JSON.stringify(walletAfter.data.wallet.transactions.slice(0, 3)));

  // receipt exists for the wallet-paid ride
  const receipt = await api('GET', `/rides/${happy.rideId}/receipt`, null, token);
  check('receipt generated for wallet payment', receipt.status === 200 && receipt.data.receipt?.receiptNumber,
    `status=${receipt.status}`);

  // ---- 8. insufficient balance ----
  await creditWalletDirectly(passengerId, 500, 'test_seed_low');
  const low = await runRideToPayment(token, { paymentMethodId: 'wallet' });
  // complete-trip succeeds (the trip did end); the failed charge leaves the
  // ride at paymentPending instead of completed.
  check('low-balance complete-trip leaves ride paymentPending', low.done?.ride?.status === 'paymentPending',
    JSON.stringify(low.done?.ride?.status || low.done || ''));

  // chargePayment failed the payment, NOT completed the ride.
  const lowRide = await api('GET', `/rides/${low.rideId}`, null, token);
  check('insufficient balance: ride NOT marked completed/paid',
    lowRide.data.ride.status === 'paymentPending', `status=${lowRide.data.ride.status}`);
  const lowPayment = await api('GET', `/rides/${low.rideId}/payment`, null, token);
  check('insufficient balance: payment state failed',
    lowPayment.data.payment?.state === 'failed' || lowPayment.data.payment?.status === 'failed',
    JSON.stringify(lowPayment.data.payment));
  const walletLow = await api('GET', '/wallet', null, token);
  check('insufficient balance: wallet NOT debited', walletLow.data.wallet.balance === 500, `balance=${walletLow.data.wallet.balance}`);

  // A finished trip must still be paid: it cannot be cancelled, but the
  // rider can fall back to cash, which the driver then confirms.
  const cancelStuck = await api('POST', `/rides/${low.rideId}/cancel`, { reason: 'cannot pay' }, token);
  check('unpaid finished ride cannot be cancelled', cancelStuck.status === 400, `status=${cancelStuck.status}`);
  const toCash = await api('POST', '/payments', { rideId: low.rideId, method: 'cash' }, token);
  check('failed wallet payment can switch to cash', toCash.status === 201 && toCash.data.payment?.method === 'cash',
    `status=${toCash.status} ${JSON.stringify(toCash.data)}`);
  const cashConfirm = await api('POST', `/drivers/rides/${low.rideId}/confirm-cash`, null, low.dt);
  const lowSettled = await api('GET', `/rides/${low.rideId}`, null, token);
  check('driver cash confirmation completes the ride', cashConfirm.status === 200 && lowSettled.data.ride.status === 'completed',
    `confirm=${cashConfirm.status} status=${lowSettled.data.ride.status}`);

  // ---- 5. active-ride restore contract at every state ----
  // New ride, check GET /rides/current at each step of the lifecycle.
  await creditWalletDirectly(passengerId, 50000, 'test_seed_restore');
  const r = await api('POST', '/rides', {
    pickup: { address: 'KN 5 Rd, Kigali', latitude: -1.9441, longitude: 30.0619 },
    destination: { address: 'Gisozi', latitude: -1.9333, longitude: 30.0712 },
    vehicleId: 'fem_economy', paymentMethodId: 'cash', rideType: 'private',
  }, token);
  const restoreRideId = r.data.ride.id;

  let cur = await api('GET', '/rides/current', null, token);
  check('restore: current while searchingDriver', cur.data.ride?.id === restoreRideId && cur.data.ride.status === 'searchingDriver',
    `status=${cur.data.ride?.status}`);
  const assignedR = await waitForAssignment(token, restoreRideId);
  const dloginR = await api('POST', '/drivers/login', { phone: assignedR.driver.phone, password: SEED_DRIVER_PASSWORD });
  const dtR = dloginR.data.token;

  await api('POST', `/drivers/rides/${restoreRideId}/accept`, null, dtR);
  cur = await api('GET', '/rides/current', null, token);
  check('restore: current at driverArriving', cur.data.ride?.status === 'driverArriving', `status=${cur.data.ride?.status}`);

  await api('POST', `/drivers/rides/${restoreRideId}/arrived`, null, dtR);
  cur = await api('GET', '/rides/current', null, token);
  check('restore: current at driverArrived', cur.data.ride?.status === 'driverArrived', `status=${cur.data.ride?.status}`);

  const pinR = (await api('GET', `/rides/${restoreRideId}`, null, token)).data.ride.pin;
  await api('POST', `/drivers/rides/${restoreRideId}/verify-pin`, { pin: pinR }, dtR);
  cur = await api('GET', '/rides/current', null, token);
  check('restore: current at inProgress', cur.data.ride?.status === 'inProgress', `status=${cur.data.ride?.status}`);

  await api('POST', `/drivers/rides/${restoreRideId}/complete-trip`, null, dtR);
  await api('POST', `/drivers/rides/${restoreRideId}/confirm-cash`, null, dtR);
  cur = await api('GET', '/rides/current', null, token);
  check('restore: current is null after completion', cur.data.ride === null, `got=${JSON.stringify(cur.data.ride)?.slice(0, 80)}`);

  // ---- 9. My Rides shows the real history with fares + payment info ----
  const history = await api('GET', '/rides', null, token);
  const mine = history.data.rides.filter((x) => [happy.rideId, low.rideId, restoreRideId].includes(x.id));
  check('history contains all 3 rides of this passenger', mine.length === 3, `n=${mine.length}/${history.data.rides.length}`);
  const paidRide = mine.find((x) => x.id === happy.rideId);
  check('completed wallet ride has real fare in history', paidRide.status === 'completed' && paidRide.finalFare === fare,
    `status=${paidRide.status} finalFare=${paidRide.finalFare}`);
  const cashFallbackRide = mine.find((x) => x.id === low.rideId);
  check('cash-fallback ride shows completed in history', cashFallbackRide.status === 'completed',
    `status=${cashFallbackRide.status}`);

  console.log(`\nWALLET-FLOW: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('wallet-flow crashed:', e); process.exit(1); });
