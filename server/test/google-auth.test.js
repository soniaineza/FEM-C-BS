// Google sign-in building blocks, offline: signed state, Google requests,
// ID-token verification against a key pair generated here, return addresses.
//   npm run test:google-auth
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

process.env.MYSQL_HOST = process.env.MYSQL_HOST || 'localhost';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'unit-test-secret';
const { config, corsOrigins } = require('../src/config');
const google = require('../src/services/googleAuth');

const CLIENT_ID = 'test-client.apps.googleusercontent.com';
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const other = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'key-1', alg: 'RS256', use: 'sig' };

function b64(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}
function idToken(claims, { kid = 'key-1', key = privateKey } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64({ alg: 'RS256', kid, typ: 'JWT' });
  const body = b64({ iss: 'https://accounts.google.com', aud: CLIENT_ID, sub: '1234567890', email: 'Rider@Example.com', email_verified: true, name: 'Grace Uwase', iat: now, exp: now + 3600, ...claims });
  const sig = crypto.sign('RSA-SHA256', Buffer.from(`${header}.${body}`), key).toString('base64url');
  return `${header}.${body}.${sig}`;
}

let calls;
function respond(status, body, headers = {}) {
  return { ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body), headers: { get: (k) => headers[k.toLowerCase()] ?? null } };
}
function fakeFetch(plan) {
  return async (url, init = {}) => {
    calls.push({ url, init });
    const next = plan.shift();
    if (!next) throw new Error(`unexpected request to ${url}`);
    return typeof next === 'function' ? next(url, init) : next;
  };
}
const jwksResponse = () => respond(200, { keys: [jwk] }, { 'cache-control': 'public, max-age=3600' });

beforeEach(() => {
  calls = [];
  Object.assign(config, {
    jwtSecret: 'unit-test-secret',
    googleClientId: CLIENT_ID,
    googleClientSecret: 'test-secret',
    googleRedirectUri: '',
    publicUrl: 'https://api.kimu.example',
    webAppUrl: 'https://app.kimu.example',
    appScheme: 'femcabs',
    localDatabase: false,
    googleAuthUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    googleTokenUrl: 'https://oauth2.googleapis.com/token',
    googleJwksUrl: 'https://www.googleapis.com/oauth2/v3/certs',
  });
  google._internals.now = () => Date.now();
  // A fresh key cache per test: force a JWKS fetch by expiring it.
  google._internals.fetch = fakeFetch([]);
});

test('state survives the round trip and carries its payload', () => {
  const state = google.signState({ p: 'native', t: 'femcabs://google', n: 'abc' });
  const read = google.readState(state);
  assert.equal(read.p, 'native');
  assert.equal(read.t, 'femcabs://google');
  assert.equal(read.n, 'abc');
});

test('a tampered or expired state is rejected', () => {
  const state = google.signState({ p: 'web', t: 'https://app.kimu.example/google', n: 'n' });
  const [body, sig] = state.split('.');
  const evil = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, 'base64url')), t: 'https://evil.example/x' })).toString('base64url');
  assert.equal(google.readState(`${evil}.${sig}`), null);
  assert.equal(google.readState(`${body}.${sig.slice(0, -2)}AA`), null);
  assert.equal(google.readState('garbage'), null);
  assert.equal(google.readState(''), null);
  google._internals.now = () => Date.now() + 11 * 60 * 1000;
  assert.equal(google.readState(state), null);
});

test('the authorization URL asks Google for an OpenID code with state and nonce', () => {
  const url = new URL(google.authorizationUrl({ redirectUri: 'https://api.kimu.example/api/auth/google/callback', state: 's1', nonce: 'n1' }));
  assert.equal(url.origin + url.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  assert.equal(url.searchParams.get('client_id'), CLIENT_ID);
  assert.equal(url.searchParams.get('redirect_uri'), 'https://api.kimu.example/api/auth/google/callback');
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('scope'), 'openid email profile');
  assert.equal(url.searchParams.get('state'), 's1');
  assert.equal(url.searchParams.get('nonce'), 'n1');
  assert.equal(url.searchParams.get('prompt'), 'select_account');
});

test('the code exchange posts the client secret as a form to the token endpoint', async () => {
  google._internals.fetch = fakeFetch([respond(200, { id_token: 'x.y.z', access_token: 'at' })]);
  const tokens = await google.exchangeCode({ code: 'c0de', redirectUri: 'https://api.kimu.example/api/auth/google/callback' });
  assert.equal(tokens.id_token, 'x.y.z');
  assert.equal(calls[0].url, 'https://oauth2.googleapis.com/token');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers['Content-Type'], 'application/x-www-form-urlencoded');
  const form = new URLSearchParams(calls[0].init.body);
  assert.equal(form.get('code'), 'c0de');
  assert.equal(form.get('client_id'), CLIENT_ID);
  assert.equal(form.get('client_secret'), 'test-secret');
  assert.equal(form.get('redirect_uri'), 'https://api.kimu.example/api/auth/google/callback');
  assert.equal(form.get('grant_type'), 'authorization_code');
});

test('a refused code exchange reports Google\'s reason', async () => {
  google._internals.fetch = fakeFetch([respond(400, { error: 'invalid_grant', error_description: 'Bad Request' })]);
  await assert.rejects(() => google.exchangeCode({ code: 'bad', redirectUri: 'r' }), /invalid_grant|Bad Request/);
});

