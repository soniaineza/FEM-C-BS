// End-to-end check of the driver application against a real local
// MySQL/MariaDB, through the real Express app on an ephemeral port: an
// operator creates the account, the driver signs in before approval, upload the four documents as real multipart
// bodies, see them on the operator list, open each file, reject one and
// re-upload it, approve all four, verify the driver, go online.
//
//   node --test test/driver-documents.test.js
//
// Needs a local MySQL/MariaDB. The MYSQL_* settings (server/.env or the
// environment) are used with the database name replaced by <name>_test; that
// database is created on first run and emptied at the start of every run, so
// the development data is never touched. Without a reachable database every
// test is skipped and says why.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mysql = require('mysql2/promise');

const baseName = process.env.MYSQL_DATABASE || 'kimu';
const TEST_DB_NAME = baseName.endsWith('_test') ? baseName : `${baseName}_test`;

// Everything the app reads from the environment is pinned before any module
// loads: the test database, a known secret, and operator credentials.
process.env.MYSQL_DATABASE = TEST_DB_NAME;
process.env.LOCAL_DEVELOPMENT = '1';
process.env.NODE_ENV = 'development';
process.env.JWT_SECRET = 'driver-documents-test-secret';
process.env.ADMIN_USERNAME = 'operator-test';
process.env.ADMIN_PASSWORD = 'operator-test-password-123';
process.env.ADMIN_API_KEY = '';
process.env.RATE_LIMIT_MAX = '200';

const { config } = require('../src/config');
const { ensureDatabase, connectionOptions, applySchema, initPool, getPool } = require('../src/db');
const { createApp } = require('../src/app');
const { DOCUMENT_MAX_MB, DOCUMENT_MAX_BYTES, REQUIRED_DOCUMENT_TYPES } = require('../src/services/driverDocuments');

// ---- sample files (real headers, so the server's sniffing accepts them) ----
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jXioAAAAASUVORK5CYII=', 'base64');
function jpeg(size = 96) {
  const head = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]), Buffer.from('JFIF\0')]);
  return Buffer.concat([head, Buffer.alloc(Math.max(0, size - head.length - 2), 0x11), Buffer.from([0xff, 0xd9])]);
}
const JPEG = jpeg();
const PDF = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n%%EOF\n');
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0x20, 0, 0, 0]), Buffer.from('WEBPVP8 '), Buffer.alloc(24, 0)]);
const SAMPLES = {
  license: { bytes: JPEG, type: 'image/jpeg', name: 'licence-front.jpg' },
  national_id: { bytes: PNG, type: 'image/png', name: 'national-id.png' },
  vehicle_registration: { bytes: PDF, type: 'application/pdf', name: 'carte-jaune.pdf' },
  insurance: { bytes: WEBP, type: 'image/webp', name: 'insurance.webp' },
};

let skipReason = null;
let server;
let BASE; // .../api — the fileUrl fields the API returns already start with /api
let ORIGIN;
let seq = 0;
function phone() {
  seq += 1;
  return `+25078${String(Date.now() % 1000000).padStart(6, '0')}${String(seq).padStart(1, '0')}`;
}

