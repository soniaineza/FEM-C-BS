const crypto = require('crypto');
const { getPool, transaction, afterCommit } = require('../db');
const { config } = require('../config');
const { ApiError } = require('../utils/asyncHandler');
const { transitionRide } = require('./rideStateMachine');
const { publishRideEvent } = require('./rideEvents');
const { releaseDriver } = require('./driverMatcher');
const { pushNotification } = require('./notify');
const paypack = require('./paypackClient');

const PROVIDER_METHODS = new Set(['mtn_momo', 'airtel_money']);
// Card has no processor yet: bookable only in demo mode, where it settles
// like the other gateway methods.
const CARD_METHOD = 'card';
// metadata.reason of a provider payment Paypack refused outright: no charge was
// created, so the rider may switch to cash without a provider reference.
const REJECTED_REASON = 'provider_rejected';

/** Payment method ids a ride can be booked with in this environment. */
function bookablePaymentMethods() {
  const methods = ['cash', 'wallet', ...PROVIDER_METHODS];
  if (config.demoPayments) methods.push(CARD_METHOD);
  return methods;
}

async function createPaymentForRide(ride) {
  const amount = ride.final_fare != null ? ride.final_fare : ride.estimated_fare;
  const reference = `KIMU-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
  const method = ride.payment_method;

  const { rows } = await getPool().query(
    `INSERT INTO payments (ride_id, passenger_id, amount, method, status, provider, state, reference, idempotency_key)
     VALUES ($1,$2,$3,$4,'pending',$5, 'pending', $6, $7)
     ON CONFLICT (idempotency_key) DO UPDATE SET idempotency_key=EXCLUDED.idempotency_key RETURNING *`,
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

/** Charges the fare using the ride's chosen method (payment already recorded). */
async function chargePayment(payment, ride) {
  const { rows: phoneRows } = await getPool().query(
    'SELECT phone FROM passengers WHERE id = $1',
    [payment.passenger_id]
  );
  const phone = phoneRows[0]?.phone || '';

  if (payment.method === 'cash') return payment; // settled in person
  if (payment.method === 'wallet') {
    await settleSucceededPayment(payment, ride, { debitWallet: true });
    return (await getPool().query('SELECT * FROM payments WHERE id=$1', [payment.id])).rows[0];
  }

  if (payment.method === CARD_METHOD && !config.demoPayments) {
    await getPool().query(
      `UPDATE payments SET state='pending', updated_at=now(),
         metadata='{"reason":"provider_not_configured"}'::jsonb WHERE id = $1`,
      [payment.id]
    );
    return payment;
  }

  if (PROVIDER_METHODS.has(payment.method) || payment.method === CARD_METHOD) {
    if (config.demoPayments) {
      // Demo mode (DEMO_PAYMENTS=1): fake acceptance — mark the charge
      // settled immediately instead of calling Paypack, so the whole ride +
      // wallet-earnings flow is testable without mobile-money credentials.
      // The payment row is still recorded with a provider label for realism.
      await getPool().query(
        `UPDATE payments SET provider=$2, state='processing', updated_at=now(),
           metadata='{"reason":"demo_acceptance"}'::jsonb WHERE id = $1`,
        [payment.id, payment.method === CARD_METHOD ? 'card' : 'paypack']
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
    const claim = await getPool().query(`UPDATE payments SET state='initiating', updated_at=now()
      WHERE id=$1 AND status='pending' AND external_reference IS NULL
        AND (state='pending' OR (state='initiating' AND updated_at < now() - interval '60 seconds')) RETURNING *`, [payment.id]);
    if (!claim.rows[0]) return (await getPool().query('SELECT * FROM payments WHERE id=$1', [payment.id])).rows[0];
    let charge;
    try {
      charge = await paypack.createCharge({
        amount: payment.amount,
        phone,
        idempotencyKey: payment.reference,
      });
    } catch (err) {
      console.error('[payments] Paypack cashin failed:', err.message);
      if (paypack.isRejectedRequest(err)) {
        // Paypack refused the request (e.g. not a mobile-money number): no
        // charge exists, so this is a failure the rider can act on now rather
        // than an outcome to keep retrying.
        await getPool().query(
          `UPDATE payments SET status='failed', state='failed', updated_at=now(),
             metadata=$2::jsonb WHERE id = $1 AND status='pending'`,
          [payment.id, JSON.stringify({ reason: REJECTED_REASON })]
        );
        await pushNotification(payment.passenger_id, {
          title: 'Payment failed',
          body: 'We could not start the mobile-money payment for this number. Please pay in cash.',
          type: 'payment',
          rideId: ride.id,
        });
        return (await getPool().query('SELECT * FROM payments WHERE id=$1', [payment.id])).rows[0];
      }
      await getPool().query(
        `UPDATE payments SET state='initiating', updated_at=now(),
           metadata=$2::jsonb WHERE id = $1 AND status='pending'`,
        [payment.id, JSON.stringify({ reason: 'provider_outcome_uncertain' })]
      );
      await pushNotification(payment.passenger_id, {
        title: 'Checking your payment',
        body: 'We are checking the mobile-money outcome. Please wait before paying another way.',
        type: 'payment',
        rideId: ride.id,
      });
      return (await getPool().query('SELECT * FROM payments WHERE id=$1', [payment.id])).rows[0];
    }
    await getPool().query(
      `UPDATE payments SET provider='paypack', state='processing',
         external_reference=$2, updated_at=now(), metadata=$3::jsonb WHERE id = $1 AND status='pending'`,
      [payment.id, String(charge.ref), JSON.stringify(charge)]
    );
  }
  return (await getPool().query('SELECT * FROM payments WHERE id=$1', [payment.id])).rows[0];
}

/** Pulls the latest Paypack status for a still-pending provider payment. */
async function refreshPaymentStatus(payment) {
  if (payment.status === 'succeeded') return payment;
  if (payment.provider !== 'paypack' || !payment.external_reference) return payment;
  if (!paypack.isConfigured()) return payment;

  const charge = await paypack.readCharge(payment.external_reference);
  paypack.assertChargeMatches(charge, payment);
  const chargeStatus = String(charge.status || '').toLowerCase();
  // Paypack statuses: pending | successful | failed.
  const state =
    chargeStatus === 'successful' ? 'succeeded' : chargeStatus === 'failed' ? 'failed' : 'processing';
  const { rows } = await getPool().query(
    `UPDATE payments SET state = CASE WHEN status='succeeded' THEN 'succeeded' ELSE $2 END,
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
    return (await getPool().query('SELECT * FROM payments WHERE id=$1', [payment.id])).rows[0];
  }
  return updated;
}

