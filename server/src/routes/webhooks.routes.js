const express = require('express');

const { getPool } = require('../db');
const { ApiError } = require('../utils/asyncHandler');
const { settleSucceededPayment } = require('../services/payments');
const paypack = require('../services/paypackClient');
const { pushNotification } = require('../services/notify');

const router = express.Router();

// POST /api/webhooks/paypack — Paypack transaction webhook.
// This router MUST be mounted with express.raw({ type: 'application/json' })
// so the raw body is available to verify the X-Paypack-Signature.
router.post('/paypack', async (req, res) => {
  const signature = req.headers['x-paypack-signature'];
  const rawBody = req.rawBody || req.bodyStr || JSON.stringify(req.body || {});

  if (!paypack.verifyWebhookSignature(rawBody, signature)) {
    return res.status(401).json({ error: 'Invalid webhook signature.' });
  }
  if (!req.body || !Array.isArray(req.body.data)) {
    return res.status(400).json({ error: 'Malformed webhook payload.' });
  }

  const primary = req.body.data[0];
  const chargeId = String(primary?.id || '');
  // Look the charge up by external_reference (Paypack returns its charge id).
  let payment = null;
  if (chargeId) {
    const { rows } = await getPool().query(
      `SELECT * FROM payments WHERE external_reference = $1
        ORDER BY created_at DESC LIMIT 1`,
      [chargeId]
    );
    payment = rows[0];
  }

  const success = String(primary?.status || '').toLowerCase() === 'successful';
  const failed = String(primary?.status || '').toLowerCase() === 'failed';

  res.status(200).json({ received: true });

  if (!payment) {
    console.warn('[webhooks] received event for unknown charge:', chargeId);
    return;
  }

  const { rows: rideRows } = await getPool().query('SELECT * FROM rides WHERE id = $1', [
    payment.ride_id,
  ]);
  const ride = rideRows[0];

  if (success) {
    await settleSucceededPayment(
      { ...payment, status: 'succeeded', state: 'succeeded' },
      ride
    );
  } else if (failed) {
    await getPool().query(
      `UPDATE payments SET status='failed', state='failed', updated_at=now(),
         metadata=COALESCE(metadata,'{}'::jsonb) || $2::jsonb
       WHERE id = $1`,
      [payment.id, JSON.stringify({ webhookStatus: primary.status })]
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
});

module.exports = router;