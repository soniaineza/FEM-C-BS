/**
 * Flows the other end-to-end scripts do not reach, against the local API:
 * saved places, rider and driver support tickets, notifications read state,
 * password reset, closing a rider and a driver account, a driver's trip share /
 * incident report / SOS, the operator's emergency queue and cash-payment
 * exceptions, and the operator's vehicle edit.
 *
 * Usage: node test/account-flows.js   (API on :3000 started with
 * DEV_REVEAL_CODES=1 and the same ADMIN_API_KEY as this process)
 */
const { request, uniquePhone, createVerifiedDriver, FIXTURE_PASSWORD } = require('./fixtures');
const { openPool, connectionOptions } = require('../src/db');

const ADMIN_KEY = process.env.ADMIN_API_KEY;
let passed = 0;
let failed = 0;
function check(name, cond, detail = '') {
  if (cond) { passed += 1; console.log(`  ok   ${name}`); } else { failed += 1; console.log(`  FAIL ${name} ${detail}`); }
}
const api = (m, p, b, t) => request(m, p, b, t);
const admin = (m, p, b) => request(m, `/admin${p}`, b, null, { 'X-Admin-Key': ADMIN_KEY });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const brief = (r) => `status=${r.status} ${JSON.stringify(r.data).slice(0, 160)}`;

const PICKUP = { address: 'KN 5 Rd, Kigali', latitude: -1.9441, longitude: 30.0619 };
const DEST = { address: 'Nyamirambo', latitude: -1.9586, longitude: 30.0205 };

async function newRider(label) {
  const phone = uniquePhone();
  const email = `${label}${phone.slice(-9)}@example.com`;
  const su = await api('POST', '/auth/signup', { fullName: `Rider ${label}`, phone, email, password: 'secret123' });
  if (su.status !== 201) throw new Error(`signup ${brief(su)}`);
  const v = await api('POST', '/auth/verify-otp', { passengerId: su.data.passenger.id, code: su.data.devCode }, su.data.token);
  if (v.status !== 200) throw new Error(`verify ${brief(v)}`);
  return { id: su.data.passenger.id, token: su.data.token, phone, email };
}

/** A real driver's phone keeps reporting; a driver who goes quiet is swept offline. */
async function ping(driver) {
  await api('POST', '/drivers/location', { latitude: PICKUP.latitude, longitude: PICKUP.longitude, heading: 0, accuracy: 8 }, driver.token);
  await api('PUT', '/driver/status', { status: 'active' }, driver.token);
}

async function bookAndAssign(rider, paymentMethodId = 'cash', driver = null) {
  if (driver) await ping(driver);
  const created = await api('POST', '/rides', { pickup: PICKUP, destination: DEST, vehicleId: 'fem_economy', paymentMethodId }, rider.token);
  if (created.status !== 201) throw new Error(`book ${brief(created)}`);
  const rideId = created.data.ride.id;
  for (let i = 0; i < 20; i += 1) {
    const r = await api('GET', `/rides/${rideId}`, null, rider.token);
    if (r.data.ride.status !== 'searchingDriver') return r.data.ride;
    await sleep(500);
  }
  throw new Error('ride never matched');
}

async function driveToEndOfTrip(rideId, rider, driver) {
  await api('POST', `/drivers/rides/${rideId}/accept`, null, driver.token);
  await api('POST', `/drivers/rides/${rideId}/arrived`, null, driver.token);
  const pin = (await api('GET', `/rides/${rideId}`, null, rider.token)).data.ride.pin;
  await api('POST', `/drivers/rides/${rideId}/verify-pin`, { pin }, driver.token);
  return api('POST', `/drivers/rides/${rideId}/complete-trip`, null, driver.token);
}