// A charge that never got a provider reference is retried for this long, then
// handed to an operator: its outcome is unknown, so it can neither be failed
// (a charge may exist) nor retried forever.
const UNRESOLVED_CHARGE_MINUTES = 15;

async function escalateUnresolvedCharges() {
  const { rows } = await getPool().query(
    `UPDATE payments p SET metadata = COALESCE(p.metadata,'{}'::jsonb) || '{"escalated":true}'::jsonb
      FROM rides r
      WHERE r.id=p.ride_id AND p.status='pending' AND r.status='paymentPending'
        AND p.method <> 'cash' AND p.external_reference IS NULL
        AND p.created_at < now() - ($1 || ' minutes')::interval
        AND COALESCE(p.metadata->>'escalated','') <> 'true'
        AND COALESCE(p.metadata->>'reason','') <> 'provider_not_configured'
      RETURNING p.id, p.ride_id, p.passenger_id`, [UNRESOLVED_CHARGE_MINUTES]);
  for (const payment of rows) {
    console.error(`[payments] NEEDS OPERATOR REVIEW: payment ${payment.id} (ride ${payment.ride_id}) has no provider outcome after ${UNRESOLVED_CHARGE_MINUTES} minutes; automatic retries stopped.`);
    await pushNotification(payment.passenger_id, {
      title: 'Payment needs attention',
      body: 'We could not confirm your mobile-money payment. Please contact support to finish this trip.',
      type: 'payment',
      rideId: payment.ride_id,
    }).catch(() => {});
  }
}

async function reconcilePendingPayments() {
  await escalateUnresolvedCharges().catch((err) => console.error('[payments] escalation failed', err.message));
  const { rows } = await getPool().query(`SELECT p.* FROM payments p JOIN rides r ON r.id=p.ride_id
    WHERE p.status='pending' AND r.status='paymentPending' AND p.method=r.payment_method
      AND p.updated_at < now() - interval '60 seconds'
      AND COALESCE(p.metadata->>'escalated','') <> 'true' ORDER BY p.created_at LIMIT 30`);
  for (const payment of rows) {
    try {
      if (payment.external_reference) await refreshPaymentStatus(payment);
      else if (payment.method !== 'cash') {
        const ride = (await getPool().query('SELECT * FROM rides WHERE id=$1', [payment.ride_id])).rows[0];
        await chargePayment(payment, ride);
      }
    } catch (err) { console.error('[payments] reconciliation failed', payment.id, err.message); }
  }
}

