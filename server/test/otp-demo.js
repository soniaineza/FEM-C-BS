/**
 * Demo login codes (OTP_MODE=demo), against a server this test starts itself
 * on the local development database:
 *   - off unless OTP_MODE=demo is set explicitly
 *   - in demo mode the code reaches the rider through the app, no SMS is
 *     claimed, and the code never appears in the server log
 *   - the code is random per request, expires, and a resend replaces it
 *   - password reset uses the same mechanism
 *
 * Usage: node test/otp-demo.js
 */
const path = require('path');
const { spawn } = require('child_process');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { Pool } = require('pg');

let passed = 0;
let failed = 0;
function check(name, cond, detail = '') {
  if (cond) { passed++; console.log(`  ok   ${name}`); }
  else { failed++; console.log(`  FAIL ${name} ${detail}`); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function withServer(port, extraEnv, run) {
  const env = {
    ...process.env,
    PORT: String(port),
    // Neither the local reveal switch nor an SMS provider: only OTP_MODE decides.
    DEV_REVEAL_CODES: '0',
    SMS_PROVIDER: '',
    OTP_RESEND_COOLDOWN: '0',
    RATE_LIMIT_MAX: '100000',
    ...extraEnv,
  };
  const server = spawn(process.execPath, ['src/index.js'], { cwd: path.join(__dirname, '..'), env });
  let log = '';
  server.stdout.on('data', (d) => { log += d; });
  server.stderr.on('data', (d) => { log += d; });
  const base = `http://localhost:${port}/api`;
  const api = async (method, p, body, token) => {
    const res = await fetch(`${base}${p}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    return { status: res.status, data };
  };
  try {
    let up = false;
    for (let i = 0; i < 160 && !up; i++) {
      try { up = (await fetch(`${base}/health`)).ok; } catch { /* booting */ }
      if (!up) await sleep(250);
    }
    if (!up) throw new Error(`server did not start:\n${log.slice(-800)}`);
    await run(api, () => log);
  } finally {
    server.kill();
    await sleep(500);
  }
}

(async () => {
  const db = new Pool({ connectionString: process.env.DATABASE_URL });
  const ts = Date.now().toString().slice(-7);
  const account = (n) => ({ fullName: 'Demo Otp', phone: `+25078${n}${ts.slice(1)}`, email: `demo-otp-${n}${ts}@example.com`, password: 'secret123' });

  // ---- without the explicit setting, nothing is revealed ----
  await withServer(3311, { OTP_MODE: '' }, async (api) => {
    const signup = await api('POST', '/auth/signup', account(1));
    check('default mode: signup does not reveal the code', signup.status === 201 && signup.data.devCode === undefined && signup.data.otpMode === undefined,
      JSON.stringify(Object.keys(signup.data || {})));
  });

  // ---- demo mode ----
  await withServer(3312, { OTP_MODE: 'demo' }, async (api, log) => {
    const me = account(2);
    const signup = await api('POST', '/auth/signup', me);
    const code = signup.data.devCode;
    check('demo mode: signup returns a 6-digit code marked as demo', signup.status === 201 && /^\d{6}$/.test(code) && signup.data.otpMode === 'demo',
      JSON.stringify({ code: Boolean(code), mode: signup.data.otpMode }));
    check('demo mode: startup log warns that phones are not verified', /OTP_MODE=demo/.test(log()));

    const other = await api('POST', '/auth/signup', account(3));
    check('codes are random per request, not one universal code', other.data.devCode !== code && /^\d{6}$/.test(other.data.devCode));

    const wrong = await api('POST', '/auth/verify-otp', { passengerId: signup.data.passenger.id, code: code === '000000' ? '111111' : '000000' });
    check('a wrong code is refused', wrong.status >= 400, `status=${wrong.status}`);
    const crossed = await api('POST', '/auth/verify-otp', { passengerId: signup.data.passenger.id, code: other.data.devCode });
    check('another account\'s code is refused', crossed.status >= 400, `status=${crossed.status}`);

    const resend = await api('POST', '/auth/resend-otp', { purpose: 'signup' }, signup.data.token);
    check('resend works and does not claim an SMS was sent',
      resend.status === 200 && /^\d{6}$/.test(resend.data.devCode) && !/was sent/i.test(resend.data.message) && /no SMS/i.test(resend.data.message),
      JSON.stringify(resend.data));

    // The newest code, made to look older than its lifetime, must be refused.
    await db.query(`UPDATE verification_codes SET expires_at = now() - interval '1 minute' WHERE passenger_id = $1`, [signup.data.passenger.id]);
    const expired = await api('POST', '/auth/verify-otp', { passengerId: signup.data.passenger.id, code: resend.data.devCode });
    check('an expired demo code is refused', expired.status >= 400, `status=${expired.status}`);

    const fresh = await api('POST', '/auth/resend-otp', { purpose: 'signup' }, signup.data.token);
    const verified = await api('POST', '/auth/verify-otp', { passengerId: signup.data.passenger.id, code: fresh.data.devCode });
    check('the current code verifies the account', verified.status === 200 && verified.data.verified === true, `status=${verified.status}`);
    const reuse = await api('POST', '/auth/verify-otp', { passengerId: signup.data.passenger.id, code: fresh.data.devCode });
    check('a used code cannot be used again', reuse.status >= 400, `status=${reuse.status}`);

    const reset = await api('POST', '/auth/reset-password/request', { identifier: me.email });
    check('password reset uses the same demo mechanism', reset.status === 200 && /^\d{6}$/.test(reset.data.devCode) && reset.data.otpMode === 'demo',
      JSON.stringify({ status: reset.status, mode: reset.data.otpMode }));
    const confirm = await api('POST', '/auth/reset-password/confirm', { identifier: me.email, code: reset.data.devCode, newPassword: 'newsecret456' });
    const login = await api('POST', '/auth/login', { identifier: me.email, password: 'newsecret456' });
    check('the reset code changes the password', confirm.status === 200 && login.status === 200, `confirm=${confirm.status} login=${login.status}`);
    const unknown = await api('POST', '/auth/reset-password/request', { identifier: 'nobody-at-all@example.com' });
    check('reset for an unknown account reveals nothing', unknown.status === 200 && unknown.data.devCode === undefined);

    const codes = [code, other.data.devCode, resend.data.devCode, fresh.data.devCode, reset.data.devCode];
    check('no code is written to the server log', codes.every((c) => !log().includes(c)));
  });

  await db.end();
  console.log(`\nOTP-DEMO: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('otp-demo crashed:', e); process.exit(1); });
