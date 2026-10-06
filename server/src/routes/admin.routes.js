const express = require('express');
const crypto = require('crypto');

const { getPool } = require('../db');
const { config } = require('../config');
const { asyncHandler, ApiError } = require('../utils/asyncHandler');
const { apiLimiter } = require('../middleware/rateLimit');
const { driverToJson } = require('../utils/serialize');
const { pushDriverNotification } = require('../services/driverNotify');
const { missingApprovedDocuments } = require('../services/driverKyc');
const { transition } = require('../services/paymentState');
const { SEED_DRIVER_PHONES } = require('../services/seedAccounts');
const { confirmCashPayment } = require('../services/payments');
const { transitionRide } = require('../services/rideStateMachine');
const paypack = require('../services/paypackClient');
const { signAdminToken, verifyToken } = require('../utils/jwt');
const {
  getDriverBalance,
  approvePayout,
  rejectPayout,
  recordOperatorSettlement,
  payoutToJson,
  settlementToJson,
} = require('../services/driverBalance');

// Operator-only routes for driver KYC review. The browser uses an
// eight-hour session token; ADMIN_API_KEY remains for trusted integrations.
const router = express.Router();

// Wrong keys are limited per address so the operator key cannot be guessed
// by brute force; correct requests are never counted.
router.use(apiLimiter({ max: 20, skipSuccessfulRequests: true, keyGenerator: (req) => `admin:${req.ip}` }));

function safeEqual(value, expected) {
  const given = Buffer.from(String(value || ''));
  const secret = Buffer.from(String(expected || ''));
  return given.length === secret.length && crypto.timingSafeEqual(given, secret);
}

router.post('/login', asyncHandler(async (req, res) => {
  if (!config.adminUsername || !config.adminPassword) {
    throw new ApiError(503, 'Operator login is not configured.');
  }
  const { username, password } = req.body || {};
  const usernameMatches = safeEqual(username, config.adminUsername);
  const passwordMatches = safeEqual(password, config.adminPassword);
  if (!usernameMatches || !passwordMatches) {
    throw new ApiError(401, 'Invalid username or password.');
  }
  res.json({ token: signAdminToken(config.adminUsername), name: config.adminUsername });
}));

router.use((req, _res, next) => {
  const authorization = String(req.headers.authorization || '');
  const token = authorization.match(/^Bearer\s+(.+)$/i);
  if (token) {
    try {
      if (verifyToken(token[1]).role === 'admin') return next();
    } catch (_) {
      return next(new ApiError(401, 'Operator session expired. Please sign in again.'));
    }
    return next(new ApiError(403, 'Operator access required.'));
  }

  if (config.adminApiKey && safeEqual(req.headers['x-admin-key'], config.adminApiKey)) {
    return next();
  }
  next(new ApiError(401, 'Sign in as an operator to continue.'));
});

function documentToJson(d) {
  return {
    id: d.id,
    docType: d.doc_type,
    fileUrl: d.file_url,
    fileName: d.file_name,
    status: d.status,
    rejectionReason: d.rejection_reason,
    expiresAt: d.expires_at,
    uploadedAt: d.uploaded_at,
    reviewedAt: d.reviewed_at,
    reviewedBy: d.reviewed_by,
    verificationMethod: d.verification_method,
    evidenceReference: d.evidence_reference,
  };
}

// Operators need an authenticated queue for every SOS, including SMS delivery
// failures. Sending an SMS alone is not an incident workflow.
router.get('/emergencies', asyncHandler(async (req, res) => {
  const { rows } = await getPool().query(
    `SELECT e.*, p.phone AS passenger_phone FROM emergency_events e
       JOIN passengers p ON p.id=e.passenger_id
       WHERE e.status != 'resolved' ORDER BY e.created_at DESC LIMIT 200`
  );
  res.json({ emergencies: rows });
}));

router.post('/emergencies/:id/resolve', asyncHandler(async (req, res) => {
  const { rows } = await getPool().query(
    `UPDATE emergency_events SET status='resolved', resolved_at=now()
       WHERE id=$1 AND status != 'resolved' RETURNING *`, [req.params.id]
  );
  if (!rows[0]) throw new ApiError(404, 'Open emergency not found.');
  res.json({ emergency: rows[0] });
}));

