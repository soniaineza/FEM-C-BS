const express = require('express');
const bcrypt = require('bcryptjs');

const { getPool } = require('../db');
const { config } = require('../config');
const { asyncHandler, ApiError } = require('../utils/asyncHandler');
const { signToken } = require('../utils/jwt');
const { generateCode, hashCode, compareCode, expiryDate } = require('../utils/otp');
const { passengerToJson } = require('../utils/serialize');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

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

// POST /api/auth/signup
router.post(
  '/signup',
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
      [String(fullName).trim(), String(phone).trim(), String(email).trim().toLowerCase(), passwordHash]
    );
    const passenger = rows[0];

    const code = generateCode();
    const codeHash = await hashCode(code);
    await getPool().query(
      `INSERT INTO verification_codes (passenger_id, code_hash, purpose, expires_at)
       VALUES ($1, $2, 'signup', $3)`,
      [passenger.id, codeHash, expiryDate()]
    );

    const token = signToken(passenger.id);
    res.status(201).json({
      passenger: passengerToJson(passenger),
      token,
      ...devPayload(code),
    });
  })
);

// POST /api/auth/login
router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { identifier, password } = req.body || {};
    if (!identifier || !password) {
      throw new ApiError(400, 'Enter your email/phone and password.');
    }
    const passenger = await findByIdentifier(String(identifier).trim().toLowerCase());
    if (!passenger) throw new ApiError(401, 'No account found with those details.');

    const ok = await bcrypt.compare(password, passenger.password_hash);
    if (!ok) throw new ApiError(401, 'Incorrect password.');

    const token = signToken(passenger.id);
    res.json({ passenger: passengerToJson(passenger), token });
  })
);

// POST /api/auth/reset-password/request
router.post(
  '/reset-password/request',
  asyncHandler(async (req, res) => {
    const { identifier } = req.body || {};
    if (!identifier) throw new ApiError(400, 'Enter your email or phone number.');
    const passenger = await findByIdentifier(String(identifier).trim().toLowerCase());

    // Always respond the same way whether or not the account exists, so the
    // endpoint cannot be used to probe for registered accounts.
    if (passenger) {
      const code = generateCode();
      const codeHash = await hashCode(code);
      await getPool().query(
        `INSERT INTO verification_codes (passenger_id, code_hash, purpose, expires_at)
         VALUES ($1, $2, 'reset', $3)`,
        [passenger.id, codeHash, expiryDate()]
      );
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
  asyncHandler(async (req, res) => {
    const { identifier, code, newPassword } = req.body || {};
    if (!identifier || !code || !newPassword) {
      throw new ApiError(400, 'Missing identifier, code or new password.');
    }
    const passenger = await findByIdentifier(String(identifier).trim().toLowerCase());
    if (!passenger) throw new ApiError(400, 'Invalid or expired code.');

    const { rows } = await getPool().query(
      `SELECT * FROM verification_codes
       WHERE passenger_id = $1 AND purpose = 'reset' AND used_at IS NULL AND expires_at > now()
       ORDER BY id DESC LIMIT 1`,
      [passenger.id]
    );
    const record = rows[0];
    if (!record || !(await compareCode(String(code), record.code_hash))) {
      throw new ApiError(400, 'Invalid or expired code.');
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await getPool().query('UPDATE passengers SET password_hash = $1 WHERE id = $2', [
      passwordHash,
      passenger.id,
    ]);
    await getPool().query('UPDATE verification_codes SET used_at = now() WHERE id = $1', [
      record.id,
    ]);

    res.json({ message: 'Password updated. You can now log in.' });
  })
);

// POST /api/auth/verify-otp
router.post(
  '/verify-otp',
  asyncHandler(async (req, res) => {
    const { passengerId, code } = req.body || {};
    if (!passengerId || !code) throw new ApiError(400, 'Missing passengerId or code.');

    const { rows } = await getPool().query(
      `SELECT * FROM verification_codes
       WHERE passenger_id = $1 AND purpose = 'signup' AND used_at IS NULL AND expires_at > now()
       ORDER BY id DESC LIMIT 1`,
      [passengerId]
    );
    const record = rows[0];
    if (!record || !(await compareCode(String(code), record.code_hash))) {
      throw new ApiError(400, 'Invalid or expired verification code.');
    }
    await getPool().query('UPDATE verification_codes SET used_at = now() WHERE id = $1', [
      record.id,
    ]);
    res.json({ verified: true });
  })
);

// GET /api/auth/me
router.get(
  '/me',
  requireAuth,
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
      emergencyContactName,
      emergencyContactPhone,
    } = req.body || {};

    const { rows } = await getPool().query(
      `UPDATE passengers SET
         full_name = COALESCE($2, full_name),
         phone = COALESCE($3, phone),
         email = COALESCE($4, email),
         photo_url = COALESCE($5, photo_url),
         emergency_contact_name = COALESCE($6, emergency_contact_name),
         emergency_contact_phone = COALESCE($7, emergency_contact_phone),
         is_profile_complete = TRUE
       WHERE id = $1
       RETURNING *`,
      [
        req.passengerId,
        fullName,
        phone,
        email,
        photoUrl,
        emergencyContactName,
        emergencyContactPhone,
      ]
    );
    if (!rows[0]) throw new ApiError(404, 'Account not found.');
    res.json({ passenger: passengerToJson(rows[0]) });
  })
);

// DELETE /api/auth/account
router.delete(
  '/account',
  requireAuth,
  asyncHandler(async (req, res) => {
    await getPool().query('DELETE FROM passengers WHERE id = $1', [req.passengerId]);
    res.status(204).end();
  })
);

module.exports = router;
