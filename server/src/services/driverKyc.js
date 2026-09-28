const { getPool } = require('../db');
const { config } = require('../config');

const REQUIRED_DOCUMENTS = ['license', 'national_id', 'vehicle_registration', 'insurance'];
const LOCATION_MAX_AGE_SECONDS = 45;
// SQL fragment for queries that alias drivers as d.
const eligibleDriverSql = config.demoFleet || config.devAutoVerifyDrivers ? '' : `
  AND EXISTS (SELECT 1 FROM driver_locations dl WHERE dl.driver_id = d.id
    AND dl.recorded_at > now() - interval '${LOCATION_MAX_AGE_SECONDS} seconds')
  AND (SELECT count(DISTINCT doc_type) FROM driver_documents dd
    WHERE dd.driver_id = d.id AND dd.doc_type IN ('license','national_id','vehicle_registration','insurance')
      AND dd.status = 'approved' AND dd.reviewed_by IS NOT NULL
      AND dd.verification_method = 'in_person' AND dd.evidence_reference IS NOT NULL
      AND (dd.expires_at IS NULL OR dd.expires_at > now())) = 4`;

async function missingApprovedDocuments(driverId) {
  if (config.devAutoVerifyDrivers) return [];
  const { rows } = await getPool().query(
    `SELECT DISTINCT doc_type FROM driver_documents
       WHERE driver_id = $1 AND status = 'approved'
         AND reviewed_by IS NOT NULL AND verification_method = 'in_person'
         AND evidence_reference IS NOT NULL
         AND (expires_at IS NULL OR expires_at > now())`,
    [driverId]
  );
  const approved = new Set(rows.map((r) => r.doc_type));
  return REQUIRED_DOCUMENTS.filter((type) => !approved.has(type));
}

module.exports = { REQUIRED_DOCUMENTS, LOCATION_MAX_AGE_SECONDS, eligibleDriverSql, missingApprovedDocuments };
