const crypto = require('crypto');

const { config, corsOrigins } = require('../config');
const { ApiError } = require('../utils/asyncHandler');

/**
 * "Continue with Google" for riders, done entirely on the server with the
 * OAuth 2.0 authorization-code flow (OpenID Connect):
 *
 *   1. GET /api/auth/google/start      -> 302 to Google's consent screen
 *   2. Google -> GET /api/auth/google/callback?code&state
 *   3. the server swaps the code for an ID token (needs the client secret,
 *      which never leaves this process), checks the token's signature and
 *      claims, finds or creates the rider, and hands the app a ONE-TIME
 *      login code: 302 to femcabs://auth/google?code=… (phone) or to
 *      <web app>/auth/google?code=… (browser)
 *   4. POST /api/auth/google/exchange { code } -> session token
 *
 * The app therefore needs no Google SDK, no SHA-1 fingerprints and no
 * client ID of its own; GET /api/auth/providers tells it whether the Google
 * button exists at all. POST /api/auth/google/token accepts an ID token from
 * the native Google Sign-In SDK too, should an app ever use it.
 */

// Replaced by the test suite to observe requests and control time.
const _internals = { fetch: (...args) => fetch(...args), now: () => Date.now() };

const STATE_TTL_MS = 10 * 60 * 1000;
const CLOCK_SKEW_S = 60;

function isConfigured() {
  return Boolean(config.googleClientId && config.googleClientSecret);
}

function b64url(input) {
  return Buffer.from(input).toString('base64url');
}

function hmac(body) {
  return crypto.createHmac('sha256', config.jwtSecret).update(body).digest();
}

// ---- state --------------------------------------------------------------
// What the start request knew (platform, where to return, the nonce) travels
// to Google and back inside `state`, signed so nobody can forge a return
// address, and short-lived so a stale link cannot be replayed.

function signState(payload) {
  const body = b64url(JSON.stringify({ ...payload, exp: _internals.now() + STATE_TTL_MS }));
  return `${body}.${b64url(hmac(body))}`;
}

function readState(state) {
  const [body, signature] = String(state || '').split('.');
  if (!body || !signature) return null;
  const expected = hmac(body);
  const given = Buffer.from(signature, 'base64url');
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!payload || typeof payload.exp !== 'number' || payload.exp < _internals.now()) return null;
  return payload;
}

// ---- addresses ----------------------------------------------------------

/** The server's own origin as seen from outside, for a local server. */
function requestOrigin(req) {
  return req ? `${req.protocol}://${req.get('host')}` : '';
}

/** Where Google sends people back: must equal the URI registered with Google. */
function callbackUrl(req) {
  if (config.googleRedirectUri) return config.googleRedirectUri;
  const base = config.publicUrl || (config.localDatabase ? requestOrigin(req) : '');
  return base ? `${base}/api/auth/google/callback` : '';
}

function originOf(url) {
  try {
    return new URL(url).origin;
  } catch {
    return '';
  }
}

function isLocalOrigin(origin) {
  return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(origin);
}

/**
 * The web app page that finishes a browser sign-in. Only origins this server
 * already trusts (its own web app, the CORS list, local dev servers on a
 * local database) are accepted, and the path is always /auth/google, so a
 * crafted link cannot send a login code anywhere else.
 */
function webReturnUrl(req, requested) {
  const allowed = new Set(
    [config.webAppUrl, ...corsOrigins.filter((o) => o && o !== '*')].map(originOf).filter(Boolean)
  );
  if (config.localDatabase) allowed.add(requestOrigin(req));
  const wanted = requested ? originOf(String(requested)) : '';
  let origin = '';
  if (wanted && (allowed.has(wanted) || (config.localDatabase && isLocalOrigin(wanted)))) origin = wanted;
  else if (!wanted && config.webAppUrl) origin = originOf(config.webAppUrl);
  else if (!wanted && config.localDatabase) origin = requestOrigin(req);
  if (!origin) throw new ApiError(400, 'That web address is not allowed to finish a Google sign-in.');
  // expo-router drops the (auth) route group from the URL, so the screen at
  // app/(auth)/google.tsx is reached at /google, not /auth/google.
  return `${origin}/google`;
}

function appReturnUrl() {
  return `${config.appScheme}://google`;
}

