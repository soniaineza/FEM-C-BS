/**
 * Development-only: seeds a few **real** driver records so the passenger app
 * can be exercised end-to-end through the real matching pipeline.
 *
 * Guard rails (production will not run this):
 *  - refuses to run when NODE_ENV === 'production'
 *  - refuses to run unless SEED_DEV_DATA=1
 *
 * Usage:  SEED_DEV_DATA=1 node scripts/seed-dev-drivers.js
 */
const bcrypt = require('bcryptjs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

async function main() {
  if (process.env.NODE_ENV === 'production') {
    console.error('Refusing to seed dev data in production.');
    process.exit(1);
  }
  if (process.env.SEED_DEV_DATA !== '1') {
    console.error('Set SEED_DEV_DATA=1 to seed development drivers.');
    process.exit(1);
  }
  const { config, ensureEmbeddedReady } = require('../src/config');
  // These accounts are only for a developer's own database. The server
  // retires them at startup, so seed them after the local API is running.
  if (!config.localDatabase) {
    console.error('Refusing to seed development drivers: DATABASE_URL is not a local database.');
    process.exit(1);
  }
  // No built-in password: each developer sets their own, kept out of the repo.
  const seedPassword = process.env.SEED_DRIVER_PASSWORD || '';
  if (seedPassword.length < 12) {
    console.error('Set SEED_DRIVER_PASSWORD (at least 12 characters) in server/.env.');
    process.exit(1);
  }
  const { ensureDatabase, applySchema, initPool, getPool } = require('../src/db');
  ensureEmbeddedReady();
  const url = await ensureDatabase();
  await applySchema(url);
  initPool(url);

  const passwordHash = await bcrypt.hash(seedPassword, 10);
  const demoDrivers = [
    {
      fullName: 'Jean Baptiste',
      phone: '+250780000001',
      vehicle: 'fem_economy',
      lat: -1.9441,
      lng: 30.0619,
      license: 'RAD 123 A',
    },
    {
      fullName: 'Alice Uwase',
      phone: '+250780000002',
      vehicle: 'fem_comfort',
      lat: -1.9509,
      lng: 30.0595,
      license: 'RAC 456 B',
    },
    {
      fullName: 'Eric Mugisha',
      phone: '+250780000003',
      vehicle: 'fem_economy',
      lat: -1.9586,
      lng: 30.0647,
      license: 'RAB 789 C',
    },
  ];

  for (const d of demoDrivers) {
    const { rows } = await getPool().query(
      `INSERT INTO drivers (full_name, phone, password_hash, license_number, verified,
                             status, current_vehicle_id, current_latitude, current_longitude, rating)
       VALUES ($1,$2,$3,$4,TRUE,'active',$5,$6,$7,4.9)
       ON CONFLICT (phone) DO UPDATE SET
         password_hash = EXCLUDED.password_hash,
         verified = TRUE, status = 'active', current_vehicle_id = EXCLUDED.current_vehicle_id,
         current_latitude = EXCLUDED.current_latitude, current_longitude = EXCLUDED.current_longitude
       RETURNING id`,
      [d.fullName, d.phone, passwordHash, d.license, d.vehicle, d.lat, d.lng]
    );
    const driverId = rows[0].id;
    await getPool().query(
      `INSERT INTO driver_locations (driver_id, latitude, longitude, recorded_at)
       VALUES ($1,$2,$3, now())
       ON CONFLICT (driver_id) DO UPDATE SET latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude`,
      [driverId, d.lat, d.lng]
    );
    console.log(`[seed] driver ready: ${d.fullName} (${d.phone})`);
  }

  // A welcome promo so the promotions module is testable immediately.
  await getPool().query(
    `INSERT INTO promotions (code, title, description, discount_type, discount_value, min_fare, max_discount)
     VALUES ('WELCOME30', 'Welcome 30% off', '30% off your first trip.', 'percent', 30, 0, 5000)
     ON CONFLICT (code) DO NOTHING`
  );

  console.log('[seed] done.');
  process.exit(0);
}

main().catch((err) => {
  console.error('[seed] failed:', err);
  process.exit(1);
});