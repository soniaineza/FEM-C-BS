/**
 * Runtime E2E for the production-readiness work against the real API + DB:
 *   - Paypack webhook: HEAD ping, signature check, wallet top-up credit
 *     (exactly once), failed top-up, ride payment settlement
 *   - Driver KYC: unverified drivers cannot go online; admin verify/suspend
 *   - Admin routes reject a wrong key
 *   - SOS config never returns the old fake fallback number
 *
 * Usage: node test/production-readiness.js   (local server on :3000, started
 * with the same PAYPACK_WEBHOOK_SECRET, ADMIN_USERNAME, ADMIN_PASSWORD and
 * ADMIN_API_KEY (optional integration key) as this process)
 */
const { FIXTURE_PASSWORD, createDriversAround } = require('./fixtures');
const crypto = require('crypto');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const BASE = 'http://localhost:3000/api';
const WEBHOOK_SECRET = process.env.PAYPACK_WEBHOOK_SECRET;
const ADMIN_KEY = process.env.ADMIN_API_KEY;
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
  let data = null;
  const text = await res.text();
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, data };
}

const TEST_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jXioAAAAASUVORK5CYII=',
  'base64'
);

async function uploadDriverDocument(docType, fileName, token) {
  const form = new FormData();
  form.append('docType', docType);
  form.append('fileName', fileName);
  form.append('file', new Blob([TEST_PNG], { type: 'image/png' }), fileName);
  const base = typeof BASE === 'string' ? BASE : API;
  const res = await fetch(`${base}/driver/documents`, {
    method: 'POST',
    headers: { Authorization: ['Bearer', token].join(' ') },
    body: form,
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, data };
}

function check(name, cond, detail = '') {
  if (cond) { passed++; console.log(`  ok   ${name}`); }
  else { failed++; console.log(`  FAIL ${name} ${detail}`); }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function sendWebhook(payload, secret = WEBHOOK_SECRET) {
  const raw = JSON.stringify(payload);
  const sig = crypto.createHmac('sha256', secret).update(raw).digest('base64');
  const res = await fetch(`${BASE}/webhooks/paypack`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-paypack-signature': sig },
    body: raw,
  });
  return res.status;
}

function processedEvent(ref, status, amount) {
  return {
    event_id: crypto.randomUUID(),
    kind: 'transaction:processed',
    created_at: new Date().toISOString(),
    data: { ref, kind: 'CASHIN', status, amount, client: '0780000000', provider: 'mtn' },
  };
}

async function db() {
  const { ensureEmbeddedReady } = require('../src/config');
  const { ensureDatabase, applySchema, initPool, getPool } = require('../src/db');
  ensureEmbeddedReady();
  const url = await ensureDatabase();
  await applySchema(url);
  initPool(url);
  return getPool();
}

(async () => {
  if (!WEBHOOK_SECRET || !ADMIN_KEY) {
    console.error('Set PAYPACK_WEBHOOK_SECRET and operator credentials (same values as the server).');
    process.exit(1);
  }
  const pool = await db();

  // Real drivers for this run, registered and verified through the API and
  // parked online around KN 5 Rd where the ride below starts.
  await createDriversAround({ latitude: -1.9441, longitude: 30.0619 }, 2);

  const ts = Date.now().toString().slice(-8);
  const signup = await api('POST', '/auth/signup', {
    fullName: 'Readiness Rider',
    phone: `+2507${ts}`,
    email: `ready${ts}@example.com`,
    password: 'secret123',
  });
  check('signup', signup.status === 201, `status=${signup.status}`);
  const token = signup.data.token;
  const passengerId = signup.data.passenger.id;
  // Wallet, SOS and booking routes need a verified phone (local reveal code).
  const verified = await api('POST', '/auth/verify-otp', { passengerId, code: signup.data.devCode }, token);
  check('phone verified with the local reveal code', verified.status === 200, `status=${verified.status}`);

  // ---- SOS config ----
  const sos = await api('GET', '/emergency/config', null, token);
  check('SOS config never returns the fake placeholder number',
    sos.status === 200 && sos.data.callCenterPhone !== '+250000000000',
    JSON.stringify(sos.data));

  // ---- Webhook: HEAD ping + signature ----
  const head = await fetch(`${BASE}/webhooks/paypack`, { method: 'HEAD' });
  check('webhook answers Paypack HEAD ping', head.status === 200, `status=${head.status}`);
  check('webhook rejects a bad signature',
    (await sendWebhook(processedEvent('nope', 'successful', 1), 'wrong-secret')) === 401);
  check('webhook rejects a missing data.ref',
    (await sendWebhook({ kind: 'transaction:processed', data: {} })) === 400);

  // ---- Webhook: wallet top-up credited exactly once ----
  const before = (await api('GET', '/wallet', null, token)).data.wallet.balance;
  const ref = crypto.randomUUID();
  await pool.query(
    `INSERT INTO wallet_topups (passenger_id, amount, phone, status, state, reference, provider, external_reference)
     VALUES ($1, 2500, '0780000000', 'pending', 'processing', $2, 'paypack', $3)`,
    [passengerId, `TOPUP-T${ts}`, ref]
  );
  check('webhook: successful top-up accepted', (await sendWebhook(processedEvent(ref, 'successful', 2500))) === 200);
  await sendWebhook(processedEvent(ref, 'successful', 2500)); // duplicate delivery
  await sleep(500);
  const after = (await api('GET', '/wallet', null, token)).data.wallet.balance;
  check('webhook: wallet credited exactly once despite duplicate delivery',
    after - before === 2500, `before=${before} after=${after}`);

  const failRef = crypto.randomUUID();
  await pool.query(
    `INSERT INTO wallet_topups (passenger_id, amount, phone, status, state, reference, provider, external_reference)
     VALUES ($1, 1000, '0780000000', 'pending', 'processing', $2, 'paypack', $3)`,
    [passengerId, `TOPUP-F${ts}`, failRef]
  );
  await sendWebhook(processedEvent(failRef, 'failed', 1000));
  await sleep(500);
  const failedTopup = await pool.query('SELECT status FROM wallet_topups WHERE external_reference = $1', [failRef]);
  const afterFail = (await api('GET', '/wallet', null, token)).data.wallet.balance;
  check('webhook: failed top-up marked failed, no credit',
    failedTopup.rows[0].status === 'failed' && afterFail === after,
    `status=${failedTopup.rows[0].status} balance=${afterFail}`);

  // ---- Webhook: ride payment settles the ride ----
  const created = await api('POST', '/rides', {
    pickup: { address: 'KN 5 Rd, Kigali', latitude: -1.9441, longitude: 30.0619 },
    destination: { address: 'Kimironko', latitude: -1.9562, longitude: 30.1575 },
    vehicleId: 'fem_economy',
    paymentMethodId: 'cash',
  }, token);
  check('ride created', created.status === 201, `status=${created.status}`);
  const rideId = created.data.ride.id;
  let assigned = null;
  for (let i = 0; i < 12 && !assigned; i++) {
    const r = await api('GET', `/rides/${rideId}`, null, token);
    if (r.data.ride.status !== 'searchingDriver') assigned = r.data.ride;
    else await sleep(1200);
  }
  check('ride matched', Boolean(assigned));
  const dt = (await api('POST', '/drivers/login', { phone: assigned.driver.phone, password: FIXTURE_PASSWORD })).data.token;
  await api('POST', `/drivers/rides/${rideId}/accept`, null, dt);
  await api('POST', `/drivers/rides/${rideId}/arrived`, null, dt);
  const pin = (await api('GET', `/rides/${rideId}`, null, token)).data.ride.pin;
  await api('POST', `/drivers/rides/${rideId}/verify-pin`, { pin }, dt);
  await api('POST', `/drivers/rides/${rideId}/complete-trip`, null, dt);
  const pending = (await api('GET', `/rides/${rideId}`, null, token)).data.ride;
  check('cash ride waiting for payment', pending.status === 'paymentPending', pending.status);

  // Simulate a Paypack charge in flight for this ride.
  const rideRef = crypto.randomUUID();
  await pool.query(
    `UPDATE payments SET provider='paypack', method='mtn_momo', state='processing', external_reference=$2
      WHERE ride_id = $1`,
    [rideId, rideRef]
  );
  await pool.query(`UPDATE rides SET payment_method='mtn_momo' WHERE id = $1`, [rideId]);
  await sendWebhook(processedEvent(rideRef, 'successful', pending.estimatedFare || 1));
  await sleep(800);
  const settled = (await api('GET', `/rides/${rideId}`, null, token)).data.ride;
  check('webhook: successful ride payment completes the ride', settled.status === 'completed', settled.status);

  // ---- Driver KYC ----
  const dphone = `+2507${(Number(ts) + 1).toString().padStart(8, '0')}`;
  const reg = await api('POST', '/drivers/register', {
    fullName: 'New Driver', phone: dphone, password: 'secret123', licenseNumber: 'RW-TEST',
  });
  check('driver registers', reg.status === 201, `status=${reg.status}`);
  const newDt = reg.data.token;
  const newDriverId = reg.data.driver.id;
  check('driver registration never bypasses admin approval', reg.data.driver.verified === false);
  // Signing in before approval is allowed (the driver needs a session to
  // upload documents after a reinstall); what the session can do is not.
  const pendingLogin = await api('POST', '/drivers/login', { phone: dphone, password: 'secret123' });
  check('unapproved driver can sign in to finish the application',
    pendingLogin.status === 200 && pendingLogin.data.pendingApproval === true && pendingLogin.data.driver.verified === false,
    `status=${pendingLogin.status}`);
  const blockedRides = await api('GET', '/drivers/rides/active', null, newDt);
  check('unapproved driver token cannot access ride operations', blockedRides.status === 403, `status=${blockedRides.status}`);
  const blockedRidesFresh = await api('GET', '/drivers/rides/active', null, pendingLogin.data.token);
  check('a session issued before approval cannot access ride operations either', blockedRidesFresh.status === 403, `status=${blockedRidesFresh.status}`);
  const onboardingDocs = await api('GET', '/driver/documents', null, newDt);
  check('unapproved driver can access document onboarding', onboardingDocs.status === 200, `status=${onboardingDocs.status}`);
  const online = await api('PUT', '/driver/status', { status: 'active' }, newDt);
  check('unverified driver cannot go online (403)', online.status === 403, `status=${online.status}`);
  const referenceOnly = await api('POST', '/driver/documents', {
    docType: 'license', fileName: 'reference-only',
  }, newDt);
  check('document references without file bytes are rejected', referenceOnly.status === 400, `status=${referenceOnly.status}`);

  check('admin: wrong key rejected',
    (await api('GET', '/admin/drivers', null, null, { 'X-Admin-Key': 'wrong' })).status === 401);
  const pendingList = await api('GET', '/admin/drivers?verified=false', null, null, { 'X-Admin-Key': ADMIN_KEY });
  check('admin: new driver listed as awaiting verification',
    pendingList.status === 200 && pendingList.data.drivers.some((d) => d.id === newDriverId),
    `status=${pendingList.status}`);

  const docs = [];
  const requiredDocTypes = ['license', 'national_id', 'vehicle_registration', 'insurance'];
  for (const docType of requiredDocTypes) {
    const doc = await uploadDriverDocument(docType, `original-${docType}.png`, newDt);
    if (doc.data?.document?.id) docs.push(doc.data.document.id);
  }
  check('driver submits all four required documents', docs.length === 4, `n=${docs.length}`);
  const adminListWithDocs = await api(
    'GET',
    '/admin/drivers?verified=false',
    null,
    null,
    { 'X-Admin-Key': ADMIN_KEY }
  );
  const adminDriver = adminListWithDocs.data?.drivers?.find((d) => d.id === newDriverId);
  const adminDocTypes = new Set((adminDriver?.documents || []).map((doc) => doc.docType));
  check(
    'admin pending-driver list includes uploaded documents and file flags',
    adminListWithDocs.status === 200 &&
      requiredDocTypes.every((docType) => adminDocTypes.has(docType)) &&
      adminDriver?.documents?.filter((doc) => requiredDocTypes.includes(doc.docType))
        .every((doc) => doc.hasFile && doc.fileUrl),
    `status=${adminListWithDocs.status}; documents=${adminDriver?.documents?.length ?? 'missing'}`
  );
  const fileResponse = await fetch(`${BASE}/driver/documents/${docs[0]}/file`, {
    headers: { Authorization: `Bearer ${newDt}` },
  });
  const fileBytes = Buffer.from(await fileResponse.arrayBuffer());
  check('driver can retrieve the uploaded private file',
    fileResponse.status === 200 && fileResponse.headers.get('content-type') === 'image/png' &&
      fileBytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    `status=${fileResponse.status}`);
  const privateFile = await fetch(`${BASE}/driver/documents/${docs[0]}/file`);
  check('driver files cannot be retrieved without authentication', privateFile.status === 401, `status=${privateFile.status}`);
  const incomplete = await api('POST', `/admin/drivers/${newDriverId}/verify`, null, null, { 'X-Admin-Key': ADMIN_KEY });
  check('admin cannot approve until every required document is reviewed', incomplete.status === 409, `status=${incomplete.status}`);
  const rej = await api('POST', `/admin/documents/${docs[0]}/review`, { status: 'rejected' }, null, { 'X-Admin-Key': ADMIN_KEY });
  check('rejecting a document requires a reason', rej.status === 400, `status=${rej.status}`);
  for (const docId of docs) {
    const ok = await api('POST', `/admin/documents/${docId}/review`, {
      status: 'approved', reviewer: 'readiness-test', method: 'in_person', evidenceReference: 'readiness test originals',
    }, null, { 'X-Admin-Key': ADMIN_KEY });
    if (ok.status !== 200) console.error(`Document approval failed: ${ok.status}`);
  }

  const ver = await api('POST', `/admin/drivers/${newDriverId}/verify`, null, null, { 'X-Admin-Key': ADMIN_KEY });
  check('admin: verify driver', ver.status === 200 && ver.data.driver.verified === true, `status=${ver.status}`);
  const approvedLogin = await api('POST', '/drivers/login', { phone: dphone, password: 'secret123' });
  check('approved driver can log in', approvedLogin.status === 200 && approvedLogin.data.token, `status=${approvedLogin.status}`);
  const online2 = await api('PUT', '/driver/status', { status: 'active' }, newDt);
  check('verified driver can go online', online2.status === 200, `status=${online2.status}`);
  const notes = await api('GET', '/driver/notifications', null, newDt);
  check('driver notified of verification',
    JSON.stringify(notes.data || '').includes('You are verified'), `status=${notes.status}`);

  const noReason = await api('POST', `/admin/drivers/${newDriverId}/suspend`, {}, null, { 'X-Admin-Key': ADMIN_KEY });
  check('admin: suspend requires a reason', noReason.status === 400, `status=${noReason.status}`);
  const sus = await api('POST', `/admin/drivers/${newDriverId}/suspend`, { reason: 'test' }, null, { 'X-Admin-Key': ADMIN_KEY });
  check('admin: suspend driver', sus.status === 200 && sus.data.driver.status === 'suspended' && !sus.data.driver.verified,
    `status=${sus.status}`);
  const online3 = await api('PUT', '/driver/status', { status: 'active' }, newDt);
  check('suspended driver cannot go online', online3.status >= 400, `status=${online3.status}`);

  console.log(`\nREADINESS: ${passed} passed, ${failed} failed`);
  await pool.end();
  process.exit(failed ? 1 : 0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
