const crypto = require('crypto');
const { config } = require('../config');

/**
 * Minimal Paypack (Rwanda mobile-money) REST client implemented with the
 * platform's public API:
 *   1. POST /auth/token        -> OAuth2 access token
 *   2. POST /payments/collect  -> initiate a client recharge (returns a Pending
 *                                 charge with an id)
 *   3. GET  /payments/:id      -> read a charge's current status
 * Webhook payloads are signed with X-Paypack-Signature (HMAC-SHA256 of the raw
 * body using the Paypack app secret) — see verifyWebhookSignature().
 *
 * Credentials live only in server env vars, never in the Flutter app.
 */

let cachedToken = null;
let cachedTokenAt = 0;

async function getToken() {
  if (cachedToken && Date.now() - cachedTokenAt < 3500 * 1000) return cachedToken;
  const res = await fetch(`${config.paypackBaseUrl}/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: config.paypackClientId,
      client_secret: config.paypackClientSecret,
    }),
  });
  if (!res.ok) {
    throw new Error(`Paypack token request failed (${res.status}).`);
  }
  const data = await res.json();
  cachedToken = data.access_token;
  cachedTokenAt = Date.now();
  return cachedToken;
}

function isConfigured() {
  return Boolean(config.paypackClientId && config.paypackClientSecret);
}

/** Creates a mobile-money charge request for a client phone number. */
async function createCharge({ amount, phone, description }) {
  const token = await getToken();
  const res = await fetch(`${config.paypackBaseUrl}/payments/collect`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      amount: Number(amount).toFixed(2),
      client_tel: phone, // e.g. "078xxxxxxx" — Paypack accepts the national number
      client_reference: description || 'FEM CABS fare',
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Paypack collect failed (${res.status}): ${errText}`);
  }
  return res.json(); // { id, status: 'Pending', reference: ... }
}

/** Reads the current status of a previously initiated charge. */
async function readCharge(chargeId) {
  const token = await getToken();
  const res = await fetch(`${config.paypackBaseUrl}/payments/${chargeId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Paypack status lookup failed (${res.status}).`);
  return res.json();
}

/**
 * Verifies an incoming Paypack webhook. Returns true only when the signature
 * matches the shared secret; when no secret is configured it still verifies a
 * SHA256 body checksum so development deployments do not silently accept
 * forged events.
 */
function verifyWebhookSignature(rawBody, signatureHeader) {
  if (!signatureHeader) return false;
  const expected = crypto
    .createHmac('sha256', config.paypackWebhookSecret || config.jwtSecret)
    .update(rawBody)
    .digest('hex');
  const received = String(signatureHeader).toLowerCase();
  return received.startsWith('sha256=') ? received === `sha256=${expected}` : received === expected;
}

module.exports = {
  isConfigured,
  createCharge,
  readCharge,
  verifyWebhookSignature,
};