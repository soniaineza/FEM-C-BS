const express = require('express');

const { getPool } = require('../db');
const { config } = require('../config');
const { asyncHandler, ApiError } = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const { pushNotification } = require('../services/notify');
const { loadRide } = require('../services/rideStateMachine');

const router = express.Router();

// GET /api/support/contacts — how to reach human support outside the in-app
// tickets. Public: the rider and driver apps call it with different tokens,
// and it holds nothing secret (SUPPORT_WHATSAPP_NUMBER / SUPPORT_EMAIL, both
// optional — a missing one is null and the app hides that button).
router.get('/contacts', (_req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
  res.json({
    whatsappNumber: config.supportWhatsappNumber || null,
    email: config.supportEmail || null,
  });
});

router.use(requireAuth);

const CATEGORIES = new Set([
  'general',
  'payment',
  'lost_item',
  'report_driver',
  'app_issue',
  'billing',
]);

function ticketToJson(row) {
  return {
    id: row.id,
    rideId: row.ride_id || null,
    category: row.category,
    subject: row.subject,
    message: row.message,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// POST /api/support — submits a help ticket (optionally for a ride).
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { category, subject, message, rideId } = req.body || {};
    if (!category || !subject || !message) {
      throw new ApiError(400, 'A category, subject and message are required.');
    }
    if (!CATEGORIES.has(category)) {
      throw new ApiError(400, 'Unknown support category.');
    }
    let rideIdValue = null;
    if (rideId) {
      const ride = await loadRide(rideId);
      if (!ride || ride.passenger_id !== req.passengerId) {
        throw new ApiError(404, 'Ride not found.');
      }
      rideIdValue = ride.id;
      if (category === 'report_driver' && !ride.driver_id) {
        throw new ApiError(400, 'No driver was assigned to this ride.');
      }
    }
    const { rows } = await getPool().query(
      `INSERT INTO support_requests (passenger_id, ride_id, category, subject, message)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.passengerId, rideIdValue, category, subject, message]
    );
    const ticket = rows[0];
    await getPool().query(
      `INSERT INTO support_messages (ticket_id, sender_role, message)
       VALUES ($1, 'passenger', $2)`,
      [ticket.id, message]
    );
    res.status(201).json({ ticket: ticketToJson(ticket) });
  })
);

// GET /api/support — this passenger's tickets.
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { rows } = await getPool().query(
      'SELECT * FROM support_requests WHERE passenger_id = $1 ORDER BY created_at DESC',
      [req.passengerId]
    );
    res.json({ tickets: rows.map(ticketToJson) });
  })
);

// GET /api/support/:id — a ticket with its message thread.
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const { rows } = await getPool().query(
      'SELECT * FROM support_requests WHERE id = $1 AND passenger_id = $2',
      [req.params.id, req.passengerId]
    );
    const ticket = rows[0];
    if (!ticket) throw new ApiError(404, 'Ticket not found.');
    const msgs = await getPool().query(
      `SELECT id, sender_role, message, created_at FROM support_messages
        WHERE ticket_id = $1 ORDER BY created_at`,
      [ticket.id]
    );
    res.json({
      ticket: ticketToJson(ticket),
      messages: msgs.rows.map((m) => ({
        id: m.id,
        senderRole: m.sender_role,
        message: m.message,
        createdAt: m.created_at,
      })),
    });
  })
);

// POST /api/support/:id/messages — passenger replies on an open thread.
router.post(
  '/:id/messages',
  asyncHandler(async (req, res) => {
    const { message } = req.body || {};
    if (!message || !String(message).trim()) {
      throw new ApiError(400, 'A message is required.');
    }
    const { rows } = await getPool().query(
      'SELECT * FROM support_requests WHERE id = $1 AND passenger_id = $2',
      [req.params.id, req.passengerId]
    );
    const ticket = rows[0];
    if (!ticket) throw new ApiError(404, 'Ticket not found.');
    if (ticket.status === 'resolved') {
      throw new ApiError(400, 'This ticket is resolved. Open a new one if needed.');
    }
    const inserted = await getPool().query(
      `INSERT INTO support_messages (ticket_id, sender_role, message)
       VALUES ($1, 'passenger', $2) RETURNING id, sender_role, message, created_at`,
      [ticket.id, String(message).trim()]
    );
    res.status(201).json({
      message: {
        id: inserted.rows[0].id,
        senderRole: inserted.rows[0].sender_role,
        content: inserted.rows[0].message,
        createdAt: inserted.rows[0].created_at,
      },
    });
  })
);

// POST /api/support/:id/close — passenger closes their own ticket.
router.post(
  '/:id/close',
  asyncHandler(async (req, res) => {
    const { rows } = await getPool().query(
      `UPDATE support_requests SET status='closed', updated_at=now()
        WHERE id = $1 AND passenger_id = $2 RETURNING *`,
      [req.params.id, req.passengerId]
    );
    if (!rows[0]) throw new ApiError(404, 'Ticket not found.');
    res.json({ ticket: ticketToJson(rows[0]) });
  })
);

module.exports = router;