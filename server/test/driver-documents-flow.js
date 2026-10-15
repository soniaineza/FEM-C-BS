/**
 * E2E: a driver registers, closes the app, signs in again, uploads the four
 * KYC documents, and the operator list shows them — the path that used to be
 * impossible (login refused until verified; verification needs documents).
 *
 * Needs the API on http://localhost:3000 (a local database) and
 * ADMIN_API_KEY in server/.env, like the other flow tests:
 *
 *   node test/driver-documents-flow.js
 */
const { request, uniquePhone, BASE } = require('./fixtures');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
let passed = 0;
let failed = 0;

function check(name, cond, detail = '') {
  if (cond) { passed++; console.log(`  ok   ${name}`); }
  else { failed++; console.log(`  FAIL ${name} ${detail}`); }
}

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jXioAAAAASUVORK5CYII=',
  'base64'
);
// Not a document: an MP4 with a mislabeled extension.
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypisom'), Buffer.alloc(64, 0)]);

(async () => {
  // Operator auth: the dashboard signs in with ADMIN_USERNAME/ADMIN_PASSWORD
  // (X-Admin-Key is only for deployments that have ADMIN_API_KEY set).
  if (!process.env.ADMIN_USERNAME || !process.env.ADMIN_PASSWORD) {
    throw new Error('ADMIN_USERNAME and ADMIN_PASSWORD must be set — see server/.env');
  }
  if (!/localhost|127\.0\.0\.1/.test(new URL(BASE).hostname)) throw new Error('Run against a local API only.');
  const adminLogin = await request('POST', '/admin/login', { username: process.env.ADMIN_USERNAME, password: process.env.ADMIN_PASSWORD });
  if (adminLogin.status !== 200 || !adminLogin.data.token) throw new Error(`admin login ${adminLogin.status}: ${JSON.stringify(adminLogin.data)}`);
  const admin = { Authorization: `Bearer ${adminLogin.data.token}` };

  // 1. Register -> the app shows the documents screen; the registration
  //    token is dropped when the driver closes the app.
  const phone = uniquePhone();
  const password = 'CloseApp-Doc-123';
  const reg = await request('POST', '/drivers/register', {
    fullName: 'Elie Driver', phone, password, licenseNumber: `TEST-DLF-${Date.now() % 10000}`,
  });
  check('register 201 + token', reg.status === 201 && !!reg.data.token, `status=${reg.status}`);
  const driverId = reg.data.driver.id;

  // 2. Tokens do not leak into the operator's pending list without documents.
  const before = await request('GET', '/admin/drivers?verified=false', null, null, admin);
  const listed = (before.data.drivers || []).find((d) => d.id === driverId);
  check('operator sees the new application', Boolean(listed), `status=${before.status}`);
  check('shows 0 documents so far', listed && (listed.documents || []).length === 0,
    `docs=${listed && (listed.documents || []).length}`);

  // 3. After closing the app: sign in with phone + password. This used to
  //    throw 403 "waiting for admin approval" — the dead end being fixed.
  const login = await request('POST', '/drivers/login', { phone, password });
  check('unverified driver can sign in', login.status === 200 && !!login.data.token,
    `status=${login.status} ${JSON.stringify(login.data).slice(0, 120)}`);
  check('response says approval is pending', login.data.pendingApproval === true);
  check('server says verified=false', login.data.driver && login.data.driver.verified === false);
  const token = login.data.token;

  // 4. A session without documents cannot use driver features.
  const status = await request('PUT', '/driver/status', { status: 'active' }, token);
  check('unverified session cannot go online', status.status === 403, `status=${status.status}`);
  const earnings = await request('GET', '/driver/earnings', null, token);
  check('unverified session cannot read earnings', earnings.status === 403, `status=${earnings.status}`);

  // 5. Upload all four documents. Camera photo = octet-stream declared type.
  const form = (docType, bytes, declared, name) => {
    const fd = new FormData();
    fd.append('docType', docType);
    fd.append('fileName', name);
    fd.append('file', new Blob([bytes], { type: declared }), name);
    return fd;
  };
  const REQUIRED = ['license', 'national_id', 'vehicle_registration', 'insurance'];
  let firstDocId = null;
  for (const docType of REQUIRED) {
    const up = await request('POST', '/driver/documents', form(docType, PNG, 'application/octet-stream', `${docType}.png`), token);
    check(`upload ${docType} accepted (declared octet-stream)`, up.status === 201 && up.data.document.hasFile,
      `status=${up.status} ${JSON.stringify(up.data).slice(0, 160)}`);
    check(`upload ${docType} typed as image/png by its bytes`, up.data.document.contentType === 'image/png',
      JSON.stringify(up.data.document));
    if (!firstDocId) firstDocId = up.data.document.id;
  }
  const list = await request('GET', '/driver/documents', null, token);
  const pending = (list.data.documents || []).filter((d) => d.status === 'pending');
  check('driver sees the four uploads as pending', pending.length === 4, `n=${pending.length}`);

  // 6. Refusals: an unsupported file, and a mismatched declared type.
  const badVideo = await request('POST', '/driver/documents', form('other', MP4, 'image/heic', 'selfie.heic'), token);
  check('an MP4 labeled .heic is refused (415)', badVideo.status === 415, `status=${badVideo.status}`);
  const badMatch = await request('POST', '/driver/documents', form('other', PNG, 'application/pdf', 'doc.pdf'), token);
  check('a PNG labeled .pdf is refused (415)', badMatch.status === 415, `status=${badMatch.status}`);

  // 7. The operator dashboard list shows all four with files.
  const after = await request('GET', '/admin/drivers?verified=false', null, null, admin);
  const row = (after.data.drivers || []).find((d) => d.id === driverId);
  const docTypes = (row ? row.documents || [] : []).map((d) => d.docType);
  check('operator list shows the four uploaded documents',
    REQUIRED.every((t) => docTypes.includes(t)), `docs=${docTypes.join(',')}`);
  check('every uploaded document carries its file', row && (row.documents || []).every((d) => d.hasFile));
  check('files are marked pending', row && (row.documents || []).every((d) => d.status === 'pending'));

  // 8. The operator can open a file through the admin route.
  const file = await request('GET', `/admin/documents/${firstDocId}/file`, null, null, admin);
  check('operator can open the uploaded file', file.status === 200, `status=${file.status}`);

  // 9. Rejecting a document notifies the driver, who can re-upload.
  const reject = await request('POST', `/admin/documents/${firstDocId}/review`,
    { status: 'rejected', reason: 'Photo is not readable' }, null, admin);
  check('operator rejects a document (with reason)', reject.status === 200 && reject.data.document.status === 'rejected',
    `status=${reject.status}`);
  const notes = await request('GET', '/driver/notifications', null, token);
  const rejectionNote = (notes.data.notifications || []).find((n) => /rejected/i.test(String(n.title || n.title_key || '')) || /not readable/i.test(String(n.body || '')));
  check('the driver got the rejection notification', Boolean(rejectionNote),
    JSON.stringify(notes.data.notifications || []).slice(0, 200));
  const reupload = await request('POST', '/driver/documents', form('license', PNG, 'application/octet-stream', 'license2.png'), token);
  check('the driver can re-upload after the rejection', reupload.status === 201, `status=${reupload.status}`);

  // 10. Approve everything, then the driver: back to the real flow.
  for (const doc of (row ? row.documents : [])) {
    await request('POST', `/admin/documents/${doc.id}/review`,
      { status: 'approved', reviewer: 'e2e-fixture', method: 'in_person', evidenceReference: 'test-flow' }, null, admin);
  }
  const verify = await request('POST', `/admin/drivers/${driverId}/verify`, null, null, admin);
  check('operator verifies the driver once documents are approved', verify.status === 200,
    `status=${verify.status} ${JSON.stringify(verify.data).slice(0, 160)}`);
  const verifiedLogin = await request('POST', '/drivers/login', { phone, password });
  check('verified driver signs in and is free to work online', verifiedLogin.status === 200 && verifiedLogin.data.driver.verified === true,
    `status=${verifiedLogin.status}`);

  console.log(`\nDRIVER-DOCUMENTS-FLOW: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('flow crashed:', e); process.exit(1); });
