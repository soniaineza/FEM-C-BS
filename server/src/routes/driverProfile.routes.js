const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const multer = require('multer');

const { getPool } = require('../db');
const { config } = require('../config');
const { asyncHandler, ApiError } = require('../utils/asyncHandler');
const { driverToJson, rideToJson } = require('../utils/serialize');
const { requireDriverAuth } = require('../middleware/auth');
const { signDriverToken } = require('../utils/jwt');
const { apiLimiter } = require('../middleware/rateLimit');
const { pushDriverNotification } = require('../services/driverNotify');
const { missingApprovedDocuments } = require('../services/driverKyc');
const { closeDriverAccount } = require('../services/accountClosure');
const { dispatchEmergency } = require('../services/emergencyDispatch');
const {
  getDriverBalance,
  quotePayout,
  requestPayout,
  startSettlement,
  payoutToJson,
  settlementToJson,
} = require('../services/driverBalance');

const router = express.Router();
router.use(requireDriverAuth);
const documentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1, fields: 3, fieldSize: 200 },
  fileFilter: (_req, file, callback) => {
    const supported = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
    if (!supported.includes(file.mimetype)) {
      callback(new ApiError(415, 'Upload a PDF, JPEG, PNG, WebP, or HEIC file.'));
      return;
    }
    callback(null, true);
  },
});

function fileMatchesType(file) {
  const bytes = file.buffer;
  switch (file.mimetype) {
    case 'application/pdf':
      return bytes.subarray(0, 5).toString('ascii') === '%PDF-';
    case 'image/jpeg':
      return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    case 'image/png':
      return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    case 'image/webp':
      return bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
        bytes.subarray(8, 12).toString('ascii') === 'WEBP';
    case 'image/heic':
    case 'image/heif':
      return bytes.subarray(4, 8).toString('ascii') === 'ftyp';
    default:
      return false;
  }
}