/** Appends query parameters to a return address (custom scheme or https). */
function withQuery(target, params) {
  const query = new URLSearchParams(params).toString();
  return `${target}${target.includes('?') ? '&' : '?'}${query}`;
}

// ---- Google -------------------------------------------------------------

function authorizationUrl({ redirectUri, state, nonce }) {
  const params = new URLSearchParams({
    client_id: config.googleClientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    nonce,
    prompt: 'select_account',
    access_type: 'online',
  });
  return `${config.googleAuthUrl}?${params.toString()}`;
}

/** Swaps the authorization code for Google's tokens. */
async function exchangeCode({ code, redirectUri }) {
  const body = new URLSearchParams({
    code,
    client_id: config.googleClientId,
    client_secret: config.googleClientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });
  const res = await _internals.fetch(config.googleTokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: body.toString(),
    signal: AbortSignal.timeout(10000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.id_token) {
    const reason = data.error_description || data.error || `HTTP ${res.status}`;
    throw new Error(`Google token exchange failed: ${reason}`);
  }
  return data;
}

// Google's signing keys, cached for as long as Google says they are fresh.
let jwksCache = { keys: [], expiresAt: 0 };

async function fetchJwks() {
  const res = await _internals.fetch(config.googleJwksUrl, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`Could not load Google's signing keys (HTTP ${res.status}).`);
  const data = await res.json();
  const maxAge = /max-age=(\d+)/.exec(res.headers?.get?.('cache-control') || '');
  jwksCache = {
    keys: Array.isArray(data.keys) ? data.keys : [],
    expiresAt: _internals.now() + (maxAge ? Number(maxAge[1]) * 1000 : 60 * 60 * 1000),
  };
  return jwksCache.keys;
}

async function signingKey(kid) {
  let keys = jwksCache.expiresAt > _internals.now() ? jwksCache.keys : await fetchJwks();
  let jwk = keys.find((k) => k.kid === kid);
  if (!jwk) {
    // Google rotates keys; an unknown id is fetched once more, not trusted.
    keys = await fetchJwks();
    jwk = keys.find((k) => k.kid === kid);
  }
  if (!jwk) throw new Error('The ID token was signed with an unknown key.');
  return crypto.createPublicKey({ key: jwk, format: 'jwk' });
}

function decodeSegment(segment) {
  return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
}

/**
 * Checks an ID token's RS256 signature against Google's published keys and
 * its claims (issuer, audience, expiry, nonce), returning the profile.
 * Required even for tokens fetched straight from Google: the same code path
 * also serves tokens handed in by the native SDK.
 */
async function verifyIdToken(idToken, { nonce } = {}) {
  const parts = String(idToken || '').split('.');
  if (parts.length !== 3) throw new Error('Malformed ID token.');
  let header;
  let claims;
  try {
    header = decodeSegment(parts[0]);
    claims = decodeSegment(parts[1]);
  } catch {
    throw new Error('Malformed ID token.');
  }
  if (header.alg !== 'RS256' || !header.kid) throw new Error('Unsupported ID token signature.');
  const key = await signingKey(header.kid);
  const valid = crypto.verify(
    'RSA-SHA256',
    Buffer.from(`${parts[0]}.${parts[1]}`),
    key,
    Buffer.from(parts[2], 'base64url')
  );
  if (!valid) throw new Error('ID token signature does not verify.');

  const nowS = Math.floor(_internals.now() / 1000);
  if (!config.googleIssuers.includes(claims.iss)) throw new Error(`Unexpected ID token issuer: ${claims.iss}`);
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audiences.includes(config.googleClientId)) throw new Error('ID token was issued for another application.');
  if (typeof claims.exp !== 'number' || claims.exp + CLOCK_SKEW_S < nowS) throw new Error('ID token has expired.');
  if (typeof claims.iat === 'number' && claims.iat - CLOCK_SKEW_S > nowS) throw new Error('ID token is not valid yet.');
  if (nonce && claims.nonce !== nonce) throw new Error('ID token nonce mismatch.');
  if (!claims.sub) throw new Error('ID token has no subject.');

  return {
    sub: String(claims.sub),
    email: typeof claims.email === 'string' ? claims.email.trim().toLowerCase() : '',
    emailVerified: claims.email_verified === true || claims.email_verified === 'true',
    name: typeof claims.name === 'string' ? claims.name.trim() : '',
    picture: typeof claims.picture === 'string' ? claims.picture : null,
  };
}

