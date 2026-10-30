const express = require('express');

const { getPool } = require('../db');
const { asyncHandler, ApiError } = require('../utils/asyncHandler');
const { savedPlaceToJson } = require('../utils/serialize');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// GET /api/places/saved
router.get(
  '/saved',
  asyncHandler(async (req, res) => {
    const { rows } = await getPool().query(
      'SELECT * FROM saved_places WHERE passenger_id = $1 ORDER BY created_at DESC',
      [req.passengerId]
    );
    res.json({ savedPlaces: rows.map(savedPlaceToJson) });
  })
);

// POST /api/places/saved
router.post(
  '/saved',
  asyncHandler(async (req, res) => {
    const { type, name, address, latitude, longitude } = req.body || {};
    if (!type || !name || !address) {
      throw new ApiError(400, 'A type, name and address are required.');
    }
    const { rows } = await getPool().query(
      `INSERT INTO saved_places (passenger_id, type, name, address, latitude, longitude)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [req.passengerId, type, name, address, latitude ?? null, longitude ?? null]
    );
    res.status(201).json({ savedPlace: savedPlaceToJson(rows[0]) });
  })
);

// DELETE /api/places/saved/:id
router.delete(
  '/saved/:id',
  asyncHandler(async (req, res) => {
    await getPool().query(
      'DELETE FROM saved_places WHERE id = $1 AND passenger_id = $2',
      [req.params.id, req.passengerId]
    );
    res.status(204).end();
  })
);

// GET /api/places/recent — recently used destinations (server-tracked).
router.get(
  '/recent',
  asyncHandler(async (req, res) => {
    const { rows } = await getPool().query(
      `SELECT address, latitude, longitude, times_used, last_used_at
         FROM recent_destinations WHERE passenger_id = $1
        ORDER BY last_used_at DESC LIMIT 20`,
      [req.passengerId]
    );
    res.json({
      recent: rows.map((r) => ({
        address: r.address,
        latitude: r.latitude,
        longitude: r.longitude,
        timesUsed: r.times_used,
        lastUsedAt: r.last_used_at,
      })),
    });
  })
);

// POST /api/places/recent — records a used destination (called on booking).
router.post(
  '/recent',
  asyncHandler(async (req, res) => {
    const { address, latitude, longitude } = req.body || {};
    if (!address || typeof latitude !== 'number' || typeof longitude !== 'number') {
      throw new ApiError(400, 'Address and coordinates are required.');
    }
    await getPool().query(
      `INSERT INTO recent_destinations (passenger_id, address, latitude, longitude)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (passenger_id, address)
       DO UPDATE SET times_used = recent_destinations.times_used + 1,
                     last_used_at = now()`,
      [req.passengerId, String(address).slice(0, 500), latitude, longitude]
    );
    res.status(204).end();
  })
);

module.exports = router;