router.get('/payment-exceptions', asyncHandler(async (_req, res) => {
  const { rows } = await getPool().query(
    `SELECT x.*, COALESCE(p.external_reference, t.external_reference) AS external_reference,
            COALESCE(p.amount, t.amount) AS amount, COALESCE(p.method, 'wallet_topup') AS method,
            COALESCE(t.phone, r.payment_phone, pa.phone) AS phone
       FROM payment_exceptions x
       LEFT JOIN payments p ON p.id = x.payment_id
       LEFT JOIN wallet_topups t ON t.id = x.topup_id
       LEFT JOIN rides r ON r.id = x.ride_id
       LEFT JOIN passengers pa ON pa.id = COALESCE(p.passenger_id, t.passenger_id)
      WHERE x.status='open'
      ORDER BY x.created_at DESC LIMIT 200`
  );
  res.json({ exceptions: rows });
}));

router.post('/payment-exceptions/:id/resolve', asyncHandler(async (req, res) => {
  const { resolution, reference } = req.body || {};
  const { rows: found } = await getPool().query(
    `SELECT * FROM payment_exceptions WHERE id = $1 AND status = 'open'`, [req.params.id]
  );
  if (!found[0]) throw new ApiError(404, 'Open payment exception not found.');
  // A cash fare the driver never confirmed is decided either way; money the
  // provider collected that could not be applied is refunded or not.
  const cashCase = found[0].reason === 'cash_unconfirmed';
  const allowed = cashCase ? ['cash_received', 'cash_not_received'] : ['refunded', 'no_refund_due'];
  if (!allowed.includes(resolution) || !String(reference || '').trim()) {
    throw new ApiError(400, `resolution (${allowed.join(' | ')}) and a reference are required.`);
  }
  if (cashCase) {
    const { rows: pay } = await getPool().query('SELECT * FROM payments WHERE id = $1', [found[0].payment_id]);
    if (resolution === 'cash_received') {
      // Settles exactly as the driver's own confirmation would: the ride
      // completes and the driver now holds that cash for Kimu.
      await confirmCashPayment(pay[0]);
    } else {
      // No money is recorded: the attempt is closed unpaid and the ride ends
      // as cancelled, with no earnings and no cash owed by the driver.
      await transition(getPool(), 'payments', pay[0].id, 'failed', { failureReason: 'CASH_NOT_RECEIVED' });
      await getPool().query(
        `UPDATE rides SET cancellation_reason = 'Cash fare not received', cancelled_by = 'operator' WHERE id = $1`,
        [found[0].ride_id]
      );
      await transitionRide(found[0].ride_id, 'cancelled', { changedBy: 'admin', reason: 'cash_not_received' });
    }
  }
  const { rows } = await getPool().query(
    `UPDATE payment_exceptions SET status='resolved', resolution=$2,
       resolution_reference=$3, resolved_at=now()
      WHERE id=$1 AND status='open' RETURNING *`,
    [req.params.id, resolution, String(reference).trim()]
  );
  if (!rows[0]) throw new ApiError(404, 'Open payment exception not found.');
  // Money sent back closes the attempt it came from.
  if (resolution === 'refunded') {
    if (rows[0].payment_id) await transition(getPool(), 'payments', rows[0].payment_id, 'refunded');
    if (rows[0].topup_id) await transition(getPool(), 'wallet_topups', rows[0].topup_id, 'refunded');
  }
  res.json({ exception: rows[0] });
}));

async function loadDriver(id) {
  const { rows } = await getPool().query('SELECT * FROM drivers WHERE id = $1', [id]);
  if (!rows[0]) throw new ApiError(404, 'Driver not found.');
  return rows[0];
}

async function recordStatus(driverId, fromStatus, toStatus, reason) {
  await getPool().query(
    `INSERT INTO driver_status_history (driver_id, from_status, to_status, changed_by, reason)
     VALUES ($1, $2, $3, 'admin', $4)`,
    [driverId, fromStatus, toStatus, reason || null]
  );
}

// GET /api/admin/drivers?verified=false — drivers (default: awaiting
// verification), each with their uploaded documents.
router.get(
  '/drivers',
  asyncHandler(async (req, res) => {
    const verified = req.query.verified === undefined ? false : req.query.verified === 'true';
    const { rows: drivers } = await getPool().query(
      // Closed accounts (deleted by the driver, or development accounts the
      // server retired) have no password and can never sign in again, so
      // they are not put in front of the operator.
      `SELECT * FROM drivers
        WHERE verified = $1 AND password_hash IS NOT NULL AND deleted_at IS NULL
        ORDER BY created_at ASC LIMIT 200`,
      [verified]
    );
    const ids = drivers.map((d) => d.id);
    const { rows: docs } = ids.length
      ? await getPool().query(
          'SELECT * FROM driver_documents WHERE driver_id = ANY($1) ORDER BY uploaded_at DESC',
          [ids]
        )
      : { rows: [] };
    res.json({
      drivers: drivers.map((d) => ({
        ...driverToJson(d),
        createdAt: d.created_at,
        documents: docs.filter((x) => x.driver_id === d.id).map(documentToJson),
      })),
    });
  })
);

