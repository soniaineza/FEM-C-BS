const express = require('express');
const crypto = require('crypto');

const { getPool } = require('../db');
const { config } = require('../config');
const { asyncHandler, ApiError } = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

const VALID_METHODS = new Set(['cash', 'mtn_momo', 'airtel_money', 'card']);

function generateReference() {
  return `FEM-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

// POST /api/payments — charges the fare for a ride.
//
// This simulates provider settlement (MTN MoMo / Airtel Money / card) since
// no real payment gateway is wired up yet. Cash is recorded immediately as
// "pending" (settled by the driver in person); other methods are recorded as
// "completed" with a generated reference.
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { rideId, method } = req.body || {};
    if (!rideId || !VALID_METHODS.has(method)) {
      throw new ApiError(400, 'A valid rideId and payment method are required.');
    }

    const { rows: rideRows } = await getPool().query(
      'SELECT * FROM rides WHERE id = $1 AND passenger_id = $2',
      [rideId, req.passengerId]
    );
    const ride = rideRows[0];
    if (!ride) throw new ApiError(404, 'Ride not found.');

    const amount = ride.final_fare != null ? ride.final_fare : ride.estimated_fare;
    const status = method === 'cash' ? 'pending' : 'completed';
    const reference = generateReference();

    const { rows } = await getPool().query(
      `INSERT INTO payments (ride_id, passenger_id, amount, method, status, reference)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [ride.id, req.passengerId, amount, method, status, reference]
    );
    const payment = rows[0];

    res.status(201).json({
      payment: {
        id: payment.id,
        rideId: payment.ride_id,
        amount: Number(payment.amount),
        method: payment.method,
        status: payment.status,
        createdAt: payment.created_at,
        ...(config.devRevealCodes ? { reference: payment.reference } : {}),
      },
    });
  })
);

module.exports = router;
