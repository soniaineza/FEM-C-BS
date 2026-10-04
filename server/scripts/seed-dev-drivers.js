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
  const { ensureEmbeddedReady } = require('../src/config');
  const { ensureDatabase, applySchema, initPool, getPool } = require('../src/db');
  ensureEmbeddedReady();
  const url = await ensureDatabase();
  await applySchema(url);
  initPool(url);

  const passwordHash = await bcrypt.hash('123456', 10);
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
         verified = TRUE, status = 'active', current_vehicle_id = EXCLUDED.current_vehicle_id,
         current_latitude = EXCLUDED.current_latitude, current_longitude = EXCLUDED.current_longitude
       RETURNING id`,
      [d.fullName, d.phone, passwordHash, d.license, d.vehicle, d.lat, d.lng]
    );
    const driverId = rows[0].id;
    await getPool().query(
      `INSERT INTO driver_locations (driver_id, latitude, longitude, measured_at, accuracy, recorded_at)
       VALUES ($1,$2,$3, now(), 100, now())
       ON CONFLICT (driver_id) DO UPDATE SET latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude,
         measured_at = EXCLUDED.measured_at, accuracy = EXCLUDED.accuracy, recorded_at = now()`,
      [driverId, d.lat, d.lng]
    );
    console.log(`[seed] driver ready: ${d.fullName} (${d.phone}) password: 123456`);
  }

  // A welcome promo so the promotions module is testable immediately.
  await getPool().query(
    `INSERT INTO promotions (code, title, description, discount_type, discount_value, min_fare, max_discount)
     VALUES ('WELCOME30', 'Welcome 30% off', '30% off your first trip.', 'percent', 30, 0, 5000)
     ON CONFLICT (code) DO NOTHING`
  );

  // A demo wallet balance so wallet payments can be tested.
  const { rows: pax } = await getPool().query(
    "SELECT id FROM passengers ORDER BY created_at LIMIT 1"
  );
  if (pax[0]) {
    await getPool().query(
      `INSERT INTO wallets (passenger_id, balance) VALUES ($1, 20000)
        ON CONFLICT (passenger_id) DO UPDATE SET balance = 20000`,
      [pax[0].id]
    );
    console.log('[seed] demo wallet funded with RWF 20,000 for the first passenger.');
  }

  console.log('[seed] done.');
  process.exit(0);
}

main().catch((err) => {
  console.error('[seed] failed:', err);
  process.exit(1);
});