const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// Password of the local seeded drivers (scripts/seed-dev-drivers.js). It is
// set per developer in server/.env and never stored in the repository.
const SEED_DRIVER_PASSWORD = process.env.SEED_DRIVER_PASSWORD;
if (!SEED_DRIVER_PASSWORD) {
  console.error('Set SEED_DRIVER_PASSWORD in server/.env, then run: SEED_DEV_DATA=1 npm run seed:dev');
  process.exit(1);
}

module.exports = { SEED_DRIVER_PASSWORD };
