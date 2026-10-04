const express = require('express');

const { getPool } = require('../db');
const { asyncHandler, ApiError } = require('../utils/asyncHandler');
const { paymentToJson } = require('../utils/serialize');
const { requireAuth } = require('../middleware/auth');
const {
  createPaymentForRide,
  chargePayment,
  refreshPaymentStatus,
  REJECTED_REASON,
} = require('../services/payments');

const router = express.Router();
router.use(requireAuth);

async function loadOwnedPayment(paymentId, passengerId) {
  const { rows } = await getPool().query(
    'SELECT * FROM payments WHERE id = $1 AND passenger_id = $2',
    [paymentId, passengerId]
  );
  return rows[0] || null;
}

// POST /api/payments — (re)initiates payment for a ride. Duplicate rides are
// rejected via the idempotency key so a retry can never double-charge.
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { rideId, method } = req.body || {};
    if (!rideId) throw new ApiError(400, 'rideId is required.');
    const { rows } = await getPool().query(
      'SELECT * FROM rides WHERE id = $1 AND passenger_id = $2',
      [rideId, req.passengerId]
    );
    const ride = rows[0];
    if (!ride) throw new ApiError(404, 'Ride not found.');
    if (ride.status !== 'paymentPending') {
      throw new ApiError(400, 'Payment can only be initiated for an arrived ride.');
    }

    const existing = await getPool().query(
      `SELECT * FROM payments WHERE ride_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [rideId]
    );
    const previous = existing.rows[0];
    if (method === 'cash') {
      if (ride.payment_method === 'cash' && previous) {
        return res.json({ payment: paymentToJson(previous) });
      }
      if (!previous || previous.status !== 'failed') {
        throw new ApiError(409, 'Wait for the previous payment to fail before switching to cash.');
      }
      if (previous.provider === 'paypack') {
        if (previous.external_reference) {
          const confirmed = await refreshPaymentStatus(previous);
          if (confirmed.status !== 'failed') {
            throw new ApiError(409, 'The mobile-money payment has not definitively failed.');
          }
        } else if (previous.metadata?.reason !== REJECTED_REASON) {
          // No provider reference and not an outright refusal: a charge may exist.
          throw new ApiError(409, 'Payment outcome is uncertain. Contact support before paying in cash.');
        }
      }
      const switched = await getPool().query(
        `UPDATE rides SET payment_method='cash' WHERE id=$1 AND passenger_id=$2 AND status='paymentPending'
           RETURNING *`, [rideId, req.passengerId]
      );
      if (!switched.rows[0]) throw new ApiError(409, 'Ride is no longer awaiting payment.');
      const cash = await createPaymentForRide(switched.rows[0]);
      return res.status(201).json({ payment: paymentToJson(cash) });
    }
    if (previous) {
      const updated = previous.status === 'pending' && !previous.external_reference ? await chargePayment(previous, ride) : previous;
      return res.json({ payment: paymentToJson(updated) });
    }

    const payment = await createPaymentForRide(ride);
    const charged = await chargePayment(payment, ride);
    res.status(201).json({ payment: paymentToJson(charged) });
  })
);

// GET /api/payments/:id — current state.
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const payment = await loadOwnedPayment(req.params.id, req.passengerId);
    if (!payment) throw new ApiError(404, 'Payment not found.');
    res.json({ payment: paymentToJson(payment) });
  })
);

// POST /api/payments/:id/refresh — ask the gateway for the latest status.
router.post(
  '/:id/refresh',
  asyncHandler(async (req, res) => {
    const payment = await loadOwnedPayment(req.params.id, req.passengerId);
    if (!payment) throw new ApiError(404, 'Payment not found.');
    const updated = await refreshPaymentStatus(payment);
    res.json({ payment: paymentToJson(updated) });
  })
);

module.exports = router;
