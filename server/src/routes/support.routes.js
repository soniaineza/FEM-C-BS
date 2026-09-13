const express = require('express');

const { getPool } = require('../db');
const { asyncHandler, ApiError } = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// POST /api/support — submits a help ticket, returns a reference id.
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { category, subject, message } = req.body || {};
    if (!category || !subject || !message) {
      throw new ApiError(400, 'A category, subject and message are required.');
    }
    const { rows } = await getPool().query(
      `INSERT INTO support_requests (passenger_id, category, subject, message)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [req.passengerId, category, subject, message]
    );
    res.status(201).json({
      reference: rows[0].id,
      status: rows[0].status,
      createdAt: rows[0].created_at,
    });
  })
);

// GET /api/support — this passenger's past requests.
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { rows } = await getPool().query(
      'SELECT * FROM support_requests WHERE passenger_id = $1 ORDER BY created_at DESC',
      [req.passengerId]
    );
    res.json({
      requests: rows.map((r) => ({
        id: r.id,
        category: r.category,
        subject: r.subject,
        message: r.message,
        status: r.status,
        createdAt: r.created_at,
      })),
    });
  })
);

module.exports = router;
