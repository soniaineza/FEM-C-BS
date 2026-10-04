const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const { AsyncLocalStorage } = require('async_hooks');
const transactions = new AsyncLocalStorage();

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
  const schemaPool = new Pool({ connectionString: url, max: 1 });
  const client = await schemaPool.connect();
  try {
    await client.query('BEGIN');
    await client.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
    await client.query(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
    const driverSchemaPath = path.join(__dirname, 'driver-schema.sql');
    if (fs.existsSync(driverSchemaPath)) await client.query(fs.readFileSync(driverSchemaPath, 'utf8'));
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await schemaPool.end();
  }
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
  if (transactions.getStore()) return transactions.getStore().client;
  if (!pool) throw new Error('Database pool not initialised — call initPool() first.');
  return pool;
}

async function transaction(work) {
  if (transactions.getStore()) return work(getPool());
  const client = await getPool().connect();
  const callbacks = [];
  let result;
  try {
    await client.query('BEGIN');
    result = await transactions.run({ client, callbacks }, () => work(client));
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
  for (const callback of callbacks) {
    try { await callback(); } catch (error) { console.error('[db] post-commit delivery failed:', error.message); }
  }
  return result;
}

function afterCommit(callback) {
  const current = transactions.getStore();
  if (current) current.callbacks.push(callback);
  else return callback();
}

function inTransaction() { return Boolean(transactions.getStore()); }

module.exports = { ensureDatabase, applySchema, initPool, getPool, transaction, afterCommit, inTransaction };

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
