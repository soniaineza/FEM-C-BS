/**
 * Passwordless e-mail sign-in against a server this test starts on the local
 * development database (no SMTP configured, so DEV_REVEAL_CODES hands the code
 * to the test; in production it is e-mailed). Usage: node test/email-login-flow.js
 */
const path = require('path');
const { spawn } = require('child_process');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { openPool, connectionOptions } = require('../src/db');

const PORT = 3324;
let passed = 0, failed = 0;
function check(name, cond, detail = '') { if (cond) { passed++; console.log(`  ok   ${name}`); } else { failed++; console.log(`  FAIL ${name} ${detail}`); } }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function withServer(run) {
  const env = { ...process.env, PORT: String(PORT), DEV_REVEAL_CODES: '1', SMS_PROVIDER: '', SMS_GATEWAY_URL: '', SMS_API_KEY: '', WHATSAPP_ACCESS_TOKEN: '', WHATSAPP_PHONE_NUMBER_ID: '', SMTP_HOST: '', SMTP_USER: '', SMTP_PASS: '', OTP_RESEND_COOLDOWN: '0', RATE_LIMIT_MAX: '100000', JWT_SECRET: process.env.JWT_SECRET || 'email-flow-secret' };
  const server = spawn(process.execPath, ['src/index.js'], { cwd: path.join(__dirname, '..'), env });
  let log = '';
  server.stdout.on('data', (d) => { log += d; });
  server.stderr.on('data', (d) => { log += d; });
  const base = `http://localhost:${PORT}/api`;
  const api = async (m, p, b, t) => { const r = await fetch(`${base}${p}`, { method: m, headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) }, body: b ? JSON.stringify(b) : undefined }); const txt = await r.text(); let d = null; try { d = txt ? JSON.parse(txt) : null; } catch { d = txt; } return { status: r.status, data: d }; };
  try {
    let up = false;
    for (let i = 0; i < 160 && !up; i++) { try { up = (await fetch(`${base}/health`)).ok; } catch {} if (!up) await sleep(250); }
    if (!up) throw new Error(`server did not start:\n${log.slice(-1000)}`);
    await run(api);
  } finally { server.kill(); await sleep(500); }
}

(async () => {
  const db = openPool(connectionOptions());
  const ts = Date.now().toString().slice(-7);
  const email = `email-login-${ts}@example.com`;
  await withServer(async (api) => {
    const start = await api('POST', '/auth/email/start', { email });
    check('email start sends a code and reveals it in dev', start.status === 200 && /^\d{6}$/.test(start.data.devCode), JSON.stringify(start.data));
    const wrong = await api('POST', '/auth/email/verify', { email, code: start.data.devCode === '000000' ? '111111' : '000000' });
    check('a wrong email code is refused', wrong.status === 400, `status=${wrong.status}`);
    const verify = await api('POST', '/auth/email/verify', { email, code: start.data.devCode });
    check('the code returns a session for a new email rider (profile incomplete)', verify.status === 200 && verify.data.token && verify.data.passenger.email === email && verify.data.passenger.isVerified === true && verify.data.passenger.isProfileComplete === false, JSON.stringify(verify.data));
    const me = await api('GET', '/auth/me', undefined, verify.data.token);
    check('the session works', me.status === 200 && me.data.passenger.email === email, JSON.stringify(me.data));
    const start2 = await api('POST', '/auth/email/start', { email: email.toUpperCase() });
    const verify2 = await api('POST', '/auth/email/verify', { email, code: start2.data.devCode });
    check('the same email in different case reaches the same account', verify2.status === 200 && verify2.data.passenger.id === verify.data.passenger.id, JSON.stringify(verify2.data));
    const bad = await api('POST', '/auth/email/start', { email: 'not-an-email' });
    check('a bad email is refused', bad.status === 400, `status=${bad.status}`);
  });
  await db.query('DELETE FROM passengers WHERE email LIKE $1', [`email-login-${ts}%`]);
  await db.end();
  console.log(`\nEMAIL-LOGIN: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('email-login-flow crashed:', e); process.exit(1); });
