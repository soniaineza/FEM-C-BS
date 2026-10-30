const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mysql = require('mysql2/promise');

const { config } = require('./config');
const { compile, GENERATED_ID } = require('./sqlCompat');

// The API talks to MySQL/MariaDB through getPool(), which keeps the small
// interface the routes were written against (query(sql, params) -> { rows,
// rowCount }, connect() -> client with query/release). The SQL itself stays
// PostgreSQL-flavoured and is translated by sqlCompat.js; see its header.

let pool = null;

/** JSON columns come back as text on MariaDB (where JSON is an alias of LONGTEXT). */
const JSON_COLUMNS = new Set(['payload', 'metadata', 'fare_breakdown']);

function typeCast(field, next) {
  if (field.type === 'TINY' && field.length === 1) {
    const v = field.string();
    return v === null ? null : v !== '0';
  }
  if (JSON_COLUMNS.has(field.name) && ['JSON', 'BLOB', 'VAR_STRING', 'STRING'].includes(field.type)) {
    const v = field.string();
    if (v === null) return null;
    try { return JSON.parse(v); } catch (_) { return v; }
  }
  return next();
}

function isLocalHost(host) {
  return ['localhost', '127.0.0.1', '::1'].includes(String(host).toLowerCase());
}

/** Connection settings from MYSQL_* (see server/.env.example). */
function connectionOptions() {
  const my = config.mysql;
  const options = {
    host: my.host,
    port: my.port,
    user: my.user,
    password: my.password,
    database: my.database,
    charset: 'utf8mb4',
    timezone: 'Z',
    decimalNumbers: true,
    typeCast,
    connectTimeout: 20000,
    connectionLimit: my.poolSize,
    // Close idle connections before a shared host's wait_timeout does.
    maxIdle: my.poolSize,
    idleTimeout: 60000,
    waitForConnections: true,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
  };
  // A remote database must not send its password in the clear. The certificate
  // is verified only when MYSQL_SSL_CA is given (shared hosts often use a
  // self-signed one); MYSQL_SSL=off is for a database on the same machine.
  const useSsl = my.ssl === 'on' || (my.ssl !== 'off' && !isLocalHost(my.host));
  if (useSsl) {
    options.ssl = my.sslCa
      ? { ca: fs.readFileSync(my.sslCa, 'utf8'), rejectUnauthorized: true }
      : { rejectUnauthorized: false };
  }
  return options;
}

// Session settings every connection gets. Strict mode keeps bad data out like
// PostgreSQL did; PIPES_AS_CONCAT makes || concatenate; UTC keeps NOW(3) and
// stored times in one zone; READ COMMITTED matches PostgreSQL's default
// isolation (skipped with a warning where the host forbids it).
const SESSION_SETUP = [
  "SET SESSION sql_mode = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION,PIPES_AS_CONCAT'",
  "SET SESSION time_zone = '+00:00'",
];

function setUpSession(connection) {
  const run = (sql, optional) => connection.query(sql, (err) => {
    if (err && !optional) console.error('[db] session setup failed:', err.message);
    else if (err) console.warn(`[db] ${sql} not applied: ${err.message}`);
  });
  SESSION_SETUP.forEach((sql) => run(sql, false));
  run('SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED', true);
}

// ---------- parameter binding and statement execution ----------

// PostgreSQL took ISO-8601 text (new Date().toISOString()) for a timestamp;
// MySQL's strict mode refuses the "T" and the "Z", so such text is sent as a
// real Date, which the driver writes in UTC.
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/;

function prepareValue(value) {
  if (value === undefined) return null;
  if (typeof value === 'string' && ISO_DATETIME.test(value)) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  if (value === null || value instanceof Date || Buffer.isBuffer(value)) return value;
  if (Array.isArray(value) || (typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype)) {
    return JSON.stringify(value);
  }
  return value;
}

/** The values for a compiled statement's `?`s, in order. */
function bind(order, lists, params, generatedId) {
  return order.map((source) => {
    if (source === GENERATED_ID) return generatedId;
    const value = params[source];
    if (lists && lists.has(source)) {
      const list = Array.isArray(value) ? value : [value];
      return list.length ? list.map(prepareValue) : [null]; // IN (NULL) matches nothing
    }
    return prepareValue(value);
  });
}

