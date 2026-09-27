const express = require('express');
const crypto = require('crypto');

const { getPool } = require('../db');
const { config } = require('../config');
const { asyncHandler, ApiError } = require('../utils/asyncHandler');
const { driverToJson } = require('../utils/serialize');
const { pushDriverNotification } = require('../services/driverNotify');

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
  };
}

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
    const { status, reason } = req.body || {};
    if (!['approved', 'rejected'].includes(status)) {
      throw new ApiError(400, 'status must be "approved" or "rejected".');
    }
    if (status === 'rejected' && !reason) throw new ApiError(400, 'A rejection reason is required.');
    const { rows } = await getPool().query(
      `UPDATE driver_documents SET status = $2, rejection_reason = $3, reviewed_at = now()
        WHERE id = $1 RETURNING *`,
      [req.params.id, status, status === 'rejected' ? String(reason) : null]
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
