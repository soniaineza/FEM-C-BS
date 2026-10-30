/**
 * Dev-only cleanup: cancels any non-terminal rides and releases drivers back
 * to 'active' near the smoke-test pickup point, clear of commission debt. Used between test runs so a
 * crashed run doesn't leave the matching pipeline wedged.
 *
 * Usage: node scripts/reset-dev-rides.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { config, ensureEmbeddedReady } = require('../src/config');
const { ensureDatabase, applySchema, initPool, getPool } = require('../src/db');

async function main() {
  // This cancels every open ride and moves every driver: local databases only.
  if (!config.localDatabase) {
    console.error('Refusing to reset rides: MYSQL_HOST is not this machine.');
    process.exit(1);
  }
  ensureEmbeddedReady();
  const url = await ensureDatabase();
  await applySchema(url);
  initPool(url);

  const { rows } = await getPool().query(
    "SELECT id, status FROM rides WHERE status NOT IN ('completed', 'cancelled') ORDER BY created_at"
  );
  console.log('non-terminal rides:', rows.length);
  for (const r of rows) {
    await getPool().query(
      "UPDATE rides SET status = 'cancelled', cancelled_at = now(), cancelled_by = 'system' WHERE id = $1",
      [r.id]
    );
    console.log('  cancelled', r.id.slice(0, 8), '(was ' + r.status + ')');
  }

  await getPool().query("UPDATE drivers SET status = 'active' WHERE status = 'busy'");
  // Clear commission owed on cash test trips, so repeated test runs do not
  // push a dev driver past the debt limit and take them offline mid-suite.
  const { getDriverBalance } = require('../src/services/driverBalance');
  const { rows: allDrivers } = await getPool().query('SELECT id FROM drivers');
  for (const d of allDrivers) {
    const { owed } = await getDriverBalance(d.id);
    if (owed > 0) {
      await getPool().query(
        `INSERT INTO driver_settlements (driver_id, amount, method, status, reference, recorded_by)
         VALUES ($1, $2, 'operator', 'succeeded', 'dev-reset', 'reset-dev-rides')`,
        [d.id, owed]
      );
    }
  }
  await getPool().query('UPDATE drivers SET current_latitude = -1.9441, current_longitude = 30.0619');
  const { rows: drivers } = await getPool().query('SELECT full_name, status, current_latitude FROM drivers');
  for (const d of drivers) console.log(`  driver ${d.full_name}: ${d.status} @ ${d.current_latitude}`);
  console.log('done.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
