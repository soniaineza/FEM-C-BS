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

/** Retrying an uncertain request reuses its durable provider key. */
async function initiateTopup(topup) {
  if (!paypack.isConfigured()) return topup;
  const claimed = await getPool().query(`UPDATE wallet_topups SET state='initiating',updated_at=now()
    WHERE id=$1 AND status='pending' AND external_reference IS NULL
    AND (state='pending' OR updated_at < now() - interval '60 seconds') RETURNING *`, [topup.id]);
  if (!claimed.rows[0]) return topup;
  try {
    const charge = await paypack.createCharge({ amount: Number(topup.amount), phone: topup.phone, idempotencyKey: topup.reference });
    return (await getPool().query(`UPDATE wallet_topups SET state='processing', external_reference=$2, updated_at=now()
      WHERE id=$1 AND status='pending' RETURNING *`, [topup.id, String(charge.ref)])).rows[0] || topup;
  } catch (error) {
    console.error('[wallet] Paypack cashin failed:', error.message);
    // Refused outright (e.g. not a mobile-money number): nothing was charged.
    if (paypack.isRejectedRequest(error)) return failTopup(topup.id, { reason: 'provider_rejected' });
    await getPool().query("UPDATE wallet_topups SET metadata=COALESCE(metadata,'{}'::jsonb) || $2::jsonb WHERE id=$1 AND status='pending'", [topup.id, JSON.stringify({reason:'provider_outcome_uncertain'})]);
    return (await getPool().query('SELECT * FROM wallet_topups WHERE id=$1',[topup.id])).rows[0];
  }
}

async function reconcilePendingTopups() {
  if (!paypack.isConfigured()) return;
  const { rows } = await getPool().query(
    `SELECT * FROM wallet_topups WHERE status='pending'
       AND updated_at < now() - interval '60 seconds'
       ORDER BY created_at LIMIT 30`
  );
  for (const topup of rows) {
    try {
      if (!topup.external_reference) { await initiateTopup(topup); continue; }
      const charge = await paypack.readCharge(topup.external_reference);
      paypack.assertChargeMatches(charge, topup);
      const status = String(charge.status || '').toLowerCase();
      if (status === 'successful') await creditTopup(topup.id, { providerStatus: status });
      if (status === 'failed') await failTopup(topup.id, { providerStatus: status });
    } catch (err) { console.error('[wallet] reconciliation failed', topup.id, err); }
  }
}

module.exports = { creditTopup, failTopup, reconcilePendingTopups, initiateTopup };
