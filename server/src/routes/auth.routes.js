const express = require('express');
const bcrypt = require('bcryptjs');

const { getPool } = require('../db');
const { config } = require('../config');
const { asyncHandler, ApiError } = require('../utils/asyncHandler');
const { signToken } = require('../utils/jwt');
const { issueCode, verifyCode } = require('../utils/otp');
const { sendOtp, toE164, otpStatus } = require('../services/otpSender');
const { closePassengerAccount } = require('../services/accountClosure');

/**
 * Sends an OTP through the configured channel (WhatsApp, then SMS, then
 * e-mail — see services/otpSender.js), turning a provider failure into a
 * retryable 502. Returns the channel the code went out on.
 */
async function deliverOtp(passenger, params) {
  if (!passenger.phone && !passenger.email) {
    throw new ApiError(400, 'Add a phone number or email first so we can send your verification code.');
  }
  try {
    return await sendOtp(passenger, params);
  } catch {
    throw new ApiError(502, 'We could not send your verification code. Please try again in a moment.');
  }
}
const { passengerToJson } = require('../utils/serialize');
const { requireAuth, requireSession } = require('../middleware/auth');
const { apiLimiter } = require('../middleware/rateLimit');
const googleAuth = require('../services/googleAuth');

const router = express.Router();

const authLimiter = apiLimiter();
const otpLimiter = apiLimiter({ max: config.rateLimitMax * 2 });

// GET /api/auth/providers — which sign-in methods this server offers, so the
// apps only show buttons that work. `otp.channel` is the first configured
// delivery channel (whatsapp → sms → email), and `otp.order` is the full
// fallback chain. Phone and email passwordless login are always offered; the
// Google button appears only once Google credentials are set.
router.get('/providers', (_req, res) => {
  const otp = otpStatus();
  // Phone and e-mail sign-in are always offered. `phoneDeliverable` /
  // `emailDeliverable` tell the app which can actually send a code right now,
  // so a tap on a not-yet-configured channel shows a clear message instead of
  // a silent dead end. The Google button still appears only once configured.
  res.set('Cache-Control', 'no-store');
  res.json({
    password: true,
    google: { enabled: googleAuth.isConfigured() },
    phone: { enabled: true, channel: otp.channel, deliverable: otp.whatsapp.configured || otp.sms.configured },
    email: { enabled: true, deliverable: otp.email.configured },
    otp: { channel: otp.channel, order: otp.order, ready: otp.ready },
    otpChannel: otp.channel,
  });
});

function normalizePhone(raw) {
  return String(raw || '').trim();
}

/** Finds a rider by either the number as typed or its E.164 form. */
async function findByPhone(phone) {
  const e164 = toE164(phone);
  const { rows } = await getPool().query(
    'SELECT * FROM passengers WHERE (phone = $1 OR phone = $2) AND deleted_at IS NULL LIMIT 1',
    [phone, e164]
  );
  return rows[0] || null;
}

async function findByEmail(email) {
  const { rows } = await getPool().query(
    'SELECT * FROM passengers WHERE email = $1 AND deleted_at IS NULL LIMIT 1',
    [email]
  );
  return rows[0] || null;
}

router.post(
  '/whatsapp/start',
  otpLimiter,
  bindIdentity,
  asyncHandler(async (req, res) => {
    const phone = normalizePhone((req.body || {}).phone);
    if (!/^\+?\d{9,15}$/.test(phone.replace(/[\s-]/g, ''))) {
      throw new ApiError(400, 'Enter a valid phone number.');
    }
    let passenger = await findByPhone(phone);
    if (!passenger) {
      const { rows } = await getPool().query(
        'INSERT INTO passengers (phone) VALUES ($1) RETURNING *',
        [toE164(phone)]
      );
      passenger = rows[0];
    }
    const code = await issueCode(getPool(), { passengerId: passenger.id, purpose: 'login' });
    let otpSent = true;
    let otpChannel = 'none';
    try {
      otpChannel = await deliverOtp(passenger, { code, purpose: 'login' });
    } catch {
      otpSent = false;
    }
    res.json({
      otpSent,
      otpChannel,
      ...(otpSent ? {} : { message: 'We could not send your code. Check the number and try again.' }),
      ...devPayload(code),
    });
  })
);


