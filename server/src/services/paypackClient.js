const crypto = require('crypto');
const { config } = require('../config');

/**
 * Paypack (Rwanda mobile-money) REST client, per https://docs.paypack.rw:
 *   POST /api/auth/agents/authorize     { client_id, client_secret } -> { access, refresh, expires }
 *   GET  /api/auth/agents/refresh/:tok  -> same shape
 *   POST /api/transactions/cashin       { amount, number } -> { ref, status: 'pending', ... }
 *   GET  /api/transactions/find/:ref    -> { ref, status, amount, client, ... }
 * Webhooks carry `x-paypack-signature`: base64(HMAC-SHA256(rawBody, webhookSecret)).
 *
 * Credentials live only in server env vars, never in the app.
 */

// Refresh a little before the provider's stated expiry.
const TOKEN_SAFETY_MS = 60 * 1000;
let token = null; // { access, refresh, expiresAt }

function apiUrl(path) {
  // PAYPACK_BASE_URL is the host (https://payments.paypack.rw); tolerate a
  // value that already includes /api.
  const base = config.paypackBaseUrl.replace(/\/+$/, '').replace(/\/api$/, '');
  return `${base}/api${path}`;
}

function expiryFrom(expires) {
  // The docs don't pin down `expires`' unit, so accept a unix timestamp in
  // ms or s, or a lifetime in seconds. Missing/unparseable -> 10 minutes.
  const n = Number(expires);
  if (Number.isFinite(n) && n > 0) {
    if (n > 1e12) return n;
    if (n > 1e9) return n * 1000;
    return Date.now() + n * 1000;
  }
  return Date.now() + 10 * 60 * 1000;
}

async function readJson(res, what) {
  const text = await res.text();
  if (!res.ok) {
    const error = new Error(`Paypack ${what} failed (${res.status}): ${text.slice(0, 300)}`);
    error.status = res.status;
    throw error;
  }
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Paypack ${what} returned invalid JSON.`);
  }
}

async function authorize() {
  const res = await fetch(apiUrl('/auth/agents/authorize'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_id: config.paypackClientId,
      client_secret: config.paypackClientSecret,
    }),
    signal: AbortSignal.timeout(10000),
  });
  return readJson(res, 'authorize');
}

async function refresh(refreshToken) {
  const res = await fetch(apiUrl(`/auth/agents/refresh/${encodeURIComponent(refreshToken)}`), {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(10000),
  });
  return readJson(res, 'token refresh');
}

async function getAccessToken() {
  if (token && Date.now() < token.expiresAt - TOKEN_SAFETY_MS) return token.access;
  let data = null;
  if (token?.refresh) {
    data = await refresh(token.refresh).catch(() => null);
  }
  if (!data?.access) data = await authorize();
  if (!data.access) throw new Error('Paypack authorize returned no access token.');
  token = { access: data.access, refresh: data.refresh, expiresAt: expiryFrom(data.expires) };
  return token.access;
}

function isConfigured() {
  return Boolean(config.paypackClientId && config.paypackClientSecret);
}

/** Paypack expects the national format, e.g. 0781234567. */
function toNationalNumber(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.startsWith('250') && digits.length === 12) return `0${digits.slice(3)}`;
  if (digits.length === 9 && digits.startsWith('7')) return `0${digits}`;
  return digits;
}

/**
 * Requests a mobile-money cash-in (the customer approves it on their phone).
 * `idempotencyKey` (max 32 chars) makes a retried request charge only once.
 * Returns the Paypack transaction: { ref, status: 'pending', amount, ... }.
 */
async function createCharge({ amount, phone, idempotencyKey }) {
  const access = await getAccessToken();
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    Authorization: `Bearer ${access}`,
  };
  if (idempotencyKey) headers['Idempotency-Key'] = String(idempotencyKey).slice(0, 32);
  const res = await fetch(apiUrl('/transactions/cashin'), {
    method: 'POST',
    headers,
    body: JSON.stringify({
      amount: Math.round(Number(amount)),
      number: toNationalNumber(phone),
    }),
    signal: AbortSignal.timeout(10000),
  });
  const charge = await readJson(res, 'cashin');
  if (!charge.ref) throw new Error('Paypack cashin returned no transaction ref.');
  return charge;
}

/** Reads a transaction's current status by its Paypack ref. */
async function readCharge(ref) {
  const access = await getAccessToken();
  const res = await fetch(apiUrl(`/transactions/find/${encodeURIComponent(ref)}`), {
    headers: { Accept: 'application/json', Authorization: `Bearer ${access}` },
    signal: AbortSignal.timeout(10000),
  });
  return readJson(res, 'transaction lookup');
}

/**
 * True when Paypack refused the cash-in request itself (bad number or amount),
 * so no charge exists and retrying the same request cannot succeed. Timeouts,
 * 5xx and authentication problems are NOT this: there the outcome is unknown
 * or temporary and the request must be retried with its idempotency key.
 */
function isRejectedRequest(error) {
  return Boolean(error) && (error.status === 400 || error.status === 422);
}

/** Reject cross-reference, cash-out and partial-amount settlement. */
function assertChargeMatches(charge, expected) {
  if (!charge || String(charge.ref) !== String(expected.external_reference) ||
      String(charge.kind).toUpperCase() !== 'CASHIN' ||
      !Number.isFinite(Number(charge.amount)) || Number(charge.amount) !== Number(expected.amount)) {
    throw new Error('Provider transaction does not match the expected cash-in.');
  }
}

/**
 * Verifies an incoming webhook: the header must equal
 * base64(HMAC-SHA256(rawBody, PAYPACK_WEBHOOK_SECRET)). Without a configured
 * secret every delivery is rejected.
 */
function verifyWebhookSignature(rawBody, signatureHeader) {
  if (!config.paypackWebhookSecret || !signatureHeader || !rawBody) return false;
  const expected = crypto
    .createHmac('sha256', config.paypackWebhookSecret)
    .update(rawBody)
    .digest('base64');
  const a = Buffer.from(String(signatureHeader).trim());
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = {
  isConfigured,
  isRejectedRequest,
  assertChargeMatches,
  createCharge,
  readCharge,
  verifyWebhookSignature,
  toNationalNumber,
};
