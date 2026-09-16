const crypto = require('crypto');
const { getPool } = require('../db');
const { ApiError } = require('../utils/asyncHandler');
const { transitionRide } = require('./rideStateMachine');
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
      throw new ApiError(400, 'Insufficient wallet balance for this trip.');
    }
    await settleSucceededPayment(payment, ride, { method: 'wallet' });
    return payment;
  }

  if (PROVIDER_METHODS.has(payment.method)) {
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
    const charge = await paypack.createCharge({
      amount: payment.amount,
      phone,
      description: `FEM C@BS trip ${ride.id.slice(0, 8)}`,
    });
    await getPool().query(
      `UPDATE payments SET provider='paypack', state='processing',
         external_reference=$2, updated_at=now(), metadata=$3::jsonb WHERE id = $1`,
      [payment.id, String(charge.id || charge.reference || ''), JSON.stringify(charge)]
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
  const { rows } = await getPool().query(
    `UPDATE payments SET state = $2, updated_at = now(), metadata = $3::jsonb
      WHERE id = $1 RETURNING *`,
    [
      payment.id,
      'successful' === chargeStatus ? 'succeeded' : chargeStatus,
      JSON.stringify(charge),
    ]
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
  const { rows } = await getPool().query(
    `UPDATE payments SET status='succeeded', state='succeeded', updated_at=now()
      WHERE id = $1 RETURNING *`,
    [payment.id]
  );
  const { rows: rideRows } = await getPool().query('SELECT * FROM rides WHERE id = $1', [
    payment.ride_id,
  ]);
  await settleSucceededPayment(rows[0], rideRows[0]);
  return rows[0];
}

/** Marks payment successful and completes the ride exactly once. */
async function settleSucceededPayment(payment, ride) {
  if (!ride) return;
  if (ride.status !== 'paymentPending') return; // already settled — idempotent

  const { rows } = await getPool().query(
    `UPDATE payments SET status='succeeded', state='succeeded', updated_at=now()
      WHERE id = $1 AND status != 'succeeded' RETURNING *`,
    [payment.id]
  );
  const paid = rows[0] || payment;

  const receiptNumber = `RCP-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  await getPool().query(
    `INSERT INTO receipts (receipt_number, payment_id, ride_id, passenger_id, amount, method, paid_at)
     VALUES ($1,$2,$3,$4,$5,$6, now())`,
    [receiptNumber, paid.id, ride.id, ride.passenger_id, paid.amount, paid.method]
  );

  await transitionRide(ride.id, 'completed', { changedBy: 'payments' });
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