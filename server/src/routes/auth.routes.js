const express = require('express');
const bcrypt = require('bcryptjs');

const { getPool, transaction, afterCommit } = require('../db');
const { config } = require('../config');
const { asyncHandler, ApiError } = require('../utils/asyncHandler');
const { signToken } = require('../utils/jwt');
const { issueCode, verifyCode } = require('../utils/otp');
const { sendOtp } = require('../services/otpSender');

/** Sends an OTP, turning a provider failure into a retryable 502. */
async function deliverOtp(passenger, params) {
  try {
    await sendOtp(passenger, params);
  } catch {
    throw new ApiError(502, 'We could not send the SMS code. Please try again in a moment.');
  }
}
const { passengerToJson } = require('../utils/serialize');
const { requireAuth, requireSession } = require('../middleware/auth');
const { apiLimiter } = require('../middleware/rateLimit');

const router = express.Router();

// ---- Rate limiting for the public, brute-force-prone endpoints. ----
const authLimiter = apiLimiter();
const otpLimiter = apiLimiter({ max: config.rateLimitMax * 2 });
const identityLimiter = apiLimiter({ keyGenerator: (req) => req.identityKey || req.ip });

function devPayload(code) {
  return config.devRevealCodes ? { devCode: code } : {};
}

async function findByIdentifier(identifier) {
  const { rows } = await getPool().query(
    'SELECT * FROM passengers WHERE email = $1 OR phone = $1',
    [identifier]
  );
  return rows[0] || null;
}

// Sets req.identityKey so both the phone/email AND the IP count towards the
// rate limit (prevents bypassing by rotating IPs for one account).
function bindIdentity(req, _res, next) {
  const identifier = String(
    (req.body && (req.body.identifier || req.body.email || req.body.phone || req.body.passengerId)) || ''
  )
    .trim()
    .toLowerCase();
  if (identifier) req.identityKey = identifier.replace(/\s+/g, '');
  next();
}

