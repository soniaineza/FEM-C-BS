const crypto = require('crypto');
const { getPool } = require('../db');
const { config } = require('../config');
const { ApiError } = require('../utils/asyncHandler');
const { transitionRide } = require('./rideStateMachine');
const { publishRideEvent } = require('./rideEvents');
const { releaseDriver } = require('./driverMatcher');
const { pushNotification } = require('./notify');
const paypack = require('./paypackClient');

const PROVIDER_METHODS = new Set(['mtn_momo', 'airtel_money']);

async function createPaymentForRide(ride) {
  const amount = ride.final_fare != null ? ride.final_fare : ride.estimated_fare;
  const reference = `FEM-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
  const method = ride.payment_method;

  const { rows } = await getPool().query(
    `INSERT INTO payments (ride_id, passenger_id, amount, method, status, provider, state, reference, idempotency_key)
     VALUES ($1,$2,$3,$4,'pending',$5, 'pending', $6, $7)
     RETURNING *`,
    [
      ride.id,
      ride.passenger_id,
      amount,
      method,
      PROVIDER_METHODS.has(method) ? 'paypack' : method,
      reference,
      `${ride.id}:${method}`,
    ]
  );
  return rows[0];
}

/** Debits a passenger wallet; returns false (with no change) when poor. */
async function debitWallet(passengerId, amount, reference) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `UPDATE wallets SET balance = balance - $1, updated_at = now()
        WHERE passenger_id = $2 AND balance >= $1
        RETURNING balance`,
      [amount, passengerId]
    );
    if (!rows[0]) {
      await client.query('ROLLBACK');
      return false;
    }
    await client.query(
      `INSERT INTO wallet_transactions (passenger_id, amount, type, source, reference)
       VALUES ($1, $2, 'debit', 'ride_payment', $3)`,
      [passengerId, amount, reference]
    );
    await client.query('COMMIT');
    return true;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Charges the fare using the ride's chosen method (payment already recorded). */
async function chargePayment(payment, ride) {
  const { rows: phoneRows } = await getPool().query(
    'SELECT phone FROM passengers WHERE id = $1',
    [payment.passenger_id]
  );
  const phone = phoneRows[0]?.phone || '';

if (payment.method === 'cash') return payment; // settled in person
  if (payment.method === 'wallet') {
    const ok = await debitWallet(payment.passenger_id, payment.amount, payment.reference);
    if (!ok) {
      await getPool().query(
        `UPDATE payments SET state='failed', status='failed', updated_at=now(), metadata='{"reason":"insufficient_wallet_balance"}'::jsonb
          WHERE id = $1`,
        [payment.id]
      );
      await pushNotification(payment.passenger_id, {
        title: 'Payment failed',
        body: 'Your wallet balance is not enough for this trip. Top up and try again.',
        type: 'payment',
        rideId: ride.id,
      });
      return payment;
    }
    await settleSucceededPayment(payment, ride, { method: 'wallet' });
    return payment;
  }

  if (PROVIDER_METHODS.has(payment.method)) {
    if (config.demoPayments) {
      // Demo mode (DEMO_PAYMENTS=1): fake acceptance — mark the charge
      // settled immediately instead of calling Paypack, so the whole ride +
      // wallet-earnings flow is testable without mobile-money credentials.
      // The payment row is still recorded with a provider label for realism.
      await getPool().query(
        `UPDATE payments SET provider='paypack', state='processing', updated_at=now(),
           metadata='{"reason":"demo_acceptance"}'::jsonb WHERE id = $1`,
        [payment.id]
      );
      await settleSucceededPayment(payment, ride, { method: payment.method, demo: true });
      const { rows: settled } = await getPool().query(
        'SELECT * FROM payments WHERE id = $1',
        [payment.id]
      );
      return settled[0] || payment;
    }
    if (!paypack.isConfigured()) {
      // Honest "gateway not configured": the ride stays pending — the app must
      // not be allowed to mark itself paid.
      await getPool().query(
        `UPDATE payments SET state='pending', updated_at=now(),
           metadata='{"reason":"provider_not_configured"}'::jsonb WHERE id = $1`,
        [payment.id]
      );
      return payment;
    }
    let charge;
    try {
      charge = await paypack.createCharge({
        amount: payment.amount,
        phone,
        idempotencyKey: payment.reference,
      });
    } catch (err) {
      console.error('[payments] Paypack cashin failed:', err.message);
      await getPool().query(
        `UPDATE payments SET state='failed', status='failed', updated_at=now(),
           metadata=$2::jsonb WHERE id = $1`,
        [payment.id, JSON.stringify({ reason: 'provider_error' })]
      );
      await pushNotification(payment.passenger_id, {
        title: 'Payment failed',
        body: 'We could not start the mobile-money payment. Please retry or pay in cash.',
        type: 'payment',
        rideId: ride.id,
      });
      return payment;
    }
    await getPool().query(
      `UPDATE payments SET provider='paypack', state='processing',
         external_reference=$2, updated_at=now(), metadata=$3::jsonb WHERE id = $1`,
      [payment.id, String(charge.ref), JSON.stringify(charge)]
    );
  }
  return payment;
}

/** Pulls the latest Paypack status for a still-pending provider payment. */
async function refreshPaymentStatus(payment) {
  if (payment.provider !== 'paypack' || !payment.external_reference) return payment;
  if (!paypack.isConfigured()) return payment;

  const charge = await paypack.readCharge(payment.external_reference);
  const chargeStatus = String(charge.status || '').toLowerCase();
  // Paypack statuses: pending | successful | failed.
  const state =
    chargeStatus === 'successful' ? 'succeeded' : chargeStatus === 'failed' ? 'failed' : 'processing';
  const { rows } = await getPool().query(
    `UPDATE payments SET state = $2,
       status = CASE WHEN $2 = 'failed' AND status != 'succeeded' THEN 'failed' ELSE status END,
       updated_at = now(), metadata = $3::jsonb
      WHERE id = $1 RETURNING *`,
    [payment.id, state, JSON.stringify(charge)]
  );
  const updated = rows[0];
  if (chargeStatus === 'successful') {
    const { rows: rideRows } = await getPool().query('SELECT * FROM rides WHERE id = $1', [
      payment.ride_id,
    ]);
    await settleSucceededPayment(updated, rideRows[0]);
  }
  return updated;
}

async function confirmCashPayment(payment) {
  if (payment.method !== 'cash') {
    throw new ApiError(400, 'This payment was not a cash payment.');
  }
  const { rows: rideRows } = await getPool().query('SELECT * FROM rides WHERE id = $1', [
    payment.ride_id,
  ]);
  await settleSucceededPayment(payment, rideRows[0]);
  const { rows } = await getPool().query('SELECT * FROM payments WHERE id = $1', [payment.id]);
  return rows[0];
}

/**
 * Marks payment successful and completes the ride exactly once. Webhook
 * deliveries and status polls can race, so the payment row is claimed
 * atomically: only the caller whose UPDATE flips it to 'succeeded' settles.
 * The claim, receipt, ride completion and driver earnings commit together in
 * one transaction, so a crash part-way leaves the payment unclaimed and a
 * later webhook/poll can settle it cleanly.
 */
async function settleSucceededPayment(payment, ride) {
  if (!ride) return;
  if (ride.status !== 'paymentPending') return; // already settled — idempotent

  const client = await getPool().connect();
  let paid;
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `UPDATE payments SET status='succeeded', state='succeeded', updated_at=now()
        WHERE id = $1 AND status != 'succeeded' RETURNING *`,
      [payment.id]
    );
    paid = rows[0];
    if (!paid) {
      await client.query('ROLLBACK');
      return; // another caller settled it first
    }

    const receiptNumber = `RCP-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    await client.query(
      `INSERT INTO receipts (receipt_number, payment_id, ride_id, passenger_id, amount, method, paid_at)
       VALUES ($1,$2,$3,$4,$5,$6, now())`,
      [receiptNumber, paid.id, ride.id, ride.passenger_id, paid.amount, paid.method]
    );

    await transitionRide(ride.id, 'completed', { changedBy: 'payments', db: client, publish: false });

    // Credit the driver's earnings ledger and trip count now that the fare is
    // actually settled (read by GET /driver/earnings, /driver/me and the
    // earnings summary). today_earnings is left alone: the summary endpoint
    // aggregates driver_earnings by CURRENT_DATE instead.
    if (ride.driver_id) {
      const gross = Number(paid.amount);
      const commission = Math.round(gross * config.driverCommissionRate * 100) / 100;
      const net = Math.round((gross - commission) * 100) / 100;
      await client.query(
        `INSERT INTO driver_earnings
           (driver_id, ride_id, gross_amount, commission, net_amount, payment_method, status, settled_at)
         VALUES ($1,$2,$3,$4,$5,$6,'settled', now())`,
        [ride.driver_id, ride.id, gross, commission, net, paid.method]
      );
      await client.query(
        `UPDATE drivers SET total_trips = total_trips + 1, total_earnings = total_earnings + $2
         WHERE id = $1`,
        [ride.driver_id, net]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  publishRideEvent(ride.id, { type: 'status', status: 'completed', rideId: ride.id });
  if (ride.driver_id) await releaseDriver(ride.driver_id);
  await pushNotification(ride.passenger_id, {
    title: 'Trip completed',
    body: `Your trip is complete. Fare: RWF ${Number(paid.amount).toLocaleString()}.`,
    type: 'payment',
    rideId: ride.id,
  });
}

/** Loads the payment for a ride owned by the passenger. */
async function getPaymentForRide(rideId, passengerId) {
  const { rows } = await getPool().query(
    'SELECT * FROM payments WHERE ride_id = $1 AND passenger_id = $2 ORDER BY created_at DESC LIMIT 1',
    [rideId, passengerId]
  );
  return rows[0] || null;
}

module.exports = {
  createPaymentForRide,
  chargePayment,
  refreshPaymentStatus,
  confirmCashPayment,
  settleSucceededPayment,
  getPaymentForRide,
};