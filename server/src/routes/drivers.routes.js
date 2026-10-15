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
const { confirmCashPayment, createPaymentForRide } = require('../services/payments');
const { eligibleDriverSql } = require('../services/driverKyc');
const {
  authenticateDriver,
  getActiveRide,
  getActiveRides,
  updateDriverLocation,
  getStopPlan,
  acceptRide,
  declineRide,
  markArrived,
  verifyPin,
  startTrip,
  completeTrip,
  chargeRide,
  cancelRideAsDriver,
  changeDestinationAsDriver,
} = require('../services/rideDriverOps');

const router = express.Router();

// POST /api/drivers/register — self-service driver sign-up for the driver
// app. New accounts start unverified/offline: the driver can sign in to
// finish the application (profile, vehicle, the four KYC documents), but
// cannot go active or receive rides until an operator has reviewed the
// documents and verified the account (middleware/auth.js).
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
        false,
      ]
    );
    const driver = rows[0];
    res.status(201).json({
      driver: driverToJson(driver),
      token: signDriverToken(driver.id),
    });
  })
);

// POST /api/drivers/login — driver-side auth for the driver app and the
// reference driver console.
//
// An unverified driver signs in too: they need a session to upload the
// documents the operator reviews, and the registration session may be gone
// (app reinstalled, phone changed, token expired). The session they get is
// the same kind as everyone else's; requireDriverAuth limits it to the
// application routes until the account is verified. Only suspended and
// closed accounts are refused.
router.post(
  '/login',
  // Per phone number being tried, so one account cannot be brute-forced and
  // drivers on a shared address do not lock each other out.
  apiLimiter({ max: 40, keyGenerator: (req) => `driver-login:${String(req.body?.phone || req.ip).trim()}` }),
  asyncHandler(async (req, res) => {
    const { phone, password } = req.body || {};
    if (!phone || !password) throw new ApiError(400, 'Phone and password are required.');
    const driver = await authenticateDriver(String(phone).trim(), String(password));
    if (driver.status === 'suspended') {
      throw new ApiError(403, 'Your driver account is suspended. Contact Kimu Transport support.');
    }
    res.json({
      driver: driverToJson(driver),
      token: signDriverToken(driver.id),
      // Tells the app where to send the driver: the documents screen until
      // the operator has approved the account.
      pendingApproval: !driver.verified,
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

// GET /api/drivers/rides/stops — the remaining pickups and drop-offs across
// every active ride, in the order to drive them.
active.get(
  '/rides/stops',
  asyncHandler(async (req, res) => {
    res.json(await getStopPlan(req.driverId));
  })
);

// POST /api/drivers/location — live GPS reported by the driver's phone.
active.post(
  '/location',
  asyncHandler(async (req, res) => {
    // 200 either way: a fix that was ignored (stale, inaccurate, an
    // impossible jump...) is reported back so the app can show GPS trouble.
    res.json(await updateDriverLocation(req.driverId, req.body || {}));
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
  // Guards one ride's PIN against guessing. Keyed per driver and ride, not
  // per IP: drivers share carrier and proxy addresses, and a shared bucket
  // would stop every driver from starting trips.
  apiLimiter({ max: 15, keyGenerator: (req) => `pin:${req.driverId}:${req.params.id}` }),
  asyncHandler(async (req, res) => {
    const { pin } = req.body || {};
    if (!pin) throw new ApiError(400, 'A ride PIN is required.');
    await verifyPin(req.driverId, req.params.id, pin);
    res.json({ verified: true });
  })
);

// POST /api/drivers/rides/:id/start — the rider has paired (scanned the QR),
// so the ride is pinVerified; the driver taps Start to begin the trip.
active.post(
  '/rides/:id/start',
  asyncHandler(async (req, res) => {
    await startTrip(req.driverId, req.params.id);
    res.json({ started: true });
  })
);

// POST /api/drivers/rides/:id/complete-trip — ends the trip; the fare is now
// collected separately (the driver sends the MoMo prompt or confirms cash).
active.post(
  '/rides/:id/complete-trip',
  asyncHandler(async (req, res) => {
    const { ride } = await completeTrip(req.driverId, req.params.id);
    res.json({ ride: rideToJson(ride) });
  })
);

// POST /api/drivers/rides/:id/charge { phone } — the driver types the
// passenger's mobile-money number; this sends the MTN/Airtel prompt to it.
active.post(
  '/rides/:id/charge',
  asyncHandler(async (req, res) => {
    const { phone } = req.body || {};
    if (!phone) throw new ApiError(400, "Enter the passenger's mobile money number.");
    const { payment, method } = await chargeRide(req.driverId, req.params.id, phone);
    res.json({
      method,
      payment: { id: payment.id, amount: Number(payment.amount), method: payment.method, status: payment.status, state: payment.state },
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
  let cashPayment = rows[0];
  if (!cashPayment) {
    // The driver chose cash at the collect-the-fare step, so no payment was
    // created yet — make the cash one now, then confirm it.
    const { rows: rideRows } = await getPool().query(
      "SELECT * FROM rides WHERE id = $1 AND driver_id = $2 AND status = 'paymentPending'",
      [req.params.id, req.driverId]
    );
    if (!rideRows[0]) throw new ApiError(404, 'No ride awaiting payment for this driver.');
    await getPool().query("UPDATE rides SET payment_method = 'cash' WHERE id = $1", [req.params.id]);
    const { rows: fresh } = await getPool().query('SELECT * FROM rides WHERE id = $1', [req.params.id]);
    cashPayment = await createPaymentForRide(fresh[0]);
  }
  const payment = await confirmCashPayment(cashPayment);
  // A late confirmation closes the operator's case for this ride.
  await getPool().query(
    `UPDATE payment_exceptions SET status='resolved', resolution='driver_confirmed', resolved_at=now()
      WHERE payment_id = $1 AND status = 'open' AND reason = 'cash_unconfirmed'`,
    [payment.id]
  );
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
