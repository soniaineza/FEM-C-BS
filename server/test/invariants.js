/**
 * Invariant-based stress test of the money + KYC paths, run against the real
 * server in NODE_ENV=production (no demo shortcuts) with a contract-faithful
 * fake Paypack + SMS gateway.
 *
 * A seeded random walk drives passengers, drivers, Paypack outcomes
 * (webhooks: single, duplicate, concurrent, forged; polling; both racing) and
 * admin actions. After EVERY step the whole database is checked against the
 * invariants below plus an independent model of each wallet's balance.
 *
 * Usage:
 *   INV_DATABASE_URL=postgres://postgres:postgres@localhost:55432/postgres \
 *   node test/invariants.js [seed] [steps]
 * A fresh database is created per run (dropped first if it exists).
 */
const crypto = require('crypto');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const { Client, Pool } = require('pg');

const SEED = Number(process.argv[2] || 1);
const STEPS = Number(process.argv[3] || 120);
const ADMIN_URL = process.env.INV_DATABASE_URL || 'postgres://postgres:postgres@localhost:55432/postgres';
const DB_NAME = `kimutransport_inv_${SEED}`;
const DB_URL = ADMIN_URL.replace(/\/[^/]*$/, `/${DB_NAME}`);
const API_PORT = 3100 + (SEED % 100);
const MOCK_PORT = 4100 + (SEED % 100);
const API = `http://localhost:${API_PORT}/api`;
const WEBHOOK_SECRET = 'whsec_invariants';
const ADMIN_KEY = crypto.randomBytes(24).toString('hex');
const COMMISSION = 0.15;

// ---------- deterministic PRNG ----------
let rngState = SEED >>> 0 || 1;
function rand() {
  rngState ^= rngState << 13; rngState >>>= 0;
  rngState ^= rngState >>> 17;
  rngState ^= rngState << 5; rngState >>>= 0;
  return rngState / 0x100000000;
}
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const chance = (p) => rand() < p;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- fake Paypack + SMS gateway ----------
const mock = {
  tokens: new Map(), // access -> expiresAtMs
  refreshTokens: new Set(),
  txns: new Map(), // ref -> txn
  byIdemKey: new Map(),
  sms: [],
  failNextCashin: false,
  failNextSms: false,
  counts: { authorize: 0, refresh: 0, cashin: 0, find: 0 },
  contractViolations: [],
};

function issueToken() {
  const access = crypto.randomBytes(12).toString('hex');
  const refresh = crypto.randomBytes(12).toString('hex');
  // Short lifetime so the client's refresh path is exercised during the run.
  const expiresAt = Date.now() + 90 * 1000;
  mock.tokens.set(access, expiresAt);
  mock.refreshTokens.add(refresh);
  return { access, refresh, expires: Math.floor(expiresAt / 1000) };
}