// POST /api/auth/signup
router.post(
  '/signup',
  bindIdentity,
  authLimiter,
  identityLimiter,
  asyncHandler(async (req, res) => {
    const { fullName, phone, email, password } = req.body || {};
    if (!fullName || !phone || !email || !password) {
      throw new ApiError(400, 'Full name, phone, email and password are required.');
    }
    if (typeof password !== 'string' || password.length < 6 || Buffer.byteLength(password, 'utf8') > 72) {
      throw new ApiError(400, 'Password must be 6–72 bytes.');
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const { rows } = await getPool().query(
      `INSERT INTO passengers (full_name, phone, email, password_hash)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [
        String(fullName).trim(),
        String(phone).trim(),
        String(email).trim().toLowerCase(),
        passwordHash,
      ]
    );
    const passenger = rows[0];

    const code = await issueCode(getPool(), {
      passengerId: passenger.id,
      purpose: 'signup',
    });

    const token = signToken(passenger.id, passenger.session_version);
    res.status(201).json({
      passenger: passengerToJson(passenger),
      token,
      ...devPayload(code),
    });
    // The account already exists; if delivery fails the app's "resend code"
    // retries it (and surfaces the error there).
    sendOtp(passenger, { code, purpose: 'signup' }).catch(() => {});
  })
);

// POST /api/auth/login
router.post(
  '/login',
  bindIdentity,
  authLimiter,
  identityLimiter,
  asyncHandler(async (req, res) => {
    const { identifier, password } = req.body || {};
    if (!identifier || !password) {
      throw new ApiError(400, 'Enter your email/phone and password.');
    }
    const passenger = await findByIdentifier(String(identifier).trim().toLowerCase());
    if (!passenger) throw new ApiError(401, 'No account found with those details.');

    const ok = await bcrypt.compare(password, passenger.password_hash);
    if (!ok) throw new ApiError(401, 'Incorrect password.');

    const token = signToken(passenger.id, passenger.session_version);
    res.json({ passenger: passengerToJson(passenger), token });
  })
);

// POST /api/auth/logout — stateless JWT: the client discards the token.
router.post('/logout', requireSession, (req, res) => res.status(204).end());

// POST /api/auth/refresh — re-issues a token for a currently valid session.
router.post(
  '/refresh',
  requireSession,
  asyncHandler(async (req, res) => {
    const { rows } = await getPool().query('SELECT * FROM passengers WHERE id = $1', [
      req.passengerId,
    ]);
    if (!rows[0]) throw new ApiError(404, 'Account not found.');
    res.json({
      passenger: passengerToJson(rows[0]),
      token: signToken(rows[0].id, rows[0].session_version),
    });
  })
);

// POST /api/auth/resend-otp — newest code for the account, respecting a short
// cooldown. Protected route because the passenger is already signed in.
router.post(
  '/resend-otp',
  requireSession,
  otpLimiter,
  asyncHandler(async (req, res) => {
    const { purpose = 'signup' } = req.body || {};
    if (!['signup', 'reset'].includes(purpose)) {
      throw new ApiError(400, 'Unknown OTP purpose.');
    }
    const { rows } = await getPool().query(
      `SELECT * FROM verification_codes
        WHERE passenger_id = $1 AND purpose = $2 AND used_at IS NULL
        ORDER BY created_at DESC LIMIT 1`,
      [req.passengerId, purpose]
    );
    const last = rows[0];
    if (last) {
      const ageMs = Date.now() - new Date(last.created_at).getTime();
      if (ageMs < config.otpResendCooldownSeconds * 1000) {
        const wait = Math.ceil(
          (config.otpResendCooldownSeconds * 1000 - ageMs) / 1000
        );
        throw new ApiError(429, `Please wait ${wait}s before requesting a new code.`);
      }
    }

    const code = await issueCode(getPool(), {
      passengerId: req.passengerId,
      purpose, cooldown: true,
    });
    const { rows: passengerRows } = await getPool().query(
      'SELECT * FROM passengers WHERE id = $1',
      [req.passengerId]
    );
    const passenger = passengerRows[0];
    await deliverOtp(passenger, { code, purpose });
    res.json({ ...devPayload(code), message: 'A new verification code was sent.' });
  })
);

// POST /api/auth/reset-password/request
router.post(
  '/reset-password/request',
  bindIdentity,
  authLimiter,
  identityLimiter,
  asyncHandler(async (req, res) => {
    const { identifier } = req.body || {};
    if (!identifier) throw new ApiError(400, 'Enter your email or phone number.');
    const passenger = await findByIdentifier(String(identifier).trim().toLowerCase());

    // Always respond the same way whether or not the account exists, so the
    // endpoint cannot be used to probe for registered accounts.
    if (passenger) {
      let code;
      try {
        code = await issueCode(getPool(), {
          passengerId: passenger.id,
          purpose: 'reset', cooldown: true,
        });
      } catch (err) {
        // Inside the cooldown no new code is sent, but the answer is the same
        // one an unknown identifier gets: a 429 here would confirm the account.
        if (!(err instanceof ApiError) || err.status !== 429) throw err;
        res.json({ message: `We sent a verification code to ${identifier}.` });
        return;
      }
      await deliverOtp(passenger, { code, purpose: 'reset' });
      res.json({
        message: `We sent a verification code to ${identifier}.`,
        ...devPayload(code),
      });
      return;
    }
    res.json({ message: `We sent a verification code to ${identifier}.` });
  })
);

// POST /api/auth/reset-password/confirm
router.post(
  '/reset-password/confirm',
  bindIdentity,
  otpLimiter,
  identityLimiter,
  asyncHandler(async (req, res) => {
    const { identifier, code, newPassword } = req.body || {};
    if (!identifier || !code || !newPassword) {
      throw new ApiError(400, 'Missing identifier, code or new password.');
    }
    // Checked before the lookup so the answer never depends on whether the
    // account exists.
    if (typeof newPassword !== 'string' || newPassword.length < 6 || Buffer.byteLength(newPassword, 'utf8') > 72) throw new ApiError(400, 'Password must be 6–72 bytes.');
    const passenger = await findByIdentifier(String(identifier).trim().toLowerCase());
    if (!passenger) throw new ApiError(400, 'Invalid or expired code.');

    const passwordHash = await bcrypt.hash(newPassword, 10);
    const result = await verifyCode(getPool(), {
      passengerId: passenger.id, purpose: 'reset', code,
      apply: (db) => db.query('UPDATE passengers SET password_hash=$1, session_version=session_version+1 WHERE id=$2', [passwordHash, passenger.id]),
    });
    if (!result.ok) throw new ApiError(400, 'Invalid or expired code.');

    res.json({ message: 'Password updated. You can now log in.' });
  })
);

// POST /api/auth/verify-otp
router.post(
  '/verify-otp',
  bindIdentity,
  otpLimiter,
  identityLimiter,
  asyncHandler(async (req, res) => {
    const { passengerId, code } = req.body || {};
    if (!passengerId || !code) throw new ApiError(400, 'Missing passengerId or code.');

    const result = await verifyCode(getPool(), {
      passengerId,
      purpose: 'signup',
      code,
      apply: (db) => db.query('UPDATE passengers SET verified_at=COALESCE(verified_at,now()) WHERE id=$1', [passengerId]),
    });
    if (!result.ok) throw new ApiError(400, 'Invalid or expired verification code.');

    res.json({ verified: true });
  })
);

// GET /api/auth/me
router.get(
  '/me',
  requireSession,
  asyncHandler(async (req, res) => {
    const { rows } = await getPool().query('SELECT * FROM passengers WHERE id = $1', [
      req.passengerId,
    ]);
    if (!rows[0]) throw new ApiError(404, 'Account not found.');
    res.json({ passenger: passengerToJson(rows[0]) });
  })
);

// PUT /api/auth/profile
router.put(
  '/profile',
  requireAuth,
  asyncHandler(async (req, res) => {
    const {
      fullName,
      phone,
      email,
      photoUrl,
      preferredLanguage,
      emergencyContactName,
      emergencyContactPhone,
    } = req.body || {};

    // A profile is complete when the essential fields are present; do not
    // blindly mark incomplete profiles as complete.
    if (phone != null && !String(phone).trim()) throw new ApiError(400, 'Phone is required.');
    const passenger = await transaction(async (db) => {
      const existing = (await db.query('SELECT * FROM passengers WHERE id=$1 FOR UPDATE', [req.passengerId])).rows[0];
      if (!existing) throw new ApiError(404, 'Account not found.');
      const phoneChanged = phone != null && String(phone).trim() !== existing.phone;
      if (phoneChanged) {
        const active = await db.query("SELECT 1 FROM rides WHERE passenger_id=$1 AND status NOT IN ('completed','cancelled') LIMIT 1", [req.passengerId]);
        if (active.rows.length) throw new ApiError(409, 'Finish or cancel your ride before changing your phone.');
        await db.query("UPDATE verification_codes SET used_at=now() WHERE passenger_id=$1 AND used_at IS NULL", [req.passengerId]);
      }
    const { rows } = await db.query(
      `UPDATE passengers SET
         full_name = COALESCE($2, full_name),
         phone = COALESCE($3, phone),
         verified_at = CASE WHEN $3 IS NOT NULL AND $3 <> phone THEN NULL ELSE verified_at END,
         email = COALESCE($4, email),
         photo_url = COALESCE($5, photo_url),
         preferred_language = COALESCE($6, preferred_language),
         emergency_contact_name = COALESCE($7, emergency_contact_name),
         emergency_contact_phone = COALESCE($8, emergency_contact_phone),
         is_profile_complete =
           (COALESCE($2, full_name) <> '' AND COALESCE($3, phone) <> '')
       WHERE id = $1
       RETURNING *`,
      [
        req.passengerId,
        fullName,
        phone == null ? null : String(phone).trim(),
        email == null ? null : String(email).trim().toLowerCase(),
        photoUrl,
        preferredLanguage,
        emergencyContactName,
        emergencyContactPhone,
      ]
    );
    if (phoneChanged) {
      const code = await issueCode(db, { passengerId: req.passengerId, purpose: 'signup' });
      afterCommit(() => sendOtp(rows[0], { code, purpose: 'signup' }));
    }
    return rows[0];
    });
    res.json({ passenger: passengerToJson(passenger) });
  })
);

// DELETE /api/auth/account
router.delete(
  '/account',
  requireSession,
  asyncHandler(async (req, res) => {
    // The account is anonymised, not deleted: a DELETE cascades through the
    // passenger's rides into receipts and the drivers' earnings records.
    await transaction(async (db) => {
      await db.query('SELECT id FROM passengers WHERE id=$1 FOR UPDATE', [req.passengerId]);
      const active = await db.query("SELECT 1 FROM rides WHERE passenger_id=$1 AND status NOT IN ('completed','cancelled') LIMIT 1", [req.passengerId]);
      if (active.rows.length) throw new ApiError(409, 'Finish or cancel your ride before deleting your account.');
      for (const table of ['verification_codes', 'saved_places', 'recent_destinations', 'device_tokens', 'notifications', 'passenger_locations', 'trip_shares']) {
        await db.query(`DELETE FROM ${table} WHERE passenger_id = $1`, [req.passengerId]);
      }
      await db.query(
        `UPDATE passengers SET full_name='Deleted rider', phone='deleted-' || id, email='deleted-' || id || '@deleted.invalid',
           password_hash='!', photo_url=NULL, emergency_contact_name=NULL, emergency_contact_phone=NULL,
           referral_code=NULL, verified_at=NULL, is_profile_complete=FALSE,
           session_version=session_version+1, deleted_at=now()
         WHERE id=$1`, [req.passengerId]);
    });
    res.status(204).end();
  })
);

module.exports = router;
