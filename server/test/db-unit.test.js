// Unit tests for the database layer's helpers (no database needed).
//   Run: node --test test/db-unit.test.js
process.env.MYSQL_HOST = process.env.MYSQL_HOST || 'db.example.com';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'unit-test-secret';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { statementsOf, serverVersionOk, prepareValue, retrying, isUniqueViolation } = require('../src/db');

const schema = fs.readFileSync(path.join(__dirname, '..', 'src', 'schema.sql'), 'utf8');

test('the schema splits into whole statements', () => {
  const statements = statementsOf(schema);
  assert.ok(statements.length > 35, `only ${statements.length} statements`);
  for (const s of statements) {
    assert.match(s, /^(CREATE TABLE IF NOT EXISTS|INSERT INTO|UPDATE)\b/, s.slice(0, 60));
    assert.ok(!s.includes(';'), `stray ";" inside: ${s.slice(0, 60)}`);
  }
});

test('every table is created once, with an engine, a charset and a key', () => {
  const creates = statementsOf(schema).filter((s) => s.startsWith('CREATE TABLE'));
  const names = creates.map((s) => /EXISTS (\w+)/.exec(s)[1]);
  assert.equal(new Set(names).size, names.length, 'a table is defined twice');
  for (const s of creates) {
    assert.match(s, /ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci$/, s.slice(0, 60));
    assert.match(s, /PRIMARY KEY/, s.slice(0, 60));
  }
});

test('every foreign key points at a table defined earlier in the file', () => {
  const defined = new Set();
  for (const s of statementsOf(schema).filter((x) => x.startsWith('CREATE TABLE'))) {
    const name = /EXISTS (\w+)/.exec(s)[1];
    for (const m of s.matchAll(/REFERENCES (\w+) \(/g)) {
      assert.ok(m[1] === name || defined.has(m[1]), `${name} references ${m[1]} before it exists`);
    }
    defined.add(name);
  }
});

test('the server version gate: MariaDB 10.4+ or MySQL 8.0.13+', () => {
  const cases = {
    '10.11.9-MariaDB': true, '10.4.0-MariaDB': true, '11.4.2-MariaDB': true, '10.3.39-MariaDB': false,
    '8.0.13': true, '8.4.1': true, '9.0.0': true, '8.0.12': false, '5.7.44': false,
  };
  for (const [version, ok] of Object.entries(cases)) assert.equal(serverVersionOk(version), ok, version);
});

test('parameters are prepared the way MySQL needs them', () => {
  assert.equal(prepareValue(undefined), null);
  assert.equal(prepareValue(null), null);
  assert.equal(prepareValue(5), 5);
  assert.equal(prepareValue('plain text'), 'plain text');
  assert.equal(prepareValue('2026-10-30 09:00:00'), '2026-10-30 09:00:00');
  const buf = Buffer.from('abc');
  assert.equal(prepareValue(buf), buf);
  assert.equal(prepareValue({ a: 1, b: [2] }), '{"a":1,"b":[2]}');
  assert.equal(prepareValue([1, 2]), '[1,2]');
  const iso = prepareValue('2026-10-31T09:44:29.768Z');
  assert.ok(iso instanceof Date && iso.toISOString() === '2026-10-31T09:44:29.768Z');
  assert.ok(prepareValue('2026-10-31T11:44:29+02:00') instanceof Date);
  const now = new Date();
  assert.equal(prepareValue(now), now);
});

test('deadlocks and lock timeouts are retried, nothing else is', async () => {
  let calls = 0;
  const flaky = async () => { calls += 1; if (calls < 3) { const e = new Error('deadlock'); e.errno = 1213; throw e; } return 'ok'; };
  assert.equal(await retrying(flaky), 'ok');
  assert.equal(calls, 3);

  let tries = 0;
  await assert.rejects(retrying(async () => { tries += 1; const e = new Error('deadlock'); e.errno = 1213; throw e; }), /deadlock/);
  assert.equal(tries, 3, 'gives up after three attempts');

  let other = 0;
  await assert.rejects(retrying(async () => { other += 1; const e = new Error('syntax'); e.errno = 1064; throw e; }), /syntax/);
  assert.equal(other, 1, 'a syntax error is not retried');
});

test('unique-key violations are recognised', () => {
  assert.equal(isUniqueViolation({ code: 'ER_DUP_ENTRY' }), true);
  assert.equal(isUniqueViolation({ errno: 1062 }), true);
  assert.equal(isUniqueViolation({ code: 'ER_PARSE_ERROR', errno: 1064 }), false);
  assert.equal(isUniqueViolation(null), false);
});

// A production server whose database is on localhost (cPanel) must not get the
// developer conveniences; only an explicit LOCAL_DEVELOPMENT=1 does.
test('development switches need LOCAL_DEVELOPMENT=1, not just a local database host', () => {
  const { spawnSync } = require('node:child_process');
  const probe = (env) => {
    const r = spawnSync(process.execPath, ['-e',
      "const { config } = require('./src/config'); console.log(JSON.stringify({ local: config.localDatabase, reveal: config.devRevealCodes }));"],
    { cwd: path.join(__dirname, '..'), encoding: 'utf8', env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot || '', JWT_SECRET: 'x', DEV_REVEAL_CODES: '1', ...env } });
    return JSON.parse(r.stdout.trim().split('\n').pop());
  };
  assert.deepEqual(probe({ MYSQL_HOST: 'localhost' }), { local: false, reveal: false }, 'production server on localhost');
  assert.deepEqual(probe({ MYSQL_HOST: '127.0.0.1', NODE_ENV: 'production' }), { local: false, reveal: false });
  assert.deepEqual(probe({ MYSQL_HOST: 'db.example.com', LOCAL_DEVELOPMENT: '1' }), { local: false, reveal: false }, 'a remote database is never local');
  assert.deepEqual(probe({ MYSQL_HOST: 'localhost', LOCAL_DEVELOPMENT: '1' }), { local: true, reveal: true }, 'a developer machine');
});
