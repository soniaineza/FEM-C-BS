/**
 * Passwordless WhatsApp/phone sign-in against a server this test starts on the
 * local development database (DEV_REVEAL_CODES reveals the code to the test;
 * in production it goes to WhatsApp):
 *   start -> code -> session, for a new number and an existing one;
 *   wrong/expired/replayed codes; a new rider lands profile-incomplete.
 *
 * Usage: node test/whatsapp-login-flow.js
 */
const path = require('path');
const { spawn } = require('child_process');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { openPool, connectionOptions } = require('../src/db');

const PORT = 3323;
let passed = 0;
let failed = 0;
function check(name, cond, detail = '') {
  if (cond) { passed++; console.log(`  ok   ${name}`); }
  else { failed++; console.log(`  FAIL ${name} ${detail}`); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function withServer(extraEnv, run) {
  const env = {
    ...process.env,
    PORT: String(PORT),
    DEV_REVEAL_CODES: '1',
    SMS_PROVIDER: '',
    SMS_GATEWAY_URL: '',
    SMS_API_KEY: '',
    WHATSAPP_ACCESS_TOKEN: '',
    WHATSAPP_PHONE_NUMBER_ID: '',
    OTP_RESEND_COOLDOWN: '0',
    RATE_LIMIT_MAX: '100000',
    JWT_SECRET: process.env.JWT_SECRET || 'whatsapp-flow-test-secret',
    ...extraEnv,
  };
  const server = spawn(process.execPath, ['src/index.js'], { cwd: path.join(__dirname, '..'), env });
  let log = '';
  server.stdout.on('data', (d) => { log += d; });
  server.stderr.on('data', (d) => { log += d; });
  const base = `http://localhost:${PORT}/api`;
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
    if (!up) throw new Error(`server did not start:\n${log.slice(-1200)}`);
    await run(api, () => log);
  } finally {
    server.kill();
    await sleep(500);
  }
}

(async () => {
  const db = openPool(connectionOptions());
  const ts = Date.now().toString().slice(-7);
  const newPhone = `+25078${ts}`;
  await withServer({}, async (api) => {
    const providers = await api('GET', '/auth/providers');
    check('phone + email sign-in are advertised (no channel configured locally)', providers.data.phone?.enabled === true && providers.data.email?.enabled === true && providers.data.otp?.ready === false, JSON.stringify(providers.data));

    // A brand-new number: a code is sent and an account is created.
    const start = await api('POST', '/auth/whatsapp/start', { phone: newPhone });
    check('start sends a code and reveals it in dev', start.status === 200 && start.data.otpSent === true && /^\d{6}$/.test(start.data.devCode), JSON.stringify(start.data));
    const wrong = await api('POST', '/auth/whatsapp/verify', { phone: newPhone, code: start.data.devCode === '000000' ? '111111' : '000000' });
    check('a wrong code is refused', wrong.status === 400, `status=${wrong.status}`);
    const verify = await api('POST', '/auth/whatsapp/verify', { phone: newPhone, code: start.data.devCode });
    check('the code returns a session for a new rider (profile incomplete)', verify.status === 200 && verify.data.token && verify.data.passenger.phone === newPhone && verify.data.passenger.isVerified === true && verify.data.passenger.isProfileComplete === false, JSON.stringify(verify.data));
    const replay = await api('POST', '/auth/whatsapp/verify', { phone: newPhone, code: start.data.devCode });
    check('the code cannot be used twice', replay.status === 400, `status=${replay.status}`);
    const me = await api('GET', '/auth/me', undefined, verify.data.token);
    check('the session works', me.status === 200 && me.data.passenger.id === verify.data.passenger.id, JSON.stringify(me.data));

    // An existing password account logs in by phone without its password.
    const pwPhone = `+25079${ts}`;
    const su = await api('POST', '/auth/signup', { fullName: 'Password Rider', phone: pwPhone, email: `wa-${ts}@example.com`, password: 'secret123' });
    await api('POST', '/auth/verify-otp', { passengerId: su.data.passenger.id, code: su.data.devCode }, su.data.token);
    const start2 = await api('POST', '/auth/whatsapp/start', { phone: pwPhone });
    const verify2 = await api('POST', '/auth/whatsapp/verify', { phone: pwPhone, code: start2.data.devCode });
    check('a phone sign-in finds the existing account, does not duplicate it', verify2.status === 200 && verify2.data.passenger.id === su.data.passenger.id && verify2.data.passenger.fullName === 'Password Rider', JSON.stringify(verify2.data));
    const { rows: dupes } = await db.query('SELECT count(*)::int AS n FROM passengers WHERE phone IN ($1,$2)', [pwPhone, pwPhone.replace('+25', '')]);
    check('exactly one row for that phone', dupes[0].n === 1, JSON.stringify(dupes[0]));

    // Matching by the number typed differently than stored (0788 vs +25078…).
    const localForm = '0' + pwPhone.slice(4); // 078…
    const start3 = await api('POST', '/auth/whatsapp/start', { phone: localForm });
    const verify3 = await api('POST', '/auth/whatsapp/verify', { phone: localForm, code: start3.data.devCode });
    check('the same number typed in local form reaches the same account', verify3.status === 200 && verify3.data.passenger.id === su.data.passenger.id, JSON.stringify(verify3.data));

    // An expired code is refused.
    const expPhone = `+25072${ts}`;
    const start4 = await api('POST', '/auth/whatsapp/start', { phone: expPhone });
    await db.query("UPDATE verification_codes SET expires_at = now() - interval '1 minute' WHERE purpose = 'login' AND used_at IS NULL");
    const verify4 = await api('POST', '/auth/whatsapp/verify', { phone: expPhone, code: start4.data.devCode });
    check('an expired code is refused', verify4.status === 400, `status=${verify4.status}`);

    const bad = await api('POST', '/auth/whatsapp/start', { phone: 'not-a-phone' });
    check('a bad phone number is refused', bad.status === 400, `status=${bad.status}`);
  });

  await db.query("DELETE FROM passengers WHERE phone LIKE $1 OR phone LIKE $2", [`%${ts}`, `0%${ts}`]);
  await db.end();
  console.log(`\nWHATSAPP-LOGIN: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('whatsapp-login-flow crashed:', e); process.exit(1); });
