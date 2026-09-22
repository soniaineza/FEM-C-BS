const { Pool } = require('pg');
(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const doomed = await pool.query(`
    SELECT id FROM drivers
     WHERE full_name IN ('Test Driver','Feature Driver')
        OR phone NOT IN ('+250780000001','+250780000002','+250780000003')`);
  const ids = doomed.rows.map((r) => r.id);
  if (ids.length) {
    await pool.query('DELETE FROM rides WHERE driver_id = ANY($1)', [ids]);
    await pool.query('DELETE FROM driver_earnings WHERE driver_id = ANY($1)', [ids]);
    await pool.query('DELETE FROM driver_status_history WHERE driver_id = ANY($1)', [ids]);
    await pool.query('DELETE FROM driver_locations WHERE driver_id = ANY($1)', [ids]);
    await pool.query('DELETE FROM drivers WHERE id = ANY($1)', [ids]);
  }
  console.log('drivers deleted:', ids.length);
  const left = await pool.query('SELECT full_name, phone, status, verified FROM drivers ORDER BY full_name');
  left.rows.forEach((r) => console.log(r.full_name, '|', r.phone, '|', r.status, '| verified=' + r.verified));
  await pool.end();
})().catch((e) => { console.error(e.message); process.exit(1); });