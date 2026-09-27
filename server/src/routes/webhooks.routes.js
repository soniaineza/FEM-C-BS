const express = require('express');

const { getPool } = require('../db');
const { settleSucceededPayment } = require('../services/payments');
const { creditTopup, failTopup } = require('../services/walletTopups');
const paypack = require('../services/paypackClient');
const { pushNotification } = require('../services/notify');

const router = express.Router();

// Paypack pings the webhook URL with HEAD before delivering events, to check
// it is reachable.
router.head('/paypack', (_req, res) => res.sendStatus(200));

// POST /api/webhooks/paypack — Paypack `transaction:processed` webhook:
//   { event_id, kind: 'transaction:processed', created_at,
//     data: { ref, kind: 'CASHIN', status: 'successful'|'failed', amount, client, ... } }
// This router MUST be mounted with express.raw({ type: 'application/json' })
// so the raw body is available to verify x-paypack-signature.
router.post('/paypack', async (req, res) => {
  if (!paypack.verifyWebhookSignature(req.rawBody, req.headers['x-paypack-signature'])) {
    return res.status(401).json({ error: 'Invalid webhook signature.' });
  }
  const data = req.body?.data;
  if (!data || typeof data !== 'object' || !data.ref) {
    return res.status(400).json({ error: 'Malformed webhook payload.' });
  }

  // Acknowledge first so Paypack doesn't retry while we settle.
  res.status(200).json({ received: true });

  try {
    await handleTransaction(data);
  } catch (err) {
    console.error('[webhooks] failed to process Paypack event', data.ref, err);
  }
});

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
    if (success) {
      await creditTopup(topup.id, { webhookStatus: status });
      await pushNotification(topup.passenger_id, {
        title: 'Wallet topped up',
        body: `RWF ${Number(topup.amount).toLocaleString()} was added to your wallet.`,
        type: 'payment',
      });
    } else {
      await failTopup(topup.id, { webhookStatus: status });
      await pushNotification(topup.passenger_id, {
        title: 'Top-up failed',
        body: 'Your mobile-money top-up was not completed. Please try again.',
        type: 'payment',
      });
    }
    return;
  }

  console.warn('[webhooks] received event for unknown Paypack ref:', ref);
}

async function handleRidePayment(payment, data, success) {
  const { rows: rideRows } = await getPool().query('SELECT * FROM rides WHERE id = $1', [
    payment.ride_id,
  ]);
  const ride = rideRows[0];

  if (success) {
    await settleSucceededPayment({ ...payment, status: 'succeeded', state: 'succeeded' }, ride);
    return;
  }
  await getPool().query(
    `UPDATE payments SET status='failed', state='failed', updated_at=now(),
       metadata=COALESCE(metadata,'{}'::jsonb) || $2::jsonb
     WHERE id = $1 AND status != 'succeeded'`,
    [payment.id, JSON.stringify({ webhookStatus: data.status })]
  );
  if (ride && ride.passenger_id) {
    await pushNotification(ride.passenger_id, {
      title: 'Payment failed',
      body: 'Your payment was not completed. Please retry or pay in cash.',
      type: 'payment',
      rideId: ride.id,
    });
  }
}

module.exports = router;
