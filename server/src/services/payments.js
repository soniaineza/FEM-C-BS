const crypto = require('crypto');
const { getPool } = require('../db');
const { config } = require('../config');
const { ApiError } = require('../utils/asyncHandler');
const { transitionRide } = require('./rideStateMachine');
const { publishRideEvent } = require('./rideEvents');
const { releaseDriver } = require('./driverMatcher');
const { pushNotification } = require('./notify');
const paypack = require('./paypackClient');
const { enforceDebtLimit } = require('./driverBalance');
const { transition } = require('./paymentState');

const PROVIDER_METHODS = new Set(['mtn_momo', 'airtel_money']);

async function createPaymentForRide(ride) {
  const amount = ride.final_fare != null ? ride.final_fare : ride.estimated_fare;
  const reference = `KIMU-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
  const method = ride.payment_method;
  // One payment per ride and method, plus one per retry after a failure.
  const { rows: earlier } = await getPool().query(
    'SELECT count(*)::int AS n FROM payments WHERE ride_id = $1 AND method = $2',
    [ride.id, method]
  );
  const attempt = earlier[0].n;

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
      attempt ? `${ride.id}:${method}:${attempt}` : `${ride.id}:${method}`,
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
  // The rider may have asked for a different mobile-money number to be charged.
  const phone = ride.payment_phone || phoneRows[0]?.phone || '';

  if (payment.method === 'cash') return payment; // settled in person
  if (payment.method === 'wallet') {
    const ok = await debitWallet(payment.passenger_id, payment.amount, payment.reference);
    if (!ok) {
      await transition(getPool(), 'payments', payment.id, 'failed', {
        failureReason: 'INSUFFICIENT_WALLET_BALANCE',
        metadata: { reason: 'insufficient_wallet_balance' },
      });
      await pushNotification(payment.passenger_id, {
        title: 'Payment failed',
        body: 'Your wallet balance is not enough for this trip. Top up and try again, or pay in cash.',
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
      await transition(getPool(), 'payments', payment.id, 'failed', {
        failureReason: 'PROVIDER_ERROR',
        metadata: { reason: 'provider_error' },
      });
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

async function loadPayment(id) {
  const { rows } = await getPool().query('SELECT * FROM payments WHERE id = $1', [id]);
  return rows[0];
}

/**
 * Pulls the latest Paypack status for a provider payment and applies it:
 * success settles the ride (or, for an attempt we already gave up on, queues
 * a refund), failure closes the attempt, and a prompt nobody answered within
 * PAYMENT_EXPIRY_SECONDS expires. Returns the payment as it now stands.
 */
async function refreshPaymentStatus(payment) {
  if (payment.provider !== 'paypack') return payment;
  if (['succeeded', 'refund_pending', 'refunded'].includes(payment.status)) return payment;
  if (!payment.external_reference || !paypack.isConfigured()) {
    await expireIfStale(payment);
    return loadPayment(payment.id);
  }

  const charge = await paypack.readCharge(payment.external_reference);
  const chargeStatus = String(charge.status || '').toLowerCase();
  // Paypack statuses: pending | successful | failed.
  if (chargeStatus === 'successful') {
    const { rows: rideRows } = await getPool().query('SELECT * FROM rides WHERE id = $1', [
      payment.ride_id,
    ]);
    await settleSucceededPayment(payment, rideRows[0], { providerAmount: charge.amount });
  } else if (chargeStatus === 'failed') {
    await failProviderPayment(payment, { providerStatus: chargeStatus });
  } else {
    await expireIfStale(payment);
  }
  return loadPayment(payment.id);
}

/** The provider said no: close a still-open attempt and tell the rider. */
async function failProviderPayment(payment, metadata) {
  const failed = await transition(getPool(), 'payments', payment.id, 'failed', {
    failureReason: 'PROVIDER_DECLINED',
    metadata,
  });
  if (!failed) return null; // already closed
  await pushNotification(payment.passenger_id, {
    title: 'Payment failed',
    body: 'Your payment was not completed. Please retry or pay in cash.',
    type: 'payment',
    rideId: payment.ride_id,
  });
  return failed;
}

async function reconcilePendingPayments() {
  // Prompts that never reached the provider have nothing to poll: expire them.
  const { rows: unsent } = await getPool().query(
    `SELECT * FROM payments WHERE provider='paypack' AND status='pending'
       AND external_reference IS NULL
       AND created_at < now() - ($1 || ' seconds')::interval LIMIT 30`,
    [String(config.paymentExpirySeconds)]
  );
  for (const payment of unsent) await expireIfStale(payment);

  if (!paypack.isConfigured()) return;
  const { rows } = await getPool().query(
    `SELECT * FROM payments WHERE provider='paypack' AND status='pending'
       AND external_reference IS NOT NULL AND created_at < now() - interval '30 seconds'
       ORDER BY created_at LIMIT 30`
  );
  for (const payment of rows) {
    // The provider is always asked first, so an approved payment is settled
    // rather than expired.
    try { await refreshPaymentStatus(payment); }
    catch (err) { console.error('[payments] reconciliation failed', payment.id, err); }
  }
}

/**
 * A mobile-money prompt the rider never answered: after
 * PAYMENT_EXPIRY_SECONDS the attempt is closed as expired (kept for audit,
 * never deleted) so they can retry or pay cash. The ride stays unpaid. If the
 * provider reports success for it later, settleSucceededPayment queues that
 * money for refund instead of applying it.
 */
async function expireIfStale(payment) {
  const { rows } = await getPool().query(
    `SELECT 1 FROM payments WHERE id = $1 AND status = 'pending' AND method != 'cash'
        AND created_at < now() - ($2 || ' seconds')::interval`,
    [payment.id, String(config.paymentExpirySeconds)]
  );
  if (!rows[0]) return null;
  const expired = await transition(getPool(), 'payments', payment.id, 'expired', {
    failureReason: 'PAYMENT_EXPIRED',
    metadata: { reason: 'expired' },
  });
  if (!expired) return null;
  await pushNotification(payment.passenger_id, {
    title: 'Payment expired',
    body: 'Your mobile-money payment expired because it was not approved in time. You can retry or pay by cash.',
    type: 'payment',
    rideId: payment.ride_id,
  });
  return expired;
}

async function confirmCashPayment(payment) {
  if (payment.method !== 'cash') {
    throw new ApiError(400, 'This payment was not a cash payment.');
  }
  const { rows: rideRows } = await getPool().query('SELECT * FROM rides WHERE id = $1', [
    payment.ride_id,
  ]);
  if (rideRows[0]?.status !== 'paymentPending') {
    throw new ApiError(409, 'This ride is not awaiting cash settlement.');
  }
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
async function settleSucceededPayment(payment, ride, { providerAmount = null } = {}) {
  if (!ride) return;

  const client = await getPool().connect();
  let paid;
  try {
    await client.query('BEGIN');
    const { rows: lockedRides } = await client.query('SELECT * FROM rides WHERE id=$1 FOR UPDATE', [ride.id]);
    const currentRide = lockedRides[0];
    if (!currentRide) throw new ApiError(404, 'Ride not found.');
    // Decide on the attempt as it is now, not as the caller last saw it.
    const { rows: lockedPayments } = await client.query('SELECT * FROM payments WHERE id=$1 FOR UPDATE', [payment.id]);
    const current = lockedPayments[0];
    if (!current || ['succeeded', 'refund_pending', 'refunded'].includes(current.status)) {
      await client.query('ROLLBACK');
      return; // already applied (duplicate webhook/poll) or already queued for refund
    }

    // Money the provider collected that must not settle this ride goes to an
    // operator for refund — recorded once, never applied, never lost:
    //  - the attempt had already failed or expired (a late approval)
    //  - the ride was paid another way or is no longer awaiting payment
    //  - the amount collected is not the fare
    let exception = null;
    if (current.status !== 'pending') exception = 'provider_success_after_expiry';
    else if (currentRide.status !== 'paymentPending' || currentRide.payment_method !== current.method) {
      exception = 'provider_success_after_ride_changed';
    } else if (providerAmount != null && Math.round(Number(providerAmount)) !== Math.round(Number(current.amount))) {
      exception = 'provider_amount_mismatch';
    }
    if (exception) {
      if (current.provider === 'paypack') {
        await transition(client, 'payments', current.id, 'refund_pending', {
          metadata: { exception, providerAmount },
        });
        await client.query(
          `INSERT INTO payment_exceptions (payment_id, ride_id, reason)
           VALUES ($1,$2,$3) ON CONFLICT (payment_id) DO NOTHING`,
          [current.id, ride.id, exception]
        );
      }
      await client.query('COMMIT');
      return;
    }

    paid = await transition(client, 'payments', current.id, 'succeeded');
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
  if (ride.driver_id) {
    await releaseDriver(ride.driver_id);
    // The driver kept the whole cash fare, so they now owe its commission.
    if (paid.method === 'cash') await enforceDebtLimit(ride.driver_id);
  }
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
  reconcilePendingPayments,
  confirmCashPayment,
  settleSucceededPayment,
  failProviderPayment,
  getPaymentForRide,
};
