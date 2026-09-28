const { getPool } = require('../db');
const paypack = require('./paypackClient');

/**
 * Marks a wallet top-up succeeded and credits the passenger's wallet —
 * exactly once, however many times it is called (refresh endpoint, Paypack
 * webhook, demo mode). Returns the latest top-up row.
 */
async function creditTopup(topupId, metadata) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const settled = await client.query(
      `UPDATE wallet_topups SET status='succeeded', state='succeeded', updated_at=now(),
         metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb
        WHERE id = $1 AND status != 'succeeded' RETURNING *`,
      [topupId, JSON.stringify(metadata || {})]
    );
    const topup = settled.rows[0];
    if (topup) {
      await client.query(
        `INSERT INTO wallets (passenger_id, balance) VALUES ($1, $2)
         ON CONFLICT (passenger_id) DO UPDATE SET balance = wallets.balance + $2, updated_at = now()`,
        [topup.passenger_id, Number(topup.amount)]
      );
      await client.query(
        `INSERT INTO wallet_transactions (passenger_id, amount, type, source, reference)
         VALUES ($1, $2, 'credit', 'topup', $3)`,
        [topup.passenger_id, Number(topup.amount), topup.reference]
      );
    }
    await client.query('COMMIT');
    if (topup) return topup;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  const { rows } = await getPool().query('SELECT * FROM wallet_topups WHERE id = $1', [topupId]);
  return rows[0];
}

/** Marks a still-open top-up failed. */
async function failTopup(topupId, metadata) {
  const { rows } = await getPool().query(
    `UPDATE wallet_topups SET status='failed', state='failed', updated_at=now(),
       metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb
      WHERE id = $1 AND status != 'succeeded' RETURNING *`,
    [topupId, JSON.stringify(metadata || {})]
  );
  if (rows[0]) return rows[0];
  const cur = await getPool().query('SELECT * FROM wallet_topups WHERE id = $1', [topupId]);
  return cur.rows[0];
}

async function reconcilePendingTopups() {
  if (!paypack.isConfigured()) return;
  const { rows } = await getPool().query(
    `SELECT id, external_reference FROM wallet_topups WHERE status='pending'
       AND external_reference IS NOT NULL AND created_at < now() - interval '30 seconds'
       ORDER BY created_at LIMIT 30`
  );
  for (const topup of rows) {
    try {
      const charge = await paypack.readCharge(topup.external_reference);
      const status = String(charge.status || '').toLowerCase();
      if (status === 'successful') await creditTopup(topup.id, { providerStatus: status });
      if (status === 'failed') await failTopup(topup.id, { providerStatus: status });
    } catch (err) { console.error('[wallet] reconciliation failed', topup.id, err); }
  }
}

module.exports = { creditTopup, failTopup, reconcilePendingTopups };
