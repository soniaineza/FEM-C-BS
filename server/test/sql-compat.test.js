// Unit tests for the PostgreSQL -> MySQL translator (src/sqlCompat.js).
// They use query shapes taken from the API's own routes and services.
//   Run: node --test test/sql-compat.test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');

const { compile, GENERATED_ID } = require('../src/sqlCompat');

const squash = (s) => s.replace(/\s+/g, ' ').trim();

test('placeholders become ? and keep the caller order, including repeats', () => {
  const plan = compile('UPDATE wallets SET balance = balance + $2 WHERE passenger_id = $1 AND $2 > 0');
  assert.equal(plan.kind, 'plain');
  assert.equal(squash(plan.text), 'UPDATE wallets SET balance = balance + ? WHERE passenger_id = ? AND ? > 0');
  assert.deepEqual(plan.order, [1, 0, 1]);
});

test('placeholders and keywords inside string literals are left alone', () => {
  const plan = compile("SELECT '$1 now() ILIKE' AS s, now() FROM t WHERE x = $1");
  assert.equal(squash(plan.text), "SELECT '$1 now() ILIKE' AS s, NOW(3) FROM t WHERE x = ?");
  assert.deepEqual(plan.order, [0]);
});

test('intervals, in both the literal and the concatenated parameter form', () => {
  assert.equal(squash(compile("SELECT 1 WHERE created_at < now() - interval '30 seconds'").text),
    'SELECT 1 WHERE created_at < NOW(3) - INTERVAL 30 SECOND');
  assert.equal(squash(compile("SELECT 1 WHERE created_at < now() - interval '2 minutes'").text),
    'SELECT 1 WHERE created_at < NOW(3) - INTERVAL 2 MINUTE');
  const p = compile("SELECT 1 WHERE recorded_at > now() - ($2 || ' seconds')::interval AND id = $1");
  assert.equal(squash(p.text), 'SELECT 1 WHERE recorded_at > NOW(3) - INTERVAL ? SECOND AND id = ?');
  assert.deepEqual(p.order, [1, 0]);
});

test("= ANY($n) becomes IN (?) and the parameter is marked as a list", () => {
  const plan = compile('SELECT 1 FROM rides WHERE driver_id = $1 AND status = ANY($2)');
  assert.equal(squash(plan.text), 'SELECT 1 FROM rides WHERE driver_id = ? AND status IN (?)');
  assert.deepEqual([...plan.lists], [1]);
});

test('casts, ILIKE, regex and uuid generation', () => {
  const plan = compile("SELECT count(*)::int AS n, AVG(rating)::double precision AS a FROM t WHERE name ILIKE '%x%' AND code ~ '^DL-1[0-9]{3}$' AND id = $1::uuid");
  assert.equal(squash(plan.text),
    "SELECT count(*) AS n, AVG(rating) AS a FROM t WHERE name LIKE '%x%' AND code REGEXP '^DL-1[0-9]{3}$' AND id = ?");
  assert.equal(squash(compile('SELECT gen_random_uuid()').text), 'SELECT UUID()');
});

test("COALESCE(x, 'epoch') compares as a real date", () => {
  assert.equal(squash(compile("SELECT COALESCE(last_online_at, 'epoch') < now()").text),
    "SELECT COALESCE(last_online_at, '1970-01-01 00:00:00') < NOW(3)");
});

test('ON CONFLICT DO NOTHING / DO UPDATE', () => {
  assert.equal(squash(compile('INSERT INTO wallets (passenger_id) VALUES ($1) ON CONFLICT (passenger_id) DO NOTHING').text),
    'INSERT INTO wallets (passenger_id) VALUES (?) ON DUPLICATE KEY UPDATE passenger_id = passenger_id');
  const up = compile(`INSERT INTO driver_device_tokens (driver_id, token, platform) VALUES ($1, $2, $3)
     ON CONFLICT (token) DO UPDATE SET driver_id = EXCLUDED.driver_id, platform = EXCLUDED.platform`);
  assert.equal(squash(up.text),
    'INSERT INTO driver_device_tokens (driver_id, token, platform) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE driver_id = VALUES(driver_id), platform = VALUES(platform)');
  const add = compile(`INSERT INTO wallets (passenger_id, balance) VALUES ($1, $2)
     ON CONFLICT (passenger_id) DO UPDATE SET balance = wallets.balance + $2, updated_at = now()`);
  assert.equal(squash(add.text),
    'INSERT INTO wallets (passenger_id, balance) VALUES (?, ?) ON DUPLICATE KEY UPDATE balance = wallets.balance + ?, updated_at = NOW(3)');
  assert.deepEqual(add.order, [0, 1, 1]);
});

test('INSERT .. RETURNING gets a generated id and a follow-up SELECT', () => {
  const plan = compile(`INSERT INTO verification_codes (passenger_id, code_hash, purpose, expires_at)
     VALUES ($1, $2, $3, $4) RETURNING id`);
  assert.equal(plan.kind, 'insert-returning');
  assert.equal(squash(plan.insert.text),
    'INSERT INTO verification_codes (id, passenger_id, code_hash, purpose, expires_at) VALUES (?, ?, ?, ?, ?)');
  assert.deepEqual(plan.insert.order, [GENERATED_ID, 0, 1, 2, 3]);
  assert.equal(plan.pkParam, 0);
  assert.equal(plan.select, 'SELECT id FROM verification_codes WHERE id = ?');
});

