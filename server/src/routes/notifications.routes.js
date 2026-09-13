const express = require('express');

const { getPool } = require('../db');
const { asyncHandler, ApiError } = require('../utils/asyncHandler');
const { notificationToJson } = require('../utils/serialize');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// GET /api/notifications
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { rows } = await getPool().query(
      'SELECT * FROM notifications WHERE passenger_id = $1 ORDER BY created_at DESC LIMIT 100',
      [req.passengerId]
    );
    res.json({ notifications: rows.map(notificationToJson) });
  })
);

// POST /api/notifications/:id/read
router.post(
  '/:id/read',
  asyncHandler(async (req, res) => {
    const { rows } = await getPool().query(
      'UPDATE notifications SET read = TRUE WHERE id = $1 AND passenger_id = $2 RETURNING *',
      [req.params.id, req.passengerId]
    );
    if (!rows[0]) throw new ApiError(404, 'Notification not found.');
    res.json({ notification: notificationToJson(rows[0]) });
  })
);

// POST /api/notifications/device-token — registers this device for push
// notifications (Firebase Cloud Messaging on the client side).
router.post(
  '/device-token',
  asyncHandler(async (req, res) => {
    const { token, platform } = req.body || {};
    if (!token) throw new ApiError(400, 'A device token is required.');
    await getPool().query(
      `INSERT INTO device_tokens (passenger_id, token, platform)
       VALUES ($1, $2, $3)
       ON CONFLICT (token) DO UPDATE SET passenger_id = EXCLUDED.passenger_id, platform = EXCLUDED.platform`,
      [req.passengerId, token, platform || null]
    );
    res.status(204).end();
  })
);

module.exports = router;