function safeDownloadName(fileName) {
  return String(fileName || 'driver-document')
    .replace(/[\\/\r\n"]/g, '_')
    .slice(0, 160);
}

// ============================================================
// PROFILE
// ============================================================

// GET /api/driver/me — current driver profile.
/** How fresh the driver's reported position is, for the app's status. */
async function locationFreshness(driverId) {
  const { rows } = await getPool().query(
    'SELECT EXTRACT(EPOCH FROM (now() - recorded_at)) AS age FROM driver_locations WHERE driver_id = $1',
    [driverId]
  );
  const ageSeconds = rows[0] ? Math.round(Number(rows[0].age)) : null;
  return {
    ageSeconds,
    maxAgeSeconds: config.driverLocationMaxAgeSeconds,
    fresh: ageSeconds != null && ageSeconds <= config.driverLocationMaxAgeSeconds,
  };
}

router.get('/me', asyncHandler(async (req, res) => {
  const { rows } = await getPool().query('SELECT * FROM drivers WHERE id = $1', [req.driverId]);
  if (!rows[0]) throw new ApiError(404, 'Driver account not found.');
  // `location` lets the app tell "online" from "online but GPS not updating".
  res.json({ driver: { ...driverToJson(rows[0]), location: await locationFreshness(req.driverId) } });
}));

// PUT /api/driver/me — update profile fields.
router.put('/me', asyncHandler(async (req, res) => {
  const {
    fullName, email, photoUrl,
    emergencyContactName, emergencyContactPhone,
    preferredLanguage,
    vehicleMake, vehicleModel, vehicleYear, vehicleColor, vehiclePlate,
  } = req.body || {};

  const vehiclePatch = { vehicleMake, vehicleModel, vehicleYear, vehicleColor, vehiclePlate };
  if (Object.values(vehiclePatch).some((value) => value !== undefined)) {
    throw new ApiError(400, 'Update vehicle details through /driver/vehicle.');
  }

  const { rows } = await getPool().query(
    `UPDATE drivers SET
       full_name = COALESCE($2, full_name),
       email = COALESCE($3, email),
       photo_url = COALESCE($4, photo_url),
       emergency_contact_name = COALESCE($5, emergency_contact_name),
       emergency_contact_phone = COALESCE($6, emergency_contact_phone),
       preferred_language = COALESCE($7, preferred_language),
       vehicle_make = COALESCE($8, vehicle_make),
       vehicle_model = COALESCE($9, vehicle_model),
       vehicle_year = COALESCE($10, vehicle_year),
       vehicle_color = COALESCE($11, vehicle_color),
       vehicle_plate = COALESCE($12, vehicle_plate),
       is_profile_complete =
         (COALESCE($2, full_name) <> '' AND COALESCE($3, email) IS NOT NULL)
     WHERE id = $1 RETURNING *`,
    [req.driverId, fullName, email, photoUrl,
     emergencyContactName, emergencyContactPhone, preferredLanguage,
     vehicleMake, vehicleModel, vehicleYear, vehicleColor, vehiclePlate]
  );
  if (!rows[0]) throw new ApiError(404, 'Driver account not found.');
  res.json({ driver: driverToJson(rows[0]) });
}));

// ============================================================
// STATUS (online / offline)
// ============================================================

// PUT /api/driver/status — toggle online/offline.
router.put('/status', asyncHandler(async (req, res) => {
  const { status } = req.body || {};
  const validStatuses = ['offline', 'active'];
  if (!validStatuses.includes(status)) {
    throw new ApiError(400, 'Status must be "offline" or "active".');
  }
  if (status === 'active') {
    // Only KYC-verified drivers can be matched (driverMatcher.js), so don't
    // let an unverified driver sit "online" waiting for rides that never come.
    const { rows: me } = await getPool().query('SELECT verified FROM drivers WHERE id = $1', [req.driverId]);
    if (!me[0]?.verified) {
      throw new ApiError(403, 'Your account is still being verified. Upload your documents and we will notify you once approved.');
    }
    const missing = await missingApprovedDocuments(req.driverId);
    if (missing.length) throw new ApiError(403, `Driver documents need current in-person approval: ${missing.join(', ')}.`);
    const balance = await getDriverBalance(req.driverId);
    if (balance.blocked) {
      throw new ApiError(403, `You owe RWF ${Math.ceil(balance.owed).toLocaleString()} in commission on cash trips. Pay it to go online.`);
    }
  }

  const { rows } = await getPool().query(
    `UPDATE drivers SET status = $2, last_online_at = CASE WHEN $2 = 'active' THEN now() ELSE last_online_at END
     WHERE id = $1 AND status NOT IN ('busy', 'suspended') RETURNING *`,
    [req.driverId, status]
  );
  if (!rows[0]) throw new ApiError(400, 'Cannot change status while busy or suspended.');

  await getPool().query(
    `INSERT INTO driver_status_history (driver_id, from_status, to_status, changed_by)
     VALUES ($1, (SELECT status FROM drivers WHERE id = $1), $2, 'driver')`,
    [req.driverId, status]
  );

  res.json({ driver: driverToJson(rows[0]) });
}));

// ============================================================
// VEHICLE
// ============================================================

// GET /api/driver/vehicle — current vehicle info.
router.get('/vehicle', asyncHandler(async (req, res) => {
  const { rows } = await getPool().query('SELECT * FROM drivers WHERE id = $1', [req.driverId]);
  const d = rows[0];
  if (!d) throw new ApiError(404, 'Driver not found.');
  res.json({
    vehicle: {
      currentVehicleId: d.current_vehicle_id,
      make: d.vehicle_make || '',
      model: d.vehicle_model || '',
      year: d.vehicle_year || null,
      color: d.vehicle_color || '',
      plate: d.vehicle_plate || '',
      licenseNumber: d.license_number || '',
    },
  });
}));

// PUT /api/driver/vehicle — update vehicle info.
router.put('/vehicle', asyncHandler(async (req, res) => {
  const { vehicleMake, vehicleModel, vehicleYear, vehicleColor, vehiclePlate, licenseNumber } = req.body || {};
  const { rows: current } = await getPool().query('SELECT * FROM drivers WHERE id=$1', [req.driverId]);
  if (!current[0]) throw new ApiError(404, 'Driver not found.');
  const changed = Object.entries({ vehicleMake, vehicleModel, vehicleYear, vehicleColor, vehiclePlate, licenseNumber })
    .some(([key, value]) => value !== undefined && String(value) !== String(current[0][key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)] ?? ''));
  if (changed && (current[0].verified || current[0].status === 'busy')) {
    throw new ApiError(409, 'Verified vehicle details require a new operator review. Contact support to update them.');
  }
  const { rows } = await getPool().query(
    `UPDATE drivers SET
       vehicle_make = COALESCE($2, vehicle_make),
       vehicle_model = COALESCE($3, vehicle_model),
       vehicle_year = COALESCE($4, vehicle_year),
       vehicle_color = COALESCE($5, vehicle_color),
       vehicle_plate = COALESCE($6, vehicle_plate),
       license_number = COALESCE($7, license_number)
     WHERE id = $1 RETURNING *`,
    [req.driverId, vehicleMake, vehicleModel, vehicleYear, vehicleColor, vehiclePlate, licenseNumber]
  );
  if (!rows[0]) throw new ApiError(404, 'Driver not found.');
  res.json({ driver: driverToJson(rows[0]) });
}));

// ============================================================
// DOCUMENTS
// ============================================================

// GET /api/driver/documents — list driver documents.
router.get('/documents', asyncHandler(async (req, res) => {
  const { rows } = await getPool().query(
    `SELECT id, doc_type, file_name, status, rejection_reason, expires_at, uploaded_at,
            reviewed_at, (file_data IS NOT NULL) AS has_file, file_size, content_type
       FROM driver_documents WHERE driver_id = $1 ORDER BY uploaded_at DESC`,
    [req.driverId]
  );
  res.json({
    documents: rows.map((r) => ({
      id: r.id,
      docType: r.doc_type,
      fileUrl: r.has_file ? `/api/driver/documents/${r.id}/file` : null,
      fileName: r.file_name,
      status: r.status,
      rejectionReason: r.rejection_reason,
      expiresAt: r.expires_at,
      uploadedAt: r.uploaded_at,
      reviewedAt: r.reviewed_at,
      hasFile: Boolean(r.has_file),
      fileSize: r.file_size,
      contentType: r.content_type,
    })),
  });
}));

router.get('/documents/:id/file', asyncHandler(async (req, res) => {
  const { rows } = await getPool().query(
    'SELECT file_data, content_type, file_name FROM driver_documents WHERE id = $1 AND driver_id = $2',
    [req.params.id, req.driverId]
  );
  if (!rows[0] || !rows[0].file_data) throw new ApiError(404, 'Document file not found.');
  res.set({
    'Cache-Control': 'private, no-store',
    'Content-Disposition': `inline; filename="${safeDownloadName(rows[0].file_name)}"`,
    'X-Content-Type-Options': 'nosniff',
  });
  res.type(rows[0].content_type).send(rows[0].file_data);
}));

// POST /api/driver/documents — persist the actual uploaded file.
router.post(
  '/documents',
  apiLimiter({ max: 12, keyGenerator: (req) => `driver-doc:${req.driverId}` }),
  documentUpload.single('file'),
  asyncHandler(async (req, res) => {
  const { docType, expiresAt } = req.body || {};
  const validTypes = ['license', 'national_id', 'vehicle_registration', 'insurance', 'profile_photo', 'vehicle_photo', 'other'];
  if (!docType || !validTypes.includes(docType)) {
    throw new ApiError(400, `docType must be one of: ${validTypes.join(', ')}`);
  }
  if (!req.file) throw new ApiError(400, 'Choose a file to upload.');
  if (!fileMatchesType(req.file)) throw new ApiError(415, 'The selected file does not match its file type.');
  if (['profile_photo', 'vehicle_photo'].includes(docType) && !req.file.mimetype.startsWith('image/')) {
    throw new ApiError(415, 'Profile and vehicle photos must be image files.');
  }

  const fileName = safeDownloadName(req.file.originalname);

  const { rows } = await getPool().query(
    `INSERT INTO driver_documents
       (driver_id, doc_type, file_url, file_name, expires_at, file_data, content_type, file_size)
     VALUES ($1, $2, NULL, $3, $4, $5, $6, $7) RETURNING *`,
    [req.driverId, docType, fileName, expiresAt || null, req.file.buffer, req.file.mimetype, req.file.size]
  );
  res.status(201).json({
    document: {
      id: rows[0].id,
      docType: rows[0].doc_type,
      status: rows[0].status,
      uploadedAt: rows[0].uploaded_at,
      fileUrl: `/api/driver/documents/${rows[0].id}/file`,
      fileName: rows[0].file_name,
      fileSize: rows[0].file_size,
    },
  });
  })
);

// ============================================================
// RIDE HISTORY
// ============================================================

// GET /api/driver/rides — ride history for the driver.
router.get('/rides', asyncHandler(async (req, res) => {
  const { rows } = await getPool().query(
    `SELECT r.*, p.full_name AS passenger_name
       FROM rides r
       JOIN passengers p ON p.id = r.passenger_id
      WHERE r.driver_id = $1 ORDER BY r.created_at DESC LIMIT 100`,
    [req.driverId]
  );
  res.json({ rides: rows.map(rideToJson) });
}));

// GET /api/driver/rides/:id — a specific ride.
router.get('/rides/:id', asyncHandler(async (req, res) => {
  const { rows } = await getPool().query(
    `SELECT r.*, p.full_name AS passenger_name
       FROM rides r
       JOIN passengers p ON p.id = r.passenger_id
      WHERE r.id = $1 AND r.driver_id = $2`,
    [req.params.id, req.driverId]
  );
  if (!rows[0]) throw new ApiError(404, 'Ride not found.');
  res.json({ ride: rideToJson(rows[0]) });
}));

// ============================================================
// EARNINGS
// ============================================================

// GET /api/driver/earnings — earnings summary.
router.get('/earnings', asyncHandler(async (req, res) => {
  const driverId = req.driverId;

  // Today's earnings
  const todayRes = await getPool().query(
    `SELECT COALESCE(SUM(net_amount), 0) as total, COALESCE(SUM(gross_amount), 0) as gross, COUNT(*)::int as rides
     FROM driver_earnings WHERE driver_id = $1 AND created_at >= CURRENT_DATE AND status = 'settled'`,
    [driverId]
  );

  // This week's earnings (Mon-Sun)
  const weekRes = await getPool().query(
    `SELECT COALESCE(SUM(net_amount), 0) as total, COALESCE(SUM(gross_amount), 0) as gross, COUNT(*)::int as rides
     FROM driver_earnings WHERE driver_id = $1
       AND created_at >= date_trunc('week', CURRENT_DATE) AND status = 'settled'`,
    [driverId]
  );

  // This month's earnings
  const monthRes = await getPool().query(
    `SELECT COALESCE(SUM(net_amount), 0) as total, COALESCE(SUM(gross_amount), 0) as gross, COUNT(*)::int as rides
     FROM driver_earnings WHERE driver_id = $1
       AND created_at >= date_trunc('month', CURRENT_DATE) AND status = 'settled'`,
    [driverId]
  );

  // All-time earnings
  const totalRes = await getPool().query(
    `SELECT COALESCE(SUM(net_amount), 0) as total, COALESCE(SUM(gross_amount), 0) as gross, COUNT(*)::int as rides
     FROM driver_earnings WHERE driver_id = $1 AND status = 'settled'`,
    [driverId]
  );

  // Pending balance (unsettled)
  const pendingRes = await getPool().query(
    `SELECT COALESCE(SUM(net_amount), 0) as total
     FROM driver_earnings WHERE driver_id = $1 AND status = 'pending'`,
    [driverId]
  );

  // Overall driver rating
  const ratingRes = await getPool().query(
    `SELECT rating, total_trips FROM drivers WHERE id = $1`,
    [driverId]
  );

  res.json({
    earnings: {
      today: {
        amount: Number(todayRes.rows[0].total),
        fares: Number(todayRes.rows[0].gross),
        rides: todayRes.rows[0].rides,
      },
      week: {
        amount: Number(weekRes.rows[0].total),
        fares: Number(weekRes.rows[0].gross),
        rides: weekRes.rows[0].rides,
      },
      month: {
        amount: Number(monthRes.rows[0].total),
        fares: Number(monthRes.rows[0].gross),
        rides: monthRes.rows[0].rides,
      },
      total: {
        amount: Number(totalRes.rows[0].total),
        fares: Number(totalRes.rows[0].gross),
        rides: totalRes.rows[0].rides,
      },
      pendingBalance: Number(pendingRes.rows[0].total),
      balance: await getDriverBalance(driverId),
      rating: ratingRes.rows[0]?.rating == null ? null : Number(ratingRes.rows[0].rating),
      totalTrips: ratingRes.rows[0]?.total_trips || 0,
    },
  });
}));

// GET /api/driver/earnings/history — detailed earnings list.
router.get('/earnings/history', asyncHandler(async (req, res) => {
  const { rows } = await getPool().query(
    `SELECT e.*, r.pickup_address, r.dest_address, r.distance_km, r.ride_type
     FROM driver_earnings e
     JOIN rides r ON r.id = e.ride_id
     WHERE e.driver_id = $1
     ORDER BY e.created_at DESC LIMIT 100`,
    [req.driverId]
  );
  res.json({
    earnings: rows.map((r) => ({
      id: r.id,
      rideId: r.ride_id,
      grossAmount: Number(r.gross_amount),
      commission: Number(r.commission),
      netAmount: Number(r.net_amount),
      paymentMethod: r.payment_method,
      status: r.status,
      pickupAddress: r.pickup_address,
      destAddress: r.dest_address,
      distanceKm: Number(r.distance_km),
      rideType: r.ride_type,
      createdAt: r.created_at,
      settledAt: r.settled_at,
    })),
  });
}));

// ============================================================
// PAYOUTS
// ============================================================

// GET /api/driver/payouts — payout history.
router.get('/payouts', asyncHandler(async (req, res) => {
  const { rows } = await getPool().query(
    'SELECT * FROM driver_payouts WHERE driver_id = $1 ORDER BY created_at DESC LIMIT 50',
    [req.driverId]
  );
  res.json({ payouts: rows.map(payoutToJson), balance: await getDriverBalance(req.driverId) });
}));

// GET /api/driver/payouts/quote?amount= — the payout amount, the provider
// fee and what the driver will receive, to show before they confirm.
router.get('/payouts/quote', asyncHandler(async (req, res) => {
  const { requestedAmount, fee, amountReceived } = await quotePayout(req.driverId, req.query.amount);
  res.json({ quote: { requestedAmount, fee, amountReceived } });
}));

// POST /api/driver/payouts { amount } — ask for available balance to be
// paid out to the driver's mobile money. An operator approves it.
router.post('/payouts', asyncHandler(async (req, res) => {
  const payout = await requestPayout(req.driverId, req.body?.amount);
  res.status(201).json({ payout: payoutToJson(payout), balance: await getDriverBalance(req.driverId) });
}));

// GET /api/driver/balance — what the platform owes the driver, or the
// cash-trip commission the driver owes, with recent commission payments.
router.get('/balance', asyncHandler(async (req, res) => {
  const { rows } = await getPool().query(
    'SELECT * FROM driver_settlements WHERE driver_id = $1 ORDER BY created_at DESC LIMIT 20',
    [req.driverId]
  );
  res.json({ balance: await getDriverBalance(req.driverId), settlements: rows.map(settlementToJson) });
}));

// POST /api/driver/balance/settle { amount? } — pay owed commission from the
// driver's mobile money (defaults to everything owed).
router.post('/balance/settle', asyncHandler(async (req, res) => {
  const settlement = await startSettlement(req.driverId, req.body?.amount);
  res.status(201).json({ settlement: settlementToJson(settlement), balance: await getDriverBalance(req.driverId) });
}));

// ============================================================
// RATINGS
// ============================================================

// GET /api/driver/ratings — the driver's received ratings.
router.get('/ratings', asyncHandler(async (req, res) => {
  const { rows } = await getPool().query(
    `SELECT r.rating, r.comment, r.created_at,
            p.full_name AS passenger_name
     FROM ratings r
     LEFT JOIN passengers p ON p.id = r.passenger_id
     WHERE r.driver_id = $1
     ORDER BY r.created_at DESC LIMIT 50`,
    [req.driverId]
  );

  // Rating breakdown
  const breakdown = await getPool().query(
    `SELECT rating, COUNT(*)::int AS count
     FROM ratings WHERE driver_id = $1
     GROUP BY rating ORDER BY rating`,
    [req.driverId]
  );

  const avgRes = await getPool().query(
    `SELECT AVG(rating)::double precision AS avg, COUNT(*)::int AS total
     FROM ratings WHERE driver_id = $1`,
    [req.driverId]
  );

  res.json({
    ratings: rows.map((r) => ({
      rating: r.rating,
      comment: r.comment,
      passengerName: r.passenger_name || 'Passenger',
      createdAt: r.created_at,
    })),
    summary: {
      average: avgRes.rows[0]?.avg == null ? 0 : Number(Number(avgRes.rows[0].avg).toFixed(1)),
      total: avgRes.rows[0]?.total || 0,
      breakdown: breakdown.rows.map((r) => ({ stars: r.rating, count: r.count })),
    },
  });
}));

// ============================================================
// NOTIFICATIONS
// ============================================================

// GET /api/driver/notifications — driver notifications.
router.get('/notifications', asyncHandler(async (req, res) => {
  const { rows } = await getPool().query(
    'SELECT * FROM driver_notifications WHERE driver_id = $1 ORDER BY created_at DESC LIMIT 100',
    [req.driverId]
  );
  res.json({
    notifications: rows.map((r) => ({
      id: r.id,
      title: r.title,
      body: r.body,
      type: r.type,
      rideId: r.ride_id,
      read: r.read,
      createdAt: r.created_at,
    })),
  });
}));

// POST /api/driver/notifications/:id/read
router.post('/notifications/:id/read', asyncHandler(async (req, res) => {
  const { rows } = await getPool().query(
    'UPDATE driver_notifications SET read = TRUE WHERE id = $1 AND driver_id = $2 RETURNING *',
    [req.params.id, req.driverId]
  );
  if (!rows[0]) throw new ApiError(404, 'Notification not found.');
  res.json({ notification: rows[0] });
}));

// POST /api/driver/notifications/read-all
router.post('/notifications/read-all', asyncHandler(async (req, res) => {
  await getPool().query(
    'UPDATE driver_notifications SET read = TRUE WHERE driver_id = $1 AND read = FALSE',
    [req.driverId]
  );
  res.json({ marked: true });
}));

// GET /api/driver/notifications/unread-count
router.get('/notifications/unread-count', asyncHandler(async (req, res) => {
  const { rows } = await getPool().query(
    'SELECT COUNT(*)::int AS count FROM driver_notifications WHERE driver_id = $1 AND read = FALSE',
    [req.driverId]
  );
  res.json({ count: rows[0].count });
}));

// POST /api/driver/notifications/device-token
router.post('/notifications/device-token', asyncHandler(async (req, res) => {
  const { token, platform } = req.body || {};
  if (!token) throw new ApiError(400, 'A device token is required.');
  await getPool().query(
    `INSERT INTO driver_device_tokens (driver_id, token, platform)
     VALUES ($1, $2, $3)
     ON CONFLICT (token) DO UPDATE SET driver_id = EXCLUDED.driver_id, platform = EXCLUDED.platform`,
    [req.driverId, token, platform || null]
  );
  res.status(204).end();
}));

// ============================================================
// SUPPORT (driver tickets)
// ============================================================

const DRIVER_CATEGORIES = new Set([
  'general', 'payment', 'report_passenger', 'app_issue', 'billing',
  'vehicle_issue', 'lost_item',
]);

// GET /api/driver/support — driver's support tickets.
router.get('/support', asyncHandler(async (req, res) => {
  const { rows } = await getPool().query(
    'SELECT * FROM support_requests WHERE driver_id = $1 ORDER BY created_at DESC',
    [req.driverId]
  );
  res.json({
    tickets: rows.map((r) => ({
      id: r.id, rideId: r.ride_id, category: r.category,
      subject: r.subject, message: r.message, status: r.status,
      createdAt: r.created_at, updatedAt: r.updated_at,
    })),
  });
}));

// POST /api/driver/support — create a support ticket.
router.post('/support', asyncHandler(async (req, res) => {
  const { category, subject, message, rideId } = req.body || {};
  if (!category || !subject || !message) {
    throw new ApiError(400, 'A category, subject and message are required.');
  }
  if (!DRIVER_CATEGORIES.has(category)) {
    throw new ApiError(400, 'Unknown support category.');
  }
  let rideIdValue = null;
  if (rideId) {
    const { rows } = await getPool().query(
      'SELECT id FROM rides WHERE id = $1 AND driver_id = $2', [rideId, req.driverId]
    );
    if (!rows[0]) throw new ApiError(404, 'Ride not found.');
    rideIdValue = rows[0].id;
  }
  const { rows } = await getPool().query(
    `INSERT INTO support_requests (passenger_id, driver_id, ride_id, category, subject, message)
     VALUES (NULL, $1, $2, $3, $4, $5) RETURNING *`,
    [req.driverId, rideIdValue, category, subject, message]
  );
  const ticket = rows[0];
  await getPool().query(
    `INSERT INTO support_messages (ticket_id, sender_role, message)
     VALUES ($1, 'driver', $2)`,
    [ticket.id, message]
  );
  res.status(201).json({
    ticket: {
      id: ticket.id, rideId: ticket.ride_id, category: ticket.category,
      subject: ticket.subject, status: ticket.status, createdAt: ticket.created_at,
    },
  });
}));

// GET /api/driver/support/:id — ticket with messages.
router.get('/support/:id', asyncHandler(async (req, res) => {
  const { rows } = await getPool().query(
    'SELECT * FROM support_requests WHERE id = $1 AND driver_id = $2',
    [req.params.id, req.driverId]
  );
  const ticket = rows[0];
  if (!ticket) throw new ApiError(404, 'Ticket not found.');
  const msgs = await getPool().query(
    'SELECT id, sender_role, message, created_at FROM support_messages WHERE ticket_id = $1 ORDER BY created_at',
    [ticket.id]
  );
  res.json({
    ticket: { id: ticket.id, category: ticket.category, subject: ticket.subject, status: ticket.status },
    messages: msgs.rows.map((m) => ({
      id: m.id, senderRole: m.sender_role, content: m.message, createdAt: m.created_at,
    })),
  });
}));

// POST /api/driver/support/:id/messages — reply.
router.post('/support/:id/messages', asyncHandler(async (req, res) => {
  const { message } = req.body || {};
  if (!message || !String(message).trim()) throw new ApiError(400, 'A message is required.');
  const { rows } = await getPool().query(
    'SELECT id FROM support_requests WHERE id = $1 AND driver_id = $2',
    [req.params.id, req.driverId]
  );
  if (!rows[0]) throw new ApiError(404, 'Ticket not found.');
  const ins = await getPool().query(
    `INSERT INTO support_messages (ticket_id, sender_role, message)
     VALUES ($1, 'driver', $2) RETURNING id, sender_role, message, created_at`,
    [rows[0].id, String(message).trim()]
  );
  res.status(201).json({
    message: { id: ins.rows[0].id, senderRole: ins.rows[0].sender_role, content: ins.rows[0].message, createdAt: ins.rows[0].created_at },
  });
}));

// ============================================================
// EMERGENCY / SOS
// ============================================================

// POST /api/driver/share { rideId } — a live link the driver can send to
// someone they trust, so a family member can follow the trip they are on.
// Mirrors the passenger-side /api/share: read-only tracking, no payment or
// account data, and it expires on its own.
router.post('/share', asyncHandler(async (req, res) => {
  const { rideId } = req.body || {};
  if (!rideId) throw new ApiError(400, 'rideId is required.');
  const { rows } = await getPool().query(
    'SELECT id, status FROM rides WHERE id = $1 AND driver_id = $2',
    [rideId, req.driverId]
  );
  const ride = rows[0];
  if (!ride) throw new ApiError(404, 'Ride not found.');
  if (['completed', 'cancelled'].includes(ride.status)) {
    throw new ApiError(400, 'Only active rides can be shared.');
  }

  const token = crypto.randomBytes(12).toString('hex');
  const expiresAt = new Date(Date.now() + config.tripShareTtlHours * 60 * 60 * 1000).toISOString();
  const { rows: shareRows } = await getPool().query(
    `INSERT INTO trip_shares (token, ride_id, passenger_id, driver_id, expires_at)
     VALUES ($1, $2, NULL, $3, $4) RETURNING token, expires_at, created_at`,
    [token, ride.id, req.driverId, expiresAt]
  );
  res.status(201).json({ share: shareRows[0] });
}));

// POST /api/driver/incidents { rideId?, category, details? } — a safety
// report about a trip. Kept out of the support-ticket queue so a safety
// matter is never sat behind a billing question.
router.post('/incidents', asyncHandler(async (req, res) => {
  const { rideId, category, details } = req.body || {};
  if (!category || typeof category !== 'string') throw new ApiError(400, 'category is required.');
  if (rideId) {
    const ride = await getPool().query('SELECT id FROM rides WHERE id=$1 AND driver_id=$2', [rideId, req.driverId]);
    if (!ride.rows[0]) throw new ApiError(404, 'Ride not found.');
  }
  const { rows } = await getPool().query(
    `INSERT INTO driver_incident_reports (driver_id, ride_id, category, details)
     VALUES ($1, $2, $3, $4) RETURNING id, category, status, created_at`,
    [req.driverId, rideId || null, category.slice(0, 64), (details || '').slice(0, 2000) || null]
  );
  res.status(201).json({ report: rows[0] });
}));

// POST /api/driver/emergency — driver SOS. Same shape as the passenger one
// (server/src/routes/emergency.routes.js): event recorded for the call
// center's audit trail, and the response carries the call-center number the
// app dials with the OS dialer.

router.post('/emergency', asyncHandler(async (req, res) => {
  const { rideId, latitude, longitude, address, details } = req.body || {};
  if (rideId) {
    const ride = await getPool().query('SELECT id FROM rides WHERE id=$1 AND driver_id=$2', [rideId, req.driverId]);
    if (!ride.rows[0]) throw new ApiError(404, 'Ride not found.');
  }
  const reference = `EM-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
  const { rows } = await getPool().query(
    `INSERT INTO emergency_events
       (ride_id, passenger_id, driver_id, latitude, longitude, address, details, status, reference)
     VALUES ($1, NULL, $2, $3, $4, $5, $6, 'pending', $7) RETURNING *`,
    [rideId || null, req.driverId, latitude ?? null, longitude ?? null, address ?? null, details ?? null, reference]
  );
  const event = rows[0];

  try {
    await dispatchEmergency(event.id);
  } catch (err) {
    console.error('[emergency] driver dispatch failed:', event.id, err.message);
    throw new ApiError(502, 'SOS was recorded but the operator alert has not been delivered. Please call the center now.');
  }

  await pushDriverNotification(req.driverId, {
    title: 'Emergency recorded',
    body: 'We recorded your emergency and notified the Kimu Transport call center.',
    type: 'safety',
    rideId: rideId || null,
  });

  res.status(201).json({
    emergency: {
      id: event.id,
      status: 'dispatched',
      createdAt: event.created_at,
      reference,
      callCenterPhone: config.emergencyCallCenterPhone || null,
    },
  });
}));

// ============================================================
// DEVICE TOKEN
// ============================================================

// POST /api/driver/device-token — register push token.
router.post('/device-token', asyncHandler(async (req, res) => {
  const { token, platform } = req.body || {};
  if (!token) throw new ApiError(400, 'A device token is required.');
  await getPool().query(
    `INSERT INTO driver_device_tokens (driver_id, token, platform)
     VALUES ($1, $2, $3)
     ON CONFLICT (token) DO UPDATE SET driver_id = EXCLUDED.driver_id, platform = EXCLUDED.platform`,
    [req.driverId, token, platform || null]
  );
  res.status(204).end();
}));

// ============================================================
// DELETE ACCOUNT
// ============================================================

// DELETE /api/driver/account
router.delete('/account', asyncHandler(async (req, res) => {
  // Closes the account without deleting it: earnings, cash and trip records stay.
  await closeDriverAccount(req.driverId);
  res.status(204).end();
}));

module.exports = router;