async function api(method, p, body, token, headers = {}) {
  const multipart = typeof FormData !== 'undefined' && body instanceof FormData;
  const res = await fetch(`${BASE}${p}`, {
    method,
    headers: {
      ...(body && !multipart ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body ? (multipart ? body : JSON.stringify(body)) : undefined,
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, data, headers: res.headers };
}

/** Uploads one document the way the apps do: multipart with docType, fileName and file. */
function upload(token, docType, { bytes, type, name }, extra = {}) {
  const form = new FormData();
  form.append('docType', docType);
  form.append('fileName', name);
  for (const [k, v] of Object.entries(extra)) form.append(k, v);
  form.append('file', new Blob([bytes], { type }), name);
  return api('POST', '/driver/documents', form, token);
}

async function ensureTestDatabase() {
  const { database, ...withoutDatabase } = connectionOptions();
  const connection = await mysql.createConnection(withoutDatabase);
  try {
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${TEST_DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  } finally {
    await connection.end();
  }
}

/** Signs in as the operator (once) and creates a driver account the way the dashboard does. */
async function createDriverAccount({ fullName, phone: number, password, licenseNumber }) {
  if (!operator.token) {
    const login = await api('POST', '/admin/login', { username: 'operator-test', password: 'operator-test-password-123' });
    assert.equal(login.status, 200, JSON.stringify(login.data));
    operator.token = login.data.token;
  }
  const created = await api('POST', '/admin/drivers/create', { fullName, phone: number, password, licenseNumber }, operator.token);
  assert.equal(created.status, 201, JSON.stringify(created.data));
  return created.data.driver;
}

before(async () => {
  try {
    if (!TEST_DB_NAME.endsWith('_test')) throw new Error(`refusing to run against "${TEST_DB_NAME}": the test database name must end in _test`);
    await ensureTestDatabase();
    const options = await ensureDatabase();
    await applySchema(options);
    initPool(options);
    // A dedicated database: start empty so the assertions below are exact.
    for (const table of ['payment_exceptions', 'rides', 'drivers', 'passengers']) {
      await getPool().query(`DELETE FROM ${table}`);
    }
    server = createApp().listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    ORIGIN = `http://127.0.0.1:${server.address().port}`;
    BASE = `${ORIGIN}/api`;
  } catch (err) {
    skipReason = `no usable local MySQL/MariaDB for ${TEST_DB_NAME}: ${err.message}`;
  }
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (!skipReason) await getPool().end();
});

// ---- shared state across the sequential tests below ----
const driver = { phone: null, password: 'Driver-pass-123', id: null, token: null };
const uploaded = {};
const operator = { token: null };

function latestByType(documents) {
  const latest = {};
  for (const doc of [...documents].sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt))) {
    if (!latest[doc.docType]) latest[doc.docType] = doc;
  }
  return latest;
}

test('self-registration is closed', async (t) => {
  if (skipReason) return t.skip(skipReason);
  const reg = await api('POST', '/drivers/register', { fullName: 'Nobody', phone: phone(), password: 'Driver-pass-123' });
  assert.equal(reg.status, 403);
});

test('an operator-created driver is unverified and their session can only reach the application routes', async (t) => {
  if (skipReason) return t.skip(skipReason);
  driver.phone = phone();
  const created = await createDriverAccount({ fullName: 'Elie Test', phone: driver.phone, password: driver.password, licenseNumber: 'RW-TEST-1' });
  assert.equal(created.verified, false);
  driver.id = created.id;
  const first = await api('POST', '/drivers/login', { phone: driver.phone, password: driver.password });
  assert.equal(first.status, 200, JSON.stringify(first.data));
  const me = await api('GET', '/driver/me', null, first.data.token);
  assert.equal(me.status, 200);
  const rides = await api('GET', '/drivers/rides/active', null, first.data.token);
  assert.equal(rides.status, 403);
  assert.equal(rides.data.code, 'PENDING_APPROVAL');
});

test('an unverified driver can sign in again and is told to finish the application', async (t) => {
  if (skipReason) return t.skip(skipReason);
  const login = await api('POST', '/drivers/login', { phone: driver.phone, password: driver.password });
  assert.equal(login.status, 200, JSON.stringify(login.data));
  assert.ok(login.data.token, 'a session token is issued');
  assert.equal(login.data.pendingApproval, true);
  assert.equal(login.data.driver.verified, false);
  driver.token = login.data.token;

  const wrong = await api('POST', '/drivers/login', { phone: driver.phone, password: 'not-it' });
  assert.equal(wrong.status, 401);

  // The application routes work with this session...
  assert.equal((await api('GET', '/driver/me', null, driver.token)).status, 200);
  assert.equal((await api('PUT', '/driver/me', { fullName: 'Elie Test', email: 'elie@example.com' }, driver.token)).status, 200);
  assert.equal((await api('PUT', '/driver/vehicle', { vehicleMake: 'Toyota', vehicleModel: 'Vitz', vehiclePlate: 'RAD 123 A' }, driver.token)).status, 200);
  const docs = await api('GET', '/driver/documents', null, driver.token);
  assert.equal(docs.status, 200);
  assert.deepEqual(docs.data.documents, []);
  assert.equal((await api('GET', '/driver/notifications', null, driver.token)).status, 200);
  assert.equal((await api('GET', '/driver/notifications/unread-count', null, driver.token)).status, 200);
  assert.equal((await api('POST', '/driver/device-token', { token: 'ExponentPushToken[test-1]', platform: 'android' }, driver.token)).status, 204);
  assert.equal((await api('POST', '/driver/notifications/device-token', { token: 'ExponentPushToken[test-2]', platform: 'android' }, driver.token)).status, 204);
  const { rows: tokens } = await getPool().query('SELECT token FROM driver_device_tokens WHERE driver_id = $1 ORDER BY token', [driver.id]);
  assert.deepEqual(tokens.map((r) => r.token), ['ExponentPushToken[test-1]', 'ExponentPushToken[test-2]']);

  // ...and the driver features do not.
  const online = await api('PUT', '/driver/status', { status: 'active' }, driver.token);
  assert.equal(online.status, 403);
  assert.equal(online.data.code, 'PENDING_APPROVAL');
  assert.equal((await api('GET', '/driver/earnings', null, driver.token)).status, 403);
  assert.equal((await api('GET', '/drivers/rides/active', null, driver.token)).status, 403);
  assert.equal((await api('POST', '/drivers/location', { latitude: -1.95, longitude: 30.06 }, driver.token)).status, 403);
});

test('a suspended driver cannot sign in', async (t) => {
  if (skipReason) return t.skip(skipReason);
  const p = phone();
  const created = await createDriverAccount({ fullName: 'Suspended Driver', phone: p, password: 'Driver-pass-123' });
  const before = await api('POST', '/drivers/login', { phone: p, password: 'Driver-pass-123' });
  assert.equal(before.status, 200);
  await getPool().query("UPDATE drivers SET status = 'suspended' WHERE id = $1", [created.id]);
  const login = await api('POST', '/drivers/login', { phone: p, password: 'Driver-pass-123' });
  assert.equal(login.status, 403);
  assert.match(login.data.error, /suspended/i);
  assert.equal((await api('GET', '/driver/documents', null, before.data.token)).status, 403, 'the old session is closed too');
});

test('each required document uploaded as a multipart body is stored with its bytes and real type', async (t) => {
  if (skipReason) return t.skip(skipReason);
  for (const docType of REQUIRED_DOCUMENT_TYPES) {
    const res = await upload(driver.token, docType, SAMPLES[docType]);
    assert.equal(res.status, 201, `${docType}: ${JSON.stringify(res.data)}`);
    const doc = res.data.document;
    assert.equal(doc.docType, docType);
    assert.equal(doc.status, 'pending');
    assert.equal(doc.hasFile, true);
    assert.equal(doc.fileName, SAMPLES[docType].name);
    assert.equal(doc.fileSize, SAMPLES[docType].bytes.length);
    assert.equal(doc.contentType, SAMPLES[docType].type);
    assert.equal(doc.fileUrl, `/api/driver/documents/${doc.id}/file`);
    uploaded[docType] = doc;

    const { rows } = await getPool().query('SELECT driver_id, doc_type, status, content_type, file_size, file_data FROM driver_documents WHERE id = $1', [doc.id]);
    assert.equal(rows[0].driver_id, driver.id);
    assert.equal(rows[0].doc_type, docType);
    assert.equal(rows[0].status, 'pending');
    assert.equal(rows[0].content_type, SAMPLES[docType].type);
    assert.equal(rows[0].file_size, SAMPLES[docType].bytes.length);
    assert.ok(Buffer.isBuffer(rows[0].file_data) && rows[0].file_data.equals(SAMPLES[docType].bytes), 'file_data holds the exact bytes');
  }
});

test('a photo the picker calls octet-stream is stored as what its bytes show', async (t) => {
  if (skipReason) return t.skip(skipReason);
  const res = await upload(driver.token, 'profile_photo', { bytes: JPEG, type: 'application/octet-stream', name: 'IMG_20261012_101500.jpg' });
  assert.equal(res.status, 201, JSON.stringify(res.data));
  assert.equal(res.data.document.contentType, 'image/jpeg');
});

test('a multipart body written by hand, as React Native sends it, is accepted', async (t) => {
  if (skipReason) return t.skip(skipReason);
  const boundary = '----RNFormDataBoundary7MA4YWxkTrZu0gW';
  const crlf = '\r\n';
  const body = Buffer.concat([
    Buffer.from(`--${boundary}${crlf}Content-Disposition: form-data; name="docType"${crlf}${crlf}vehicle_photo${crlf}`),
    Buffer.from(`--${boundary}${crlf}Content-Disposition: form-data; name="fileName"${crlf}${crlf}car.png${crlf}`),
    Buffer.from(`--${boundary}${crlf}Content-Disposition: form-data; name="file"; filename="car.png"${crlf}Content-Type: image/png${crlf}${crlf}`),
    PNG,
    Buffer.from(`${crlf}--${boundary}--${crlf}`),
  ]);
  const res = await fetch(`${BASE}/driver/documents`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${driver.token}`, 'Content-Type': `multipart/form-data; boundary=${boundary}`, 'Content-Length': String(body.length) },
    body,
  });
  const data = await res.json();
  assert.equal(res.status, 201, JSON.stringify(data));
  assert.equal(data.document.docType, 'vehicle_photo');
  assert.equal(data.document.fileSize, PNG.length);
});

test('a camera-sized photo fits, and every bad upload gets a clear error', async (t) => {
  if (skipReason) return t.skip(skipReason);
  const big = await upload(driver.token, 'other', { bytes: jpeg(9 * 1024 * 1024), type: 'image/jpeg', name: 'big-photo.jpg' });
  assert.equal(big.status, 201, `a 9 MB camera photo must be accepted: ${JSON.stringify(big.data)}`);
  assert.equal(big.data.document.fileSize, 9 * 1024 * 1024);

  const tooBig = await upload(driver.token, 'other', { bytes: jpeg(DOCUMENT_MAX_BYTES + 1024), type: 'image/jpeg', name: 'huge.jpg' });
  assert.equal(tooBig.status, 413);
  assert.equal(tooBig.data.code, 'FILE_TOO_LARGE');
  assert.match(tooBig.data.error, new RegExp(`${DOCUMENT_MAX_MB} MB`));

  const lies = await upload(driver.token, 'license', { bytes: Buffer.from('not a picture at all, just text that is long enough'), type: 'image/png', name: 'fake.png' });
  assert.equal(lies.status, 415);
  assert.equal(lies.data.code, 'UNSUPPORTED_FILE_TYPE');

  const text = await upload(driver.token, 'license', { bytes: Buffer.from('hello hello hello'), type: 'text/plain', name: 'notes.txt' });
  assert.equal(text.status, 415);

  const video = await upload(driver.token, 'license', { bytes: Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypisom'), Buffer.alloc(24)]), type: 'application/octet-stream', name: 'clip.mp4' });
  assert.equal(video.status, 415);

  const nameOnly = await api('POST', '/driver/documents', { docType: 'license', fileName: 'reference-only' }, driver.token);
  assert.equal(nameOnly.status, 400, 'a JSON body with no file is refused');
  assert.equal(nameOnly.data.code, 'FILE_MISSING');

  const noFile = new FormData();
  noFile.append('docType', 'license');
  const missing = await api('POST', '/driver/documents', noFile, driver.token);
  assert.equal(missing.status, 400);
  assert.equal(missing.data.code, 'FILE_MISSING');

  const unknownType = await upload(driver.token, 'passport', SAMPLES.license);
  assert.equal(unknownType.status, 400);
  assert.match(unknownType.data.error, /docType must be one of/);

  const notImage = await upload(driver.token, 'profile_photo', SAMPLES.vehicle_registration);
  assert.equal(notImage.status, 415);

  const noSession = await upload('', 'license', SAMPLES.license);
  assert.equal(noSession.status, 401);
});

test('the driver sees the four documents as pending and can open each file', async (t) => {
  if (skipReason) return t.skip(skipReason);
  const list = await api('GET', '/driver/documents', null, driver.token);
  assert.equal(list.status, 200);
  const latest = latestByType(list.data.documents);
  for (const docType of REQUIRED_DOCUMENT_TYPES) {
    assert.ok(latest[docType], `${docType} listed`);
    assert.equal(latest[docType].status, 'pending');
    assert.equal(latest[docType].hasFile, true);
    assert.equal(latest[docType].id, uploaded[docType].id);
    const file = await fetch(`${ORIGIN}${latest[docType].fileUrl}`, { headers: { Authorization: `Bearer ${driver.token}` } });
    assert.equal(file.status, 200);
    assert.equal(file.headers.get('content-type').split(';')[0], SAMPLES[docType].type);
    assert.ok(Buffer.from(await file.arrayBuffer()).equals(SAMPLES[docType].bytes));
  }
  const anonymous = await fetch(`${ORIGIN}${latest.license.fileUrl}`);
  assert.equal(anonymous.status, 401);
});

test('the operator list shows the driver with all four documents submitted, and serves each file', async (t) => {
  if (skipReason) return t.skip(skipReason);
  const login = await api('POST', '/admin/login', { username: 'operator-test', password: 'operator-test-password-123' });
  assert.equal(login.status, 200, JSON.stringify(login.data));
  operator.token = login.data.token;

  const list = await api('GET', '/admin/drivers?verified=false', null, operator.token);
  assert.equal(list.status, 200);
  const row = list.data.drivers.find((d) => d.id === driver.id);
  assert.ok(row, 'the unverified driver is on the list');
  assert.equal(row.fullName, 'Elie Test');
  assert.equal(row.verified, false);
  const latest = latestByType(row.documents);
  for (const docType of REQUIRED_DOCUMENT_TYPES) {
    assert.ok(latest[docType], `${docType} is not "not submitted"`);
    assert.equal(latest[docType].status, 'pending');
    assert.equal(latest[docType].hasFile, true);
    assert.equal(latest[docType].fileName, SAMPLES[docType].name);
    assert.equal(latest[docType].contentType, SAMPLES[docType].type);
    assert.equal(latest[docType].fileUrl, `/api/admin/documents/${latest[docType].id}/file`);
    const file = await fetch(`${ORIGIN}${latest[docType].fileUrl}`, { headers: { Authorization: `Bearer ${operator.token}` } });
    assert.equal(file.status, 200);
    assert.equal(file.headers.get('content-type').split(';')[0], SAMPLES[docType].type);
    assert.match(file.headers.get('content-disposition'), /^inline; filename="/);
    assert.ok(Buffer.from(await file.arrayBuffer()).equals(SAMPLES[docType].bytes));
  }
  assert.equal((await fetch(`${ORIGIN}${latest.license.fileUrl}`)).status, 401, 'operator files need the operator session');
  assert.equal((await fetch(`${ORIGIN}${latest.license.fileUrl}`, { headers: { Authorization: `Bearer ${driver.token}` } })).status, 403, 'a driver session is not an operator session');
});

test('rejecting a document notifies the driver, who can upload a new one', async (t) => {
  if (skipReason) return t.skip(skipReason);
  const noReason = await api('POST', `/admin/documents/${uploaded.license.id}/review`, { status: 'rejected' }, operator.token);
  assert.equal(noReason.status, 400);
  const rejected = await api('POST', `/admin/documents/${uploaded.license.id}/review`, { status: 'rejected', reason: 'Photo is blurred', reviewer: 'operator-test' }, operator.token);
  assert.equal(rejected.status, 200, JSON.stringify(rejected.data));
  assert.equal(rejected.data.document.status, 'rejected');
  assert.equal(rejected.data.document.rejectionReason, 'Photo is blurred');

  const notes = await api('GET', '/driver/notifications', null, driver.token);
  assert.equal(notes.status, 200);
  const note = notes.data.notifications.find((n) => /rejected/i.test(n.title));
  assert.ok(note, 'the driver has a rejection notification');
  assert.match(note.body, /Photo is blurred/);
  const unread = await api('GET', '/driver/notifications/unread-count', null, driver.token);
  assert.ok(unread.data.count >= 1);

  const mine = await api('GET', '/driver/documents', null, driver.token);
  const rejectedRow = mine.data.documents.find((d) => d.id === uploaded.license.id);
  assert.equal(rejectedRow.status, 'rejected');
  assert.equal(rejectedRow.rejectionReason, 'Photo is blurred');

  const again = await upload(driver.token, 'license', { bytes: jpeg(2048), type: 'image/jpeg', name: 'licence-front-2.jpg' });
  assert.equal(again.status, 201, JSON.stringify(again.data));
  uploaded.license = again.data.document;

  const list = await api('GET', '/admin/drivers?verified=false', null, operator.token);
  const row = list.data.drivers.find((d) => d.id === driver.id);
  const latest = latestByType(row.documents);
  assert.equal(latest.license.id, again.data.document.id, 'the operator sees the new upload as the current licence');
  assert.equal(latest.license.status, 'pending');
  assert.equal(row.documents.filter((d) => d.docType === 'license').length, 2, 'the rejected one stays on record');
});

test('approving the four documents and verifying the driver lets them sign in verified and go online', async (t) => {
  if (skipReason) return t.skip(skipReason);
  const early = await api('POST', `/admin/drivers/${driver.id}/verify`, null, operator.token);
  assert.equal(early.status, 409, 'cannot verify before every document is approved');

  for (const docType of REQUIRED_DOCUMENT_TYPES) {
    const res = await api('POST', `/admin/documents/${uploaded[docType].id}/review`, {
      status: 'approved', reviewer: 'operator-test', method: 'in_person', evidenceReference: 'office log 12 Oct p.3',
    }, operator.token);
    assert.equal(res.status, 200, `${docType}: ${JSON.stringify(res.data)}`);
    assert.equal(res.data.document.status, 'approved');
  }
  const verified = await api('POST', `/admin/drivers/${driver.id}/verify`, null, operator.token);
  assert.equal(verified.status, 200, JSON.stringify(verified.data));
  assert.equal(verified.data.driver.verified, true);

  const still = await api('GET', '/admin/drivers?verified=false', null, operator.token);
  assert.ok(!still.data.drivers.some((d) => d.id === driver.id), 'no longer on the pending list');
  const done = await api('GET', '/admin/drivers?verified=true', null, operator.token);
  assert.ok(done.data.drivers.some((d) => d.id === driver.id), 'listed among verified drivers');

  const login = await api('POST', '/drivers/login', { phone: driver.phone, password: driver.password });
  assert.equal(login.status, 200);
  assert.equal(login.data.pendingApproval, false);
  assert.equal(login.data.driver.verified, true);

  const notes = await api('GET', '/driver/notifications', null, login.data.token);
  assert.ok(notes.data.notifications.some((n) => /verified/i.test(n.title)), 'the driver is told they are verified');

  const online = await api('PUT', '/driver/status', { status: 'active' }, login.data.token);
  assert.equal(online.status, 200, JSON.stringify(online.data));
  assert.equal(online.data.driver.status, 'active');
  assert.equal((await api('GET', '/drivers/rides/active', null, login.data.token)).status, 200);
  assert.equal((await api('GET', '/driver/earnings', null, driver.token)).status, 200, 'the session issued before approval works fully now');
});