// POST /api/admin/documents/:id/review { status: 'approved'|'rejected', reason? }
router.post(
  '/documents/:id/review',
  asyncHandler(async (req, res) => {
    const { status, reason, reviewer, method, evidenceReference } = req.body || {};
    if (!['approved', 'rejected'].includes(status)) {
      throw new ApiError(400, 'status must be "approved" or "rejected".');
    }
    if (status === 'rejected' && !reason) throw new ApiError(400, 'A rejection reason is required.');
    if (status === 'approved' && (
      !String(reviewer || '').trim() || method !== 'in_person' || !String(evidenceReference || '').trim()
    )) throw new ApiError(400, 'Approval requires reviewer, method=in_person, and evidenceReference.');
    const { rows } = await getPool().query(
      `UPDATE driver_documents SET status = $2, rejection_reason = $3, reviewed_at = now(),
         reviewed_by = $4, verification_method = $5, evidence_reference = $6
        WHERE id = $1 RETURNING *`,
      [req.params.id, status, status === 'rejected' ? String(reason) : null,
        String(reviewer || '').trim() || null, status === 'approved' ? method : null,
        status === 'approved' ? String(evidenceReference).trim() : null]
    );
    const doc = rows[0];
    if (!doc) throw new ApiError(404, 'Document not found.');
    if (status === 'rejected') {
      await pushDriverNotification(doc.driver_id, {
        title: 'Document rejected',
        body: `Your ${doc.doc_type.replace(/_/g, ' ')} was rejected: ${reason}. Please upload a new one.`,
        type: 'account',
      });
    }
    res.json({ document: documentToJson(doc) });
  })
);

// POST /api/admin/drivers/:id/verify — approve a driver so they can go online.
router.post(
  '/drivers/:id/verify',
  asyncHandler(async (req, res) => {
    const driver = await loadDriver(req.params.id);
    const missing = await missingApprovedDocuments(driver.id);
    if (missing.length) throw new ApiError(409, `Approve current originals first: ${missing.join(', ')}.`);
    const { rows } = await getPool().query(
      `UPDATE drivers SET verified = TRUE,
         status = CASE WHEN status = 'suspended' THEN 'offline' ELSE status END,
         updated_at = now()
        WHERE id = $1 RETURNING *`,
      [driver.id]
    );
    await recordStatus(driver.id, driver.status, rows[0].status, 'verified by admin');
    await pushDriverNotification(driver.id, {
      title: 'You are verified',
      body: 'Your Kimu Transport driver account is approved. Go online to start receiving rides.',
      type: 'account',
    });
    res.json({ driver: driverToJson(rows[0]) });
  })
);

// Operator changes to an approved vehicle revoke verification until the new
// registration and insurance originals have been inspected.
router.put('/drivers/:id/vehicle', asyncHandler(async (req, res) => {
  const driver = await loadDriver(req.params.id);
  if (driver.status === 'busy') throw new ApiError(409, 'Finish the active trip first.');
  const { vehicleMake, vehicleModel, vehicleYear, vehicleColor, vehiclePlate, licenseNumber } = req.body || {};
  if (![vehicleMake, vehicleModel, vehicleYear, vehicleColor, vehiclePlate, licenseNumber]
    .some((value) => value !== undefined)) throw new ApiError(400, 'Vehicle details are required.');
  const client = await getPool().connect();
  let updated;
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `UPDATE drivers SET vehicle_make=COALESCE($2,vehicle_make), vehicle_model=COALESCE($3,vehicle_model),
         vehicle_year=COALESCE($4,vehicle_year), vehicle_color=COALESCE($5,vehicle_color),
         vehicle_plate=COALESCE($6,vehicle_plate), license_number=COALESCE($7,license_number),
         verified=FALSE, status='offline', updated_at=now()
       WHERE id=$1 AND status!='busy' RETURNING *`,
      [driver.id, vehicleMake, vehicleModel, vehicleYear, vehicleColor, vehiclePlate, licenseNumber]
    );
    updated = result.rows[0];
    if (!updated) throw new ApiError(409, 'Finish the active trip first.');
    await client.query(
      `UPDATE driver_documents SET status='pending', reviewed_at=NULL, reviewed_by=NULL,
         verification_method=NULL, evidence_reference=NULL
       WHERE driver_id=$1 AND doc_type IN ('vehicle_registration','insurance') AND status='approved'`,
      [driver.id]
    );
    await client.query(
      `INSERT INTO driver_status_history (driver_id,from_status,to_status,changed_by,reason)
       VALUES ($1,$2,'offline','admin','vehicle details changed; verification required')`,
      [driver.id, driver.status]
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally { client.release(); }
  res.json({ driver: driverToJson(updated) });
}));

