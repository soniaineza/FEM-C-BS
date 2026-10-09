/**
 * The whole "Continue with Google" journey against a server this test starts
 * itself on the local development database, with a fake Google standing in
 * for accounts.google.com (the server only accepts those overrides on a
 * local database):
 *   start -> Google consent -> callback -> one-time code -> session,
 *   then the phone number, the verification code and the verified session;
 *   linking to an existing password account by e-mail; the errors.
 *
 * Usage: node test/google-auth-flow.js
 */
const http = require('http');
const crypto = require('crypto');
const path = require('path');
const { spawn } = require('child_process');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { Pool } = require('pg');

const API_PORT = 3321;
const GOOGLE_PORT = 3322;
const CLIENT_ID = 'test-client.apps.googleusercontent.com';
const CLIENT_SECRET = 'test-secret';
const APP_URL = `http://localhost:${API_PORT}`;
const GOOGLE_URL = `http://localhost:${GOOGLE_PORT}`;

let passed = 0;
let failed = 0;
function check(name, cond, detail = '') {
  if (cond) { passed++; console.log(`  ok   ${name}`); }
  else { failed++; console.log(`  FAIL ${name} ${detail}`); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- a fake Google ---------------------------------------------------------
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'test-key', alg: 'RS256', use: 'sig' };
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
function signIdToken(claims) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64({ alg: 'RS256', kid: 'test-key', typ: 'JWT' });
  const body = b64({ iss: 'https://accounts.google.com', aud: CLIENT_ID, iat: now, exp: now + 3600, ...claims });
  const sig = crypto.sign('RSA-SHA256', Buffer.from(`${header}.${body}`), privateKey).toString('base64url');
  return `${header}.${body}.${sig}`;
}

// The Google account the next consent screen "signs in" as.
let googleUser = null;
let denyNext = false;
const pendingCodes = new Map();
const tokenRequests = [];

function startFakeGoogle() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, GOOGLE_URL);
      if (url.pathname === '/auth') {
        const p = Object.fromEntries(url.searchParams);
        if (denyNext) {
          denyNext = false;
          res.writeHead(302, { Location: `${p.redirect_uri}?error=access_denied&state=${encodeURIComponent(p.state)}` });
          return res.end();
        }
        const code = `gcode-${crypto.randomBytes(8).toString('hex')}`;
        pendingCodes.set(code, { ...googleUser, nonce: p.nonce, redirect_uri: p.redirect_uri, scope: p.scope });
        res.writeHead(302, { Location: `${p.redirect_uri}?code=${code}&state=${encodeURIComponent(p.state)}` });
        return res.end();
      }
      if (url.pathname === '/token' && req.method === 'POST') {
        let raw = '';
        req.on('data', (d) => { raw += d; });
        req.on('end', () => {
          const form = Object.fromEntries(new URLSearchParams(raw));
          tokenRequests.push(form);
          const account = pendingCodes.get(form.code);
          pendingCodes.delete(form.code);
          const ok = account && form.client_id === CLIENT_ID && form.client_secret === CLIENT_SECRET
            && form.grant_type === 'authorization_code' && form.redirect_uri === account.redirect_uri;
          res.setHeader('Content-Type', 'application/json');
          if (!ok) { res.writeHead(400); return res.end(JSON.stringify({ error: 'invalid_grant', error_description: 'Bad Request' })); }
          const { nonce, redirect_uri, scope, ...claims } = account; // eslint-disable-line no-unused-vars
          res.writeHead(200);
          res.end(JSON.stringify({ access_token: 'fake-access-token', expires_in: 3599, scope, token_type: 'Bearer', id_token: signIdToken({ ...claims, nonce }) }));
        });
        return;
      }
      if (url.pathname === '/certs') {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' });
        return res.end(JSON.stringify({ keys: [jwk] }));
      }
      res.writeHead(404);
      res.end();
    });
    server.listen(GOOGLE_PORT, () => resolve(server));
  });
}

