/**
 * Runtime E2E: shared-ride seats + stop plan, and the driver's money —
 * cash-trip commission, commission settlement, payout request and operator
 * approval — against the real API + database.
 *
 * Usage: ADMIN_API_KEY=... node test/driver-money.js
 * (local server on :3000 started with DEV_REVEAL_CODES=1,
 * the same ADMIN_API_KEY.
 * Start it with DRIVER_MAX_COMMISSION_DEBT=100 to also cover the
 * going-online block; with the default limit that part is skipped.)
 */
const { FIXTURE_PASSWORD, createDriversAround } = require('./fixtures');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const BASE = 'http://localhost:3000/api';
const ADMIN_KEY = process.env.ADMIN_API_KEY;
const COMMISSION_RATE = Number(process.env.DRIVER_COMMISSION_RATE ?? 1);
// Whether the server under test has real Paypack credentials: mobile-money
// payouts then go out through Paypack instead of a hand-recorded transfer.
const PAYPACK_ON = Boolean(process.env.PAYPACK_CLIENT_ID && process.env.PAYPACK_CLIENT_SECRET);
let passed = 0;
let failed = 0;

async function api(method, p, body, token, headers = {}) {
  const res = await fetch(`${BASE}${p}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, data };
}
const admin = (method, p, body) => api(method, `/admin${p}`, body, null, { 'X-Admin-Key': ADMIN_KEY });

function check(name, cond, detail = '') {
  if (cond) { passed++; console.log(`  ok   ${name}`); }
  else { failed++; console.log(`  FAIL ${name} ${detail}`); }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PICKUP = { address: 'KN 5 Rd, Kigali', latitude: -1.9441, longitude: 30.0619 };
const DEST = { address: 'Nyamirambo', latitude: -1.9586, longitude: 30.0205 };

async function waitForAssignment(token, rideId) {
  for (let i = 0; i < 15; i++) {
    const r = await api('GET', `/rides/${rideId}`, null, token);
    if (r.data.ride.status !== 'searchingDriver') return r.data.ride;
    await sleep(1200);
  }
  return null;
}

(async () => {
  if (!ADMIN_KEY) {
    console.error('Set ADMIN_API_KEY (same value as the server).');
    process.exit(1);
  }
  // Real drivers for this run, registered and verified through the API and
  // parked online at the pickup used below.
  await createDriversAround(PICKUP, 3);

  const ts = Date.now().toString().slice(-8);
  const signup = await api('POST', '/auth/signup', {
    fullName: 'Money Rider', phone: `+2507${ts}`, email: `money${ts}@example.com`, password: 'secret123',
  });
  const token = signup.data.token;
  await api('POST', '/auth/verify-otp', { passengerId: signup.data.passenger.id, code: signup.data.devCode }, token);

  // Start every driver clear of old commission so earlier runs cannot take
  // a driver offline part-way through this one.
  const roster = await admin('GET', '/drivers?verified=true');
  for (const d of roster.data.drivers || []) {
    const b = (await admin('GET', `/drivers/${d.id}/balance`)).data.balance;
    if (b.owed > 0) {
      await admin('POST', `/drivers/${d.id}/settlements`, { amount: b.owed, reference: 'test-reset', recordedBy: 'test' });
    }
  }

  // ---- shared-ride quote: seats and the promised detour cap ----
  const q = (seats) => api('GET',
    `/rides/quote?pickup=${PICKUP.latitude},${PICKUP.longitude}&destination=${DEST.latitude},${DEST.longitude}&rideType=shared&seats=${seats}`,
    null, token);
  const [quote1, quote2, quote9] = await Promise.all([q(1), q(2), q(9)]);
  const fare = (quote) => quote.data.quote.options.find((o) => o.vehicleId === 'fem_economy').fare.total;
  check('shared quote promises a detour cap', quote1.data.quote.shared?.maxAddedMinutes > 0,
    JSON.stringify(quote1.data.quote?.shared));
  check('two seats cost more than one, less than double',
    fare(quote2) > fare(quote1) && fare(quote2) < 2 * fare(quote1), `1=${fare(quote1)} 2=${fare(quote2)}`);
  check('seats are capped at 2', quote9.data.quote.shared.seats === 2, `seats=${quote9.data.quote.shared?.seats}`);
  const privateQuote = await api('GET',
    `/rides/quote?pickup=${PICKUP.latitude},${PICKUP.longitude}&destination=${DEST.latitude},${DEST.longitude}&rideType=private`,
    null, token);
  check('two shared seats still cost less than a private car', fare(quote2) < fare(privateQuote),
    `shared2=${fare(quote2)} private=${fare(privateQuote)}`);

  // ---- cash shared ride with 2 seats; the driver's stop plan ----
  const quoted = quote2.data.quote.options.find((o) => o.vehicleId === 'fem_economy');
  const booked = await api('POST', '/rides', {
    pickup: PICKUP, destination: DEST, vehicleId: 'fem_economy', paymentMethodId: 'cash',
    rideType: 'shared', seats: 2, quoteId: quoted.quoteId,
  }, token);
  check('shared ride booked with 2 seats at the quoted fare',
    booked.status === 201 && booked.data.ride.seats === 2 && booked.data.ride.estimatedFare === quoted.fare.total,
    `status=${booked.status} seats=${booked.data.ride?.seats} fare=${booked.data.ride?.estimatedFare}`);
  const rideId = booked.data.ride.id;
  const assigned = await waitForAssignment(token, rideId);
  check('ride matched', assigned?.status === 'driverAssigned', `status=${assigned?.status}`);
  const dt = (await api('POST', '/drivers/login', { phone: assigned.driver.phone, password: FIXTURE_PASSWORD })).data.token;

  const before = (await api('GET', '/driver/balance', null, dt)).data.balance;
  check('driver balance readable', typeof before?.balance === 'number', JSON.stringify(before));

  await api('POST', `/drivers/rides/${rideId}/accept`, null, dt);
  const plan1 = await api('GET', '/drivers/rides/stops', null, dt);
  check('stop plan: pickup then drop-off',
    plan1.status === 200 && plan1.data.stops.map((s) => s.type).join() === 'pickup,dropoff' &&
      plan1.data.stops[0].seats === 2 && plan1.data.stops[1].etaMinutes >= plan1.data.stops[0].etaMinutes,
    JSON.stringify(plan1.data));
  await api('POST', `/drivers/rides/${rideId}/arrived`, null, dt);
  const pin = (await api('GET', `/rides/${rideId}`, null, token)).data.ride.pin;
  await api('POST', `/drivers/rides/${rideId}/verify-pin`, { pin }, dt);
  const plan2 = await api('GET', '/drivers/rides/stops', null, dt);
  check('stop plan after pickup: only the drop-off remains',
    plan2.data.stops.length === 1 && plan2.data.stops[0].type === 'dropoff', JSON.stringify(plan2.data.stops));
  await api('POST', `/drivers/rides/${rideId}/complete-trip`, null, dt);
  const cash = await api('POST', `/drivers/rides/${rideId}/confirm-cash`, null, dt);
  check('cash confirmed', cash.status === 200, `status=${cash.status}`);

  // ---- cash commission is owed by the driver ----
  const cashFare = booked.data.ride.estimatedFare;
  const afterCash = (await api('GET', '/driver/balance', null, dt)).data.balance;
  const commission = Math.round(cashFare * COMMISSION_RATE * 100) / 100;
  check('cash trip debits its commission from the driver balance',
    Math.abs(before.balance - afterCash.balance - commission) < 0.01,
    `before=${before.balance} after=${afterCash.balance} commission=${commission}`);

  // ---- digital fare credits the driver's net ----
  const momo = await api('POST', '/rides', {
    pickup: PICKUP, destination: DEST, vehicleId: 'fem_economy', paymentMethodId: 'mtn_momo', rideType: 'private',
  }, token);
  const momoId = momo.data.ride.id;
  const momoAssigned = await waitForAssignment(token, momoId);
  const dt2 = (await api('POST', '/drivers/login', { phone: momoAssigned.driver.phone, password: FIXTURE_PASSWORD })).data.token;
  const momoBefore = (await api('GET', '/driver/balance', null, dt2)).data.balance;
  await api('POST', `/drivers/rides/${momoId}/accept`, null, dt2);
  await api('POST', `/drivers/rides/${momoId}/arrived`, null, dt2);
  const pin2 = (await api('GET', `/rides/${momoId}`, null, token)).data.ride.pin;
  await api('POST', `/drivers/rides/${momoId}/verify-pin`, { pin: pin2 }, dt2);
  await api('POST', `/drivers/rides/${momoId}/complete-trip`, null, dt2);
  const momoAfter = (await api('GET', '/driver/balance', null, dt2)).data.balance;
  const momoFare = momo.data.ride.estimatedFare;
  const net = Math.round((momoFare - Math.round(momoFare * COMMISSION_RATE * 100) / 100) * 100) / 100;
  check('mobile-money trip credits the net fare to the driver balance',
    Math.abs(momoAfter.balance - momoBefore.balance - net) < 0.01,
    `before=${momoBefore.balance} after=${momoAfter.balance} net=${net}`);

  // ---- operator-recorded commission payment ----
  const me = (await api('GET', '/driver/me', null, dt)).data.driver;
  let balance;
  const badSettle = await admin('POST', `/drivers/${me.id}/settlements`, { amount: 3000 });
  check('operator settlement needs a reference', badSettle.status === 400, `status=${badSettle.status}`);
  balance = (await api('GET', '/driver/balance', null, dt)).data.balance;
  // Clears whatever the cash trip left owing, plus 3,000 to withdraw below.
  const settleAmount = Math.ceil(balance.owed) + 3000;
  const opSettle = await admin('POST', `/drivers/${me.id}/settlements`, { amount: settleAmount, reference: 'office-receipt-1', recordedBy: 'test-operator' });
  check('operator records a commission payment',
    opSettle.status === 201 && Math.abs(opSettle.data.balance.balance - balance.balance - settleAmount) < 0.01,
    `status=${opSettle.status} ${JSON.stringify(opSettle.data.balance)}`);

  // ---- payouts ----
  balance = opSettle.data.balance;
  const tooMuch = await api('POST', '/driver/payouts', { amount: balance.available + 1000 }, dt);
  check('payout above the available balance is refused', tooMuch.status === 400, `status=${tooMuch.status}`);
  const tooSmall = await api('POST', '/driver/payouts', { amount: 10 }, dt);
  check('payout below the minimum is refused', tooSmall.status === 400, `status=${tooSmall.status}`);
  const payout = await api('POST', '/driver/payouts', { amount: 2000 }, dt);
  check('payout requested', payout.status === 201 && payout.data.payout.status === 'pending' &&
    Math.abs(balance.balance - payout.data.balance.balance - 2000) < 0.01,
    `status=${payout.status} ${JSON.stringify(payout.data)}`);
  check('payout shows the cash-out fee and what the driver receives',
    payout.data.payout.fee === Math.ceil(2000 * payout.data.balance.payoutFeeRate) &&
      payout.data.payout.amountReceived === 2000 - payout.data.payout.fee && payout.data.payout.requestedAmount === 2000,
    JSON.stringify(payout.data.payout));
  const second = await api('POST', '/driver/payouts', { amount: 1000 }, dt);
  check('only one payout in progress at a time', second.status === 409, `status=${second.status}`);

  const queue = await admin('GET', '/payouts?status=pending');
  check('operator sees the pending payout', queue.data.payouts?.some((p) => p.id === payout.data.payout.id), `n=${queue.data.payouts?.length}`);
  const noReviewer = await admin('POST', `/payouts/${payout.data.payout.id}/approve`, {});
  check('approval needs a reviewer', noReviewer.status === 400, `status=${noReviewer.status}`);
  const wrongKey = await api('POST', `/admin/payouts/${payout.data.payout.id}/approve`, { reviewer: 'x' }, null, { 'X-Admin-Key': 'wrong' });
  check('approval rejects a wrong admin key', wrongKey.status === 401, `status=${wrongKey.status}`);
  // Approval moves the money one of two ways. With Paypack configured a
  // cash-out is sent and the payout stays 'processing' until the provider
  // confirms — unless the merchant balance cannot cover it (409) or the
  // provider is unreachable (502), in which case it is released to 'pending'.
  // Without Paypack the operator pays by hand and records the transfer's
  // reference, which closes the payout at once.
  let payoutOpen = false;
  if (PAYPACK_ON) {
    const approved = await admin('POST', `/payouts/${payout.data.payout.id}/approve`, { reviewer: 'test-operator' });
    if (approved.status === 200) {
      check('payout approved — mobile-money transfer started',
        ['processing', 'completed'].includes(approved.data.payout.status), JSON.stringify(approved.data));
      payoutOpen = approved.data.payout.status !== 'completed';
    } else {
      check('payout approval blocked only by provider availability',
        [409, 502].includes(approved.status), `status=${approved.status} ${JSON.stringify(approved.data)}`);
      payoutOpen = true;
    }
    const again = await admin('POST', `/payouts/${payout.data.payout.id}/approve`, { reviewer: 'test-operator' });
    check('a payout cannot be approved twice', payoutOpen ? [404, 409].includes(again.status) : again.status === 404, `status=${again.status}`);
  } else {
    const approved = await admin('POST', `/payouts/${payout.data.payout.id}/approve`, { reviewer: 'test-operator', reference: 'office-transfer-1' });
    check('payout approved and completed (recorded transfer)',
      approved.status === 200 && approved.data.payout.status === 'completed', `status=${approved.status} ${JSON.stringify(approved.data)}`);
    const again = await admin('POST', `/payouts/${payout.data.payout.id}/approve`, { reviewer: 'test-operator', reference: 'office-transfer-1' });
    check('a payout cannot be approved twice', again.status === 404, `status=${again.status}`);
  }

  // Free the driver for the next payout: a provider shortfall leaves the first
  // payout pending, so reject it before requesting another.
  if (payoutOpen) {
    await admin('POST', `/payouts/${payout.data.payout.id}/reject`, { reviewer: 'test-operator', reason: 'provider balance unavailable' });
  }

  const afterPayout = (await api('GET', '/driver/balance', null, dt)).data.balance;
  const rejectable = await api('POST', '/driver/payouts', { amount: 1000 }, dt);
  const rejected = await admin('POST', `/payouts/${rejectable.data.payout.id}/reject`, { reviewer: 'test-operator', reason: 'Wrong number' });
  const afterReject = (await api('GET', '/driver/balance', null, dt)).data.balance;
  check('rejected payout returns the amount to the balance',
    rejected.status === 200 && rejected.data.payout.status === 'failed' && Math.abs(afterReject.balance - afterPayout.balance) < 0.01,
    `status=${rejected.status} before=${afterPayout.balance} after=${afterReject.balance}`);
  const history = await api('GET', '/driver/payouts', null, dt);
  check('payout history lists both payouts', history.data.payouts.filter((p) => [payout.data.payout.id, rejectable.data.payout.id].includes(p.id)).length === 2,
    `n=${history.data.payouts?.length}`);

  // ---- owing commission: blocked from going online until it is paid ----
  // Empty the balance, then a cash trip leaves the driver owing its commission.
  balance = afterReject;
  if (balance.available >= balance.minPayout) {
    const all = await api('POST', '/driver/payouts', { amount: Math.floor(balance.available) }, dt);
    await admin('POST', `/payouts/${all.data.payout.id}/approve`, { reviewer: 'test-operator', reference: 'office-transfer-drain' });
  }
  const debtRide = await api('POST', '/rides', {
    pickup: PICKUP, destination: DEST, vehicleId: 'fem_economy', paymentMethodId: 'cash', rideType: 'private',
  }, token);
  const debtRideId = debtRide.data.ride.id;
  const debtAssigned = await waitForAssignment(token, debtRideId);
  const dt3 = (await api('POST', '/drivers/login', { phone: debtAssigned.driver.phone, password: FIXTURE_PASSWORD })).data.token;
  await api('POST', `/drivers/rides/${debtRideId}/accept`, null, dt3);
  await api('POST', `/drivers/rides/${debtRideId}/arrived`, null, dt3);
  const pin3 = (await api('GET', `/rides/${debtRideId}`, null, token)).data.ride.pin;
  await api('POST', `/drivers/rides/${debtRideId}/verify-pin`, { pin: pin3 }, dt3);
  await api('POST', `/drivers/rides/${debtRideId}/complete-trip`, null, dt3);
  await api('POST', `/drivers/rides/${debtRideId}/confirm-cash`, null, dt3);
  const owing = (await api('GET', '/driver/balance', null, dt3)).data.balance;
  check('driver owes commission after a cash trip', owing.owed > 0, JSON.stringify(owing));
  if (owing.blocked) {
    const meNow = (await api('GET', '/driver/me', null, dt3)).data.driver;
    check('driver over the debt limit is taken offline', meNow.status === 'offline', `status=${meNow.status}`);
    const goOnline = await api('PUT', '/driver/status', { status: 'active' }, dt3);
    check('driver over the debt limit cannot go online', goOnline.status === 403, `status=${goOnline.status}`);
  } else {
    console.log(`  skip going-online block (owed ${owing.owed} is within the limit ${owing.debtLimit})`);
  }
  // The driver tries to clear it by mobile money. With Paypack configured a
  // charge is started (it stays pending until the provider confirms); without
  // it the self-service path is honestly unavailable.
  const settle = await api('POST', '/driver/balance/settle', {}, dt3);
  if (PAYPACK_ON) {
    check('driver pays owed commission by mobile money (charge started)',
      settle.status === 201 ? ['pending', 'processing'].includes(settle.data.settlement.status) : settle.status === 502,
      `status=${settle.status} ${JSON.stringify(settle.data)}`);
  } else {
    check('commission settlement needs a payment provider',
      settle.status === 503, `status=${settle.status}`);
  }
  // A provider confirmation cannot be awaited here, so clear the debt the way
  // an operator does when the driver pays at the office.
  const me3 = (await api('GET', '/driver/me', null, dt3)).data.driver;
  const owedNow = (await api('GET', '/driver/balance', null, dt3)).data.balance.owed;
  await admin('POST', `/drivers/${me3.id}/settlements`, { amount: Math.ceil(owedNow), reference: 'office-receipt-2', recordedBy: 'test-operator' });
  const cleared = (await api('GET', '/driver/balance', null, dt3)).data.balance;
  check('commission cleared once the operator records the payment', cleared.owed === 0, JSON.stringify(cleared));
  const noDebt = await api('POST', '/driver/balance/settle', {}, dt3);
  check('nothing to settle once clear', noDebt.status === 400, `status=${noDebt.status}`);
  const backOnline = await api('PUT', '/driver/status', { status: 'active' }, dt3);
  check('driver can go online again after paying', backOnline.status === 200, `status=${backOnline.status} ${JSON.stringify(backOnline.data).slice(0, 120)}`);

  console.log(`\nDRIVER-MONEY: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('driver-money crashed:', e); process.exit(1); });