function startMock() {
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const send = (status, obj) => {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(obj));
      };
      const json = () => { try { return JSON.parse(body || '{}'); } catch { return null; } };
      const authed = () => {
        const tok = (req.headers.authorization || '').replace(/^Bearer /, '');
        const exp = mock.tokens.get(tok);
        return exp && exp > Date.now();
      };
      const url = req.url;

      if (req.method === 'POST' && url === '/sms') {
        if (req.headers.authorization !== 'Bearer sms-key') return send(401, { error: 'bad key' });
        if (mock.failNextSms) { mock.failNextSms = false; return send(503, { error: 'gateway down' }); }
        const b = json();
        if (!b || !/^\+2507\d{8}$/.test(b.to) || !b.message) {
          mock.contractViolations.push(`sms bad payload ${body}`);
          return send(400, { error: 'bad payload' });
        }
        mock.sms.push(b);
        return send(200, { id: crypto.randomUUID() });
      }
      if (req.method === 'POST' && url === '/api/auth/agents/authorize') {
        mock.counts.authorize++;
        const b = json();
        if (b?.client_id !== 'pp-id' || b?.client_secret !== 'pp-secret') return send(401, { error: 'bad creds' });
        return send(200, issueToken());
      }
      if (req.method === 'GET' && url.startsWith('/api/auth/agents/refresh/')) {
        mock.counts.refresh++;
        const r = decodeURIComponent(url.split('/').pop());
        if (!mock.refreshTokens.has(r)) return send(401, { error: 'bad refresh' });
        mock.refreshTokens.delete(r);
        return send(200, issueToken());
      }
      if (req.method === 'POST' && url === '/api/transactions/cashin') {
        mock.counts.cashin++;
        if (!authed()) return send(401, { error: 'unauthorized' });
        const b = json();
        const key = req.headers['idempotency-key'];
        if (!b || !Number.isInteger(b.amount) || b.amount <= 0 || !/^07\d{8}$/.test(String(b.number))) {
          mock.contractViolations.push(`cashin bad payload ${body}`);
          return send(400, { error: 'bad payload' });
        }
        if (key && key.length > 32) {
          mock.contractViolations.push(`idempotency key too long: ${key}`);
          return send(400, { error: 'bad idempotency key' });
        }
        if (mock.failNextCashin) { mock.failNextCashin = false; return send(500, { error: 'provider down' }); }
        if (key && mock.byIdemKey.has(key)) return send(200, mock.txns.get(mock.byIdemKey.get(key)));
        const txn = {
          ref: crypto.randomUUID(), kind: 'CASHIN', amount: b.amount, client: b.number,
          status: 'pending', created_at: new Date().toISOString(), idemKey: key || null,
        };
        mock.txns.set(txn.ref, txn);
        if (key) mock.byIdemKey.set(key, txn.ref);
        return send(200, { amount: txn.amount, created_at: txn.created_at, kind: 'CASHIN', ref: txn.ref, status: 'pending' });
      }
      // Status polling reads the event log, like the real API: a processed
      // event exists only once the transaction has succeeded or failed.
      if (req.method === 'GET' && url.startsWith('/api/events/transactions')) {
        mock.counts.find++;
        if (!authed()) return send(401, { error: 'unauthorized' });
        const ref = new URL(url, 'http://mock').searchParams.get('ref');
        const txn = mock.txns.get(ref);
        const transactions = [];
        if (txn) {
          transactions.push({ event_kind: 'transaction:created', data: { ...txn, status: 'pending' } });
          if (txn.status !== 'pending') transactions.push({ event_kind: 'transaction:processed', data: { ...txn } });
        }
        return send(200, { ref, limit: 20, total: transactions.length, transactions });
      }
      send(404, { error: `mock: no route ${req.method} ${url}` });
    });
  });
  return new Promise((r) => server.listen(MOCK_PORT, () => r(server)));
}

function webhookBody(txn) {
  return JSON.stringify({
    event_id: crypto.randomUUID(),
    kind: 'transaction:processed',
    created_at: new Date().toISOString(),
    data: {
      ref: txn.ref, kind: 'CASHIN', fee: 2.3, merchant: 'TEST', client: txn.client,
      amount: txn.amount, provider: 'mtn', status: txn.status,
      created_at: txn.created_at, processed_at: new Date().toISOString(),
    },
  });
}

async function deliverWebhook(txn, { forge = false } = {}) {
  const raw = webhookBody(txn);
  const sig = crypto.createHmac('sha256', forge ? 'not-the-secret' : WEBHOOK_SECRET).update(raw).digest('base64');
  const res = await fetch(`${API}/webhooks/paypack`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-paypack-signature': sig },
    body: raw,
  });
  return res.status;
}

