const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const { getPool } = require('../db');
const { ApiError } = require('../utils/asyncHandler');
const { getDriverBalance } = require('./driverBalance');

// Closing an account must never erase money records. Rides, payments,
// receipts, wallet transactions, top-ups, driver earnings, payouts and cash
// settlements all hang off the passenger or driver row, so that row is kept
// and stripped of personal details instead of being deleted:
//  - the person can no longer sign in, and existing sessions stop working
//  - their phone number and email are freed for a new account
//  - contact details, saved places, devices and documents are removed
//  - every financial and trip record stays exactly as it was

/** A value that satisfies the unique/NOT NULL columns and identifies nobody. */
const tombstone = (id) => `deleted:${id}`;

/** An unusable password hash: no input will ever match it. */
const deadPasswordHash = () => bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);

async function closePassengerAccount(passengerId) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      'SELECT id FROM passengers WHERE id = $1 AND deleted_at IS NULL FOR UPDATE',
      [passengerId]
    );
    if (!rows[0]) throw new ApiError(404, 'Account not found.');
    // A trip in progress, or a fare still owed, has to be finished first.
    const { rows: open } = await client.query(
      `SELECT 1 FROM rides WHERE passenger_id = $1 AND status NOT IN ('completed', 'cancelled') LIMIT 1`,
      [passengerId]
    );
    if (open[0]) {
      throw new ApiError(409, 'You have a trip that is not finished or not yet paid. Complete it before closing your account.');
    }
    await client.query(
      `UPDATE passengers SET full_name = 'Deleted rider', phone = $2, email = $3, password_hash = $4,
         photo_url = NULL, emergency_contact_name = NULL, emergency_contact_phone = NULL,
         referral_code = NULL, deleted_at = now()
       WHERE id = $1`,
      [passengerId, tombstone(passengerId), `${passengerId}@deleted.invalid`, await deadPasswordHash()]
    );
    // Personal data that is not part of any financial or trip record.
    await client.query('DELETE FROM device_tokens WHERE passenger_id = $1', [passengerId]);
    await client.query('DELETE FROM saved_places WHERE passenger_id = $1', [passengerId]);
    await client.query('DELETE FROM recent_destinations WHERE passenger_id = $1', [passengerId]);
    await client.query('DELETE FROM passenger_locations WHERE passenger_id = $1', [passengerId]);
    await client.query('DELETE FROM verification_codes WHERE passenger_id = $1', [passengerId]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function closeDriverAccount(driverId, { pendingApplicationOnly = false } = {}) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      'SELECT id, verified FROM drivers WHERE id = $1 AND deleted_at IS NULL FOR UPDATE',
      [driverId]
    );
    if (!rows[0]) throw new ApiError(404, 'Account not found.');
    if (pendingApplicationOnly && rows[0].verified) {
      throw new ApiError(409, 'Only a pending, unverified driver application can be removed here.');
    }
    const { rows: open } = await client.query(
      `SELECT 1 FROM rides WHERE driver_id = $1 AND status NOT IN ('completed', 'cancelled') LIMIT 1`,
      [driverId]
    );
    if (open[0]) {
      throw new ApiError(409, 'You have a trip that is not finished or whose cash is not confirmed. Complete it before closing your account.');
    }
    // Cash collected for Kimu cannot be walked away from.
    const balance = await getDriverBalance(driverId, client);
    if (balance.owed > 0) {
      throw new ApiError(409, `You still hold RWF ${Math.ceil(balance.owed).toLocaleString()} for Kimu. Send it before closing your account.`);
    }
    const { rows: payouts } = await client.query(
      `SELECT 1 FROM driver_payouts WHERE driver_id = $1 AND status IN ('pending', 'processing') LIMIT 1`,
      [driverId]
    );
    if (payouts[0]) throw new ApiError(409, 'You have a payout in progress. Wait for it to finish before closing your account.');

    await client.query(
      `UPDATE drivers SET full_name = 'Deleted driver', phone = $2, password_hash = NULL,
         license_number = NULL, verified = FALSE, status = 'suspended',
         current_latitude = NULL, current_longitude = NULL, deleted_at = now()
       WHERE id = $1`,
      [driverId, tombstone(driverId)]
    );
    await client.query('DELETE FROM driver_device_tokens WHERE driver_id = $1', [driverId]);
    await client.query('DELETE FROM driver_documents WHERE driver_id = $1', [driverId]);
    await client.query('DELETE FROM driver_locations WHERE driver_id = $1', [driverId]);
    // Past riders keep the trip, but not a way to reach the person.
    await client.query('UPDATE rides SET driver_phone = NULL WHERE driver_id = $1', [driverId]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function closePendingDriverApplication(driverId) {
  return closeDriverAccount(driverId, { pendingApplicationOnly: true });
}

module.exports = { closePassengerAccount, closeDriverAccount, closePendingDriverApplication };