router.post(
  '/whatsapp/verify',
  otpLimiter,
  bindIdentity,
  asyncHandler(async (req, res) => {
    const phone = normalizePhone((req.body || {}).phone);
    const { code } = req.body || {};
    if (!phone || !code) throw new ApiError(400, 'Enter the code we sent you.');
    const passenger = await findByPhone(phone);
    if (!passenger) throw new ApiError(400, 'Invalid or expired code.');
    const result = await verifyCode(getPool(), { passengerId: passenger.id, purpose: 'login', code });
    if (!result.ok) throw new ApiError(400, 'Invalid or expired code.');
    await result.processCode();
    const { rows } = await getPool().query(
      'UPDATE passengers SET verified_at = COALESCE(verified_at, now()) WHERE id = $1 RETURNING *',
      [passenger.id]
    );
    res.json({ passenger: passengerToJson(rows[0]), token: signToken(passenger.id), needsPhone: false });
  })
);

// POST /api/auth/email/start { email } — passwordless sign-in by e-mail: send
// a code to the address (through SMTP when configured). A new address gets an
// account created, so the same button signs in and signs up.
router.post(
  '/email/start',
  otpLimiter,
  bindIdentity,
  asyncHandler(async (req, res) => {
    const email = String((req.body || {}).email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ApiError(400, 'Enter a valid email address.');
    let passenger = await findByEmail(email);
    if (!passenger) {
      const { rows } = await getPool().query('INSERT INTO passengers (email) VALUES ($1) RETURNING *', [email]);
      passenger = rows[0];
    }
    const code = await issueCode(getPool(), { passengerId: passenger.id, purpose: 'login' });
    let otpSent = true;
    let otpChannel = 'none';
    try {
      otpChannel = await deliverOtp(passenger, { code, purpose: 'login' });
    } catch {
      otpSent = false;
    }
    res.json({
      otpSent,
      otpChannel,
      ...(otpSent ? {} : { message: 'We could not send your code. Check the address and try again.' }),
      ...devPayload(code),
    });
  })
);

// POST /api/auth/email/verify { email, code } — checks the code and returns a
// session. A brand-new rider then completes their profile (name + phone).
router.post(
  '/email/verify',
  otpLimiter,
  bindIdentity,
  asyncHandler(async (req, res) => {
    const email = String((req.body || {}).email || '').trim().toLowerCase();
    const { code } = req.body || {};
    if (!email || !code) throw new ApiError(400, 'Enter the code we sent you.');
    const passenger = await findByEmail(email);
    if (!passenger) throw new ApiError(400, 'Invalid or expired code.');
    const result = await verifyCode(getPool(), { passengerId: passenger.id, purpose: 'login', code });
    if (!result.ok) throw new ApiError(400, 'Invalid or expired code.');
    await result.processCode();
    const { rows } = await getPool().query(
      'UPDATE passengers SET verified_at = COALESCE(verified_at, now()) WHERE id = $1 RETURNING *',
      [passenger.id]
    );
    res.json({ passenger: passengerToJson(rows[0]), token: signToken(passenger.id), needsPhone: false });
  })
);

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

function resetMessage(identifier) {
  return `We sent a verification code to ${identifier}.`;
}

function bindIdentity(req, _res, next) {
  const identifier = String(
    (req.body && (req.body.identifier || req.body.email || req.body.phone)) || ''
  )
    .trim()
    .toLowerCase();
  if (identifier.includes('@')) req.identityKey = identifier;
  next();
}

router.post(
  '/signup',
  authLimiter,
  bindIdentity,
  asyncHandler(async (req, res) => {
    const { fullName, phone, email, password } = req.body || {};
    if (!fullName || !phone || !email || !password) {
      throw new ApiError(400, 'Full name, phone, email and password are required.');
    }
    if (String(password).length < 6) {
      throw new ApiError(400, 'Password must be at least 6 characters.');
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

    let otpSent = true;
    let otpChannel = 'none';
    try {
      otpChannel = await deliverOtp(passenger, { code, purpose: 'signup' });
    } catch {
      otpSent = false;
    }

    const token = signToken(passenger.id);
    res.status(201).json({
      passenger: passengerToJson(passenger),
      token,
      otpSent,
      otpChannel,
      ...(otpSent ? {} : { message: 'Account created, but the verification code could not be sent. Use resend code to try again.' }),
      ...devPayload(code),
    });
  })
);


router.post(
  '/phone',
  requireSession,
  otpLimiter,
  asyncHandler(async (req, res) => {
    const phone = String((req.body || {}).phone || '').trim();
    if (!/^\+?\d{9,15}$/.test(phone.replace(/[\s-]/g, ''))) throw new ApiError(400, 'Enter a valid phone number.');
    const { rows: current } = await getPool().query('SELECT * FROM passengers WHERE id = $1 AND deleted_at IS NULL', [req.passengerId]);
    if (!current[0]) throw new ApiError(404, 'Account not found.');
    if (current[0].verified_at) throw new ApiError(409, 'Your phone number is already verified. Change it from your profile.');
    const { rows: taken } = await getPool().query('SELECT 1 FROM passengers WHERE phone = $1 AND id <> $2', [phone, req.passengerId]);
    if (taken[0]) throw new ApiError(409, 'That phone number is already used by another account.');
    const { rows } = await getPool().query(
      `UPDATE passengers SET phone = $2,
         is_profile_complete = (COALESCE(full_name, '') <> '' AND $2 <> '')
       WHERE id = $1 RETURNING *`,
      [req.passengerId, phone]
    );
    const passenger = rows[0];
    const code = await issueCode(getPool(), { passengerId: passenger.id, purpose: 'signup' });
    let otpSent = true;
    let otpChannel = 'none';
    try {
      otpChannel = await deliverOtp(passenger, { code, purpose: 'signup' });
    } catch {
      otpSent = false;
    }
    res.json({
      passenger: passengerToJson(passenger),
      otpSent,
      otpChannel,
      ...(otpSent ? {} : { message: 'Phone number saved, but the verification code could not be sent. Use resend code to try again.' }),
      ...devPayload(code),
    });
  })
);

// POST /api/auth/login
router.post(
  '/login',
  authLimiter,
  bindIdentity,
  asyncHandler(async (req, res) => {
    const { identifier, password } = req.body || {};
    if (!identifier || !password) {
      throw new ApiError(400, 'Enter your email/phone and password.');
    }
    const passenger = await findByIdentifier(String(identifier).trim().toLowerCase());
    if (!passenger) throw new ApiError(401, 'No account found with those details.');
    if (!passenger.password_hash) {
      // Created through Google: there is no password to compare against.
      throw new ApiError(401, 'This account signs in with Google. Tap "Continue with Google", or use "Forgot password?" to set a password.', 'google_account');
    }

    const ok = await bcrypt.compare(password, passenger.password_hash);
    if (!ok) throw new ApiError(401, 'Incorrect password.');

    let devCode;
    let otpSent = true;
    let otpChannel = 'none';
    if (!passenger.verified_at) {
      devCode = await issueCode(getPool(), {
        passengerId: passenger.id,
        purpose: 'signup',
      });
      try {
        otpChannel = await deliverOtp(passenger, { code: devCode, purpose: 'signup' });
      } catch {
        otpSent = false;
      }
    }
    const token = signToken(passenger.id);
    res.json({
      passenger: passengerToJson(passenger),
      token,
      ...(passenger.verified_at ? {} : {
        otpSent,
        otpChannel,
        needsPhone: !passenger.phone,
        ...(otpSent ? {} : { message: 'We could not send the verification code. Use resend code to try again.' }),
      }),
      ...devPayload(devCode),
    });
  })
);

router.post('/logout', requireSession, (req, res) => res.status(204).end());

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
      token: signToken(rows[0].id),
    });
  })
);


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
      purpose,
    });
    const { rows: passengerRows } = await getPool().query(
      'SELECT * FROM passengers WHERE id = $1',
      [req.passengerId]
    );
    const passenger = passengerRows[0];
    if (!passenger) throw new ApiError(404, 'Account not found.');
    const otpChannel = await deliverOtp(passenger, { code, purpose });
    res.json({
      ...devPayload(code),
      otpChannel,
      message: config.devRevealCodes && config.localDatabase
        ? 'A new verification code is ready in the app.'
        : 'A new verification code was sent.',
    });
  })
);

