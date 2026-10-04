const { getPool } = require('../db');
const { config } = require('../config');

// Driver accounts created by development tooling. They are useful on a
// developer's own database and must never be usable on a real one:
//  - scripts/seed-dev-drivers.js creates three drivers on fixed phone numbers
//    (their password used to be a published default)
//  - the simulated fleet (services/demoFleet.js) creates drivers on
//    +25078999NNNN with licence numbers DL-1NNN
const SEED_DRIVER_PHONES = ['+250780000001', '+250780000002', '+250780000003'];
const FLEET_PHONE_PATTERN = '+25078999____';
const FLEET_LICENSE_REGEX = '^DL-1[0-9]{3}$';

/**
 * On a real (non-local) database, permanently closes every development
 * driver account: no password (so nobody can sign in), unverified and
 * suspended (so it is never shown to riders or offered a ride), and no push
 * devices. Rows and their ride history are kept for the record — nothing is
 * deleted. Runs at every startup and is a no-op once done, so an account
 * re-created by mistake is closed again on the next boot.
 */
async function retireSeedAccounts() {
  if (config.localDatabase) return;
  const { rows } = await getPool().query(
    `UPDATE drivers
        SET password_hash = NULL, verified = FALSE,
            status = CASE WHEN status = 'busy' THEN status ELSE 'suspended' END
      WHERE (phone = ANY($1) OR (phone LIKE $2 AND license_number ~ $3))
        AND (password_hash IS NOT NULL OR verified = TRUE OR status NOT IN ('suspended', 'busy'))
      RETURNING id, phone`,
    [SEED_DRIVER_PHONES, FLEET_PHONE_PATTERN, FLEET_LICENSE_REGEX]
  );
  if (!rows.length) return;
  await getPool().query('DELETE FROM driver_device_tokens WHERE driver_id = ANY($1)', [
    rows.map((r) => r.id),
  ]);
  console.warn(`[security] closed ${rows.length} development driver account(s): ${rows.map((r) => r.phone).join(', ')}`);
}

module.exports = { retireSeedAccounts, SEED_DRIVER_PHONES };
