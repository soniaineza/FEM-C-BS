#!/usr/bin/env node
// Checks that the MYSQL_* settings give the API a database it can use, and
// says what to fix when they do not. Nothing permanent is written: the write
// test uses a TEMPORARY table.
//
//   cd server && npm run db:check
//
// Run it from the machine that will run the API (Render's shell), or from
// your own machine once its address is allowed under cPanel > Remote Database
// Access, to prove the connection before the first deploy.
const net = require('net');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const mysql = require('mysql2/promise');
const { config } = require('../src/config');
const { connectionOptions, serverVersionOk } = require('../src/db');

const results = [];
function report(ok, name, detail = '', fix = '') {
  results.push(ok);
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${detail ? ` - ${detail}` : ''}`);
  if (!ok && fix) console.log(`        -> ${fix}`);
}

function tcpReachable(host, port, timeoutMs = 10000) {
  return new Promise((resolve) => {
    const started = Date.now();
    const socket = net.connect({ host, port, timeout: timeoutMs });
    socket.once('connect', () => { socket.destroy(); resolve({ ok: true, ms: Date.now() - started }); });
    socket.once('timeout', () => { socket.destroy(); resolve({ ok: false, reason: 'timed out (blocked by a firewall?)' }); });
    socket.once('error', (err) => resolve({ ok: false, reason: err.code || err.message }));
  });
}

async function main() {
  const my = config.mysql;
  const missing = ['host', 'database', 'user', 'password'].filter((k) => !my[k]);
  if (missing.length) {
    console.error(`Missing settings: ${missing.map((k) => `MYSQL_${k.toUpperCase()}`).join(', ')}`);
    process.exit(2);
  }
  console.log(`Checking ${my.user}@${my.host}:${my.port}/${my.database}\n`);

  const tcp = await tcpReachable(my.host, my.port);
  report(tcp.ok, 'server reachable on the network', tcp.ok ? `${tcp.ms} ms` : tcp.reason,
    'allow this machine under cPanel > Remote Database Access (Render: its outbound IPs), and check the host/port');
  if (!tcp.ok) return;

  let connection;
  try {
    connection = await mysql.createConnection(connectionOptions());
    report(true, 'signed in', `TLS ${connectionOptions().ssl ? 'on' : 'off'}`);
  } catch (err) {
    const fix = /ssl|secure/i.test(err.message)
      ? 'the server does not accept TLS: set MYSQL_SSL=off (only if the network is trusted)'
      : /access denied/i.test(err.message)
        ? 'check MYSQL_USER / MYSQL_PASSWORD (cPanel prefixes both with the account name) and that the user is added to the database with ALL PRIVILEGES, and that this address is allowed for it'
        : /unknown database/i.test(err.message)
          ? 'check MYSQL_DATABASE exactly as shown in cPanel > MySQL Databases'
          : '';
    report(false, 'sign in', err.message, fix);
    return;
  }

  try {
    const [[{ version }]] = await connection.query('SELECT VERSION() AS version');
    report(serverVersionOk(version), 'server version', version, 'the API needs MariaDB 10.4+ or MySQL 8.0.13+');

    const [[cipher]] = await connection.query("SHOW SESSION STATUS LIKE 'Ssl_cipher'");
    if (connectionOptions().ssl) report(Boolean(cipher && cipher.Value), 'connection is encrypted', cipher && cipher.Value);

    const [[vars]] = await connection.query(
      'SELECT @@max_allowed_packet AS packet, @@max_connections AS maxc, @@wait_timeout AS waitt, @@character_set_database AS cs, @@collation_database AS co'
    );
    report(vars.packet >= 4 * 1024 * 1024, 'max_allowed_packet', `${Math.round(vars.packet / 1048576)} MB`,
      'low; fine while documents live on the document store, but ask the host to raise it if you store files in the database');
    report(true, 'connection limits', `server max ${vars.maxc}, API pool ${my.poolSize}${vars.waitt < 60 ? `, idle timeout only ${vars.waitt}s` : ''}`);
    report(/utf8mb4/.test(vars.cs), 'database character set', `${vars.cs} / ${vars.co}`, 'create the database with utf8mb4 (emoji and non-Latin names need it)');

    try {
      const [[limit]] = await connection.query('SELECT @@max_user_connections AS n');
      if (limit.n > 0) report(limit.n >= my.poolSize, 'per-user connection cap', `${limit.n}`, `set MYSQL_POOL_SIZE to at most ${Math.max(1, limit.n - 2)}`);
    } catch (_) { /* variable not available */ }

    try {
      await connection.query('SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED');
      report(true, 'READ COMMITTED isolation available');
    } catch (err) {
      report(false, 'READ COMMITTED isolation', err.message, 'the host forbids it (binary logging); the API still works but locks more');
    }

    // The schema's features: expression defaults, JSON, foreign keys, a write.
    try {
      await connection.query(`CREATE TEMPORARY TABLE kimu_check_tmp (
        id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
        meta JSON NULL DEFAULT ('{}'),
        at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
      ) ENGINE=InnoDB`);
      await connection.query('INSERT INTO kimu_check_tmp () VALUES ()');
      const [rows] = await connection.query('SELECT id, meta FROM kimu_check_tmp');
      report(rows.length === 1 && String(rows[0].id).length === 36, 'create, default expressions, JSON, insert, select');
    } catch (err) {
      report(false, 'create/insert/select test', err.message, 'the database user needs CREATE, INSERT, SELECT, UPDATE, DELETE, ALTER, INDEX, REFERENCES and CREATE TEMPORARY TABLES');
    }

    const started = Date.now();
    for (let i = 0; i < 5; i += 1) await connection.query('SELECT 1');
    const avg = (Date.now() - started) / 5;
    report(avg < 150, 'round-trip time', `${avg.toFixed(0)} ms per query`,
      'slow: every API call makes several queries, so a far-away database will feel sluggish; pick the server nearest Render');

    const [[tables]] = await connection.query('SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = DATABASE()');
    console.log(`\n  This database has ${tables.n} table(s)${tables.n ? '' : ' (empty: the API creates them on first start)'}.`);
  } finally {
    await connection.end();
  }
}

main()
  .then(() => {
    const failed = results.filter((ok) => !ok).length;
    console.log(failed ? `\n${failed} problem(s) to fix.` : '\nAll checks passed.');
    process.exit(failed ? 1 : 0);
  })
  .catch((err) => { console.error('db-check crashed:', err.message); process.exit(1); });
