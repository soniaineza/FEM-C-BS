const express = require('express');
const bcrypt = require('bcryptjs');

const { getPool } = require('../db');
const { asyncHandler, ApiError } = require('../utils/asyncHandler');

const router = express.Router();

// POST /api/admin-seed/drivers — one-time helper to seed a few real driver
// accounts so ride matching has someone to find in a fresh database. Guarded
// by a shared secret (never the JWT secret) so it can't be triggered by
// anyone else. Meant to be removed once used.
router.post(
  '/drivers',
  asyncHandler(async (req, res) => {
    const key = req.header('x-seed-key');
    if (!process.env.SEED_KEY || key !== process.env.SEED_KEY) {
      throw new ApiError(403, 'Forbidden.');
    }

    const passwordHash = await bcrypt.hash('123456', 10);
    const demoDrivers = [
      { fullName: 'Jean Baptiste', phone: '+250780000001', vehicle: 'fem_economy', lat: -1.9441, lng: 30.0619, license: 'RAD 123 A' },
      { fullName: 'Alice Uwase', phone: '+250780000002', vehicle: 'fem_comfort', lat: -1.9509, lng: 30.0595, license: 'RAC 456 B' },
      { fullName: 'Eric Mugisha', phone: '+250780000003', vehicle: 'fem_economy', lat: -1.9586, lng: 30.0647, license: 'RAB 789 C' },
    ];

    const created = [];
    for (const d of demoDrivers) {
      const { rows } = await getPool().query(
        `INSERT INTO drivers (full_name, phone, password_hash, license_number, verified,
                               status, current_vehicle_id, current_latitude, current_longitude, rating)
         VALUES ($1,$2,$3,$4,TRUE,'active',$5,$6,$7,4.9)
         ON CONFLICT (phone) DO UPDATE SET
           verified = TRUE, status = 'active', current_vehicle_id = EXCLUDED.current_vehicle_id,
           current_latitude = EXCLUDED.current_latitude, current_longitude = EXCLUDED.current_longitude
         RETURNING id`,
        [d.fullName, d.phone, passwordHash, d.license, d.vehicle, d.lat, d.lng]
      );
      const driverId = rows[0].id;
      await getPool().query(
        `INSERT INTO driver_locations (driver_id, latitude, longitude, recorded_at)
         VALUES ($1,$2,$3, now())
         ON CONFLICT (driver_id) DO UPDATE SET latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude`,
        [driverId, d.lat, d.lng]
      );
      created.push({ fullName: d.fullName, phone: d.phone });
    }

    await getPool().query(
      `INSERT INTO promotions (code, title, description, discount_type, discount_value, min_fare, max_discount)
       VALUES ('WELCOME30', 'Welcome 30% off', '30% off your first trip.', 'percent', 30, 0, 5000)
       ON CONFLICT (code) DO NOTHING`
    );

    res.json({ seeded: created });
  })
);

// GET /api/admin-seed/debug/ride/:id — temporary raw-row inspector to
// diagnose a matching bug. Remove alongside the rest of this file.
router.get(
  '/debug/ride/:id',
  asyncHandler(async (req, res) => {
    const key = req.header('x-seed-key');
    if (!process.env.SEED_KEY || key !== process.env.SEED_KEY) {
      throw new ApiError(403, 'Forbidden.');
    }
    const { rows } = await getPool().query('SELECT * FROM rides WHERE id = $1', [req.params.id]);
    const { rows: historyRows } = await getPool().query(
      'SELECT * FROM ride_status_history WHERE ride_id = $1 ORDER BY changed_at ASC',
      [req.params.id]
    );
    res.json({ ride: rows[0] || null, history: historyRows });
  })
);

module.exports = router;