// ---- the API under test -------------------------------------------------------
async function withServer(port, extraEnv, run) {
  const env = {
    ...process.env,
    PORT: String(port),
    DEV_REVEAL_CODES: '1',
    SMS_PROVIDER: '',
    SMS_GATEWAY_URL: '',
    SMS_API_KEY: '',
    WHATSAPP_ACCESS_TOKEN: '',
    WHATSAPP_PHONE_NUMBER_ID: '',
    OTP_RESEND_COOLDOWN: '0',
    RATE_LIMIT_MAX: '100000',
    JWT_SECRET: process.env.JWT_SECRET || 'google-flow-test-secret',
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
      redirect: 'manual',
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    return { status: res.status, data, location: res.headers.get('location') };
  };
  try {
    let up = false;
    for (let i = 0; i < 160 && !up; i++) {
      try { up = (await fetch(`${base}/health`)).ok; } catch { /* booting */ }
      if (!up) await sleep(250);
    }
    if (!up) throw new Error(`server did not start:\n${log.slice(-1200)}`);
    await run(api, () => log, base);
  } finally {
    server.kill();
    await sleep(500);
  }
}

/** Walks start -> fake Google -> callback and returns the final redirect. */
async function signInWithGoogle(api, platform = 'native', extra = '') {
  const start = await api('GET', `/auth/google/start?platform=${platform}${extra}`);
  if (start.status !== 302) return { start, status: start.status, location: null, data: start.data };
  const consent = await fetch(start.location, { redirect: 'manual' });
  const callbackUrl = consent.headers.get('location');
  const callback = await fetch(callbackUrl, { redirect: 'manual' });
  return { start, consentUrl: start.location, callbackUrl, status: callback.status, location: callback.headers.get('location'), text: await callback.text() };
}
const codeFrom = (location) => new URL(location).searchParams.get('code');
const errorFrom = (location) => new URL(location).searchParams.get('error');

