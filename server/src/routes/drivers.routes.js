const express = require('express');

const { getPool } = require('../db');
const { asyncHandler, ApiError } = require('../utils/asyncHandler');
const { rideToJson, driverToJson } = require('../utils/serialize');
const { signDriverToken } = require('../utils/jwt');
const { requireDriverAuth, requireAuth } = require('../middleware/auth');
const { apiLimiter } = require('../middleware/rateLimit');
const { haversineKm } = require('../utils/distance');
const {
  authenticateDriver,
  getActiveRide,
  getActiveRides,
  updateDriverLocation,
  acceptRide,
  markArrived,
  verifyPin,
  completeTrip,
  changeDestinationAsDriver,
} = require('../services/rideDriverOps');

const router = express.Router();

// POST /api/drivers/login — real driver-side auth for the future driver app
// and the reference driver console.
router.post(
  '/login',
  apiLimiter({ max: 40 }),
  asyncHandler(async (req, res) => {
    const { phone, password } = req.body || {};
    if (!phone || !password) throw new ApiError(400, 'Phone and password are required.');
    const driver = await authenticateDriver(String(phone).trim(), String(password));
    res.json({
      driver: driverToJson(driver),
      token: signDriverToken(driver.id),
    });
  })
);

// GET /api/drivers/nearby?lat=&lng= — approximate live positions of nearby
// online drivers, passenger-authenticated. No driver identity is exposed
// (just a position and vehicle class) — this only feeds the "cars near you"
// decoration on the passenger home map, not real dispatch data.
const passengerFacing = express.Router();
// requireAuth is scoped to this one route (not passengerFacing.use(...)),
// which would otherwise run for every request that reaches this router —
// including driver-authenticated requests further below — and 401 them
// before they ever get a chance to match.
passengerFacing.get(
  '/nearby',
  requireAuth,
  asyncHandler(async (req, res) => {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      throw new ApiError(400, 'lat and lng are required.');
    }
    const { rows } = await getPool().query(
      `SELECT current_latitude AS latitude, current_longitude AS longitude,
              current_vehicle_id AS vehicle_id
         FROM drivers
        WHERE status = 'active' AND verified = TRUE
          AND current_latitude IS NOT NULL AND current_longitude IS NOT NULL
        LIMIT 200`
    );
    const nearby = rows
      .map((r) => ({ ...r, distanceKm: haversineKm(lat, lng, r.latitude, r.longitude) }))
      .filter((r) => r.distanceKm <= 5)
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, 12);
    res.json({
      drivers: nearby.map((r) => ({
        latitude: r.latitude,
        longitude: r.longitude,
        vehicleId: r.vehicle_id,
      })),
    });
  })
);
router.use(passengerFacing);

// Authenticated driver endpoints act on the single ride currently assigned to
// the driver — the driver is never free to touch someone else's ride.
const active = express.Router();
active.use(requireDriverAuth);

// GET /api/drivers/ride — the driver's current assigned ride, if any.
// Kept for backward compatibility; a pooled trip has more than one active
// ride, so drivers should prefer GET /api/drivers/rides/active.
active.get(
  '/ride',
  asyncHandler(async (req, res) => {
    const ride = await getActiveRide(req.driverId);
    res.json({ ride: ride ? rideToJson(ride) : null });
  })
);

// GET /api/drivers/rides/active — every ride currently assigned to this
// driver, oldest-picked-up-first. A shared/pooled trip returns more than one
// so the driver app can show the full queue of pickups/drop-offs to handle.
active.get(
  '/rides/active',
  asyncHandler(async (req, res) => {
    const rides = await getActiveRides(req.driverId);
    res.json({ rides: rides.map(rideToJson) });
  })
);

// POST /api/drivers/location — live GPS reported by the driver's phone.
active.post(
  '/location',
  asyncHandler(async (req, res) => {
    await updateDriverLocation(req.driverId, req.body || {});
    res.status(204).end();
  })
);

// POST /api/drivers/rides/:id/accept — driver accepts and heads to pickup.
active.post(
  '/rides/:id/accept',
  asyncHandler(async (req, res) => {
    await acceptRide(req.driverId, req.params.id);
    res.json({ accepted: true });
  })
);

// POST /api/drivers/rides/:id/arrived
active.post(
  '/rides/:id/arrived',
  asyncHandler(async (req, res) => {
    const pin = await markArrived(req.driverId, req.params.id);
    res.json({ pin, rideId: req.params.id, message: 'Arrival recorded.' });
  })
);

// POST /api/drivers/rides/:id/verify-pin
active.post(
  '/rides/:id/verify-pin',
  asyncHandler(async (req, res) => {
    const { pin } = req.body || {};
    if (!pin) throw new ApiError(400, 'A ride PIN is required.');
    await verifyPin(req.driverId, req.params.id, pin);
    res.json({ verified: true });
  })
);

// POST /api/drivers/rides/:id/complete-trip — ends the trip, creates payment.
active.post(
  '/rides/:id/complete-trip',
  asyncHandler(async (req, res) => {
    const { ride, payment } = await completeTrip(req.driverId, req.params.id);
    res.json({
      ride: rideToJson(ride),
      payment: {
        id: payment.id,
        amount: Number(payment.amount),
        method: payment.method,
        status: payment.status,
        state: payment.state,
      },
    });
  })
);

// POST /api/drivers/rides/:id/change-destination — driver-initiated change.
active.post(
  '/rides/:id/change-destination',
  asyncHandler(async (req, res) => {
    const ride = await changeDestinationAsDriver(req.driverId, req.params.id, req.body?.destination);
    res.json({ ride: rideToJson(ride) });
  })
);

router.use(active);
module.exports = router;