const BINARY_THRESHOLD = 64 * 1024;

function toResult(raw) {
  if (Array.isArray(raw)) return { rows: raw, rowCount: raw.length };
  return { rows: [], rowCount: raw.affectedRows, insertId: raw.insertId };
}

// MySQL rolls back the statement (or transaction) it picked as a deadlock
// victim, or that waited too long for a lock; running it again is safe and is
// what its documentation tells applications to do.
const RETRYABLE_ERRNOS = new Set([1213, 1205]);
const MAX_ATTEMPTS = 3;

async function retrying(fn) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      if (!RETRYABLE_ERRNOS.has(err && err.errno) || attempt >= MAX_ATTEMPTS) throw err;
      await new Promise((resolve) => setTimeout(resolve, 20 * attempt + Math.random() * 30));
    }
  }
}

/**
 * Runs `fn` inside a transaction unless the connection already has one (then
 * the caller owns it and its retry). A transaction started here is retried as
 * a whole after a deadlock.
 */
async function inTransaction(conn, state, fn) {
  if (state.inTx) return fn();
  return retrying(async () => {
    await conn.query('BEGIN');
    state.inTx = true;
    try {
      const result = await fn();
      await conn.query('COMMIT');
      return result;
    } catch (err) {
      await conn.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      state.inTx = false;
    }
  });
}

/** Executes one PostgreSQL-style statement on `conn` (a pool connection). */
async function execute(conn, state, sql, params) {
  const plan = compile(sql);
  // A big file would be sent as a hex literal (twice its size) and can exceed
  // the server's max_allowed_packet; a prepared statement sends the raw bytes.
  const run = async (text, values) => {
    const binary = values.some((v) => Buffer.isBuffer(v) && v.length > BINARY_THRESHOLD);
    return toResult((await (binary ? conn.execute(text, values) : conn.query(text, values)))[0]);
  };

  if (plan.kind === 'plain') {
    const verb = /^\s*(BEGIN|START\s+TRANSACTION|COMMIT|ROLLBACK)\b/i.exec(sql);
    const result = await run(plan.text, bind(plan.order, plan.lists, params));
    if (verb) state.inTx = /^(BEGIN|START)/i.test(verb[1]);
    return result;
  }

  if (plan.kind === 'insert-returning') {
    const id = plan.pkParam === 0 && plan.insert.order[0] === GENERATED_ID
      ? crypto.randomUUID()
      : null;
    const values = bind(plan.insert.order, plan.lists, params, id);
    await run(plan.insert.text, values);
    return run(plan.select, [id === null ? values[plan.pkParam] : id]);
  }

  return inTransaction(conn, state, async () => {
    if (plan.kind === 'update-returning') {
      const locked = (await run(plan.lock.text, bind(plan.lock.order, plan.lists, params))).rows.map((r) => r[plan.pk]);
      if (!locked.length) return { rows: [], rowCount: 0 };
      const updateValues = bind(plan.update.order, plan.lists, params);
      await run(plan.update.text, [...updateValues, locked]);
      const result = await run(plan.select, [locked]);
      return { rows: result.rows, rowCount: locked.length };
    }
    // delete-returning
    const doomed = await run(plan.select.text, bind(plan.select.order, plan.lists, params));
    if (!doomed.rows.length) return doomed;
    const ids = (await run(plan.lock.text, bind(plan.lock.order, plan.lists, params))).rows.map((r) => r[plan.pk]);
    if (ids.length) await run(plan.delete, [ids]);
    return { rows: doomed.rows, rowCount: ids.length };
  });
}

/** A borrowed connection: the same query() as the pool, plus release(). */
class Client {
  constructor(connection) {
    this.connection = connection;
    this.state = { inTx: false };
  }

  query(sql, params = []) {
    return execute(this.connection, this.state, sql, params);
  }

  release() {
    // A client handed back mid-transaction would leak locks into the next user.
    if (this.state.inTx) this.connection.query('ROLLBACK').catch(() => {});
    this.connection.release();
  }
}

class Database {
  constructor(rawPool) {
    this.raw = rawPool;
  }

  async query(sql, params = []) {
    const plan = compile(sql);
    if (plan.kind === 'plain') {
      return retrying(async () => toResult((await this.raw.query(plan.text, bind(plan.order, plan.lists, params)))[0]));
    }
    const client = await this.connect();
    try {
      return await client.query(sql, params);
    } finally {
      client.release();
    }
  }

