/**
 * Test fixtures created through the real API, for the local test scripts.
 *
 * There is no seed script and no built-in demo account any more: every
 * driver a test needs is registered through POST /drivers/register, has its
 * four KYC documents uploaded and reviewed through the operator API, is
 * verified by the operator API, and goes online by reporting a real location.
 * That is the same path a real driver takes, so the tests exercise it too.
 *
 * Needs the API on http://localhost:3000 with ADMIN_API_KEY set to the same
 * value as this process (server/.env), and a local database (the operator
 * review here uses a one-pixel PNG, which is a test fixture, not a document —
 * refused against anything but localhost).
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const BASE = process.env.TEST_API_URL || `http://localhost:${process.env.PORT || 3000}/api`;
const ADMIN_KEY = process.env.ADMIN_API_KEY || '';
/** Password every fixture driver is registered with. */
const FIXTURE_PASSWORD = 'Fixture-Driver-123';

const TEST_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jXioAAAAASUVORK5CYII=',
  'base64'
);

let seq = 0;
/** A unique MTN/Airtel-prefixed Rwandan number, so payouts and charges validate. */
function uniquePhone() {
  seq += 1;
  const stamp = String(Date.now()).slice(-6);
  return `+2507${'8293'[seq % 4]}${stamp}${String(seq % 100).padStart(2, '0')}`;
}

async function request(method, p, body, token, headers = {}) {
  const multipart = typeof FormData !== 'undefined' && body instanceof FormData;
  const h = { ...(multipart ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers };
  const res = await fetch(`${BASE}${p}`, { method, headers: h, body: body ? (multipart ? body : JSON.stringify(body)) : undefined });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, data };
}

function requireAdminKey() {
  if (!ADMIN_KEY) {
    throw new Error('ADMIN_API_KEY must be set (same value as the running server) to create verified test drivers.');
  }
  const host = new URL(BASE).hostname;
  if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
    throw new Error('Test drivers with placeholder documents may only be created against a local API.');
  }
}

/**
 * Registers and verifies a driver the way a real one is onboarded, then
 * parks them online at `at`. Returns { id, token, phone, password }.
 */
async function createVerifiedDriver({ at, online = true, vehicleId = 'fem_economy', fullName } = {}) {
  requireAdminKey();
  const phone = uniquePhone();
  const name = fullName || `Test Driver ${seq}`;
  const reg = await request('POST', '/drivers/register', { fullName: name, phone, password: FIXTURE_PASSWORD, licenseNumber: `TEST-${seq}-${Date.now() % 10000}` });
  if (reg.status !== 201) throw new Error(`driver register ${reg.status}: ${JSON.stringify(reg.data)}`);
  const d = { id: reg.data.driver.id, token: reg.data.token, phone, password: FIXTURE_PASSWORD, name };

  const profile = await request('PUT', '/driver/me', { fullName: name, email: `drv${phone.slice(-9)}@example.com` }, d.token);
  if (profile.status !== 200) throw new Error(`driver profile ${profile.status}: ${JSON.stringify(profile.data)}`);
  const vehicle = await request('PUT', '/driver/vehicle', {
    vehicleMake: 'Toyota', vehicleModel: 'Corolla', vehicleYear: 2019, vehicleColor: 'White',
    vehiclePlate: `RA${String(seq).padStart(3, '0')} T`,
  }, d.token);
  if (vehicle.status !== 200) throw new Error(`driver vehicle ${vehicle.status}: ${JSON.stringify(vehicle.data)}`);

  for (const docType of ['license', 'national_id', 'vehicle_registration', 'insurance']) {
    const form = new FormData();
    form.append('docType', docType);
    form.append('fileName', `${docType}.png`);
    form.append('file', new Blob([TEST_PNG], { type: 'image/png' }), `${docType}.png`);
    const doc = await request('POST', '/driver/documents', form, d.token);
    if (doc.status !== 201) throw new Error(`document ${docType} ${doc.status}: ${JSON.stringify(doc.data)}`);
    const review = await request('POST', `/admin/documents/${doc.data.document.id}/review`, {
      status: 'approved', reviewer: 'test-fixture', method: 'in_person', evidenceReference: `test-${docType}`,
    }, null, { 'X-Admin-Key': ADMIN_KEY });
    if (review.status !== 200) throw new Error(`document review ${review.status}: ${JSON.stringify(review.data)}`);
  }
  const verified = await request('POST', `/admin/drivers/${d.id}/verify`, null, null, { 'X-Admin-Key': ADMIN_KEY });
  if (verified.status !== 200) throw new Error(`driver verify ${verified.status}: ${JSON.stringify(verified.data)}`);

  if (at) {
    const loc = await request('POST', '/drivers/location', { latitude: at.latitude, longitude: at.longitude, heading: 0, accuracy: 8 }, d.token);
    if (loc.status >= 300) throw new Error(`driver location ${loc.status}: ${JSON.stringify(loc.data)}`);
  }
  if (online) {
    const on = await request('PUT', '/driver/status', { status: 'active' }, d.token);
    if (on.status !== 200) throw new Error(`driver online ${on.status}: ${JSON.stringify(on.data)}`);
  }
  return d;
}

/** Spreads `count` online drivers within ~300 m of `around`. */
async function createDriversAround(around, count = 3, opts = {}) {
  const drivers = [];
  for (let i = 0; i < count; i += 1) {
    const jitter = (i - (count - 1) / 2) * 0.0025;
    drivers.push(await createVerifiedDriver({ ...opts, at: { latitude: around.latitude + jitter, longitude: around.longitude + jitter / 2 } }));
  }
  return drivers;
}

/**
 * A promotion for tests that exercise discounts. Written straight to the
 * local database (there is no public API to create promotions). The row is
 * named so the server's startup sweep switches it off on any real database.
 */
async function ensureTestPromotion(code = 'WELCOME30') {
  const { config, ensureEmbeddedReady } = require('../src/config');
  if (!config.localDatabase) throw new Error('Test promotions may only be created on a local database.');
  const { ensureDatabase, applySchema, initPool, getPool } = require('../src/db');
  ensureEmbeddedReady();
  const url = await ensureDatabase();
  await applySchema(url);
  initPool(url);
  await getPool().query(
    `INSERT INTO promotions (code, title, description, discount_type, discount_value, min_fare, max_discount, active)
     VALUES ($1, 'Welcome 30% off', '30% off your first trip (test).', 'percent', 30, 0, 5000, TRUE)
     ON CONFLICT (code) DO UPDATE SET active = TRUE`,
    [code]
  );
  return code;
}

/**
 * Makes a pending mobile-money prompt old enough to have timed out, so the
 * next refresh closes it as expired exactly as the scheduler would after
 * PAYMENT_EXPIRY_SECONDS — without the test waiting that long for real.
 */
async function expirePaymentPrompt(paymentId) {
  const { config, ensureEmbeddedReady } = require('../src/config');
  if (!config.localDatabase) throw new Error('Payment prompts may only be aged on a local database.');
  const { ensureDatabase, applySchema, initPool, getPool } = require('../src/db');
  ensureEmbeddedReady();
  const url = await ensureDatabase();
  await applySchema(url);
  initPool(url);
  await getPool().query(
    `UPDATE payments SET created_at = now() - ($2 || ' seconds')::interval WHERE id = $1 AND status = 'pending'`,
    [paymentId, String(config.paymentExpirySeconds + 60)]
  );
}

module.exports = { BASE, ADMIN_KEY, FIXTURE_PASSWORD, request, uniquePhone, createVerifiedDriver, createDriversAround, ensureTestPromotion, expirePaymentPrompt, TEST_PNG };
