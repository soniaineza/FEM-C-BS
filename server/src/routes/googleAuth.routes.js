const express = require('express');
const crypto = require('crypto');

const { getPool } = require('../db');
const { asyncHandler, ApiError } = require('../utils/asyncHandler');
const { signToken } = require('../utils/jwt');
const { passengerToJson } = require('../utils/serialize');
const { apiLimiter } = require('../middleware/rateLimit');
const google = require('../services/googleAuth');

// /api/auth/google — see services/googleAuth.js for the whole flow.
const router = express.Router();
const limiter = apiLimiter();

function requireGoogle(_req, _res, next) {
  if (!google.isConfigured()) return next(new ApiError(404, 'Google sign-in is not available yet.'));
  next();
}

function sessionResponse(passenger) {
  return {
    passenger: passengerToJson(passenger),
    token: signToken(passenger.id),
    // A rider who arrived through Google still has to give a phone number
    // (POST /api/auth/phone) and verify it before using the app.
    needsPhone: !passenger.phone,
  };
}

// GET /api/auth/google/start?platform=native|web[&return=https://web-app]
// Sends the browser to Google. The app opens this address itself.
router.get(
  '/start',
  limiter,
  requireGoogle,
  asyncHandler(async (req, res) => {
    const platform = req.query.platform === 'web' ? 'web' : 'native';
    const target = platform === 'web' ? google.webReturnUrl(req, req.query.return) : google.appReturnUrl();
    const redirectUri = google.callbackUrl(req);
    if (!redirectUri) throw new ApiError(503, 'Google sign-in is not fully configured: PUBLIC_URL is missing.');
    const nonce = crypto.randomBytes(16).toString('hex');
    const state = google.signState({ p: platform, t: target, n: nonce });
    res.set('Cache-Control', 'no-store');
    res.redirect(302, google.authorizationUrl({ redirectUri, state, nonce }));
  })
);

// GET /api/auth/google/callback?code&state — Google sends the browser here.
// Ends with a redirect back into the app carrying a one-time login code, or
// an error reason the app can explain (cancelled, failed, email_unverified,
// linked_elsewhere, unavailable).
router.get(
  '/callback',
  limiter,
  asyncHandler(async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const state = google.readState(req.query.state);
    if (!state || typeof state.t !== 'string') {
      res.status(400).type('text/plain').send('This sign-in link has expired. Go back to the Kimu Transport app and try again.');
      return;
    }
    const fail = (reason) => res.redirect(302, google.withQuery(state.t, { error: reason }));
    if (!google.isConfigured()) return fail('unavailable');
    if (req.query.error || !req.query.code) return fail(req.query.error === 'access_denied' ? 'cancelled' : 'failed');
    try {
      const tokens = await google.exchangeCode({ code: String(req.query.code), redirectUri: google.callbackUrl(req) });
      const profile = await google.verifyIdToken(tokens.id_token, { nonce: state.n });
      const { passenger } = await google.findOrCreatePassenger(getPool(), profile);
      const code = await google.issueLoginCode(getPool(), passenger.id);
      return res.redirect(302, google.withQuery(state.t, { code }));
    } catch (err) {
      console.error('[googleAuth] sign-in failed:', err.message);
      if (err instanceof ApiError && err.status === 409) return fail('linked_elsewhere');
      if (err instanceof ApiError && err.status === 400) return fail('email_unverified');
      return fail('failed');
    }
  })
);

// POST /api/auth/google/exchange { code } — the app turns its one-time code
// into a session. Codes are single-use and expire within minutes.
router.post(
  '/exchange',
  limiter,
  asyncHandler(async (req, res) => {
    const passenger = await google.redeemLoginCode(getPool(), (req.body || {}).code);
    if (!passenger) throw new ApiError(401, 'This sign-in link has expired. Please try again.');
    res.json(sessionResponse(passenger));
  })
);

// POST /api/auth/google/token { idToken } — for an app that uses the native
// Google Sign-In SDK instead of the browser flow. The token is verified
// against Google's keys exactly like the one from the code exchange.
router.post(
  '/token',
  limiter,
  requireGoogle,
  asyncHandler(async (req, res) => {
    const { idToken } = req.body || {};
    if (!idToken) throw new ApiError(400, 'Missing idToken.');
    let profile;
    try {
      profile = await google.verifyIdToken(idToken);
    } catch (err) {
      console.error('[googleAuth] rejected ID token:', err.message);
      throw new ApiError(401, 'Google could not confirm this sign-in. Please try again.');
    }
    const { passenger, created } = await google.findOrCreatePassenger(getPool(), profile);
    res.status(created ? 201 : 200).json(sessionResponse(passenger));
  })
);

module.exports = router;
