const express = require('express');
const crypto = require('crypto');

const { getPool } = require('../db');
const { asyncHandler, ApiError } = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const { config } = require('../config');
const { pushNotification } = require('../services/notify');
const { dispatchEmergency } = require('../services/emergencyDispatch');
const { apiLimiter } = require('../middleware/rateLimit');

// The Kimu Transport call center the app's SOS button reaches. Server-side config
// (EMERGENCY_CALL_CENTER_PHONE) so it can be rotated without an app release;
// the client fetches it here and dials it with the OS dialer.
// Production refuses to start without it (config.js); in development it may
// be unset, in which case the app hides the call button.
function callCenterNumber() {
  return config.emergencyCallCenterPhone || null;
}

const router = express.Router();
router.use(requireAuth);

// GET /api/emergency/config — the SOS call-center configuration. Requires
// auth like the rest of this router (the safety screen is only reachable
// logged-in); contains nothing sensitive.
router.get(
  '/config',
  asyncHandler(async (_req, res) => {
    res.json({ callCenterPhone: callCenterNumber() });
  })
);

// POST /api/emergency — passenger SOS. Records the event server-side so the
// call center has an auditable trail, notifies the in-app control-room feed,
// and the client dials the Kimu Transport call center with the OS dialer.
router.post(
  '/',
  apiLimiter({ max: 5 }),
  asyncHandler(async (req, res) => {
    const { rideId, latitude, longitude, address, details } = req.body || {};
    if (rideId) {
      const owned = await getPool().query('SELECT id FROM rides WHERE id=$1 AND passenger_id=$2', [rideId, req.passengerId]);
      if (!owned.rows[0]) throw new ApiError(404, 'Ride not found.');
    }
    const reference = `EM-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
    const { rows } = await getPool().query(
      `INSERT INTO emergency_events
         (ride_id, passenger_id, latitude, longitude, address, details, status, reference)
       VALUES ($1,$2,$3,$4,$5,$6,'pending',$7)
       RETURNING *`,
      [
        rideId || null,
        req.passengerId,
        latitude ?? null,
        longitude ?? null,
        address ?? null,
        details ?? null,
        reference,
      ]
    );
    const event = rows[0];
    try {
      await dispatchEmergency(event.id);
    } catch (err) {
      console.error('[emergency] dispatch failed:', event.id, err.message);
      throw new ApiError(502, 'SOS was recorded but the operator alert has not been delivered. Please call the center now.');
    }
    await pushNotification(req.passengerId, {
      title: 'SOS alert submitted',
      body: 'The call center alert was submitted. Please place the call if you can.',
      type: 'safety',
      rideId: rideId || null,
    });

    res.status(201).json({
      emergency: {
        id: event.id,
        status: 'dispatched',
        createdAt: event.created_at,
        reference,
        callCenterPhone: callCenterNumber(),
      },
    });
  })
);

// GET /api/emergency — the passenger's own emergency history.
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { rows } = await getPool().query(
      `SELECT id, status, latitude, longitude, address, details, created_at, resolved_at
         FROM emergency_events
        WHERE passenger_id = $1 ORDER BY created_at DESC`,
      [req.passengerId]
    );
    res.json({ events: rows });
  })
);

module.exports = router;