(async () => {
  const db = new Pool({ connectionString: process.env.DATABASE_URL });
  const fakeGoogle = await startFakeGoogle();
  const ts = Date.now().toString().slice(-7);
  const mail = (n) => `google-flow-${n}-${ts}@example.com`;
  const phone = (n) => `+25078${n}${ts.slice(1)}`;

  // ---- not configured: no button, no endpoints ----
  await withServer(API_PORT, { GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '' }, async (api) => {
    const providers = await api('GET', '/auth/providers');
    check('providers: Google is off until the keys exist', providers.status === 200 && providers.data.google.enabled === false && providers.data.password === true, JSON.stringify(providers.data));
    const start = await api('GET', '/auth/google/start?platform=native');
    check('start is a 404 while Google is not configured', start.status === 404, `status=${start.status}`);
    const exchange = await api('POST', '/auth/google/exchange', { code: 'x'.repeat(43) });
    check('an unknown login code is refused', exchange.status === 401, `status=${exchange.status}`);
  });

  // ---- configured, against the fake Google ----
  const env = {
    GOOGLE_CLIENT_ID: CLIENT_ID,
    GOOGLE_CLIENT_SECRET: CLIENT_SECRET,
    PUBLIC_URL: APP_URL,
    WEB_APP_URL: '',
    GOOGLE_AUTH_URL: `${GOOGLE_URL}/auth`,
    GOOGLE_TOKEN_URL: `${GOOGLE_URL}/token`,
    GOOGLE_JWKS_URL: `${GOOGLE_URL}/certs`,
  };
  await withServer(API_PORT, env, async (api, log) => {
    const providers = await api('GET', '/auth/providers');
    check('providers: Google is on as soon as the keys are set', providers.data.google.enabled === true, JSON.stringify(providers.data));

    // A brand-new rider arrives through Google.
    googleUser = { sub: `sub-new-${ts}`, email: mail('new'), email_verified: true, name: 'Grace Uwase', picture: 'https://lh3.example/grace.jpg' };
    const first = await signInWithGoogle(api);
    check('start sends the browser to Google with the registered callback', first.consentUrl.startsWith(`${GOOGLE_URL}/auth?`) && new URL(first.consentUrl).searchParams.get('redirect_uri') === `${APP_URL}/api/auth/google/callback`, first.consentUrl);
    check('callback returns into the app with a one-time code', first.status === 302 && first.location.startsWith('femcabs://google?code='), `${first.status} ${first.location}`);
    check('the token exchange carried the client secret and nonce came back', tokenRequests.length === 1 && tokenRequests[0].client_secret === CLIENT_SECRET, JSON.stringify(tokenRequests));
    const code = codeFrom(first.location);
    const session = await api('POST', '/auth/google/exchange', { code });
    check('the code becomes a session for a rider without a phone yet', session.status === 200 && session.data.token && session.data.needsPhone === true && session.data.passenger.email === mail('new') && session.data.passenger.isVerified === false && session.data.passenger.hasPassword === false && session.data.passenger.googleLinked === true, JSON.stringify(session.data));
    check('the Google name and photo came along', session.data.passenger.fullName === 'Grace Uwase' && session.data.passenger.photoUrl === 'https://lh3.example/grace.jpg', JSON.stringify(session.data.passenger));
    const replay = await api('POST', '/auth/google/exchange', { code });
    check('a login code works once only', replay.status === 401, `status=${replay.status}`);
    const token = session.data.token;
    const me = await api('GET', '/auth/me', undefined, token);
    check('the session is real', me.status === 200 && me.data.passenger.id === session.data.passenger.id && me.data.passenger.phone == null, JSON.stringify(me.data));
    const blocked = await api('GET', '/rides', undefined, token);
    check('rider features stay closed until the phone is verified', blocked.status === 403, `status=${blocked.status}`);
    const noPhone = await api('POST', '/auth/resend-otp', { purpose: 'signup' }, token);
    check('no code can be sent before a phone exists', noPhone.status === 400, `status=${noPhone.status}`);

    // The app collects the phone; the code goes to it.
    const badPhone = await api('POST', '/auth/phone', { phone: 'abc' }, token);
    check('a bad phone number is refused', badPhone.status === 400, `status=${badPhone.status}`);
    const taken = await api('POST', '/auth/signup', { fullName: 'Taken Phone', phone: phone(1), email: mail('taken'), password: 'secret123' });
    const dup = await api('POST', '/auth/phone', { phone: phone(1) }, token);
    check('a phone another account uses is refused', taken.status === 201 && dup.status === 409, `signup=${taken.status} phone=${dup.status}`);
    const added = await api('POST', '/auth/phone', { phone: phone(2) }, token);
    check('adding the phone sends the verification code', added.status === 200 && added.data.otpSent === true && /^\d{6}$/.test(added.data.devCode) && added.data.passenger.phone === phone(2), JSON.stringify(added.data));
    const wrong = await api('POST', '/auth/verify-otp', { passengerId: session.data.passenger.id, code: added.data.devCode === '000000' ? '111111' : '000000' }, token);
    check('a wrong code is refused', wrong.status === 400, `status=${wrong.status}`);
    const verified = await api('POST', '/auth/verify-otp', { passengerId: session.data.passenger.id, code: added.data.devCode }, token);
    const meAfter = await api('GET', '/auth/me', undefined, token);
    check('the code verifies the phone and opens the app', verified.status === 200 && meAfter.data.passenger.isVerified === true && meAfter.data.passenger.phone === phone(2), JSON.stringify(meAfter.data));
    const open = await api('GET', '/rides', undefined, token);
    check('rider features open after verification', open.status === 200, `status=${open.status}`);
    const again = await api('POST', '/auth/phone', { phone: phone(3) }, token);
    check('a verified phone cannot be swapped through the sign-up endpoint', again.status === 409, `status=${again.status}`);

    // The same Google account comes back: same rider, straight in.
    const second = await signInWithGoogle(api);
    const session2 = await api('POST', '/auth/google/exchange', { code: codeFrom(second.location) });
    check('the same Google account signs into the same rider', session2.status === 200 && session2.data.passenger.id === session.data.passenger.id && session2.data.needsPhone === false && session2.data.passenger.isVerified === true, JSON.stringify(session2.data));

    // Password login for a Google-only account explains itself.
    const pwLogin = await api('POST', '/auth/login', { identifier: mail('new'), password: 'whatever1' });
    check('a Google account has no password to log in with', pwLogin.status === 401 && pwLogin.data.code === 'google_account' && /Google/.test(pwLogin.data.error), JSON.stringify(pwLogin.data));
    const reset = await api('POST', '/auth/reset-password/request', { identifier: mail('new') });
    check('a password reset can set one (code goes to the verified phone)', reset.status === 200 && /^\d{6}$/.test(reset.data.devCode), JSON.stringify(reset.data));
    const confirm = await api('POST', '/auth/reset-password/confirm', { identifier: mail('new'), code: reset.data.devCode, newPassword: 'newsecret456' });
    const pwLogin2 = await api('POST', '/auth/login', { identifier: mail('new'), password: 'newsecret456' });
    check('after setting a password, both ways in work', confirm.status === 200 && pwLogin2.status === 200 && pwLogin2.data.passenger.hasPassword === true, `confirm=${confirm.status} login=${pwLogin2.status}`);

    // An existing password account with the same e-mail gets linked.
    const existing = await api('POST', '/auth/signup', { fullName: 'Existing Rider', phone: phone(4), email: mail('existing'), password: 'secret123' });
    await api('POST', '/auth/verify-otp', { passengerId: existing.data.passenger.id, code: existing.data.devCode }, existing.data.token);
    googleUser = { sub: `sub-existing-${ts}`, email: mail('existing').toUpperCase(), email_verified: true, name: 'Someone Else' };
    const linked = await signInWithGoogle(api);
    const linkedSession = await api('POST', '/auth/google/exchange', { code: codeFrom(linked.location) });
    check('a verified Google e-mail links to the existing account (case-insensitively), keeping its name', linkedSession.status === 200 && linkedSession.data.passenger.id === existing.data.passenger.id && linkedSession.data.passenger.fullName === 'Existing Rider' && linkedSession.data.passenger.googleLinked === true && linkedSession.data.needsPhone === false, JSON.stringify(linkedSession.data));
    const stillPassword = await api('POST', '/auth/login', { identifier: mail('existing'), password: 'secret123' });
    check('the linked account still logs in with its password', stillPassword.status === 200, `status=${stillPassword.status}`);
    googleUser = { sub: `sub-other-${ts}`, email: mail('existing'), email_verified: true, name: 'Impostor' };
    const clash = await signInWithGoogle(api);
    check('a different Google account with that e-mail cannot take the link over', errorFrom(clash.location) === 'linked_elsewhere', clash.location);

    // Unverified Google e-mail: no account is made from it.
    googleUser = { sub: `sub-unverified-${ts}`, email: mail('unverified'), email_verified: false, name: 'No Mail' };
    const unverified = await signInWithGoogle(api);
    const { rows: ghosts } = await db.query('SELECT 1 FROM passengers WHERE email = $1', [mail('unverified')]);
    check('an unverified Google e-mail is refused and creates nothing', errorFrom(unverified.location) === 'email_unverified' && ghosts.length === 0, unverified.location);

    // Cancelling on Google's screen.
    denyNext = true;
    googleUser = { sub: `sub-cancel-${ts}`, email: mail('cancel'), email_verified: true };
    const cancelled = await signInWithGoogle(api);
    check('cancelling at Google returns to the app as cancelled', errorFrom(cancelled.location) === 'cancelled', cancelled.location);

    // A forged or stale state cannot redirect anywhere.
    const forged = await api('GET', `/auth/google/callback?code=abc&state=${encodeURIComponent('eyJ0IjoiaHR0cHM6Ly9ldmlsLmV4YW1wbGUifQ.forged')}`);
    check('a forged state is refused without redirecting', forged.status === 400 && !forged.location, `status=${forged.status} location=${forged.location}`);
    const noState = await api('GET', '/auth/google/callback?code=abc');
    check('a callback without state is refused', noState.status === 400, `status=${noState.status}`);

    // A Google code that Google refuses (replayed / stolen) fails cleanly.
    googleUser = { sub: `sub-replay-${ts}`, email: mail('replay'), email_verified: true };
    const replayed = await signInWithGoogle(api);
    const callbackAgain = await fetch(replayed.callbackUrl, { redirect: 'manual' });
    check('replaying Google\'s callback fails because Google refuses the used code', errorFrom(callbackAgain.headers.get('location')) === 'failed', callbackAgain.headers.get('location'));

    // Web: returns to the web app, only on an allowed address.
    googleUser = { sub: `sub-web-${ts}`, email: mail('web'), email_verified: true, name: 'Web Rider' };
    const web = await signInWithGoogle(api, 'web', '&return=' + encodeURIComponent('http://localhost:8081/anything'));
    check('a browser sign-in returns to the web app page with the code', web.status === 302 && web.location.startsWith('http://localhost:8081/google?code='), `${web.status} ${web.location}`);
    const webSession = await api('POST', '/auth/google/exchange', { code: codeFrom(web.location) });
    check('the web code is exchanged the same way', webSession.status === 200 && webSession.data.passenger.email === mail('web'), JSON.stringify(webSession.data));
    const evil = await api('GET', '/auth/google/start?platform=web&return=' + encodeURIComponent('https://evil.example'));
    check('an unknown web address cannot receive login codes', evil.status === 400, `status=${evil.status} ${JSON.stringify(evil.data)}`);

    // An expired login code.
    googleUser = { sub: `sub-expired-${ts}`, email: mail('expired'), email_verified: true };
    const late = await signInWithGoogle(api);
    await db.query("UPDATE login_codes SET expires_at = now() - interval '1 minute' WHERE used_at IS NULL");
    const expired = await api('POST', '/auth/google/exchange', { code: codeFrom(late.location) });
    check('an expired login code is refused', expired.status === 401, `status=${expired.status}`);

    // The native-SDK path: an ID token straight from Google.
    const direct = await api('POST', '/auth/google/token', { idToken: signIdToken({ sub: `sub-sdk-${ts}`, email: mail('sdk'), email_verified: true, name: 'SDK Rider' }) });
    check('an ID token from the Google SDK signs in too', direct.status === 201 && direct.data.token && direct.data.needsPhone === true && direct.data.passenger.email === mail('sdk'), JSON.stringify(direct.data));
    const forgedToken = await api('POST', '/auth/google/token', { idToken: signIdToken({ sub: 'x', email: mail('forged'), email_verified: true, aud: 'another-app' }) });
    check('an ID token for another app is refused', forgedToken.status === 401, `status=${forgedToken.status}`);

    check('no session token or client secret was written to the server log', !log().includes(CLIENT_SECRET) && !log().includes(token));
    check('every login code hash is stored, never the code', (await db.query("SELECT 1 FROM login_codes WHERE code_hash = $1", [codeFrom(first.location)])).rows.length === 0);
  });

  // Hosted servers ignore the fake-Google overrides. Exercised through the
  // config module directly: a hosted DATABASE_URL must not be contacted.
  const { spawnSync } = require('child_process');
  const hosted = spawnSync(process.execPath, ['-e', `
    process.env.DATABASE_URL='postgres://u:p@db.example.com:5432/kimu';
    process.env.GOOGLE_TOKEN_URL='http://localhost:9/token';
    const { config } = require('./src/config');
    console.log(config.googleTokenUrl);
  `], { cwd: path.join(__dirname, '..'), encoding: 'utf8' });
  check('a hosted server always talks to the real Google', hosted.stdout.trim() === 'https://oauth2.googleapis.com/token', hosted.stdout + hosted.stderr);

  fakeGoogle.close();
  await db.end();
  console.log(`\nGOOGLE-FLOW: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('google-auth-flow crashed:', e); process.exit(1); });