async function main() {
  if (!ADMIN_KEY) throw new Error('ADMIN_API_KEY must be set (same value as the server).');
  const { config } = require('../src/config');
  if (!config.localDatabase) throw new Error('This test writes test data: local databases only.');
  const db = openPool(connectionOptions());
  const q = async (sql, params) => (await db.query(sql, params)).rows;
  // Drivers left online by earlier runs would take the rides below.
  await db.query("UPDATE drivers SET status = 'offline' WHERE status = 'active'");

  // ---------- rider: places, notifications, support ----------
  const rider = await newRider('flow');

  const saved = await api('POST', '/places/saved', { type: 'home', name: 'Home', address: 'KG 11 Ave', latitude: -1.95, longitude: 30.06 }, rider.token);
  const placeId = saved.data?.place?.id || saved.data?.savedPlace?.id || saved.data?.id;
  check('saved place created', saved.status === 201 && Boolean(placeId), brief(saved));
  const listed = await api('GET', '/places/saved', null, rider.token);
  check('saved place listed', listed.status === 200 && JSON.stringify(listed.data).includes('KG 11 Ave'), brief(listed));
  const removed = await api('DELETE', `/places/saved/${placeId}`, null, rider.token);
  check('saved place deleted', removed.status < 300, brief(removed));
  const after = await api('GET', '/places/saved', null, rider.token);
  check('saved place gone', !JSON.stringify(after.data).includes('KG 11 Ave'), brief(after));

  await db.query('INSERT INTO notifications (passenger_id, title, body, type) VALUES ($1, $2, $3, $4)', [rider.id, 'Hello', 'Test notification', 'general']);
  const notes = await api('GET', '/notifications', null, rider.token);
  const noteId = notes.data?.notifications?.[0]?.id;
  check('notification listed', Boolean(noteId), brief(notes));
  const read = await api('POST', `/notifications/${noteId}/read`, null, rider.token);
  check('one notification marked read', read.status === 200 && read.data?.notification?.read === true, brief(read));
  const unread = await api('GET', '/notifications/unread-count', null, rider.token);
  check('unread count is zero afterwards', unread.data?.count === 0, brief(unread));

  const ticket = await api('POST', '/support', { category: 'general', subject: 'Help', message: 'I need help' }, rider.token);
  const ticketId = ticket.data?.ticket?.id || ticket.data?.request?.id || ticket.data?.id;
  check('support ticket opened', ticket.status === 201 && Boolean(ticketId), brief(ticket));
  check('support ticket listed', JSON.stringify((await api('GET', '/support', null, rider.token)).data).includes(ticketId));
  const thread = await api('GET', `/support/${ticketId}`, null, rider.token);
  check('support ticket opens with its first message', thread.status === 200, brief(thread));
  const replied = await api('POST', `/support/${ticketId}/messages`, { message: 'More detail' }, rider.token);
  check('support reply accepted', replied.status === 201 || replied.status === 200, brief(replied));
  const closed = await api('POST', `/support/${ticketId}/close`, null, rider.token);
  check('support ticket closed', closed.status === 200, brief(closed));
  const [row] = await q('SELECT status FROM support_requests WHERE id = $1', [ticketId]);
  check('closed state is stored', row?.status === 'closed', JSON.stringify(row));

  // ---------- rider: password reset ----------
  const resetAsk = await api('POST', '/auth/reset-password/request', { identifier: rider.email });
  check('reset code requested', resetAsk.status === 200 && Boolean(resetAsk.data?.devCode), brief(resetAsk));
  const resetDo = await api('POST', '/auth/reset-password/confirm', { identifier: rider.email, code: resetAsk.data?.devCode, newPassword: 'brandnew123' });
  check('password reset with the code', resetDo.status === 200, brief(resetDo));
  const oldPw = await api('POST', '/auth/login', { identifier: rider.email, password: 'secret123' });
  const newPw = await api('POST', '/auth/login', { identifier: rider.email, password: 'brandnew123' });
  check('old password refused, new accepted', oldPw.status === 401 && newPw.status === 200, `old=${oldPw.status} new=${newPw.status}`);

  // ---------- rider: phone before verification ----------
  const phoneUser = await api('POST', '/auth/signup', { fullName: 'Phone Change', phone: uniquePhone(), email: `pc${Date.now()}@example.com`, password: 'secret123' });
  const changed = await api('POST', '/auth/phone', { phone: uniquePhone() }, phoneUser.data.token);
  check('unverified rider can set a different phone', changed.status === 200, brief(changed));

  // ---------- driver: ride-bound features ----------
  const driver = await createVerifiedDriver({ at: { latitude: PICKUP.latitude, longitude: PICKUP.longitude }, online: true });
  const rider2 = await newRider('ride');
  const assigned = await bookAndAssign(rider2, 'cash', driver);
  const rideId = assigned.id;
  check('driver matched to the ride', assigned.driver?.phone === driver.phone, JSON.stringify(assigned.driver));
  await api('POST', `/drivers/rides/${rideId}/accept`, null, driver.token);

  const dTicket = await api('POST', '/driver/support', { category: 'general', subject: 'Driver help', message: 'Question', rideId }, driver.token);
  const dTicketId = dTicket.data?.ticket?.id || dTicket.data?.request?.id || dTicket.data?.id;
  check('driver support ticket opened for the ride', dTicket.status === 201 && Boolean(dTicketId), brief(dTicket));
  check('driver tickets listed', JSON.stringify((await api('GET', '/driver/support', null, driver.token)).data).includes(dTicketId));
  check('driver ticket opens', (await api('GET', `/driver/support/${dTicketId}`, null, driver.token)).status === 200);
  const dReply = await api('POST', `/driver/support/${dTicketId}/messages`, { message: 'Follow up' }, driver.token);
  check('driver reply accepted', dReply.status < 300, brief(dReply));

  const share = await api('POST', '/driver/share', { rideId }, driver.token);
  check('driver shares the active trip', share.status < 300, brief(share));
  const incident = await api('POST', '/driver/incidents', { rideId, category: 'rude_passenger', details: 'Shouting' }, driver.token);
  check('driver files an incident report', incident.status < 300, brief(incident));
  const sos = await api('POST', '/driver/emergency', { rideId, latitude: -1.94, longitude: 30.06, address: 'KN 5 Rd', details: 'Help' }, driver.token);
  check('driver SOS recorded', sos.status < 300, brief(sos));
  const riderSos = await api('POST', '/emergency', { rideId, latitude: -1.94, longitude: 30.06 }, rider2.token);
  check('rider SOS recorded', riderSos.status < 300, brief(riderSos));
  const riderSosList = await api('GET', '/emergency', null, rider2.token);
  check('rider sees their SOS history', JSON.stringify(riderSosList.data).includes('dispatched') || JSON.stringify(riderSosList.data).includes('pending'), brief(riderSosList));

  const queue = await admin('GET', '/emergencies');
  const open = queue.data?.emergencies || [];
  check('operator sees both open emergencies', queue.status === 200 && open.some((e) => e.driver_id) && open.some((e) => e.passenger_id && !e.driver_id), brief(queue));
  let resolvedAll = true;
  for (const e of open) {
    const r = await admin('POST', `/emergencies/${e.id}/resolve`);
    if (r.status !== 200) resolvedAll = false;
  }
  check('operator resolves them', resolvedAll);
  check('resolved emergencies leave the queue', ((await admin('GET', '/emergencies')).data?.emergencies || []).length === 0);

  await db.query('INSERT INTO driver_notifications (driver_id, title, body, type) VALUES ($1, $2, $3, $4)', [driver.id, 'Hi', 'Driver note', 'general']);
  const dNotes = await api('GET', '/driver/notifications', null, driver.token);
  const dNoteId = dNotes.data?.notifications?.[0]?.id;
  const dRead = await api('POST', `/driver/notifications/${dNoteId}/read`, null, driver.token);
  check('driver notification marked read', dRead.status === 200, brief(dRead));
  check('driver read-all works', (await api('POST', '/driver/notifications/read-all', null, driver.token)).status < 300);

  // finish the trip in cash and rate it
  await api('POST', `/drivers/rides/${rideId}/arrived`, null, driver.token);
  const pin = (await api('GET', `/rides/${rideId}`, null, rider2.token)).data.ride.pin;
  await api('POST', `/drivers/rides/${rideId}/verify-pin`, { pin }, driver.token);
  const done = await api('POST', `/drivers/rides/${rideId}/complete-trip`, null, driver.token);
  check('trip completed', done.status === 200, brief(done));
  const cash = await api('POST', `/drivers/rides/${rideId}/confirm-cash`, null, driver.token);
  check('cash confirmed', cash.status === 200, brief(cash));
  const rated = await api('POST', `/rides/${rideId}/rate`, { rating: 4, comment: 'Good' }, rider2.token);
  check('rider rates the trip', rated.status < 300, brief(rated));
  const ratings = await api('GET', '/driver/ratings', null, driver.token);
  check('driver ratings show the new rating', ratings.status === 200 && JSON.stringify(ratings.data).includes('Good'), brief(ratings));
  check('driver ride history lists the trip', JSON.stringify((await api('GET', '/driver/rides', null, driver.token)).data).includes(rideId));
  check('driver can open the trip', (await api('GET', `/driver/rides/${rideId}`, null, driver.token)).status === 200);
  check('earnings history works', (await api('GET', '/driver/earnings/history', null, driver.token)).status === 200);

  // ---------- operator: cash payment exceptions ----------
  for (const resolution of ['cash_received', 'cash_not_received']) {
    const rr = await newRider(`exc${resolution === 'cash_received' ? 'a' : 'b'}`);
    const ride = await bookAndAssign(rr, 'cash', driver);
    await driveToEndOfTrip(ride.id, rr, driver);
    const pay = await api('POST', '/payments', { rideId: ride.id }, rr.token);
    const payId = pay.data?.payment?.id;
    check(`cash payment exists (${resolution})`, Boolean(payId), brief(pay));
    await db.query('UPDATE rides SET cash_disputed_at = now() WHERE id = $1', [ride.id]);
    await db.query("INSERT INTO payment_exceptions (payment_id, ride_id, reason) VALUES ($1, $2, 'cash_unconfirmed')", [payId, ride.id]);
    // The scheduler frees the driver when it opens this case; the test opened it by hand.
    await db.query("UPDATE drivers SET status = 'active' WHERE id = $1", [driver.id]);
    const list = await admin('GET', '/payment-exceptions');
    const ex = (list.data?.exceptions || []).find((e) => e.payment_id === payId || e.paymentId === payId);
    check(`operator sees the exception (${resolution})`, list.status === 200 && Boolean(ex), brief(list));
    const resolved = await admin('POST', `/payment-exceptions/${ex?.id}/resolve`, { resolution, reference: `ref-${resolution}` });
    check(`operator resolves it as ${resolution}`, resolved.status === 200, brief(resolved));
    const [final] = await q('SELECT status FROM rides WHERE id = $1', [ride.id]);
    check(`ride ends ${resolution === 'cash_received' ? 'completed' : 'cancelled'}`, final?.status === (resolution === 'cash_received' ? 'completed' : 'cancelled'), JSON.stringify(final));
    const twice = await admin('POST', `/payment-exceptions/${ex?.id}/resolve`, { resolution, reference: 'again' });
    check('an exception cannot be resolved twice', twice.status === 404, `status=${twice.status}`);
  }

  // ---------- operator: vehicle edit ----------
  const edit = await admin('PUT', `/drivers/${driver.id}/vehicle`, { vehicleMake: 'Honda', vehicleModel: 'Fit', vehicleYear: 2020, vehicleColor: 'Blue', vehiclePlate: 'RAZ 111 Z', licenseNumber: 'LIC-1' });
  check('operator edits the vehicle', edit.status === 200, brief(edit));
  const [edited] = await q('SELECT vehicle_make, verified, status FROM drivers WHERE id = $1', [driver.id]);
  check('the edit takes the driver offline for review', edited?.vehicle_make === 'Honda' && edited?.verified === false && edited?.status === 'offline', JSON.stringify(edited));

  // ---------- closing accounts ----------
  const busy = await newRider('busy');
  await api('POST', '/rides', { pickup: PICKUP, destination: DEST, vehicleId: 'fem_economy', paymentMethodId: 'cash' }, busy.token);
  check('a rider with an open ride cannot close the account', (await api('DELETE', '/auth/account', null, busy.token)).status === 409);
  await api('POST', '/rides/' + (await q('SELECT id FROM rides WHERE passenger_id = $1', [busy.id]))[0].id + '/cancel', { reason: 'test' }, busy.token);

  const closing = await api('DELETE', '/auth/account', null, rider.token);
  check('rider closes the account', closing.status === 204, brief(closing));
  check('closed rider cannot sign in', (await api('POST', '/auth/login', { identifier: rider.email, password: 'brandnew123' })).status >= 400);
  check('closed rider session is refused', (await api('GET', '/rides', null, rider.token)).status === 401);
  const [tomb] = await q('SELECT full_name, deleted_at FROM passengers WHERE id = $1', [rider.id]);
  check('the rider row is kept, stripped of personal details', tomb?.full_name === 'Deleted rider' && tomb?.deleted_at != null, JSON.stringify(tomb));

  const leaving = await createVerifiedDriver({ at: { latitude: PICKUP.latitude, longitude: PICKUP.longitude }, online: false });
  const gone = await api('DELETE', '/driver/account', null, leaving.token);
  check('driver closes the account', gone.status === 204, brief(gone));
  check('closed driver cannot sign in', (await api('POST', '/drivers/login', { phone: leaving.phone, password: FIXTURE_PASSWORD })).status >= 400);
  const [docs] = await q('SELECT COUNT(*) AS n FROM driver_documents WHERE driver_id = $1', [leaving.id]);
  check('the closed driver\'s documents are deleted', Number(docs.n) === 0, JSON.stringify(docs));

  await db.end();
  console.log(`\nACCOUNT-FLOWS: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => { console.error('account-flows crashed:', err); process.exit(1); });
