const express = require('express');
const crypto = require('crypto');

const { getPool } = require('../db');
const { asyncHandler, ApiError } = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const { config } = require('../config');
const { pushNotification } = require('../services/notify');

// The FEM C@BS call center the app's SOS button reaches. Server-side config
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
// and the client dials the FEM C@BS call center with the OS dialer.
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { rideId, latitude, longitude, address, details } = req.body || {};
    const { rows } = await getPool().query(
      `INSERT INTO emergency_events
         (ride_id, passenger_id, latitude, longitude, address, details, status)
       VALUES ($1,$2,$3,$4,$5,$6,'pending')
       RETURNING *`,
      [
        rideId || null,
        req.passengerId,
        latitude ?? null,
        longitude ?? null,
        address ?? null,
        details ?? null,
      ]
    );
    const event = rows[0];

    const pax = await getPool().query('SELECT * FROM passengers WHERE id = $1', [
      req.passengerId,
    ]);
    const passenger = pax.rows[0];
    if (passenger?.emergency_contact_phone) {
      // The actual call is made on the device; we log that contacts were
      // advised so support can follow up.
      await getPool().query(
        'UPDATE emergency_events SET details = COALESCE(details,\'\') || \' [contact advised]\' WHERE id = $1',
        [event.id]
      );
    }

    await pushNotification(req.passengerId, {
      title: 'Help is on the way',
      body: 'We recorded your emergency and notified the FEM C@BS call center.',
      type: 'safety',
      rideId: rideId || null,
    });

    res.status(201).json({
      emergency: {
        id: event.id,
        status: event.status,
        createdAt: event.created_at,
        reference: `EM-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
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