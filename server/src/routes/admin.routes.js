const express = require('express');
const crypto = require('crypto');

const { getPool } = require('../db');
const { config } = require('../config');
const { asyncHandler, ApiError } = require('../utils/asyncHandler');
const { driverToJson } = require('../utils/serialize');
const { pushDriverNotification } = require('../services/driverNotify');
const { missingApprovedDocuments } = require('../services/driverKyc');

// Operator-only routes for driver KYC review. Authenticated with the
// ADMIN_API_KEY shared secret in the X-Admin-Key header; disabled entirely
// when ADMIN_API_KEY is unset. See server/README.md for curl examples.
const router = express.Router();

router.use((req, _res, next) => {
  if (!config.adminApiKey) return next(new ApiError(404, 'Not found.'));
  const given = Buffer.from(String(req.headers['x-admin-key'] || ''));
  const expected = Buffer.from(config.adminApiKey);
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
    return next(new ApiError(401, 'Invalid admin key.'));
  }
  next();
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
    `SELECT x.*, p.external_reference, p.amount, p.method FROM payment_exceptions x
       JOIN payments p ON p.id=x.payment_id WHERE x.status='open'
       ORDER BY x.created_at DESC LIMIT 200`
  );
  res.json({ exceptions: rows });
}));

router.post('/payment-exceptions/:id/resolve', asyncHandler(async (req, res) => {
  const { resolution, reference } = req.body || {};
  if (!['refunded', 'no_refund_due'].includes(resolution) || !String(reference || '').trim()) {
    throw new ApiError(400, 'resolution and external reference are required.');
  }
  const { rows } = await getPool().query(
    `UPDATE payment_exceptions SET status='resolved', resolution=$2,
       resolution_reference=$3, resolved_at=now()
      WHERE id=$1 AND status='open' RETURNING *`,
    [req.params.id, resolution, String(reference).trim()]
  );
  if (!rows[0]) throw new ApiError(404, 'Open payment exception not found.');
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
      'SELECT * FROM drivers WHERE verified = $1 ORDER BY created_at ASC LIMIT 200',
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
      body: 'Your FEM C@BS driver account is approved. Go online to start receiving rides.',
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
      body: `Your driver account was suspended: ${reason}. Contact FEM C@BS support.`,
      type: 'account',
    });
    res.json({ driver: driverToJson(rows[0]) });
  })
);

module.exports = router;