// ---- riders -------------------------------------------------------------

function displayName(profile) {
  if (profile.name) return profile.name.slice(0, 120);
  const local = profile.email.split('@')[0] || 'Rider';
  return local.replace(/[._-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 120);
}

/**
 * The rider this Google account belongs to: matched by Google's stable
 * subject id, else linked to an existing account with the same verified
 * e-mail, else created. New Google riders have no phone and no password
 * yet; the app collects the phone next and verifies it with a code.
 */
async function findOrCreatePassenger(db, profile) {
  let { rows } = await db.query('SELECT * FROM passengers WHERE google_sub = $1 AND deleted_at IS NULL', [profile.sub]);
  if (rows[0]) {
    if (!rows[0].photo_url && profile.picture) {
      ({ rows } = await db.query('UPDATE passengers SET photo_url = $2 WHERE id = $1 RETURNING *', [rows[0].id, profile.picture]));
    }
    return { passenger: rows[0], created: false };
  }
  if (!profile.email || !profile.emailVerified) {
    throw new ApiError(400, 'Your Google account has no verified e-mail address, so it cannot be used to sign in.');
  }
  ({ rows } = await db.query('SELECT * FROM passengers WHERE email = $1 AND deleted_at IS NULL', [profile.email]));
  if (rows[0]) {
    if (rows[0].google_sub && rows[0].google_sub !== profile.sub) {
      throw new ApiError(409, 'This e-mail address is already linked to a different Google account.');
    }
    ({ rows } = await db.query(
      `UPDATE passengers SET google_sub = $2, google_linked_at = now(), photo_url = COALESCE(photo_url, $3)
       WHERE id = $1 RETURNING *`,
      [rows[0].id, profile.sub, profile.picture]
    ));
    return { passenger: rows[0], created: false };
  }
  ({ rows } = await db.query(
    `INSERT INTO passengers (full_name, email, google_sub, google_linked_at, photo_url)
     VALUES ($1, $2, $3, now(), $4) RETURNING *`,
    [displayName(profile), profile.email, profile.sub, profile.picture]
  ));
  return { passenger: rows[0], created: true };
}

// ---- one-time login codes ----------------------------------------------
// The browser hands the app an opaque code, never the session token: a code
// is random, single-use, expires in minutes, and only its hash is stored.

function hashLoginCode(code) {
  return crypto.createHash('sha256').update(String(code)).digest('hex');
}

async function issueLoginCode(db, passengerId, provider = 'google') {
  const code = crypto.randomBytes(32).toString('base64url');
  await db.query(
    `INSERT INTO login_codes (passenger_id, code_hash, provider, expires_at)
     VALUES ($1, $2, $3, now() + ($4 || ' seconds')::interval)`,
    [passengerId, hashLoginCode(code), provider, String(config.loginCodeTtlSeconds)]
  );
  return code;
}

/** Marks the code used and returns the rider, or null if it is unknown, used or expired. */
async function redeemLoginCode(db, code) {
  if (typeof code !== 'string' || code.length < 20 || code.length > 200) return null;
  const { rows } = await db.query(
    `UPDATE login_codes SET used_at = now()
      WHERE code_hash = $1 AND used_at IS NULL AND expires_at > now()
      RETURNING passenger_id`,
    [hashLoginCode(code)]
  );
  if (!rows[0]) return null;
  const { rows: passengers } = await db.query('SELECT * FROM passengers WHERE id = $1 AND deleted_at IS NULL', [rows[0].passenger_id]);
  return passengers[0] || null;
}

/** What the operator page shows (no secrets). */
function status(req) {
  const id = config.googleClientId;
  return {
    enabled: isConfigured(),
    clientId: id ? `${id.slice(0, 12)}…${id.slice(-26)}` : null,
    redirectUri: callbackUrl(req) || null,
    appReturnUrl: appReturnUrl(),
    webReturnUrl: config.webAppUrl ? `${originOf(config.webAppUrl)}/auth/google` : null,
  };
}

module.exports = {
  isConfigured,
  signState,
  readState,
  callbackUrl,
  webReturnUrl,
  appReturnUrl,
  withQuery,
  authorizationUrl,
  exchangeCode,
  verifyIdToken,
  findOrCreatePassenger,
  issueLoginCode,
  redeemLoginCode,
  hashLoginCode,
  status,
  _internals,
};