  async connect() {
    return new Client(await this.raw.getConnection());
  }

  end() {
    return this.raw.end();
  }
}

// ---------- start-up ----------

/** Checks the MYSQL_* settings are present. Returns the pool options. */
async function ensureDatabase() {
  const my = config.mysql;
  const missing = ['host', 'user', 'password', 'database'].filter((key) => !my[key]);
  if (missing.length) {
    throw new Error(
      `MySQL settings are missing: ${missing.map((k) => `MYSQL_${k.toUpperCase()}`).join(', ')}. See server/.env.example.`
    );
  }
  return connectionOptions();
}

/** Splits schema.sql into statements: a ";" at the end of a line ends one. */
function statementsOf(sql) {
  const lines = sql.split(/\r?\n/).filter((line) => !/^\s*--/.test(line));
  return lines.join('\n').split(/;\s*(?:\n|$)/).map((s) => s.trim()).filter(Boolean);
}

/**
 * Columns added after the first release. Each is checked against
 * information_schema before it runs, so applying the schema stays idempotent
 * on every start (MySQL has no ADD COLUMN IF NOT EXISTS). Add new entries at
 * the end; never reorder or edit shipped ones.
 */
const MIGRATIONS = [];

async function runMigrations(connection) {
  for (const m of MIGRATIONS) {
    const [rows] = await connection.query(
      'SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?',
      [m.table, m.column]
    );
    if (!rows.length) {
      await connection.query(`ALTER TABLE \`${m.table}\` ADD COLUMN \`${m.column}\` ${m.definition}`);
      console.log(`[db] added ${m.table}.${m.column}`);
    }
  }
}

/** MariaDB 10.4+ or MySQL 8.0.13+ (the schema uses expression defaults). */
function serverVersionOk(version) {
  const [major, minor, patch] = String(version).split(/[.-]/).map((n) => parseInt(n, 10) || 0);
  if (/mariadb/i.test(version)) return major > 10 || (major === 10 && minor >= 4);
  return major > 8 || (major === 8 && (minor > 0 || patch >= 13));
}

/** Creates the tables (idempotent) and seeds the vehicle catalogue. */
async function applySchema(options) {
  const connection = await mysql.createConnection({ ...options, connectionLimit: undefined, waitForConnections: undefined });
  try {
    const [[{ version }]] = await connection.query('SELECT VERSION() AS version');
    if (!serverVersionOk(version)) {
      throw new Error(`Database server ${version} is too old: need MariaDB 10.4+ or MySQL 8.0.13+.`);
    }
    for (const statement of statementsOf(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'))) {
      await connection.query(statement);
    }
    await runMigrations(connection);
    console.log(`[db] schema applied (${version}).`);
  } finally {
    await connection.end();
  }
}

/** A new, separate pool (the API itself uses the shared one from initPool). */
function openPool(options) {
  const raw = mysql.createPool(options);
  raw.pool.on('connection', setUpSession);
  return new Database(raw);
}

/** Creates (once) the shared connection pool used by the API routes. */
function initPool(options) {
  if (!pool) pool = openPool(options);
  return pool;
}

/** Returns the shared pool. Throws if `initPool` has not run yet. */
function getPool() {
  if (!pool) throw new Error('Database pool not initialised — call initPool() first.');
  return pool;
}

/** True for "this row already exists" (a unique key was violated). */
function isUniqueViolation(err) {
  return Boolean(err) && (err.code === 'ER_DUP_ENTRY' || err.errno === 1062);
}

module.exports = {
  ensureDatabase, applySchema, initPool, openPool, getPool, connectionOptions, isUniqueViolation, statementsOf, serverVersionOk,
  prepareValue, retrying,
};

// Support `node src/db.js --init-only` to just (re)create the schema.
if (require.main === module && process.argv.includes('--init-only')) {
  (async () => {
    const { ensureEmbeddedReady } = require('./config');
    ensureEmbeddedReady();
    await applySchema(await ensureDatabase());
    console.log('[db] init complete.');
    process.exit(0);
  })().catch((err) => {
    console.error('[db] init failed:', err);
    process.exit(1);
  });
}