test('INSERT .. RETURNING * keeps expressions like now() in the VALUES list', () => {
  const plan = compile(`INSERT INTO payments (ride_id, amount, created_at) VALUES ($1, $2, now()) RETURNING *`);
  assert.equal(squash(plan.insert.text), 'INSERT INTO payments (id, ride_id, amount, created_at) VALUES (?, ?, ?, NOW(3))');
  assert.equal(plan.select, 'SELECT * FROM payments WHERE id = ?');
});

test('INSERT .. RETURNING with an explicit id uses that parameter', () => {
  const plan = compile(`INSERT INTO driver_documents (id, driver_id, doc_type) VALUES ($1, $2, $3) RETURNING *`);
  assert.equal(squash(plan.insert.text), 'INSERT INTO driver_documents (id, driver_id, doc_type) VALUES (?, ?, ?)');
  assert.equal(plan.pkParam, 0);
  assert.deepEqual(plan.insert.order, [0, 1, 2]);
});

test('UPDATE .. RETURNING locks the matching rows, updates them by key, then reads them back', () => {
  const plan = compile(`UPDATE emergency_events SET status='resolved', resolved_at=now()
       WHERE id=$1 AND status != 'resolved' RETURNING *`);
  assert.equal(plan.kind, 'update-returning');
  assert.equal(squash(plan.lock.text), "SELECT id FROM emergency_events WHERE id=? AND status != 'resolved' FOR UPDATE");
  assert.deepEqual(plan.lock.order, [0]);
  assert.equal(squash(plan.update.text), "UPDATE emergency_events SET status='resolved', resolved_at=NOW(3) WHERE id IN (?)");
  assert.deepEqual(plan.update.order, []);
  assert.equal(plan.select, 'SELECT * FROM emergency_events WHERE id IN (?)');
});

test('UPDATE .. RETURNING splits parameters between SET and WHERE', () => {
  const plan = compile(`UPDATE payment_exceptions SET status='resolved', resolution=$2,
       resolution_reference=$3, resolved_at=now()
      WHERE id=$1 AND status='open' RETURNING *`);
  assert.deepEqual(plan.update.order, [1, 2]);
  assert.deepEqual(plan.lock.order, [0]);
});

test('UPDATE .. RETURNING ignores WHERE inside a sub-select in SET', () => {
  const plan = compile(`UPDATE t SET n = (SELECT count(*) FROM u WHERE u.k = $2) WHERE id = $1 RETURNING id`);
  assert.deepEqual(plan.update.order, [1]);
  assert.equal(squash(plan.lock.text), 'SELECT id FROM t WHERE id = ? FOR UPDATE');
});

test('a table whose key is not "id" uses its own key', () => {
  const plan = compile(`UPDATE wallets SET balance = balance - $2 WHERE passenger_id = $1 AND balance >= $2 RETURNING balance`);
  assert.equal(squash(plan.lock.text), 'SELECT passenger_id FROM wallets WHERE passenger_id = ? AND balance >= ? FOR UPDATE');
  assert.equal(squash(plan.update.text), 'UPDATE wallets SET balance = balance - ? WHERE passenger_id IN (?)');
  assert.equal(plan.select, 'SELECT balance FROM wallets WHERE passenger_id IN (?)');
});

test('DELETE .. RETURNING reads the rows first, then deletes them by key', () => {
  const plan = compile('DELETE FROM device_tokens WHERE token = $1 RETURNING id');
  assert.equal(plan.kind, 'delete-returning');
  assert.equal(squash(plan.select.text), 'SELECT id FROM device_tokens WHERE token = ? FOR UPDATE');
  assert.equal(plan.delete, 'DELETE FROM device_tokens WHERE id IN (?)');
});

test('shapes that cannot be emulated fail loudly', () => {
  assert.throws(() => compile('INSERT INTO t (a) VALUES ($1) ON CONFLICT (a) DO UPDATE SET a = EXCLUDED.a RETURNING id'), /by hand/);
  assert.throws(() => compile('UPDATE t SET a = $1 RETURNING id'), /WHERE/);
  assert.throws(() => compile('UPDATE t SET a = $1 WHERE b = $2 ORDER BY c LIMIT 1 RETURNING id'), /by hand/);
  assert.throws(() => compile('INSERT INTO t (a) VALUES ($1), ($2) RETURNING id'), /multi-row/);
});

test('comments are dropped and compile results are cached', () => {
  const sql = 'SELECT 1 -- note with $1 and now()\n FROM t /* $2 */ WHERE a = $1';
  const plan = compile(sql);
  assert.equal(squash(plan.text), 'SELECT 1 FROM t WHERE a = ?');
  assert.equal(compile(sql), plan);
});
