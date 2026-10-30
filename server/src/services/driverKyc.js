const { getPool } = require('../db');
const { config } = require('../config');

const REQUIRED_DOCUMENTS = ['license', 'national_id', 'vehicle_registration', 'insurance'];
const LOCATION_MAX_AGE_SECONDS = config.driverLocationMaxAgeSeconds;
// SQL fragment for queries that alias drivers as d.
// A driver is only shown to riders and offered rides while their phone is
// actually reporting its position; one that stopped is not really there.
// Only local tests may opt out of the live-location requirement.
const freshLocationSql = config.devAllowStaleDrivers ? '' : `
  AND EXISTS (SELECT 1 FROM driver_locations dl WHERE dl.driver_id = d.id
    AND dl.recorded_at > now() - interval '${LOCATION_MAX_AGE_SECONDS} seconds')`;
const eligibleDriverSql = freshLocationSql + `
  AND (SELECT count(DISTINCT doc_type) FROM driver_documents dd
    WHERE dd.driver_id = d.id AND dd.doc_type IN ('license','national_id','vehicle_registration','insurance')
      AND (dd.file_data IS NOT NULL OR dd.file_remote)
      AND dd.status = 'approved' AND dd.reviewed_by IS NOT NULL
      AND dd.verification_method = 'in_person' AND dd.evidence_reference IS NOT NULL
      AND (dd.expires_at IS NULL OR dd.expires_at > now())) = 4`;

async function missingApprovedDocuments(driverId) {
  const { rows } = await getPool().query(
    `SELECT DISTINCT doc_type FROM driver_documents
       WHERE driver_id = $1 AND status = 'approved'
         AND (file_data IS NOT NULL OR file_remote)
         AND reviewed_by IS NOT NULL AND verification_method = 'in_person'
         AND evidence_reference IS NOT NULL
         AND (expires_at IS NULL OR expires_at > now())`,
    [driverId]
  );
  const approved = new Set(rows.map((r) => r.doc_type));
  return REQUIRED_DOCUMENTS.filter((type) => !approved.has(type));
}

module.exports = { REQUIRED_DOCUMENTS, LOCATION_MAX_AGE_SECONDS, eligibleDriverSql, missingApprovedDocuments };
