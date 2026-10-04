/* End-to-end smoke test against the running Kimu Transport API. */
const { SEED_DRIVER_PASSWORD } = require('./seedPassword');
const BASE = 'http://localhost:3000/api';
let passed = 0, failed = 0;

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

(async () => {
  // 1. Health
  const health = await api('GET', '/health');
  check('health', health.status === 200, `status=${health.status}`);

  // 2. Signup + login
  const ts = Date.now().toString().slice(-8);
  const rnd = () => '07' + Math.floor(10000000 + Math.random() * 89999999).toString();
  const phone = `+250${rnd().slice(1)}`;
  const email = `u${ts}@example.com`;
  const signup = await api('POST', '/auth/signup', { fullName: 'Test Rider', phone, email, password: 'secret123' });
  check('signup 201 + token + devCode', signup.status === 201 && signup.data.token && signup.data.devCode, `status=${signup.status}`);
  const token = signup.data.token;

  const login = await api('POST', '/auth/login', { identifier: email, password: 'secret123' });
  check('login (email)', login.status === 200 && login.data.token, `status=${login.status}`);
  const loginBad = await api('POST', '/auth/login', { identifier: email, password: 'wrong' });
  check('login rejects bad password', loginBad.status === 401, `status=${loginBad.status}`);

  // 3. resend-otp back-to-back must respect the cooldown: the 2nd immediate
  // request is always blocked by the 60s cooldown.
  const resend1 = await api('POST', '/auth/resend-otp', { purpose: 'signup' }, token);
  const resend2 = await api('POST', '/auth/resend-otp', { purpose: 'signup' }, token);
  check('resend-otp blocked by cooldown', resend2.status === 429, `r1=${resend1.status} r2=${resend2.status}`);

  // 4. verify-otp with the revealed dev code (latest issued)
  const latestCode = resend1.data.devCode || signup.data.devCode;
  const otp = await api('POST', '/auth/verify-otp', { passengerId: signup.data.passenger.id, code: latestCode });
  check('verify-otp', otp.status === 200 && otp.data.verified === true, `status=${otp.status}`);

  // 5. vehicles
  const vehicles = await api('GET', '/vehicles', null, token);
  check('vehicles >= 3', vehicles.status === 200 && vehicles.data.vehicles?.length >= 3, `n=${vehicles.data.vehicles?.length}`);

  // 5b. nearby drivers (real seeded drivers are parked around KN 5 Rd)
  const nearby = await api('GET', '/drivers/nearby?lat=-1.9441&lng=30.0619', null, token);
  check('nearby drivers returns real seeded drivers',
    nearby.status === 200 && Array.isArray(nearby.data.drivers) && nearby.data.drivers.length >= 1,
    `status=${nearby.status} n=${nearby.data?.drivers?.length}`);

  // 6. fare estimate
  const est = await api('GET', '/rides/estimate?vehicleId=fem_economy&rideType=private&pickup=-1.9441,30.0619&destination=-1.9586,30.0205', null, token);
  check('estimate returns fare', est.status === 200 && est.data.estimate.estimatedFare > 0, JSON.stringify(est.data?.estimate));

  // 7. promotion validate
  const promo = await api('POST', '/promotions/validate', { code: 'WELCOME30', grossFare: 30000 }, token);
  check('promotion valid', promo.status === 200 && promo.data.valid === true && promo.data.discount > 0, `status=${promo.status}`);

  // 8. create a ride (promo + shared)
  const ride = await api('POST', '/rides', {
    pickup: { address: 'KN 5 Rd, Kigali', latitude: -1.9441, longitude: 30.0619 },
    destination: { address: 'Nyamirambo', latitude: -1.9586, longitude: 30.0205 },
    vehicleId: 'fem_economy', paymentMethodId: 'mtn_momo', rideType: 'shared',
    rideNote: 'Ring twice', promotionCode: 'WELCOME30',
  }, token);
  check('create ride 201 (shared, discounted)',
    ride.status === 201 && ride.data.ride.status === 'searchingDriver' &&
    ride.data.ride.appliedDiscount > 0 && ride.data.ride.rideType === 'shared',
    `status=${ride.status} ${JSON.stringify(ride.data?.ride)}`);
  const rideId = ride.data.ride.id;

  // 8b. duplicate-request guard: while rideId is active, a second booking
  // must be rejected with 409 — passengers cannot stack rides.
  const dupRide = await api('POST', '/rides', {
    pickup: { address: 'KN 5 Rd, Kigali', latitude: -1.9441, longitude: 30.0619 },
    destination: { address: 'CBD', latitude: -1.9509, longitude: 30.0595 },
    vehicleId: 'fem_economy', paymentMethodId: 'cash', rideType: 'private',
  }, token);
  check('duplicate ride blocked (409)', dupRide.status === 409, `status=${dupRide.status}`);

  // 9. recent destination recorded on booking? (we call the endpoint directly)
  const recent = await api('POST', '/places/recent', { address: 'Nyamirambo', latitude: -1.9586, longitude: 30.0205 }, token);
  check('record recent dest', recent.status === 204, `status=${recent.status}`);
  const recentList = await api('GET', '/places/recent', null, token);
  check('recent dest listed', recentList.status === 200 && recentList.data.recent?.length >= 1, `n=${recentList.data.recent?.length}`);

  // 10. driver auth + ride progress
  const loginAsAssignedDriver = async (rideJson) => {
    const dlogin = await api('POST', '/drivers/login', { phone: rideJson.driver.phone, password: SEED_DRIVER_PASSWORD });
    check(`driver login (${rideJson.driver.name})`, dlogin.status === 200 && dlogin.data.token, `status=${dlogin.status}`);
    return dlogin.data.token;
  };

  // matching runs in background; wait for assignment
  let assigned = null;
  for (let i = 0; i < 12; i++) {
    const r = await api('GET', `/rides/${rideId}`, null, token);
    if (r.data.ride.status !== 'searchingDriver') { assigned = r; break; }
    await sleep(1200);
  }
  check('driver matched -> driverAssigned', assigned && assigned.data.ride.status === 'driverAssigned' && assigned.data.ride.driver?.phone,
    `status=${assigned?.data.ride?.status}`);
  const dt = await loginAsAssignedDriver(assigned.data.ride);

  // destination change is allowed while the driver has not picked you up —
  // check it here (before acceptance).
  const chg = await api('POST', `/rides/${rideId}/change-destination`, {
    destination: { address: 'Kimironko', latitude: -1.9562, longitude: 30.1575 },
  }, token);
  check('destination change', chg.status === 200 && chg.data.ride.destination.address === 'Kimironko', `status=${chg.status}`);

  // driver accepts, marks arrived
  const accept = await api('POST', `/drivers/rides/${rideId}/accept`, null, dt);
  check('driver accepts ride', accept.status === 200, `status=${accept.status}`);
  const arrived = await api('POST', `/drivers/rides/${rideId}/arrived`, null, dt);
  // The PIN is only ever shown to the rider, who reads it out to the driver.
  check('driver arrived (PIN not leaked to driver)', arrived.status === 200 && !arrived.data.pin, `status=${arrived.status}`);
  const ridePinCheck = await api('GET', `/rides/${rideId}`, null, token);
  const pin = ridePinCheck.data.ride.pin;
  check('passenger sees ride pin', /^\d+$/.test(String(pin || '')), `got=${pin}`);

  // driver starts trip by verifying pin
  const vpin = await api('POST', `/drivers/rides/${rideId}/verify-pin`, { pin }, dt);
  check('drive verify pin', vpin.status === 200, `status=${vpin.status}`);

  // driver's phone reports a few GPS pings while the trip is under way — this
  // is what lets the passenger see the actual road path afterwards.
  await api('POST', '/drivers/location', { latitude: -1.9441, longitude: 30.0619 }, dt);
  await sleep(200);
  await api('POST', '/drivers/location', { latitude: -1.9500, longitude: 30.0450 }, dt);
  await sleep(200);
  await api('POST', '/drivers/location', { latitude: -1.9586, longitude: 30.0205 }, dt);

  // driver completes trip -> paymentPending (honest mode) or completed
  // immediately (DEMO_PAYMENTS fake acceptance).
  const DEMO = process.env.DEMO_PAYMENTS === '1';
  const done = await api('POST', `/drivers/rides/${rideId}/complete-trip`, null, dt);
  if (DEMO) {
    check('complete-trip -> completed (DEMO_PAYMENTS demo acceptance)',
      done.status === 200 && done.data.ride.status === 'completed' && done.data.payment.status === 'succeeded',
      `status=${done.status} ${JSON.stringify(done.data?.ride?.status)}/${JSON.stringify(done.data?.payment)}`);
  } else {
    check('complete-trip -> paymentPending (paypack not configured, stays pending)',
      done.status === 200 && done.data.ride.status === 'paymentPending' && done.data.payment.status === 'pending',
      `status=${done.status} ${JSON.stringify(done.data?.ride?.status)}/${JSON.stringify(done.data?.payment)}`);
  }

  // actual travelled route: the passenger can fetch the breadcrumb trail
  // recorded while the driver drove this ride, in chronological order.
  const route = await api('GET', `/rides/${rideId}/route`, null, token);
  const pts = route.data?.points || [];
  const inOrder = pts.every((p, i) => i === 0 ||
    new Date(p.recordedAt).getTime() >= new Date(pts[i - 1].recordedAt).getTime());
  check('actual route recorded (>=3 points, chronological)',
    route.status === 200 && pts.length >= 3 && inOrder,
    `status=${route.status} n=${pts.length}`);

  // 11. payment flow: retry POST /payments while provider not configured
  // (honest mode) — demo mode already settled momo, so this path is not
  // re-exercised here.
  const pay = await api('POST', '/payments', { rideId }, token);
  if (DEMO) {
    check('payment re-init after demo settlement returns 400', pay.status === 400, `status=${pay.status}`);
  } else {
    check('payment re-init idempotent', pay.status === 200 && pay.data.payment, `status=${pay.status}`);
  }

  // 11b. rideId is still paymentPending (momo, provider unconfigured) — its
  // payment must NOT be marked paid by any client action. Demo mode has the
  // opposite, intentional behavior: momo was settled automatically.
  const ride1Check = await api('GET', `/rides/${rideId}`, null, token);
  if (DEMO) {
    check('demo momo ride completed (fake acceptance settled it)',
      ride1Check.data.ride.status === 'completed',
      `status=${ride1Check.data.ride.status}`);
  } else {
    check('unpaid momo ride still paymentPending (never falsely paid)',
      ride1Check.data.ride.status === 'paymentPending',
      `status=${ride1Check.data.ride.status}`);
  }

  // switch to cash route: create a NEW cash ride and settle it via the driver confirm-cash.
  // (In honest mode rideId is cancelled first — a passenger can hold only one
  // active ride. Demo mode: the ride is already completed, passenger is free.)
  if (!DEMO) {
    const ride1Cancel = await api('POST', `/rides/${rideId}/cancel`, { reason: 'smoke: switching to cash ride' }, token);
    check('cancel momo ride to free the passenger', ride1Cancel.status === 200 && ride1Cancel.data.ride.status === 'cancelled',
      `status=${ride1Cancel.status}`);
  }

  const ride2 = await api('POST', '/rides', {
    pickup: { address: 'KN 5 Rd, Kigali', latitude: -1.9441, longitude: 30.0619 },
    destination: { address: 'Gisozi', latitude: -1.9333, longitude: 30.0712 },
    vehicleId: 'fem_economy', paymentMethodId: 'cash', rideType: 'private',
  }, token);
  check('cash ride created after cancel (guard released)', ride2.status === 201, `status=${ride2.status}`);
  const ride2Id = ride2.data.ride.id;
  let ride2assigned = null;
  for (let i = 0; i < 12; i++) {
    const r = await api('GET', `/rides/${ride2Id}`, null, token);
    if (r.data.ride.status !== 'searchingDriver') { ride2assigned = r; break; }
    await sleep(1200);
  }
  check('cash ride matched', ride2assigned?.data.ride.status === 'driverAssigned', `status=${ride2assigned?.data.ride?.status}`);
  const dt2 = await loginAsAssignedDriver(ride2assigned.data.ride);
  await api('POST', `/drivers/rides/${ride2Id}/accept`, null, dt2);
  await api('POST', `/drivers/rides/${ride2Id}/arrived`, null, dt2);
  const pin2 = (await api('GET', `/rides/${ride2Id}`, null, token)).data.ride.pin;
  await api('POST', `/drivers/rides/${ride2Id}/verify-pin`, { pin: pin2 }, dt2);
  const done2 = await api('POST', `/drivers/rides/${ride2Id}/complete-trip`, null, dt2);
  const cashSettle = await api('POST', `/drivers/rides/${ride2Id}/confirm-cash`, null, dt2);
  check('cash payment settles -> completed', cashSettle.status === 200 && done2.data.ride.id === ride2Id &&
    (await api('GET', `/rides/${ride2Id}`, null, token)).data.ride.status === 'completed',
    `status=${cashSettle.status}`);
  const receipt = await api('GET', `/rides/${ride2Id}/receipt`, null, token);
  check('receipt generated', receipt.status === 200 && receipt.data.receipt && receipt.data.receipt.receiptNumber, `n=${receipt.data.receipt?.receiptNumber}`);

  // 12. rate + rating already rated uniqueness
  const rate = await api('POST', `/rides/${ride2Id}/rate`, { rating: 5, comment: 'Great driver' }, token);
  check('rate ride', rate.status === 200, `status=${rate.status}`);
  const rate2 = await api('POST', `/rides/${ride2Id}/rate`, { rating: 1 }, token);
  check('double rate rejected', rate2.status === 400, `status=${rate2.status}`);

  // 13. cancel flow + reason
  const ride3 = await api('POST', '/rides', {
    pickup: { address: 'KN 5 Rd', latitude: -1.9441, longitude: 30.0619 },
    destination: { address: 'Airport', latitude: -1.9536, longitude: 30.0945 },
    vehicleId: 'fem_comfort', paymentMethodId: 'cash', rideType: 'private',
  }, token);
  const cancel = await api('POST', `/rides/${ride3.data.ride.id}/cancel`, { reason: 'Pickup taking too long' }, token);
  check('cancel with reason', cancel.status === 200 && cancel.data.ride.status === 'cancelled' && cancel.data.ride.cancelledBy === 'passenger',
    `status=${cancel.status}`);
  const cancelLate = await api('POST', `/rides/${ride2Id}/cancel`, {}, token);
  check('completed ride cannot cancel', cancelLate.status === 400, `status=${cancelLate.status}`);
  const rateCancelled = await api('POST', `/rides/${ride3.data.ride.id}/rate`, { rating: 3 }, token);
  check('rate non-completed (cancelled) ride rejected', rateCancelled.status === 400, `status=${rateCancelled.status}`);

  // 14. notifications + device token + mark read
  const devToken = await api('POST', '/notifications/device-token', { token: `smoke-${ts}`, platform: 'android' }, token);
  check('register device token', devToken.status === 204, `status=${devToken.status}`);
  const notifs = await api('GET', '/notifications', null, token);
  check('notifications written by events', notifs.status === 200 && notifs.data.notifications.length > 0, `n=${notifs.data.notifications?.length}`);
  const unread = await api('GET', '/notifications/unread-count', null, token);
  check('unread count', unread.data.count > 0, `count=${unread.data.count}`);
  const markAll = await api('POST', '/notifications/read-all', null, token);
  check('mark all read', markAll.status === 200, `status=${markAll.status}`);

  // 16. support ticket + message
  const ticket = await api('POST', '/support', { category: 'lost_item', subject: 'Left phone in car', message: 'Phone charger', rideId: ride2Id }, token);
  check('support ticket', ticket.status === 201 && ticket.data.ticket.id, `status=${ticket.status}`);
  const reply = await api('POST', `/support/${ticket.data.ticket.id}/messages`, { message: 'Actually it was a power bank' }, token);
  check('support reply', reply.status === 201, `status=${reply.status}`);
  const thread = await api('GET', `/support/${ticket.data.ticket.id}`, null, token);
  check('support thread has 2 messages', thread.status === 200 && thread.data.messages.length === 2, `n=${thread.data.messages?.length}`);

  // 17. emergency + share. rideId was cancelled at step 11b — sharing only
  // applies to ACTIVE rides, so use ride2Id (completed? no — completed also
  // rejected). Create a fresh active ride for the share check.
  const sos = await api('POST', '/emergency', { rideId, latitude: -1.9441, longitude: 30.0619, address: 'KN 5 Rd', details: 'Passenger needs help' }, token);
  check('emergency event', sos.status === 201 && sos.data.emergency.status === 'dispatched' && !!sos.data.emergency.reference, `status=${sos.status}`);

  // free the passenger (ride2 completed at this point — terminal, fine), then
  // book a throwaway ride to share.
  const shareRide = await api('POST', '/rides', {
    pickup: { address: 'KN 5 Rd', latitude: -1.9441, longitude: 30.0619 },
    destination: { address: 'Remera', latitude: -1.9494, longitude: 30.1067 },
    vehicleId: 'fem_economy', paymentMethodId: 'cash', rideType: 'private',
  }, token);
  const shareRideId = shareRide.data.ride.id;
  const share = await api('POST', '/share', { rideId: shareRideId }, token);
  check('trip share token (active ride)', share.status === 201 && share.data.share.token, `status=${share.status} ${JSON.stringify(share.data)}`);
  if (share.data.share?.token) {
    const shareView = await api('GET', `/share/${share.data.share.token}`);
    check('public share view', shareView.status === 200 && shareView.data.trip.status, `status=${shareView.status}`);
  }
  await api('POST', `/rides/${shareRideId}/cancel`, { reason: 'smoke cleanup' }, token);

  // 17b. Real shared-ride pooling: two different passengers, both booking a
  // 'shared' ride heading the same way, should be matched to the SAME
  // driver/vehicle — not just get the same discount independently.
  const poolA = await api('POST', '/rides', {
    pickup: { address: 'KN 5 Rd, Kigali', latitude: -1.9441, longitude: 30.0619 },
    destination: { address: 'Nyamirambo', latitude: -1.9586, longitude: 30.0205 },
    vehicleId: 'fem_economy', paymentMethodId: 'cash', rideType: 'shared',
  }, token);
  const poolAId = poolA.data.ride.id;
  let poolAAssigned = null;
  for (let i = 0; i < 12; i++) {
    const r = await api('GET', `/rides/${poolAId}`, null, token);
    if (r.data.ride.status !== 'searchingDriver') { poolAAssigned = r.data.ride; break; }
    await sleep(1200);
  }
  check('pool ride A matched', poolAAssigned?.status === 'driverAssigned' && poolAAssigned.isPooled,
    `status=${poolAAssigned?.status} pooled=${poolAAssigned?.isPooled}`);

  const signup2 = await api('POST', '/auth/signup', {
    fullName: 'Second Rider', phone: `+250${rnd().slice(1)}`, email: `u2${ts}@example.com`, password: 'secret123',
  });
  const token2 = signup2.data.token;
  // Booking requires a verified phone.
  await api('POST', '/auth/verify-otp', { passengerId: signup2.data.passenger.id, code: signup2.data.devCode });

  const poolB = await api('POST', '/rides', {
    pickup: { address: 'Near KN 5 Rd', latitude: -1.9455, longitude: 30.0600 },
    destination: { address: 'Near Nyamirambo', latitude: -1.9570, longitude: 30.0230 },
    vehicleId: 'fem_economy', paymentMethodId: 'cash', rideType: 'shared',
  }, token2);
  check('pool ride B created', poolB.status === 201, `status=${poolB.status} ${JSON.stringify(poolB.data).slice(0, 200)} signup2=${signup2.status}`);
  const poolBId = poolB.data.ride.id;
  let poolBAssigned = null;
  for (let i = 0; i < 12; i++) {
    const r = await api('GET', `/rides/${poolBId}`, null, token2);
    if (r.data.ride.status !== 'searchingDriver') { poolBAssigned = r.data.ride; break; }
    await sleep(1200);
  }
  check('pool ride B joined the SAME pool as A',
    poolBAssigned?.status === 'driverAssigned' &&
    poolBAssigned.poolGroupId === poolAAssigned?.poolGroupId &&
    poolBAssigned.driver?.phone === poolAAssigned?.driver?.phone,
    `A.pool=${poolAAssigned?.poolGroupId} B.pool=${poolBAssigned?.poolGroupId} A.driver=${poolAAssigned?.driver?.phone} B.driver=${poolBAssigned?.driver?.phone}`);

  const companions = await api('GET', `/rides/${poolAId}/companions`, null, token);
  check('companions endpoint sees the other pooled passenger',
    companions.status === 200 && companions.data.companions.some((c) => c.firstName === 'Second'),
    JSON.stringify(companions.data));

  const poolDriverLogin = await api('POST', '/drivers/login', {
    phone: poolAAssigned.driver.phone, password: SEED_DRIVER_PASSWORD,
  });
  const poolDt = poolDriverLogin.data.token;

  // The driver must be able to act on BOTH pooled rides independently — this
  // is the part that breaks without per-ride (not "most recent ride") lookup.
  const acceptA = await api('POST', `/drivers/rides/${poolAId}/accept`, null, poolDt);
  const acceptB = await api('POST', `/drivers/rides/${poolBId}/accept`, null, poolDt);
  check('driver can accept BOTH pooled rides', acceptA.status === 200 && acceptB.status === 200,
    `A=${acceptA.status} B=${acceptB.status}`);

  const activeRides = await api('GET', '/drivers/rides/active', null, poolDt);
  check('driver sees both pooled rides as active',
    activeRides.status === 200 && activeRides.data.rides.length === 2,
    `n=${activeRides.data?.rides?.length}`);

  // Drop off passenger A first; the driver must still be able to serve B.
  const arrivedA = await api('POST', `/drivers/rides/${poolAId}/arrived`, null, poolDt);
  check('driver arrived at pooled pickup A', arrivedA.status === 200, `status=${arrivedA.status}`);
  const pinA = (await api('GET', `/rides/${poolAId}`, null, token)).data.ride.pin;
  await api('POST', `/drivers/rides/${poolAId}/verify-pin`, { pin: pinA }, poolDt);
  const completeA = await api('POST', `/drivers/rides/${poolAId}/complete-trip`, null, poolDt);
  await api('POST', `/drivers/rides/${poolAId}/confirm-cash`, null, poolDt);

  const arrivedB = await api('POST', `/drivers/rides/${poolBId}/arrived`, null, poolDt);
  check('driver still assigned to B after completing A (not released mid-pool)',
    completeA.status === 200 && arrivedB.status === 200,
    `completeA=${completeA.status} arrivedB=${arrivedB.status}`);
  const pinB = (await api('GET', `/rides/${poolBId}`, null, token2)).data.ride.pin;
  await api('POST', `/drivers/rides/${poolBId}/verify-pin`, { pin: pinB }, poolDt);
  const completeB = await api('POST', `/drivers/rides/${poolBId}/complete-trip`, null, poolDt);
  const payB = await api('POST', `/drivers/rides/${poolBId}/confirm-cash`, null, poolDt);
  check('pool ride B completes independently', completeB.status === 200 && payB.status === 200,
    `completeB=${completeB.status} payB=${payB.status}`);

  // 18. wallet
  const wallet = await api('GET', '/wallet', null, token);
  check('wallet balance', wallet.status === 200 && typeof wallet.data.wallet.balance === 'number', `status=${wallet.status}`);

  // 19. scheduled ride
  const sched = await api('POST', '/rides', {
    pickup: { address: 'KN 5 Rd', latitude: -1.9441, longitude: 30.0619 },
    destination: { address: 'Downtown', latitude: -1.9509, longitude: 30.0595 },
    vehicleId: 'fem_economy', paymentMethodId: 'cash', rideType: 'private',
    scheduledFor: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
  }, token);
  check('scheduled ride', sched.status === 201 && sched.data.ride.status === 'scheduled' && sched.data.ride.scheduledFor, `status=${sched.status}`);

  // 20. locations proxy (public geocoding — may flake offline, non-fatal)
  try {
    const loc = await api('GET', '/locations/search?q=Kigali', null, token);
    check('locations search', loc.status === 200, `status=${loc.status}`);
  } catch (e) { check('locations search (proxy down)', false, e.message); }

  // 21. security: rate limiter check
  const loginBadTry = await api('POST', '/auth/login', { identifier: email, password: 'wrong' });
  check('bad login -> 401', loginBadTry.status === 401, `status=${loginBadTry.status}`);

  // 22. profile update persists preferred language + emergency contact
  const profile = await api('PUT', '/auth/profile', { preferredLanguage: 'rw', emergencyContactName: 'Mom', emergencyContactPhone: '+250780000999' }, token);
  check('profile update', profile.status === 200 && profile.data.passenger.emergencyContactName === 'Mom', `status=${profile.status}`);

  console.log(`\nSMOKE: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('smoke crashed:', e); process.exit(1); });