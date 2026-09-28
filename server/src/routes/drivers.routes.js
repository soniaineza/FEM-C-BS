const express = require('express');
const crypto = require('crypto');
const { recentTrail } = require('../services/driverTrails');
const bcrypt = require('bcryptjs');

const { getPool } = require('../db');
const { config } = require('../config');
const { asyncHandler, ApiError } = require('../utils/asyncHandler');
const { rideToJson, driverToJson } = require('../utils/serialize');
const { signDriverToken } = require('../utils/jwt');
const { requireDriverAuth, requireAuth } = require('../middleware/auth');
const { apiLimiter } = require('../middleware/rateLimit');
const { haversineKm } = require('../utils/distance');
const { confirmCashPayment } = require('../services/payments');
const { eligibleDriverSql } = require('../services/driverKyc');
const {
  authenticateDriver,
  getActiveRide,
  getActiveRides,
  updateDriverLocation,
  acceptRide,
  declineRide,
  markArrived,
  verifyPin,
  completeTrip,
  cancelRideAsDriver,
  changeDestinationAsDriver,
} = require('../services/rideDriverOps');

const router = express.Router();

// POST /api/drivers/register — self-service driver sign-up for the driver
// app. New accounts start unverified/offline (KYC documents must be
// reviewed before a driver can go active and receive rides) unless
// DEV_AUTO_VERIFY_DRIVERS=1, which immediately verifies them so the app can
// be exercised end-to-end without a separate admin-verification tool.
router.post(
  '/register',
  apiLimiter({ max: 20 }),
  asyncHandler(async (req, res) => {
    const { fullName, phone, password, licenseNumber } = req.body || {};
    if (!fullName || !phone || !password) {
      throw new ApiError(400, 'Full name, phone and password are required.');
    }
    if (String(password).length < 6) {
      throw new ApiError(400, 'Password must be at least 6 characters.');
    }

    const { rows: existing } = await getPool().query('SELECT id FROM drivers WHERE phone = $1', [
      String(phone).trim(),
    ]);
    if (existing[0]) throw new ApiError(409, 'An account with that phone number already exists.');

    const passwordHash = await bcrypt.hash(String(password), 10);
    const { rows } = await getPool().query(
      `INSERT INTO drivers (full_name, phone, password_hash, license_number, verified, status)
       VALUES ($1, $2, $3, $4, $5, 'offline') RETURNING *`,
      [
        String(fullName).trim(),
        String(phone).trim(),
        passwordHash,
        licenseNumber ? String(licenseNumber).trim() : null,
        config.devAutoVerifyDrivers,
      ]
    );
    const driver = rows[0];
    res.status(201).json({
      driver: driverToJson(driver),
      token: signDriverToken(driver.id),
    });
  })
);

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
      `SELECT d.id, d.current_latitude AS latitude, d.current_longitude AS longitude,
              d.current_heading AS heading, d.current_vehicle_id AS vehicle_id
         FROM drivers d
        WHERE d.status = 'active' AND d.verified = TRUE
          AND d.current_latitude IS NOT NULL AND d.current_longitude IS NOT NULL
          ${eligibleDriverSql}
        LIMIT 300`
    );
    const now = Date.now();
    const nearby = rows
      .map((r) => ({ ...r, distanceKm: haversineKm(lat, lng, r.latitude, r.longitude) }))
      .filter((r) => r.distanceKm <= 5)
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, 24);
    res.json({
      serverTime: now,
      drivers: nearby.map((r) => ({
        // Stable per driver, but not the driver's real id.
        id: crypto.createHmac('sha256', config.jwtSecret).update(r.id).digest('base64url').slice(0, 12),
        latitude: r.latitude,
        longitude: r.longitude,
        heading: r.heading ?? null,
        vehicleId: r.vehicle_id,
        trail: recentTrail(r.id, now),
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

// POST /api/drivers/rides/:id/decline — driver declines a newly assigned
// ride; it goes back to the matching pool for another driver.
active.post(
  '/rides/:id/decline',
  asyncHandler(async (req, res) => {
    await declineRide(req.driverId, req.params.id);
    res.json({ declined: true });
  })
);

// POST /api/drivers/rides/:id/arrived
active.post(
  '/rides/:id/arrived',
  asyncHandler(async (req, res) => {
    await markArrived(req.driverId, req.params.id);
    res.json({ rideId: req.params.id, message: 'Arrival recorded.' });
  })
);

// POST /api/drivers/rides/:id/verify-pin
active.post(
  '/rides/:id/verify-pin',
  apiLimiter({ max: 15 }),
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

// The driver confirms that cash was actually collected after the trip.
active.post('/rides/:id/confirm-cash', asyncHandler(async (req, res) => {
  const { rows } = await getPool().query(
    `SELECT p.* FROM payments p JOIN rides r ON r.id = p.ride_id
      WHERE r.id = $1 AND r.driver_id = $2 AND r.status = 'paymentPending'
        AND p.method = 'cash' ORDER BY p.created_at DESC LIMIT 1`,
    [req.params.id, req.driverId]
  );
  if (!rows[0]) throw new ApiError(404, 'Cash payment awaiting this driver was not found.');
  const payment = await confirmCashPayment(rows[0]);
  res.json({ payment: { id: payment.id, status: payment.status } });
}));

// POST /api/drivers/rides/:id/cancel — driver-initiated cancellation of an
// already-accepted ride (e.g. a no-show passenger).
active.post(
  '/rides/:id/cancel',
  asyncHandler(async (req, res) => {
    const ride = await cancelRideAsDriver(req.driverId, req.params.id, req.body?.reason);
    res.json({ ride: rideToJson(ride) });
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
