const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { config } = require('../config');

/**
 * Generates a cryptographically secure N-digit numeric code (default from
 * config). Uses crypto.randomInt, never Math.random, so codes are not
 * predictable.
 */
function generateCode(length = config.otpLength) {
  const min = Math.pow(10, length - 1);
  const max = Math.pow(10, length);
  return crypto.randomInt(min, max).toString();
}

/**
 * Issues a new verification code for a passenger, invalidating any previous
 * unused code of the same purpose (single active code per purpose).
 */
async function issueCode(pool, { passengerId, purpose }) {
  const code = generateCode();
  const codeHash = await hashCode(code);
  const { rows } = await pool.query(
    `INSERT INTO verification_codes (passenger_id, code_hash, purpose, expires_at)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [passengerId, codeHash, purpose, expiryDate()]
  );
  // Only the code just issued may be redeemed. (ids are random UUIDs, so
  // "latest" must never be inferred from id order.)
  await pool.query(
    `UPDATE verification_codes SET used_at = now()
     WHERE passenger_id = $1 AND purpose = $2 AND used_at IS NULL AND id <> $3`,
    [passengerId, purpose, rows[0].id]
  );
  return code;
}

/**
 * Finds the latest still-valid code of a purpose and verifies it. Increments
 * failed_attempts on each mismatch, and locks the code once the configured
 * attempt limit is exceeded. Returns { ok, code, used } where processCode is a
 * callback to (finally) mark the code as used.
 */
async function verifyCode(pool, { passengerId, purpose, code }) {
  const { rows } = await pool.query(
    `SELECT id, code_hash, attempts
       FROM verification_codes
      WHERE passenger_id = $1 AND purpose = $2 AND used_at IS NULL AND expires_at > now()
      ORDER BY created_at DESC LIMIT 1`,
    [passengerId, purpose]
  );
  const record = rows[0];
  if (!record) return { ok: false, reason: 'expired', processCode: null };
  if (record.attempts >= config.otpMaxAttempts) {
    return { ok: false, reason: 'locked', processCode: null };
  }

  const matches = await compareCode(String(code), record.code_hash);
  if (!matches) {
    await pool.query(
      `UPDATE verification_codes
          SET used_at = CASE WHEN attempts + 1 >= $2 THEN now() ELSE used_at END,
              attempts = attempts + 1
        WHERE id = $1`,
      [record.id, config.otpMaxAttempts]
    );
    return { ok: false, reason: 'invalid', processCode: null };
  }

  const processCode = async () => {
    await pool.query(
      'UPDATE verification_codes SET used_at = now() WHERE id = $1',
      [record.id]
    );
  };
  return { ok: true, reason: 'ok', processCode };
}

async function hashCode(code) {
  return bcrypt.hash(code, 10);
}

async function compareCode(code, hash) {
  return bcrypt.compare(code, hash);
}

/** When did a code issued now expire? */
function expiryDate() {
  return new Date(Date.now() + config.otpTtlSeconds * 1000);
}

module.exports = {
  generateCode,
  issueCode,
  verifyCode,
  hashCode,
  compareCode,
  expiryDate,
};