async function confirmCashPayment(payment) {
  if (payment.method !== 'cash') {
    throw new ApiError(400, 'This payment was not a cash payment.');
  }
  const { rows: rideRows } = await getPool().query('SELECT * FROM rides WHERE id = $1', [
    payment.ride_id,
  ]);
  const latest = (await getPool().query('SELECT * FROM payments WHERE id=$1',[payment.id])).rows[0];
  if (latest?.status === 'succeeded') return latest;
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
async function settleSucceededPayment(payment, ride, { debitWallet = false } = {}) {
  if (!ride) return;
  return transaction(async (client) => {
    // Dispatch and driver actions lock driver before ride. Settlement also
    // updates driver earnings, so use that order to avoid a lock cycle.
    const assigned = (await client.query('SELECT driver_id FROM rides WHERE id=$1',[ride.id])).rows[0];
    if (assigned?.driver_id) await client.query('SELECT id FROM drivers WHERE id=$1 FOR UPDATE',[assigned.driver_id]);
    const currentRide = (await client.query('SELECT * FROM rides WHERE id=$1 FOR UPDATE', [ride.id])).rows[0];
    const currentPayment = (await client.query('SELECT * FROM payments WHERE id=$1 FOR UPDATE', [payment.id])).rows[0];
    if (!currentRide || !currentPayment) throw new ApiError(404, 'Payment or ride not found.');
    if (currentPayment.status === 'succeeded') return;
    if (currentRide.status !== 'paymentPending' || currentRide.payment_method !== currentPayment.method) {
      if (currentPayment.provider === 'paypack') {
        await client.query("UPDATE payments SET status='succeeded', state='succeeded', updated_at=now() WHERE id=$1", [payment.id]);
        await client.query(`INSERT INTO payment_exceptions (payment_id,ride_id,reason)
          VALUES ($1,$2,'provider_success_after_ride_changed') ON CONFLICT (payment_id) DO NOTHING`, [payment.id,ride.id]);
      }
      return;
    }
    const amount = Number(currentPayment.amount);
    if (!Number.isFinite(amount) || amount < 0) throw new ApiError(400, 'Invalid payment amount.');
    if (debitWallet) {
      // Existing debit receipts from older releases are resumed, never charged again.
      const existing = await client.query("SELECT id FROM wallet_transactions WHERE reference=$1 AND source='ride_payment' AND type='debit'", [currentPayment.reference]);
      if (!existing.rows.length) {
        const debit = await client.query(`UPDATE wallets SET balance=balance-$1,updated_at=now()
          WHERE passenger_id=$2 AND balance >= $1 RETURNING balance`, [amount,currentPayment.passenger_id]);
        if (!debit.rows.length) {
          await client.query(`UPDATE payments SET status='failed',state='failed',updated_at=now(),
            metadata='{"reason":"insufficient_wallet_balance"}'::jsonb WHERE id=$1`, [payment.id]);
          // Only the first failure is announced; a retry that is still short stays quiet.
          if (currentPayment.status !== 'failed') {
            afterCommit(() => pushNotification(currentPayment.passenger_id, {
              title: 'Payment failed',
              body: 'Your wallet balance is not enough for this trip. Top up and try again.',
              type: 'payment',
              rideId: ride.id,
            }));
          }
          return;
        }
        await client.query(`INSERT INTO wallet_transactions (passenger_id,amount,type,source,reference)
          VALUES ($1,$2,'debit','ride_payment',$3)`, [currentPayment.passenger_id,amount,currentPayment.reference]);
      }
    }
    await client.query("UPDATE payments SET status='succeeded',state='succeeded',updated_at=now() WHERE id=$1", [payment.id]);
    const receiptNumber = `RCP-${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
    await client.query(`INSERT INTO receipts (receipt_number,payment_id,ride_id,passenger_id,amount,method,paid_at)
      VALUES ($1,$2,$3,$4,$5,$6,now())`, [receiptNumber,payment.id,ride.id,currentRide.passenger_id,amount,currentPayment.method]);
    await transitionRide(ride.id, 'completed', { changedBy: 'payments', db: client, publish: false });
    if (currentRide.driver_id) {
      const commission = Math.round(amount*config.driverCommissionRate*100)/100;
      const net = Math.round((amount-commission)*100)/100;
      await client.query(`INSERT INTO driver_earnings (driver_id,ride_id,gross_amount,commission,net_amount,payment_method,status,settled_at)
        VALUES ($1,$2,$3,$4,$5,$6,'settled',now())`, [currentRide.driver_id,ride.id,amount,commission,net,currentPayment.method]);
      await client.query('UPDATE drivers SET total_trips=total_trips+1,total_earnings=total_earnings+$2 WHERE id=$1', [currentRide.driver_id,net]);
    }
    afterCommit(async () => {
      publishRideEvent(ride.id, { type: 'status', status: 'completed', rideId: ride.id });
      if (currentRide.driver_id) await releaseDriver(currentRide.driver_id);
      await pushNotification(currentRide.passenger_id, { title: 'Trip completed',
        body: `Your trip is complete. Fare: RWF ${amount.toLocaleString()}.`, type: 'payment', rideId: ride.id });
    });
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
  getPaymentForRide,
  bookablePaymentMethods,
  REJECTED_REASON,
};