// POST /api/admin/drivers/:id/suspend { reason } — revoke verification and
// take the driver offline. A driver mid-trip must finish it first.
router.post(
  '/drivers/:id/suspend',
  asyncHandler(async (req, res) => {
    const { reason } = req.body || {};
    if (!reason) throw new ApiError(400, 'A reason is required.');
    const driver = await loadDriver(req.params.id);
    if (driver.status === 'busy') {
      throw new ApiError(409, 'This driver is on a trip. Try again once it ends.');
    }
    const { rows } = await getPool().query(
      `UPDATE drivers SET verified = FALSE, status = 'suspended', updated_at = now()
        WHERE id = $1 RETURNING *`,
      [driver.id]
    );
    await recordStatus(driver.id, driver.status, 'suspended', String(reason));
    await pushDriverNotification(driver.id, {
      title: 'Account suspended',
      body: `Your driver account was suspended: ${reason}. Contact Kimu Transport support.`,
      type: 'account',
    });
    res.json({ driver: driverToJson(rows[0]) });
  })
);

// GET /api/admin/payouts?status=pending — driver payout requests to review.
router.get('/payouts', asyncHandler(async (req, res) => {
  const status = String(req.query.status || 'pending');
  const { rows } = await getPool().query(
    `SELECT p.*, d.full_name AS driver_name FROM driver_payouts p
       JOIN drivers d ON d.id = p.driver_id
      WHERE p.status = $1 ORDER BY p.created_at ASC LIMIT 200`,
    [status]
  );
  res.json({ payouts: rows.map((r) => ({ ...payoutToJson(r), driverName: r.driver_name })) });
}));

// POST /api/admin/payouts/:id/approve { reviewer, reference? } — sends the
// money by mobile money, or records a manual transfer by its reference.
router.post('/payouts/:id/approve', asyncHandler(async (req, res) => {
  const payout = await approvePayout(req.params.id, req.body || {});
  res.json({ payout: payoutToJson(payout) });
}));

// POST /api/admin/payouts/:id/reject { reviewer, reason }
router.post('/payouts/:id/reject', asyncHandler(async (req, res) => {
  const payout = await rejectPayout(req.params.id, req.body || {});
  res.json({ payout: payoutToJson(payout) });
}));

// GET /api/admin/drivers/:id/balance
router.get('/drivers/:id/balance', asyncHandler(async (req, res) => {
  const driver = await loadDriver(req.params.id);
  res.json({ balance: await getDriverBalance(driver.id) });
}));

// POST /api/admin/drivers/:id/settlements { amount, reference, recordedBy }
// — commission the driver paid in person or by transfer.
router.post('/drivers/:id/settlements', asyncHandler(async (req, res) => {
  const driver = await loadDriver(req.params.id);
  const settlement = await recordOperatorSettlement(driver.id, req.body || {});
  res.status(201).json({ settlement: settlementToJson(settlement), balance: await getDriverBalance(driver.id) });
}));

// GET /api/admin/paypack/status — proves the configured Paypack credentials
// still work (after rotating the secret, for example). Read-only: it signs in
// and reads the account; no transaction is created.
router.get('/paypack/status', asyncHandler(async (_req, res) => {
  if (!paypack.isConfigured()) return res.json({ configured: false, authenticated: false });
  try {
    const balances = await paypack.getBalances();
    res.json({
      configured: true,
      authenticated: true,
      webhookSecretSet: Boolean(config.paypackWebhookSecret),
      balances,
    });
  } catch (err) {
    console.error('[admin] Paypack status check failed:', err.message);
    res.json({ configured: true, authenticated: false, webhookSecretSet: Boolean(config.paypackWebhookSecret) });
  }
}));