test('a valid ID token yields the profile with a lower-cased e-mail', async () => {
  google._internals.fetch = fakeFetch([jwksResponse()]);
  const profile = await google.verifyIdToken(idToken({ nonce: 'n1', picture: 'https://lh3.example/p.jpg' }), { nonce: 'n1' });
  assert.deepEqual(profile, { sub: '1234567890', email: 'rider@example.com', emailVerified: true, name: 'Grace Uwase', picture: 'https://lh3.example/p.jpg' });
  assert.equal(calls.length, 1, 'keys fetched once');
  assert.equal(calls[0].url, 'https://www.googleapis.com/oauth2/v3/certs');
  // The cache serves the second verification without a request.
  await google.verifyIdToken(idToken({}));
  assert.equal(calls.length, 1);
});

test('ID tokens for another app, expired, with a wrong nonce, issuer or signature are refused', async () => {
  google._internals.fetch = fakeFetch([jwksResponse(), jwksResponse(), jwksResponse(), jwksResponse(), jwksResponse(), jwksResponse(), jwksResponse(), jwksResponse()]);
  await assert.rejects(() => google.verifyIdToken(idToken({ aud: 'someone-else' })), /another application/);
  await assert.rejects(() => google.verifyIdToken(idToken({ exp: Math.floor(Date.now() / 1000) - 600 })), /expired/);
  await assert.rejects(() => google.verifyIdToken(idToken({ nonce: 'other' }), { nonce: 'n1' }), /nonce/);
  await assert.rejects(() => google.verifyIdToken(idToken({ iss: 'https://evil.example' })), /issuer/);
  await assert.rejects(() => google.verifyIdToken(idToken({}, { key: other.privateKey })), /signature/);
  await assert.rejects(() => google.verifyIdToken('not.a.jwt'), /Malformed/);
  const [h, b] = idToken({}).split('.');
  await assert.rejects(() => google.verifyIdToken(`${h}.${b}.`), /signature/);
});

test('an unknown key id triggers one fresh key fetch, then fails', async () => {
  // Two hours on: the key cache from the earlier tests has gone stale.
  google._internals.now = () => Date.now() + 2 * 60 * 60 * 1000;
  google._internals.fetch = fakeFetch([jwksResponse(), jwksResponse()]);
  await assert.rejects(() => google.verifyIdToken(idToken({}, { kid: 'rotated' })), /unknown key/);
  assert.equal(calls.length, 2);
});

test('the callback address follows the configuration, or the request on a local server', () => {
  assert.equal(google.callbackUrl(), 'https://api.kimu.example/api/auth/google/callback');
  config.googleRedirectUri = 'https://custom.example/cb';
  assert.equal(google.callbackUrl(), 'https://custom.example/cb');
  config.googleRedirectUri = '';
  config.publicUrl = '';
  assert.equal(google.callbackUrl(), '', 'hosted server without PUBLIC_URL has no callback');
  config.localDatabase = true;
  const req = { protocol: 'http', get: () => 'localhost:3000' };
  assert.equal(google.callbackUrl(req), 'http://localhost:3000/api/auth/google/callback');
});

test('web sign-ins may only return to trusted origins, always at /auth/google', () => {
  const req = { protocol: 'http', get: () => 'localhost:3000' };
  assert.equal(google.webReturnUrl(req), 'https://app.kimu.example/google');
  assert.equal(google.webReturnUrl(req, 'https://app.kimu.example/some/page?x=1'), 'https://app.kimu.example/google');
  assert.throws(() => google.webReturnUrl(req, 'https://evil.example'), /not allowed/);
  assert.throws(() => google.webReturnUrl(req, 'http://localhost:8081'), /not allowed/, 'local dev servers are not trusted by a hosted server');
  corsOrigins.push('https://partner.example');
  assert.equal(google.webReturnUrl(req, 'https://partner.example'), 'https://partner.example/google');
  corsOrigins.pop();
  config.localDatabase = true;
  assert.equal(google.webReturnUrl(req, 'http://localhost:8081'), 'http://localhost:8081/google');
  assert.equal(google.webReturnUrl(req, 'http://127.0.0.1:19006/'), 'http://127.0.0.1:19006/google');
  assert.throws(() => google.webReturnUrl(req, 'https://evil.example'), /not allowed/);
  config.webAppUrl = '';
  assert.equal(google.webReturnUrl(req), 'http://localhost:3000/google');
});

test('return addresses get their query appended whatever the scheme', () => {
  assert.equal(google.withQuery('femcabs://google', { code: 'a b' }), 'femcabs://google?code=a+b');
  assert.equal(google.withQuery('https://app.kimu.example/google?x=1', { error: 'cancelled' }), 'https://app.kimu.example/google?x=1&error=cancelled');
  assert.equal(new URL(google.withQuery('femcabs://google', { code: 'xyz' })).searchParams.get('code'), 'xyz');
});

test('login codes are only hashed, and implausible codes never reach the database', async () => {
  const db = { query: async () => { throw new Error('database must not be queried'); } };
  assert.equal(await google.redeemLoginCode(db, 'short'), null);
  assert.equal(await google.redeemLoginCode(db, undefined), null);
  assert.equal(await google.redeemLoginCode(db, 'x'.repeat(500)), null);
  assert.equal(google.hashLoginCode('abc').length, 64);
  assert.notEqual(google.hashLoginCode('abc'), google.hashLoginCode('abd'));
});

test('status exposes no secret', () => {
  const status = google.status({ protocol: 'https', get: () => 'api.kimu.example' });
  assert.equal(status.enabled, true);
  assert.ok(!JSON.stringify(status).includes('test-secret'));
  assert.ok(status.clientId.includes('…'));
  assert.equal(status.redirectUri, 'https://api.kimu.example/api/auth/google/callback');
  assert.equal(status.appReturnUrl, 'femcabs://google');
  config.googleClientSecret = '';
  assert.equal(google.isConfigured(), false);
});
