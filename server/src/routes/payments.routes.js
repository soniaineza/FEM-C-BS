const express = require('express');

const { getPool } = require('../db');
const { asyncHandler, ApiError } = require('../utils/asyncHandler');
const { paymentToJson } = require('../utils/serialize');
const { requireAuth } = require('../middleware/auth');
const {
  createPaymentForRide,
  chargePayment,
  refreshPaymentStatus,
  confirmCashPayment,
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
    const { rideId } = req.body || {};
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
    if (existing.rows[0]) {
      return res.json({ payment: paymentToJson(existing.rows[0]) });
    }

    const payment = await createPaymentForRide(ride);
    await chargePayment(payment, ride);
    res.status(201).json({ payment: paymentToJson(payment) });
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

// POST /api/payments/:id/confirm-cash — passenger confirms they paid in cash.
router.post(
  '/:id/confirm-cash',
  asyncHandler(async (req, res) => {
    const payment = await loadOwnedPayment(req.params.id, req.passengerId);
    if (!payment) throw new ApiError(404, 'Payment not found.');
    const settled = await confirmCashPayment(payment);
    res.json({ payment: paymentToJson(settled) });
  })
);

module.exports = router;