router.post(
  '/reset-password/request',
  authLimiter,
  bindIdentity,
  asyncHandler(async (req, res) => {
    const { identifier } = req.body || {};
    if (!identifier) throw new ApiError(400, 'Enter your email or phone number.');
    const passenger = await findByIdentifier(String(identifier).trim().toLowerCase());  
    if (passenger && passenger.phone) {
      const code = await issueCode(getPool(), {
        passengerId: passenger.id,
        purpose: 'reset',
      });
      await deliverOtp(passenger, { code, purpose: 'reset' });
      res.json({ message: resetMessage(identifier), ...devPayload(code) });
      return;
    }
    res.json({ message: resetMessage(identifier) });
  })
);

router.post(
  '/reset-password/confirm',
  otpLimiter,
  bindIdentity,
  asyncHandler(async (req, res) => {
    const { identifier, code, newPassword } = req.body || {};
    if (!identifier || !code || !newPassword) {
      throw new ApiError(400, 'Missing identifier, code or new password.');
    }
    const passenger = await findByIdentifier(String(identifier).trim().toLowerCase());
    if (!passenger) throw new ApiError(400, 'Invalid or expired code.');

    const result = await verifyCode(getPool(), {
      passengerId: passenger.id,
      purpose: 'reset',
      code,
    });
    if (!result.ok) throw new ApiError(400, 'Invalid or expired code.');

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await getPool().query('UPDATE passengers SET password_hash = $1 WHERE id = $2', [
      passwordHash,
      passenger.id,
    ]);
    await result.processCode();
    res.json({ message: 'Password updated. You can now log in.' });
  })
);