// ---------- API helpers ----------
async function api(method, p, body, token, headers = {}) {
  const res = await fetch(`${API}${p}`, {
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

// ---------- world model ----------
const world = {
  passengers: [], // { id, token, phone, expectedBalance, email }
  drivers: [], // { id, token, phone }
  topupOutcome: new Map(), // topup reference -> 'succeeded' | 'failed' (once terminal)
  log: [],
};
let seq = 0;
const uniquePhone = () => `+2507${String(SEED % 10)}${String(++seq).padStart(7, '0')}`;

function note(msg) {
  world.log.push(msg);
  if (world.log.length > 40) world.log.shift();
}

// ---------- invariants ----------
let db;
const violations = [];

async function q(sql, params) {
  return (await db.query(sql, params)).rows;
}

const TRANSITIONS = {
  scheduled: ['searchingDriver', 'cancelled'],
  searchingDriver: ['driverAssigned', 'cancelled'],
  driverAssigned: ['driverArriving', 'cancelled', 'searchingDriver'],
  driverArriving: ['driverArrived', 'cancelled'],
  driverArrived: ['pinVerified', 'cancelled'],
  pinVerified: ['inProgress', 'cancelled'],
  inProgress: ['arrived'],
  arrived: ['paymentPending'],
  paymentPending: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

async function collectViolations(step) {
  const v = [];
  const fail = (name, detail) => v.push(`[step ${step}] ${name}: ${detail}`);

  // I1 wallet balance == ledger, never negative.
  for (const r of await q(`
      SELECT w.passenger_id, w.balance,
             COALESCE(SUM(CASE WHEN t.type='credit' THEN t.amount ELSE -t.amount END), 0) AS ledger
        FROM wallets w LEFT JOIN wallet_transactions t ON t.passenger_id = w.passenger_id
       GROUP BY w.passenger_id, w.balance`)) {
    if (Math.abs(Number(r.balance) - Number(r.ledger)) > 1e-6) fail('I1 balance==ledger', `${r.passenger_id} balance=${r.balance} ledger=${r.ledger}`);
    if (Number(r.balance) < 0) fail('I1 balance>=0', `${r.passenger_id} balance=${r.balance}`);
  }

  // I2 top-up succeeded <=> exactly one credit with its reference.
  for (const r of await q(`
      SELECT tp.reference, tp.status, tp.amount,
             (SELECT COUNT(*) FROM wallet_transactions t WHERE t.reference = tp.reference AND t.type='credit') AS credits,
             (SELECT COALESCE(SUM(amount),0) FROM wallet_transactions t WHERE t.reference = tp.reference AND t.type='credit') AS credited
        FROM wallet_topups tp`)) {
    const n = Number(r.credits);
    if (r.status === 'succeeded' && (n !== 1 || Number(r.credited) !== Number(r.amount))) fail('I2 succeeded top-up credited once', `${r.reference} credits=${n} credited=${r.credited} amount=${r.amount}`);
    if (r.status !== 'succeeded' && n !== 0) fail('I2 non-succeeded top-up never credited', `${r.reference} status=${r.status} credits=${n}`);
    // I3 terminal top-up states never change.
    const prev = world.topupOutcome.get(r.reference);
    if (prev && prev !== r.status) fail('I3 top-up terminal state stable', `${r.reference} was ${prev} now ${r.status}`);
    if (r.status === 'succeeded' || r.status === 'failed') world.topupOutcome.set(r.reference, r.status);
  }

  // I4 wallet balance matches the independent model.
  for (const p of world.passengers) {
    const [w] = await q('SELECT balance FROM wallets WHERE passenger_id = $1', [p.id]);
    const actual = Number(w?.balance ?? 0);
    if (Math.abs(actual - p.expectedBalance) > 1e-6) fail('I4 balance==model', `${p.phone} actual=${actual} expected=${p.expectedBalance}`);
  }

  // I5 receipts: succeeded payment <=> exactly one receipt.
  for (const r of await q(`
      SELECT p.id, p.status, (SELECT COUNT(*) FROM receipts rc WHERE rc.payment_id = p.id) AS n
        FROM payments p`)) {
    const n = Number(r.n);
    if (r.status === 'succeeded' && n !== 1) fail('I5 one receipt per succeeded payment', `${r.id} receipts=${n}`);
    if (r.status !== 'succeeded' && n !== 0) fail('I5 no receipt without success', `${r.id} status=${r.status} receipts=${n}`);
  }
  for (const r of await q('SELECT ride_id, COUNT(*) AS n FROM receipts GROUP BY ride_id HAVING COUNT(*) > 1')) {
    fail('I5 at most one receipt per ride', `${r.ride_id} receipts=${r.n}`);
  }

  // I6 ride completed (after paymentPending) <=> one succeeded payment.
  for (const r of await q(`
      SELECT r.id, r.status, r.payment_method,
             (SELECT COUNT(*) FROM payments p WHERE p.ride_id = r.id AND p.status = 'succeeded') AS paid
        FROM rides r
       WHERE EXISTS (SELECT 1 FROM ride_status_history h WHERE h.ride_id = r.id AND h.to_status = 'paymentPending')`)) {
    const paid = Number(r.paid);
    if (r.status === 'completed' && paid !== 1) fail('I6 completed ride has one succeeded payment', `${r.id} paid=${paid}`);
    if (r.status !== 'completed' && paid !== 0) fail('I6 succeeded payment completes ride', `${r.id} status=${r.status} paid=${paid}`);
  }

  // I7 wallet ride payments debit exactly once, only when succeeded.
  for (const r of await q(`
      SELECT p.id, p.status, p.amount,
             (SELECT COUNT(*) FROM wallet_transactions t WHERE t.reference = p.reference AND t.type='debit') AS debits
        FROM payments p WHERE p.method = 'wallet'`)) {
    const n = Number(r.debits);
    if (r.status === 'succeeded' && n !== 1) fail('I7 wallet payment debited once', `${r.id} debits=${n}`);
    if (r.status !== 'succeeded' && n !== 0) fail('I7 unpaid wallet payment not debited', `${r.id} status=${r.status} debits=${n}`);
  }

  // I8 driver earnings: one row per completed ride, arithmetic consistent.
  for (const r of await q('SELECT ride_id, COUNT(*) AS n FROM driver_earnings GROUP BY ride_id HAVING COUNT(*) > 1')) {
    fail('I8 one earnings row per ride', `${r.ride_id} rows=${r.n}`);
  }
  for (const r of await q(`
      SELECT e.*, rd.status AS ride_status FROM driver_earnings e JOIN rides rd ON rd.id = e.ride_id`)) {
    const gross = Number(r.gross_amount);
    const commission = Math.round(gross * COMMISSION * 100) / 100;
    if (Math.abs(Number(r.commission) - commission) > 0.005) fail('I8 commission', `${r.ride_id} ${r.commission} != ${commission}`);
    if (Math.abs(Number(r.net_amount) + Number(r.commission) - gross) > 0.011) fail('I8 net+commission==gross', `${r.ride_id}`);
    if (r.ride_status !== 'completed') fail('I8 earnings only for completed rides', `${r.ride_id} status=${r.ride_status}`);
  }
  for (const r of await q(`
      SELECT r.id FROM rides r
       WHERE r.status = 'completed' AND r.driver_id IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM driver_earnings e WHERE e.ride_id = r.id)`)) {
    fail('I8 completed ride credits its driver', r.id);
  }

  // I9 driver aggregates == earnings ledger.
  for (const r of await q(`
      SELECT d.id, d.total_trips, d.total_earnings,
             (SELECT COUNT(*) FROM driver_earnings e WHERE e.driver_id = d.id) AS n,
             (SELECT COALESCE(SUM(net_amount),0) FROM driver_earnings e WHERE e.driver_id = d.id) AS net
        FROM drivers d`)) {
    if (Number(r.total_trips) !== Number(r.n)) fail('I9 total_trips==earnings rows', `${r.id} ${r.total_trips} vs ${r.n}`);
    if (Math.abs(Number(r.total_earnings) - Number(r.net)) > 0.011) fail('I9 total_earnings==sum(net)', `${r.id} ${r.total_earnings} vs ${r.net}`);
  }

  // I10 KYC: an unverified driver is never online or on a ride.
  for (const r of await q(`SELECT id, status FROM drivers WHERE verified = FALSE AND status IN ('active','busy')`)) {
    fail('I10 unverified driver offline', `${r.id} status=${r.status}`);
  }
  for (const r of await q(`
      SELECT r.id, r.driver_id FROM rides r JOIN drivers d ON d.id = r.driver_id
       WHERE d.verified = FALSE AND r.status IN ('searchingDriver','driverAssigned')
         AND r.created_at > d.updated_at`)) {
    fail('I10 no new assignment to unverified driver', `${r.id} -> ${r.driver_id}`);
  }

  // I11 driver busy <=> has an active ride.
  for (const r of await q(`
      SELECT d.id, d.status,
             (SELECT COUNT(*) FROM rides r WHERE r.driver_id = d.id
                AND r.status IN ('driverAssigned','driverArriving','driverArrived','pinVerified','inProgress','arrived','paymentPending')) AS active
        FROM drivers d`)) {
    if (r.status === 'busy' && Number(r.active) === 0) fail('I11 busy driver has a ride', `${r.id}`);
  }

  // I12 every recorded transition is legal, and the history forms one
  // unbroken chain from creation to the current status: per status,
  // (times entered - times left) is 1 for the current status, 0 otherwise.
  // Timestamp-free on purpose (WSL2's clock can step backwards mid-run).
  for (const r of await q(`SELECT ride_id, from_status, to_status FROM ride_status_history`)) {
    if (r.from_status && !(TRANSITIONS[r.from_status] || []).includes(r.to_status)) {
      fail('I12 legal transition', `${r.ride_id} ${r.from_status} -> ${r.to_status}`);
    }
  }
  for (const r of await q(`
      SELECT r.id, r.status, s.st,
             (SELECT COUNT(*) FROM ride_status_history h WHERE h.ride_id = r.id AND h.to_status = s.st)
           - (SELECT COUNT(*) FROM ride_status_history h WHERE h.ride_id = r.id AND h.from_status = s.st) AS net
        FROM rides r
        CROSS JOIN LATERAL (SELECT to_status AS st FROM ride_status_history WHERE ride_id = r.id
                            UNION SELECT r.status) s`)) {
    const want = r.st === r.status ? 1 : 0;
    if (Number(r.net) !== want) fail('I12 history chain ends at current status', `${r.id} status=${r.status} ${r.st} net=${r.net}`);
  }

  // I13 Paypack side: each charge is for the recorded amount + passenger number.
  for (const r of await q(`
      SELECT p.external_reference AS ref, p.amount, ps.phone FROM payments p
        JOIN passengers ps ON ps.id = p.passenger_id WHERE p.external_reference IS NOT NULL
      UNION ALL
      SELECT tp.external_reference, tp.amount, tp.phone FROM wallet_topups tp WHERE tp.external_reference IS NOT NULL`)) {
    const txn = mock.txns.get(r.ref);
    if (!txn) { fail('I13 charge exists at Paypack', r.ref); continue; }
    if (txn.amount !== Math.round(Number(r.amount))) fail('I13 charged amount', `${r.ref} ${txn.amount} vs ${r.amount}`);
    const national = `0${String(r.phone).replace(/\D/g, '').slice(-9)}`;
    if (txn.client !== national) fail('I13 charged number', `${r.ref} ${txn.client} vs ${r.phone}`);
  }
  for (const [key, ref] of mock.byIdemKey) {
    const dupes = [...mock.txns.values()].filter((t) => t.idemKey === key);
    if (dupes.length !== 1) fail('I13 one Paypack charge per idempotency key', `${key} -> ${dupes.length} (${ref})`);
  }

  if (mock.contractViolations.length) {
    // Recorded directly: the queue is drained, so a re-check would lose them.
    for (const c of mock.contractViolations.splice(0)) violations.push(`[step ${step}] I14 Paypack/SMS contract: ${c}`);
  }

  return v;
}

/**
 * Webhooks are processed after Paypack is acked, so a check can land while a
 * settlement is in flight. Re-check for up to ~2s and report only violations
 * that persist; real bugs (double credits, lost transitions) are permanent.
 */
async function checkInvariants(step) {
  let v = await collectViolations(step);
  for (let i = 0; i < 6 && v.length; i++) {
    await sleep(350);
    v = await collectViolations(step);
  }
  if (v.length) {
    violations.push(...v);
    v.forEach((x) => console.log(`  VIOLATION ${x}`));
  }
}

// ---------- actions ----------
async function codeFor(phone) {
  for (let i = 0; i < 20; i++) {
    const sms = [...mock.sms].reverse().find((s) => s.to === phone);
    if (sms) return (sms.message.match(/code is (\d+)/) || [])[1];
    await sleep(50);
  }
  return null;
}

async function newPassenger() {
  const phone = uniquePhone();
  const failSms = chance(0.15);
  mock.failNextSms = failSms;
  const r = await api('POST', '/auth/signup', {
    fullName: `Rider ${seq}`, phone, email: `r${SEED}_${seq}@example.com`, password: 'secret123',
  });
  if (r.status !== 201) throw new Error(`signup ${r.status} ${JSON.stringify(r.data)}`);
  if (r.data.devCode || JSON.stringify(r.data).match(/"code"/)) violations.push(`OTP leaked in production signup response: ${JSON.stringify(r.data)}`);
  const p = { id: r.data.passenger.id, token: r.data.token, phone, expectedBalance: 0 };
  world.passengers.push(p);
  await sleep(100);
  if (failSms) {
    // The signup SMS failed; resend must work (and a failing resend is a 502).
    mock.failNextSms = true;
    const bad = await api('POST', '/auth/resend-otp', { purpose: 'signup' }, p.token);
    if (bad.status !== 502) violations.push(`resend with failing SMS gateway returned ${bad.status}, expected 502`);
    const ok = await api('POST', '/auth/resend-otp', { purpose: 'signup' }, p.token);
    if (ok.status !== 200) violations.push(`resend after gateway recovery returned ${ok.status}`);
  }
  const code = await codeFor(phone);
  const v = await api('POST', '/auth/verify-otp', { passengerId: p.id, code });
  if (v.status !== 200) {
    const sent = mock.sms.filter((x) => x.to === phone).map((x) => (x.message.match(/code is (\d+)/) || [])[1]);
    const codes = await q('SELECT id, purpose, used_at IS NOT NULL AS used, attempts, created_at FROM verification_codes WHERE passenger_id = $1 ORDER BY id', [p.id]);
    violations.push(`verify-otp with the SMS'd code failed: ${v.status} failSms=${failSms} used=${code} smsCodes=${JSON.stringify(sent)} rows=${JSON.stringify(codes)}`);
  }
  note(`passenger ${phone}${failSms ? ' (signup SMS failed, resent)' : ''}`);
}

async function newDriver() {
  const phone = uniquePhone();
  const reg = await api('POST', '/drivers/register', { fullName: `Driver ${seq}`, phone, password: 'secret123', licenseNumber: `RW${seq}` });
  if (reg.status !== 201) throw new Error(`driver register ${reg.status}`);
  const d = { id: reg.data.driver.id, token: reg.data.token, phone };
  world.drivers.push(d);
  const on = await api('PUT', '/driver/status', { status: 'active' }, d.token);
  if (on.status !== 403) violations.push(`unverified driver going online returned ${on.status}, expected 403`);
  // Verification needs all four core documents approved in person.
  d.docIds = [];
  for (const docType of ['license', 'national_id', 'vehicle_registration', 'insurance']) {
    const doc = await api('POST', '/driver/documents', { docType, fileName: `${docType}.jpg` }, d.token);
    if (doc.status !== 201) violations.push(`document submit ${doc.status}`);
    else d.docIds.push(doc.data.document.id);
  }
  note(`driver ${phone} registered (unverified)`);
}

async function adminAction() {
  const d = pick(world.drivers);
  if (!d) return;
  const [row] = await q('SELECT verified, status FROM drivers WHERE id = $1', [d.id]);
  if (!row.verified || row.status === 'suspended') {
    if (!d.docsApproved) {
      const early = await admin('POST', `/drivers/${d.id}/verify`);
      if (early.status !== 409) violations.push(`verify without approved documents returned ${early.status}, expected 409`);
      for (const docId of d.docIds) {
        const review = await admin('POST', `/documents/${docId}/review`, {
          status: 'approved', reviewer: 'invariants', method: 'in_person', evidenceReference: `inspection-${docId.slice(0, 8)}`,
        });
        if (review.status !== 200) violations.push(`document review ${review.status}`);
      }
      d.docsApproved = true;
    }
    const r = await admin('POST', `/drivers/${d.id}/verify`);
    if (r.status !== 200) violations.push(`admin verify ${r.status}`);
    await api('POST', '/drivers/location', { latitude: -1.9441 + rand() * 0.01, longitude: 30.0619 + rand() * 0.01 }, d.token);
    const on = await api('PUT', '/driver/status', { status: 'active' }, d.token);
    if (on.status !== 200) violations.push(`verified driver going online returned ${on.status}`);
    note(`admin verified ${d.phone}, online`);
  } else if (chance(0.3)) {
    const r = await admin('POST', `/drivers/${d.id}/suspend`, { reason: 'invariant test' });
    if (row.status === 'busy') {
      if (r.status !== 409) violations.push(`suspending a busy driver returned ${r.status}, expected 409`);
    } else if (r.status !== 200) {
      violations.push(`admin suspend ${r.status}`);
    } else {
      note(`admin suspended ${d.phone}`);
    }
  }
}

/** Resolves a pending Paypack txn in one of several adversarial ways. */
async function resolveTxn(ref, refreshFn) {
  const txn = mock.txns.get(ref);
  if (!txn) return 'no-txn';
  const mode = pick(['webhook', 'dup-webhook', 'concurrent-webhooks', 'poll', 'webhook+poll-race', 'forged', 'none']);
  const outcome = chance(0.75) ? 'successful' : 'failed';
  if (mode === 'none') return 'unresolved';
  if (mode === 'forged') {
    // A forged "successful" webhook must change nothing.
    const status = await deliverWebhook({ ...txn, status: 'successful' }, { forge: true });
    if (status !== 401) violations.push(`forged webhook returned ${status}`);
    return 'unresolved';
  }
  txn.status = outcome;
  if (mode === 'webhook') await deliverWebhook(txn);
  if (mode === 'dup-webhook') { await deliverWebhook(txn); await deliverWebhook(txn); }
  if (mode === 'concurrent-webhooks') await Promise.all([1, 2, 3, 4].map(() => deliverWebhook(txn)));
  if (mode === 'poll') await refreshFn();
  if (mode === 'webhook+poll-race') await Promise.all([deliverWebhook(txn), refreshFn(), refreshFn(), deliverWebhook(txn)]);
  await sleep(250); // webhook handler finishes after acking
  return `${outcome} via ${mode}`;
}

async function topup() {
  const p = pick(world.passengers);
  if (!p) return;
  const amount = pick([500, 1000, 2500, 10000, 1234.4]);
  const phone = chance(0.5) ? p.phone : `0${p.phone.slice(-9)}`;
  const failCashin = chance(0.1);
  mock.failNextCashin = failCashin;
  const r = await api('POST', '/wallet/topup', { phone, amount }, p.token);
  if (failCashin) {
    if (r.status !== 502) violations.push(`top-up with Paypack down returned ${r.status}, expected 502`);
    note(`top-up ${amount} for ${p.phone}: Paypack down -> 502`);
    return;
  }
  if (r.status !== 201) throw new Error(`topup ${r.status} ${JSON.stringify(r.data)}`);
  const [row] = await q('SELECT external_reference FROM wallet_topups WHERE id = $1', [r.data.topup.id]);
  const how = await resolveTxn(row.external_reference, () => api('POST', `/wallet/topups/${r.data.topup.id}/refresh`, null, p.token));
  if (how.startsWith('successful')) p.expectedBalance += amount;
  note(`top-up ${amount} for ${p.phone}: ${how}`);
}

async function ride() {
  const p = pick(world.passengers);
  if (!p) return;
  const [live] = await q(`SELECT id FROM rides WHERE passenger_id = $1 AND status NOT IN ('completed','cancelled')`, [p.id]);
  if (live) {
    // Leftover unpaid ride from an unresolved payment: cancel it.
    const c = await api('POST', `/rides/${live.id}/cancel`, { reason: 'cleanup' }, p.token);
    note(`cancel leftover ride ${live.id}: ${c.status}`);
    return;
  }
  const method = pick(['cash', 'wallet', 'mtn_momo', 'airtel_money']);
  const created = await api('POST', '/rides', {
    pickup: { address: 'KN 5 Rd', latitude: -1.9441, longitude: 30.0619 },
    destination: { address: 'Kimironko', latitude: -1.9562, longitude: 30.1575 },
    vehicleId: 'fem_economy', paymentMethodId: method,
  }, p.token);
  if (created.status !== 201) throw new Error(`ride ${created.status} ${JSON.stringify(created.data)}`);
  const rideId = created.data.ride.id;
  let assigned = null;
  for (let i = 0; i < 6 && !assigned; i++) {
    const r = await api('GET', `/rides/${rideId}`, null, p.token);
    if (r.data.ride.status !== 'searchingDriver') assigned = r.data.ride;
    else await sleep(300);
  }
  if (!assigned) {
    await api('POST', `/rides/${rideId}/cancel`, { reason: 'no driver' }, p.token);
    note(`ride ${method}: no driver, cancelled`);
    return;
  }
  const d = world.drivers.find((x) => x.phone === assigned.driver.phone);
  if (chance(0.1)) {
    await api('POST', `/drivers/rides/${rideId}/decline`, null, d.token);
    await api('POST', `/rides/${rideId}/cancel`, { reason: 'declined' }, p.token);
    note(`ride ${method}: driver declined, cancelled`);
    return;
  }
  await api('POST', `/drivers/rides/${rideId}/accept`, null, d.token);
  await api('POST', `/drivers/rides/${rideId}/arrived`, null, d.token);
  const pin = (await api('GET', `/rides/${rideId}`, null, p.token)).data.ride.pin;
  await api('POST', `/drivers/rides/${rideId}/verify-pin`, { pin }, d.token);
  const failCashin = (method === 'mtn_momo' || method === 'airtel_money') && chance(0.1);
  mock.failNextCashin = failCashin;
  await api('POST', `/drivers/rides/${rideId}/complete-trip`, null, d.token);
  mock.failNextCashin = false;

  const [payment] = await q('SELECT * FROM payments WHERE ride_id = $1', [rideId]);
  const fare = Number(payment.amount);
  let how;
  if (method === 'cash') {
    const c = await api('POST', `/payments/${payment.id}/confirm-cash`, null, p.token);
    how = `cash confirm ${c.status}`;
  } else if (method === 'wallet') {
    if (p.expectedBalance >= fare) { p.expectedBalance -= fare; how = 'wallet debited'; }
    else how = 'wallet insufficient';
  } else if (failCashin) {
    how = 'Paypack down at charge time';
  } else {
    how = await resolveTxn(payment.external_reference, () => api('POST', `/payments/${payment.id}/refresh`, null, p.token));
  }
  note(`ride ${method} fare ${fare}: ${how}`);
}

// ---------- runner ----------
async function main() {
  const adminDb = new Client({ connectionString: ADMIN_URL });
  await adminDb.connect();
  await adminDb.query(`DROP DATABASE IF EXISTS ${DB_NAME}`);
  await adminDb.query(`CREATE DATABASE ${DB_NAME}`);
  await adminDb.end();

  const mockServer = await startMock();
  const env = {
    PATH: process.env.PATH,
    NODE_ENV: 'production',
    PORT: String(API_PORT),
    DATABASE_URL: DB_URL,
    JWT_SECRET: crypto.randomBytes(16).toString('hex'),
    SMS_PROVIDER: 'generic',
    SMS_GATEWAY_URL: `http://localhost:${MOCK_PORT}/sms`,
    SMS_API_KEY: 'sms-key',
    PAYPACK_CLIENT_ID: 'pp-id',
    PAYPACK_CLIENT_SECRET: 'pp-secret',
    PAYPACK_WEBHOOK_SECRET: WEBHOOK_SECRET,
    PAYPACK_BASE_URL: `http://localhost:${MOCK_PORT}`,
    EMERGENCY_CALL_CENTER_PHONE: '+250788123456',
    ADMIN_API_KEY: ADMIN_KEY,
    RATE_LIMIT_MAX: '100000',
    OTP_RESEND_COOLDOWN: '0',
    // Production refuses the public map services and every demo switch.
    // The server also loads server/.env, so the switches are pinned off here
    // rather than left to a developer's local values. Routing points at the
    // mock (which has no such route), so fares use the straight-line fallback.
    OSRM_URL: process.env.OSRM_URL || `http://localhost:${MOCK_PORT}/route/v1/driving`,
    PHOTON_URL: `http://localhost:${MOCK_PORT}/photon/api/`,
    PHOTON_REVERSE_URL: `http://localhost:${MOCK_PORT}/photon/reverse`,
    DEV_REVEAL_CODES: '0',
    DEV_AUTO_VERIFY_DRIVERS: '0',
    DEMO_PAYMENTS: '0',
    DEMO_FLEET: '0',
    // Windows needs these for DNS/sockets in the child process.
    ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}),
  };
  const server = spawn(process.execPath, ['src/index.js'], { cwd: path.join(__dirname, '..'), env });
  let serverLog = '';
  server.stdout.on('data', (d) => { serverLog += d; });
  server.stderr.on('data', (d) => { serverLog += d; });
  let up = false;
  for (let i = 0; i < 240 && !up; i++) {
    try { up = (await fetch(`${API}/health`)).ok; } catch { /* booting */ }
    if (!up) await sleep(250);
  }
  if (!up) {
    server.kill();
    mockServer.close();
    throw new Error(`API did not start:
${serverLog.slice(-1500)}`);
  }
  db = new Pool({ connectionString: DB_URL });

  // Production-mode surface checks.
  const head = await fetch(`${API}/webhooks/paypack`, { method: 'HEAD' });
  if (head.status !== 200) violations.push(`webhook HEAD ${head.status}`);
  if ((await api('GET', '/admin/drivers', null, null, { 'X-Admin-Key': ADMIN_KEY.slice(0, -1) + 'x' })).status !== 401) violations.push('admin accepted a wrong key');

  console.log(`seed=${SEED} steps=${STEPS} db=${DB_NAME}`);
  for (let i = 0; i < 3; i++) await newPassenger();
  // Needs a phone-verified rider, like every authenticated rider route.
  const sosCfg = await api('GET', '/emergency/config', null, world.passengers[0].token);
  if (sosCfg.data?.callCenterPhone !== '+250788123456') violations.push(`SOS config ${JSON.stringify(sosCfg.data)}`);
  for (let i = 0; i < 2; i++) await newDriver();

  const actions = [
    [newPassenger, 1], [newDriver, 1], [adminAction, 3], [topup, 5], [ride, 6],
  ];
  const total = actions.reduce((s, [, w]) => s + w, 0);
  for (let step = 1; step <= STEPS; step++) {
    let r = rand() * total;
    const [fn] = actions.find(([, w]) => (r -= w) < 0);
    try {
      await fn();
    } catch (err) {
      violations.push(`[step ${step}] ${fn.name} threw: ${err.message}`);
      console.log(`  ERROR step ${step} ${fn.name}: ${err.message}`);
    }
    await checkInvariants(step);
    if (step % 20 === 0) console.log(`  step ${step}: ${violations.length} violations so far`);
  }

  const stats = await q(`SELECT
      (SELECT COUNT(*) FROM rides) AS rides,
      (SELECT COUNT(*) FROM rides WHERE status='completed') AS completed,
      (SELECT COUNT(*) FROM wallet_topups) AS topups,
      (SELECT COUNT(*) FROM wallet_topups WHERE status='succeeded') AS topups_ok,
      (SELECT COUNT(*) FROM payments WHERE method IN ('mtn_momo','airtel_money')) AS momo,
      (SELECT COUNT(*) FROM drivers WHERE verified) AS verified_drivers`);
  console.log('  stats', JSON.stringify(stats[0]), 'paypack', JSON.stringify(mock.counts), 'sms', mock.sms.length);

  const unexpected = serverLog.split('\n').filter((l) => /error|unhandled/i.test(l) && !/Paypack cashin failed|SMS delivery failed/.test(l));
  if (unexpected.length) {
    console.log('  server errors logged:');
    [...new Set(unexpected)].slice(0, 10).forEach((l) => console.log(`    ${l}`));
  }

  const unique = [...new Set(violations.map((x) => x.replace(/^\[step \d+\] /, '')))];
  console.log(`\nINVARIANTS seed=${SEED}: ${violations.length} violations (${unique.length} distinct)`);
  if (violations.length) {
    unique.slice(0, 15).forEach((x) => console.log(`  - ${x}`));
    console.log('  recent actions:'); world.log.slice(-8).forEach((x) => console.log(`    ${x}`));
  }

  await db.end();
  server.kill();
  mockServer.close();
  process.exit(violations.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