// GET /api/admin/audit/test-data — read-only inventory of records that look
// like development or test data, for an operator to review before anything
// is cleaned up. Nothing is changed.
router.get('/audit/test-data', asyncHandler(async (_req, res) => {
  const q = async (sql, params) => (await getPool().query(sql, params)).rows;
  const seedWhere = `(d.phone = ANY($1) OR (d.phone LIKE '+25078999____' AND d.license_number ~ '^DL-1[0-9]{3}$'))`;
  res.json({
    seededDrivers: await q(
      `SELECT d.id, d.full_name, d.phone, d.status, d.verified, d.password_hash IS NOT NULL AS can_sign_in, d.created_at,
              (SELECT count(*)::int FROM rides r WHERE r.driver_id = d.id) AS rides
         FROM drivers d WHERE ${seedWhere} ORDER BY d.phone`, [SEED_DRIVER_PHONES]),
    ridesWithSeededDrivers: await q(
      `SELECT r.id, r.status, r.payment_method, r.estimated_fare, r.created_at, d.phone AS driver_phone,
              p.id AS passenger_id, p.full_name AS passenger_name, p.phone AS passenger_phone
         FROM rides r JOIN drivers d ON d.id = r.driver_id JOIN passengers p ON p.id = r.passenger_id
        WHERE ${seedWhere} ORDER BY r.created_at`, [SEED_DRIVER_PHONES]),
    // A wallet whose balance differs from the sum of its transactions was
    // changed outside the ledger — the old seed script did exactly that.
    walletsNotMatchingLedger: await q(
      `SELECT w.passenger_id, p.full_name, p.phone, p.created_at AS passenger_created_at, w.balance,
              COALESCE(SUM(CASE WHEN t.type = 'credit' THEN t.amount ELSE -t.amount END), 0) AS ledger
         FROM wallets w JOIN passengers p ON p.id = w.passenger_id
         LEFT JOIN wallet_transactions t ON t.passenger_id = w.passenger_id
        GROUP BY w.passenger_id, p.full_name, p.phone, p.created_at, w.balance
       HAVING abs(w.balance - COALESCE(SUM(CASE WHEN t.type = 'credit' THEN t.amount ELSE -t.amount END), 0)) > 0.005`),
    likelyTestPassengers: await q(
      `SELECT p.id, p.full_name, p.phone, p.email, p.created_at,
              (SELECT count(*)::int FROM rides r WHERE r.passenger_id = p.id) AS rides,
              (SELECT balance FROM wallets w WHERE w.passenger_id = p.id) AS wallet_balance
         FROM passengers p
        WHERE p.email ILIKE '%@example.com' OR p.full_name ILIKE '%test%' OR p.full_name ILIKE '%rider%'
        ORDER BY p.created_at`),
    likelyTestDrivers: await q(
      `SELECT d.id, d.full_name, d.phone, d.status, d.verified, d.license_number, d.created_at,
              (SELECT count(*)::int FROM rides r WHERE r.driver_id = d.id) AS rides
         FROM drivers d
        WHERE d.full_name ILIKE '%test%' OR d.license_number ILIKE 'TEST%' OR d.full_name ILIKE '%driver%'
        ORDER BY d.created_at`),
    promotions: await q('SELECT id, code, title, active, uses_count, max_uses, created_at FROM promotions ORDER BY created_at'),
    openRidesOlderThanADay: await q(
      `SELECT id, status, payment_method, created_at FROM rides
        WHERE status NOT IN ('completed', 'cancelled') AND created_at < now() - interval '1 day' ORDER BY created_at`),
    pendingPaymentsOlderThanADay: await q(
      `SELECT id, ride_id, method, amount, created_at FROM payments
        WHERE status = 'pending' AND created_at < now() - interval '1 day' ORDER BY created_at`),
    openPaymentExceptions: await q(`SELECT id, reason, payment_id, topup_id, ride_id, created_at FROM payment_exceptions WHERE status = 'open'`),
    totals: (await q(
      `SELECT (SELECT count(*)::int FROM passengers) AS passengers,
              (SELECT count(*)::int FROM passengers WHERE deleted_at IS NOT NULL) AS closed_passengers,
              (SELECT count(*)::int FROM drivers) AS drivers,
              (SELECT count(*)::int FROM drivers WHERE status IN ('active', 'busy')) AS drivers_online,
              (SELECT count(*)::int FROM rides) AS rides,
              (SELECT count(*)::int FROM payments) AS payments,
              (SELECT count(*)::int FROM wallet_topups) AS wallet_topups,
              (SELECT count(*)::int FROM driver_locations WHERE recorded_at < now() - interval '1 day') AS driver_locations_older_than_a_day`))[0],
  });
}));

module.exports = router;