router.post(
  '/verify-otp',
  requireSession,
  otpLimiter,
  asyncHandler(async (req, res) => {
    const { passengerId, code } = req.body || {};
    if (!passengerId || !code) throw new ApiError(400, 'Missing passengerId or code.');
    if (passengerId !== req.passengerId) throw new ApiError(403, 'You can only verify your own account.');

    const result = await verifyCode(getPool(), {
      passengerId,
      purpose: 'signup',
      code,
    });
    if (!result.ok) throw new ApiError(400, 'Invalid or expired verification code.');
    await getPool().query('UPDATE passengers SET verified_at=COALESCE(verified_at, now()) WHERE id=$1', [passengerId]);
    await result.processCode();
    res.json({ verified: true });
  })
);

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

    const { rows } = await getPool().query(
      `UPDATE passengers SET
         full_name = COALESCE($2, full_name),
         phone = COALESCE($3, phone),
         email = COALESCE($4, email),
         photo_url = COALESCE($5, photo_url),
         preferred_language = COALESCE($6, preferred_language),
         emergency_contact_name = COALESCE($7, emergency_contact_name),
         emergency_contact_phone = COALESCE($8, emergency_contact_phone),
         is_profile_complete =
           (COALESCE($2, full_name, '') <> '' AND COALESCE($3, phone, '') <> '')
       WHERE id = $1
       RETURNING *`,
      [
        req.passengerId,
        fullName,
        phone,
        email,
        photoUrl,
        preferredLanguage,
        emergencyContactName,
        emergencyContactPhone,
      ]
    );
    if (!rows[0]) throw new ApiError(404, 'Account not found.');
    res.json({ passenger: passengerToJson(rows[0]) });
  })
);


router.delete(
  '/account',
  requireSession,
  asyncHandler(async (req, res) => {
    // Closes the account without deleting it: money and trip records stay.
    await closePassengerAccount(req.passengerId);
    res.status(204).end();
  })
);

module.exports = router;
