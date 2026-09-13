const express = require('express');

const { getPool } = require('../db');
const { asyncHandler, ApiError } = require('../utils/asyncHandler');
const { rideToJson } = require('../utils/serialize');
const { requireAuth } = require('../middleware/auth');
const { haversineKm, estimateDurationMinutes, estimateFare } = require('../utils/distance');
const { simulateRide } = require('../services/rideSimulator');

const router = express.Router();
router.use(requireAuth);

async function loadOwnedRide(rideId, passengerId) {
  const { rows } = await getPool().query(
    'SELECT * FROM rides WHERE id = $1 AND passenger_id = $2',
    [rideId, passengerId]
  );
  return rows[0] || null;
}

// POST /api/rides — request a ride. The fare/distance/duration are always
// recomputed server-side; the client's own estimate is never trusted.
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { pickup, destination, vehicleId, paymentMethodId } = req.body || {};
    if (
      !pickup || !destination || !vehicleId || !paymentMethodId ||
      typeof pickup.latitude !== 'number' || typeof pickup.longitude !== 'number' ||
      typeof destination.latitude !== 'number' || typeof destination.longitude !== 'number'
    ) {
      throw new ApiError(400, 'Pickup, destination (with coordinates), vehicle and payment method are required.');
    }

    const { rows: vehicleRows } = await getPool().query('SELECT * FROM vehicles WHERE id = $1', [
      vehicleId,
    ]);
    const vehicle = vehicleRows[0];
    if (!vehicle) throw new ApiError(400, 'Unknown vehicle.');

    const distanceKm = haversineKm(
      pickup.latitude,
      pickup.longitude,
      destination.latitude,
      destination.longitude
    );
    const durationMinutes = estimateDurationMinutes(distanceKm);
    const fare = estimateFare(vehicle, distanceKm);

    const { rows } = await getPool().query(
      `INSERT INTO rides (
         passenger_id, vehicle_id, pickup_address, pickup_latitude, pickup_longitude,
         dest_address, dest_latitude, dest_longitude, distance_km, duration_minutes,
         estimated_fare, status, payment_method
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'searchingDriver',$12)
       RETURNING *`,
      [
        req.passengerId,
        vehicle.id,
        pickup.address || 'Pickup',
        pickup.latitude,
        pickup.longitude,
        destination.address || 'Destination',
        destination.latitude,
        destination.longitude,
        distanceKm,
        durationMinutes,
        fare,
        paymentMethodId,
      ]
    );
    const ride = rows[0];

    // Fire-and-forget: progresses the ride through its simulated lifecycle.
    simulateRide({ id: ride.id, distanceKm, estimatedFare: fare }).catch((err) =>
      console.error('[rides] simulator failed:', err)
    );

    res.status(201).json({ ride: rideToJson(ride) });
  })
);

// GET /api/rides — ride history for the current passenger.
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { rows } = await getPool().query(
      'SELECT * FROM rides WHERE passenger_id = $1 ORDER BY created_at DESC LIMIT 100',
      [req.passengerId]
    );
    res.json({ rides: rows.map(rideToJson) });
  })
);

// GET /api/rides/:id
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const ride = await loadOwnedRide(req.params.id, req.passengerId);
    if (!ride) throw new ApiError(404, 'Ride not found.');
    res.json({ ride: rideToJson(ride) });
  })
);

// GET /api/rides/:id/stream — Server-Sent Events with live ride status.
// Stands in for a realtime subscription until the app is wired to a
// push-based transport (websockets / Supabase Realtime / etc).
router.get(
  '/:id/stream',
  asyncHandler(async (req, res) => {
    const ride = await loadOwnedRide(req.params.id, req.passengerId);
    if (!ride) throw new ApiError(404, 'Ride not found.');

    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.flushHeaders();

    let lastPayload = '';
    const send = (row) => {
      const payload = JSON.stringify(rideToJson(row));
      if (payload === lastPayload) return;
      lastPayload = payload;
      res.write(`data: ${payload}\n\n`);
    };
    send(ride);

    const interval = setInterval(async () => {
      const current = await loadOwnedRide(req.params.id, req.passengerId);
      if (!current) {
        clearInterval(interval);
        res.end();
        return;
      }
      send(current);
      if (current.status === 'completed' || current.status === 'cancelled') {
        clearInterval(interval);
        res.end();
      }
    }, 1500);

    req.on('close', () => clearInterval(interval));
  })
);

// POST /api/rides/:id/cancel
router.post(
  '/:id/cancel',
  asyncHandler(async (req, res) => {
    const ride = await loadOwnedRide(req.params.id, req.passengerId);
    if (!ride) throw new ApiError(404, 'Ride not found.');
    if (ride.status === 'completed' || ride.status === 'cancelled') {
      throw new ApiError(400, 'This ride can no longer be cancelled.');
    }
    const { rows } = await getPool().query(
      `UPDATE rides SET status = 'cancelled', cancelled_at = now() WHERE id = $1 RETURNING *`,
      [ride.id]
    );
    res.json({ ride: rideToJson(rows[0]) });
  })
);

// POST /api/rides/:id/rate
router.post(
  '/:id/rate',
  asyncHandler(async (req, res) => {
    const { rating, comment } = req.body || {};
    const value = Number(rating);
    if (!Number.isInteger(value) || value < 1 || value > 5) {
      throw new ApiError(400, 'Rating must be an integer from 1 to 5.');
    }
    const ride = await loadOwnedRide(req.params.id, req.passengerId);
    if (!ride) throw new ApiError(404, 'Ride not found.');
    if (ride.status !== 'completed') {
      throw new ApiError(400, 'Only completed rides can be rated.');
    }
    const { rows } = await getPool().query(
      `UPDATE rides SET rating = $2, rating_comment = $3 WHERE id = $1 RETURNING *`,
      [ride.id, value, comment || null]
    );
    res.json({ ride: rideToJson(rows[0]) });
  })
);

module.exports = router;
