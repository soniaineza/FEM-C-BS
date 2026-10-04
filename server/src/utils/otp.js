const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { config } = require('../config');
const { transaction, getPool } = require('../db');
const { ApiError } = require('./asyncHandler');

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
async function issueCode(pool, params) {
  return transaction(async () => {
    await getPool().query('SELECT id FROM passengers WHERE id=$1 FOR UPDATE', [params.passengerId]);
    return issueCodeLocked(getPool(), params);
  });
}
async function issueCodeLocked(pool, { passengerId, purpose, cooldown = false }) {
  if (cooldown) {
    const last = (await pool.query('SELECT created_at FROM verification_codes WHERE passenger_id=$1 AND purpose=$2 ORDER BY created_at DESC LIMIT 1', [passengerId, purpose])).rows[0];
    if (last && Date.now() - new Date(last.created_at).getTime() < config.otpResendCooldownSeconds * 1000) throw new ApiError(429, 'Please wait before requesting a new code.');
  }
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
async function verifyCode(pool, params) {
  return transaction(() => verifyCodeLocked(getPool(), params));
}
async function verifyCodeLocked(pool, { passengerId, purpose, code, apply }) {
  await pool.query('SELECT id FROM passengers WHERE id=$1 FOR UPDATE', [passengerId]);
  const { rows } = await pool.query(
    `SELECT id, code_hash, attempts
       FROM verification_codes
      WHERE passenger_id = $1 AND purpose = $2 AND used_at IS NULL AND expires_at > now()
      ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
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
          SET attempts = attempts + 1,
              used_at = CASE WHEN attempts + 1 >= $2 THEN now() ELSE used_at END
        WHERE id = $1 AND used_at IS NULL AND attempts < $2`,
      [record.id, config.otpMaxAttempts]
    );
    return { ok: false, reason: 'invalid', processCode: null };
  }

  await pool.query('UPDATE verification_codes SET used_at=now() WHERE id=$1', [record.id]);
  if (apply) await apply(pool);
  return { ok: true, reason: 'ok', processCode: async () => {} };
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