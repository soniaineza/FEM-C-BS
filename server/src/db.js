const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const { config } = require('./config');

let pool = null;

/** Returns the configured PostgreSQL connection string. Requires DATABASE_URL. */
async function ensureDatabase() {
  if (!config.databaseUrl) {
    throw new Error(
      'DATABASE_URL is not set. See server/.env.example for how to configure it.'
    );
  }
  config.poolDsn = config.databaseUrl;
  return config.poolDsn;
}

/** Applies schema.sql + seeds to the database (idempotent). */
async function applySchema(url) {
  const client = new Pool({ connectionString: url, max: 2 });
  const schemaPath = path.join(__dirname, 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');
  await client.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
  await client.query(sql);

  // Apply driver-side schema extensions (idempotent).
  const driverSchemaPath = path.join(__dirname, 'driver-schema.sql');
  if (fs.existsSync(driverSchemaPath)) {
    const driverSql = fs.readFileSync(driverSchemaPath, 'utf8');
    await client.query(driverSql);
    console.log('[db] driver schema applied.');
  }

  await client.end();
  console.log('[db] schema applied.');
}

/** Creates (once) the shared connection pool used by the API routes. */
function initPool(url) {
  if (pool) return pool;
  pool = new Pool({ connectionString: url, max: 10 });
  return pool;
}

/** Returns the shared pool. Throws if `initPool` has not run yet. */
function getPool() {
  if (!pool) throw new Error('Database pool not initialised — call initPool() first.');
  return pool;
}

module.exports = { ensureDatabase, applySchema, initPool, getPool };

// Support `node src/db.js --init-only` to just (re)create the schema.
if (require.main === module && process.argv.includes('--init-only')) {
  (async () => {
    const { ensureEmbeddedReady } = require('./config');
    ensureEmbeddedReady();
    const url = await ensureDatabase();
    await applySchema(url);
    console.log('[db] init complete.');
    process.exit(0);
  })().catch((err) => {
    console.error('[db] init failed:', err);
    process.exit(1);
  });
}
