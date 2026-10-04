const express = require('express');

const { getPool } = require('../db');
const { settleSucceededPayment, failProviderPayment } = require('../services/payments');
const { creditTopup, failTopup } = require('../services/walletTopups');
const paypack = require('../services/paypackClient');
const { handleProviderTransaction } = require('../services/driverBalance');
const { pushNotification } = require('../services/notify');
const { asyncHandler, ApiError } = require('../utils/asyncHandler');

const router = express.Router();

// Paypack pings the webhook URL with HEAD before delivering events, to check
// it is reachable.
router.head('/paypack', (_req, res) => res.sendStatus(200));

// POST /api/webhooks/paypack — Paypack `transaction:processed` webhook:
//   { event_id, kind: 'transaction:processed', created_at,
//     data: { ref, kind: 'CASHIN'|'CASHOUT', status: 'successful'|'failed', amount, client, ... } }
// This router MUST be mounted with express.raw({ type: 'application/json' })
// so the raw body is available to verify x-paypack-signature.
router.post('/paypack', asyncHandler(async (req, res) => {
  if (!paypack.verifyWebhookSignature(req.rawBody, req.headers['x-paypack-signature'])) {
    throw new ApiError(401, 'Invalid webhook signature.');
  }
  const data = req.body?.data;
  if (!data || typeof data !== 'object' || !data.ref) {
    throw new ApiError(400, 'Malformed webhook payload.');
  }
  // Return success only after durable settlement. Failures let the provider retry.
  await handleTransaction(data);
  res.status(200).json({ received: true });
}));

async function handleTransaction(data) {
  const ref = String(data.ref);
  const status = String(data.status || '').toLowerCase();
  const success = status === 'successful';
  const failed = status === 'failed';
  if (!success && !failed) return;

  const { rows: paymentRows } = await getPool().query(
    `SELECT * FROM payments WHERE external_reference = $1 ORDER BY created_at DESC LIMIT 1`,
    [ref]
  );
  const payment = paymentRows[0];
  if (payment) {
    await handleRidePayment(payment, data, success);
    return;
  }

  const { rows: topupRows } = await getPool().query(
    `SELECT * FROM wallet_topups WHERE external_reference = $1 ORDER BY created_at DESC LIMIT 1`,
    [ref]
  );
  const topup = topupRows[0];
  if (topup) {
    // Both are no-ops for a repeated delivery, so the rider is told once.
    if (success) {
      const credited = await creditTopup(topup.id, { webhookStatus: status }, { providerAmount: data.amount });
      if (credited.justCredited) {
        await pushNotification(topup.passenger_id, {
          title: 'Wallet topped up',
          body: `RWF ${Number(topup.amount).toLocaleString()} was added to your wallet.`,
          type: 'payment',
        });
      }
    } else {
      const failed = await failTopup(topup.id, { webhookStatus: status });
      if (failed.justFailed) {
        await pushNotification(topup.passenger_id, {
          title: 'Top-up failed',
          body: 'Your mobile-money top-up was not completed. Please try again.',
          type: 'payment',
        });
      }
    }
    return;
  }

  // Driver payouts (cash-out) and commission settlements (cash-in).
  if (await handleProviderTransaction(ref, success)) return;

  // The webhook may beat the API's external_reference update. Retry later.
  throw new ApiError(503, 'Payment reference is not recorded yet.');
}

async function handleRidePayment(payment, data, success) {
  const { rows: rideRows } = await getPool().query('SELECT * FROM rides WHERE id = $1', [
    payment.ride_id,
  ]);
  const ride = rideRows[0];

  if (success) {
    // The amount the provider collected is checked against the fare.
    await settleSucceededPayment(payment, ride, { providerAmount: data.amount });
    return;
  }
  await failProviderPayment(payment, { webhookStatus: data.status });
}

module.exports = router;
