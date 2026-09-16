const express = require('express');
const crypto = require('crypto');

const { getPool } = require('../db');
const { config } = require('../config');
const { asyncHandler, ApiError } = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// POST /api/share — creates a public trip-sharing token for an active ride.
// The link is read-only live tracking for a passenger's trusted contacts
// (family). It never exposes payment or account data.
router.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { rideId } = req.body || {};
    if (!rideId) throw new ApiError(400, 'rideId is required.');
    const { rows } = await getPool().query(
      'SELECT * FROM rides WHERE id = $1 AND passenger_id = $2',
      [rideId, req.passengerId]
    );
    const ride = rows[0];
    if (!ride) throw new ApiError(404, 'Ride not found.');
    if (['completed', 'cancelled'].includes(ride.status)) {
      throw new ApiError(400, 'Only active rides can be shared.');
    }

    const token = crypto.randomBytes(12).toString('hex');
    const expiresAt = new Date(
      Date.now() + config.tripShareTtlHours * 60 * 60 * 1000
    ).toISOString();
    const { rows: shareRows } = await getPool().query(
      `INSERT INTO trip_shares (token, ride_id, passenger_id, expires_at)
       VALUES ($1,$2,$3,$4) RETURNING token, expires_at, created_at`,
      [token, ride.id, req.passengerId, expiresAt]
    );
    res.status(201).json({ share: shareRows[0] });
  })
);

// GET /api/share/:token — public, unauthenticated live snapshot of a shared
// ride. Includes only pickup/destination/status/driver/position.
router.get(
  '/:token',
  asyncHandler(async (req, res) => {
    const { rows } = await getPool().query(
      `SELECT s.token, s.expires_at, r.id AS ride_id, r.status, r.pickup_address,
              r.pickup_latitude, r.pickup_longitude, r.dest_address,
              r.dest_latitude, r.dest_longitude, r.ride_type,
              r.driver_name, r.driver_vehicle_model, r.driver_license_plate
         FROM trip_shares s
         JOIN rides r ON r.id = s.ride_id
        WHERE s.token = $1`,
      [req.params.token]
    );
    if (!rows[0]) throw new ApiError(404, 'Share link not found.');
    if (new Date(rows[0].expires_at) < new Date()) {
      throw new ApiError(410, 'This share link has expired.');
    }
    await getPool().query('UPDATE trip_shares SET view_count = view_count + 1 WHERE token = $1', [
      req.params.token,
    ]);
    const row = rows[0];
    let location = null;
    if (row.status !== 'completed' && row.status !== 'cancelled') {
      const loc = await getPool().query(
        'SELECT latitude, longitude FROM driver_locations WHERE driver_id = (SELECT driver_id FROM rides WHERE id = $1)',
        [row.ride_id]
      );
      if (loc.rows[0]) location = loc.rows[0];
    }
    res.json({
      trip: {
        status: row.status,
        rideType: row.ride_type,
        pickupAddress: row.pickup_address,
        destinationAddress: row.dest_address,
        driverName: row.driver_name,
        vehicleModel: row.driver_vehicle_model,
        licensePlate: row.driver_license_plate,
        expiresAt: row.expires_at,
      },
      location,
    });
  })
);

module.exports = router;