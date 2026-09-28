const express = require('express');

const { getPool } = require('../db');
const { asyncHandler, ApiError } = require('../utils/asyncHandler');
const { rideToJson, paymentToJson, receiptToJson } = require('../utils/serialize');
const { requireAuth } = require('../middleware/auth');
const { onRideEvent } = require('../services/rideEvents');
const {
  computeEstimate,
  createRide,
  cancelRide,
  changeDestination,
  rateRide,
} = require('../services/rideService');
const {
  getPaymentForRide,
  confirmCashPayment,
} = require('../services/payments');

const { quoteTrip } = require('../services/pricing');
const { recentTrail } = require('../services/driverTrails');

const router = express.Router();
router.use(requireAuth);

async function loadOwnedRide(rideId, passengerId) {
  const { rows } = await getPool().query(
    'SELECT * FROM rides WHERE id = $1 AND passenger_id = $2',
    [rideId, passengerId]
  );
  return rows[0] || null;
}

// POST /api/rides — request (or schedule) a ride. All fares are computed
// server-side; the client's estimate is never trusted.
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const ride = await createRide(req.passengerId, req.body || {});
    res.status(201).json({ ride: rideToJson(ride) });
  })
);

// POST /api/rides/location — live GPS reported by the passenger's own phone
// while a ride is active, so their assigned driver can see where they
// actually are (they may have walked from the original pickup point).
// Mirrors POST /api/drivers/location exactly, passenger-side.
router.post(
  '/location',
  asyncHandler(async (req, res) => {
    const { latitude, longitude, heading } = req.body || {};
    if (typeof latitude !== 'number' || typeof longitude !== 'number') {
      throw new ApiError(400, 'latitude and longitude are required.');
    }
    await getPool().query(
      `INSERT INTO passenger_locations (passenger_id, latitude, longitude, heading, recorded_at)
       VALUES ($1,$2,$3,$4, now())
       ON CONFLICT (passenger_id) DO UPDATE SET
         latitude = EXCLUDED.latitude,
         longitude = EXCLUDED.longitude,
         heading = EXCLUDED.heading,
         recorded_at = now()`,
      [req.passengerId, latitude, longitude, heading ?? null]
    );
    res.status(204).end();
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

function parseLatLng(value) {
  const [lat, lng] = String(value || '').split(',').map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { latitude: lat, longitude: lng };
}

// GET /api/rides/quote?pickup=lat,lng&destination=lat,lng&rideType=private
// Upfront prices for every vehicle class over the real road route, with the
// route geometry, surge and per-class pickup ETA (the vehicle-choice sheet).
router.get(
  '/quote',
  asyncHandler(async (req, res) => {
    const pickup = parseLatLng(req.query.pickup);
    const destination = parseLatLng(req.query.destination);
    if (!pickup || !destination) throw new ApiError(400, 'pickup and destination are required as lat,lng.');
    const rideType = req.query.rideType === 'shared' ? 'shared' : 'private';
    res.json({ quote: await quoteTrip(pickup, destination, rideType) });
  })
);

// GET /api/rides/estimate — server-side fare for one vehicle class.
router.get(
  '/estimate',
  asyncHandler(async (req, res) => {
    const { vehicleId, rideType, quoteId } = req.query;
    const pickup = parseLatLng(req.query.pickup);
    const destination = parseLatLng(req.query.destination);
    if (!pickup || !destination) throw new ApiError(400, 'pickup and destination are required as lat,lng.');
    const { rows: vehicleRows } = await getPool().query(
      'SELECT * FROM vehicles WHERE id = $1',
      [vehicleId]
    );
    const vehicle = vehicleRows[0];
    if (!vehicle) throw new ApiError(400, 'Unknown vehicle.');
    const estimate = await computeEstimate(
      vehicle,
      pickup,
      destination,
      rideType === 'shared' ? 'shared' : 'private',
      quoteId
    );
    res.json({ estimate });
  })
);

// GET /api/rides/current — the passenger's most recent NON terminal ride.
router.get(
  '/current',
  asyncHandler(async (req, res) => {
    const { rows } = await getPool().query(
      `SELECT * FROM rides
        WHERE passenger_id = $1 AND status NOT IN ('completed','cancelled')
        ORDER BY created_at DESC LIMIT 1`,
      [req.passengerId]
    );
    res.json({ ride: rows[0] ? rideToJson(rows[0]) : null });
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

// GET /api/rides/:id/driver-location — the live driver GPS for tracking.
router.get(
  '/:id/driver-location',
  asyncHandler(async (req, res) => {
    const ride = await loadOwnedRide(req.params.id, req.passengerId);
    if (!ride) throw new ApiError(404, 'Ride not found.');
    if (!ride.driver_id) return res.json({ location: null });
    const { rows } = await getPool().query(
      'SELECT * FROM driver_locations WHERE driver_id = $1',
      [ride.driver_id]
    );
    const loc = rows[0];
    const now = Date.now();
    res.json({
      serverTime: now,
      location: loc
        ? {
            latitude: loc.latitude,
            longitude: loc.longitude,
            heading: loc.heading ?? null,
            recordedAt: loc.recorded_at,
            trail: recentTrail(ride.driver_id, now),
          }
        : null,
    });
  })
);

// GET /api/rides/:id/route — the actual GPS breadcrumbs recorded while the
// driver drove this ride, ordered by time. Used to draw the real road path
// travelled (as opposed to a straight pickup -> destination line) once the
// trip is finished, and can also be used to trace progress mid-ride.
router.get(
  '/:id/route',
  asyncHandler(async (req, res) => {
    const ride = await loadOwnedRide(req.params.id, req.passengerId);
    if (!ride) throw new ApiError(404, 'Ride not found.');
    const { rows } = await getPool().query(
      'SELECT latitude, longitude, recorded_at FROM ride_route_points WHERE ride_id = $1 ORDER BY recorded_at ASC',
      [ride.id]
    );
    res.json({
      points: rows.map((r) => ({
        latitude: r.latitude,
        longitude: r.longitude,
        recordedAt: r.recorded_at,
      })),
    });
  })
);

// GET /api/rides/:id/companions — other passengers currently pooled into the
// same vehicle for a shared ride (first name only, for privacy).
router.get(
  '/:id/companions',
  asyncHandler(async (req, res) => {
    const ride = await loadOwnedRide(req.params.id, req.passengerId);
    if (!ride) throw new ApiError(404, 'Ride not found.');
    if (!ride.pool_group_id) return res.json({ companions: [] });
    const { rows } = await getPool().query(
      `SELECT p.full_name, r.status FROM rides r
         JOIN passengers p ON p.id = r.passenger_id
        WHERE r.pool_group_id = $1 AND r.id != $2
          AND r.status NOT IN ('completed', 'cancelled')`,
      [ride.pool_group_id, ride.id]
    );
    res.json({
      companions: rows.map((r) => ({
        firstName: (r.full_name || '').trim().split(/\s+/)[0] || 'Passenger',
        status: r.status,
      })),
    });
  })
);

// GET /api/rides/:id/stream — Server-Sent Events: ride state + live driver
// location. Backed by the in-process event hub and a benign poller so it also
// survives restarts.
router.get(
  '/:id/stream',
  asyncHandler(async (req, res) => {
    const ride = await loadOwnedRide(req.params.id, req.passengerId);
    if (!ride) throw new ApiError(404, 'Ride not found.');

    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();

    const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);
    send({ type: 'ride', ride: rideToJson(ride) });

    const unsubscribe = onRideEvent(ride.id, (payload) => {
      const parsed = typeof payload === 'string' ? JSON.parse(payload) : payload;
      send(parsed);
    });

    const poller = setInterval(async () => {
      const current = await loadOwnedRide(req.params.id, req.passengerId);
      if (!current) {
        clearInterval(poller);
        res.end();
        return;
      }
      send({ type: 'ride', ride: rideToJson(current) });

      if (current.driver_id) {
        const loc = await getPool().query(
          'SELECT * FROM driver_locations WHERE driver_id = $1',
          [current.driver_id]
        );
        if (loc.rows[0]) {
          send({
            type: 'driverLocation',
            location: {
              latitude: loc.rows[0].latitude,
              longitude: loc.rows[0].longitude,
              heading: loc.rows[0].heading ?? null,
              recordedAt: loc.rows[0].recorded_at,
            },
          });
        }
      }

      if (['completed', 'cancelled'].includes(current.status)) {
        clearInterval(poller);
        res.end();
      }
    }, 3000);

    req.on('close', () => {
      unsubscribe();
      clearInterval(poller);
    });
  })
);

// POST /api/rides/:id/cancel
router.post(
  '/:id/cancel',
  asyncHandler(async (req, res) => {
    const { reason } = req.body || {};
    const ride = await cancelRide(req.passengerId, req.params.id, reason);
    res.json({ ride: rideToJson(ride) });
  })
);

// POST /api/rides/:id/change-destination
router.post(
  '/:id/change-destination',
  asyncHandler(async (req, res) => {
    const ride = await changeDestination(
      req.passengerId,
      req.params.id,
      req.body?.destination
    );
    res.json({ ride: rideToJson(ride) });
  })
);

// POST /api/rides/:id/rate
router.post(
  '/:id/rate',
  asyncHandler(async (req, res) => {
    const { rating, comment } = req.body || {};
    const ride = await rateRide(req.passengerId, req.params.id, rating, comment);
    res.json({ ride: rideToJson(ride) });
  })
);

// GET /api/rides/:id/payment — current payment for the ride (if any).
router.get(
  '/:id/payment',
  asyncHandler(async (req, res) => {
    const payment = await getPaymentForRide(req.params.id, req.passengerId);
    res.json({ payment: paymentToJson(payment) });
  })
);

// POST /api/rides/:id/pay-cash — passenger confirms in-person cash settlement.
router.post(
  '/:id/pay-cash',
  asyncHandler(async (req, res) => {
    const ride = await loadOwnedRide(req.params.id, req.passengerId);
    if (!ride) throw new ApiError(404, 'Ride not found.');
    if (ride.status !== 'paymentPending') {
      throw new ApiError(400, 'There is nothing to pay for this ride right now.');
    }
    const payment = await getPaymentForRide(ride.id, req.passengerId);
    if (!payment) throw new ApiError(404, 'No payment found for this ride.');
    const settled = await confirmCashPayment(payment);
    res.json({ payment: paymentToJson(settled) });
  })
);

// GET /api/rides/:id/receipt — the paid ride's receipt, if any.
router.get(
  '/:id/receipt',
  asyncHandler(async (req, res) => {
    const ride = await loadOwnedRide(req.params.id, req.passengerId);
    if (!ride) throw new ApiError(404, 'Ride not found.');
    const { rows } = await getPool().query(
      `SELECT r.* FROM receipts r JOIN payments p ON p.id = r.payment_id
        WHERE r.ride_id = $1 ORDER BY r.created_at DESC LIMIT 1`,
      [ride.id]
    );
    res.json({ receipt: receiptToJson(rows[0] || null) });
  })
);

module.exports = router;