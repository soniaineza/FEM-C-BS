const { getPool } = require('../db');

// Records created by development tooling. They are useful on a developer's
// own database and must never be usable on a real one:
//  - scripts/seed-dev-drivers.js creates three drivers on fixed phone numbers
//    (their password used to be a published default) and a sample promotion
//  - the retired demo fleet used +25078999NNNN with licence numbers DL-1NNN
const SEED_DRIVER_PHONES = ['+250780000001', '+250780000002', '+250780000003'];
const FLEET_PHONE_PATTERN = '+25078999____';
const FLEET_LICENSE_REGEX = '^DL-1[0-9]{3}$';
// Identified by its code and exact title, so a promotion an operator later
// creates under the same code but their own title is left alone.
const SEED_PROMOTION = { code: 'WELCOME30', title: 'Welcome 30% off' };

/**
 * On every database, permanently closes every development driver account —
 * no password (so nobody can sign in), unverified and
 * suspended (so it is never shown to riders or offered a ride), no push
 * devices — and switches off the sample promotion. Rows and their ride
 * history are kept for the record: nothing is deleted. Runs at every startup
 * and is a no-op once done, so anything re-created by mistake is closed
 * again on the next boot.
 */
async function retireSeedAccounts() {
  const { rows } = await getPool().query(
    `UPDATE drivers
        SET password_hash = NULL, verified = FALSE, status = 'suspended'
      WHERE (phone = ANY($1) OR (phone LIKE $2 AND license_number ~ $3))
        AND (password_hash IS NOT NULL OR verified = TRUE OR status <> 'suspended')
      RETURNING id, phone`,
    [SEED_DRIVER_PHONES, FLEET_PHONE_PATTERN, FLEET_LICENSE_REGEX]
  );
  await getPool().query(
    `DELETE t FROM driver_device_tokens t
       JOIN drivers d ON t.driver_id = d.id
      WHERE (d.phone = ANY($1) OR (d.phone LIKE $2 AND d.license_number ~ $3))`,
    [SEED_DRIVER_PHONES, FLEET_PHONE_PATTERN, FLEET_LICENSE_REGEX]
  );
  if (rows.length) {
    console.warn(`[security] closed ${rows.length} development driver account(s): ${rows.map((r) => r.phone).join(', ')}`);
  }

  const promo = await getPool().query(
    `UPDATE promotions SET active = FALSE
      WHERE code = $1 AND title = $2 AND active = TRUE RETURNING code`,
    [SEED_PROMOTION.code, SEED_PROMOTION.title]
  );
  if (promo.rows.length) console.warn(`[security] switched off the development promotion ${SEED_PROMOTION.code}`);
}

module.exports = { retireSeedAccounts, SEED_DRIVER_PHONES };
