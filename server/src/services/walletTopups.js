const { getPool } = require('../db');
const paypack = require('./paypackClient');
const { config } = require('../config');
const { transition } = require('./paymentState');

/**
 * Applies a provider success to a wallet top-up, exactly once however many
 * times it is called (refresh endpoint, webhook, scheduler, demo mode):
 *  - a pending top-up for the right amount is credited to the wallet
 *  - a top-up that had already expired or failed, or whose collected amount
 *    is wrong, is NOT credited: it is queued for an operator refund
 *  - anything already applied or queued is left alone
 * Returns the latest row, with justCredited set when this call credited it.
 */
async function creditTopup(topupId, metadata, { providerAmount = null } = {}) {
  const client = await getPool().connect();
  let justCredited = false;
  try {
    await client.query('BEGIN');
    const { rows } = await client.query('SELECT * FROM wallet_topups WHERE id = $1 FOR UPDATE', [topupId]);
    const current = rows[0];
    const wrongAmount = providerAmount != null && current &&
      Math.round(Number(providerAmount)) !== Math.round(Number(current.amount));
    if (current && current.status === 'pending' && !wrongAmount) {
      const topup = await transition(client, 'wallet_topups', topupId, 'succeeded', { metadata });
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
      justCredited = true;
    } else if (current && ['pending', 'failed', 'expired'].includes(current.status)) {
      const reason = wrongAmount ? 'provider_amount_mismatch' : 'provider_success_after_expiry';
      await transition(client, 'wallet_topups', topupId, 'refund_pending', {
        metadata: { ...(metadata || {}), exception: reason, providerAmount },
      });
      await client.query(
        `INSERT INTO payment_exceptions (topup_id, reason) VALUES ($1, $2)
         ON CONFLICT (topup_id) DO NOTHING`,
        [topupId, reason]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  const { rows } = await getPool().query('SELECT * FROM wallet_topups WHERE id = $1', [topupId]);
  return { ...rows[0], justCredited };
}

/** Marks a still-open top-up failed. The wallet is never touched. */
async function failTopup(topupId, metadata) {
  const failed = await transition(getPool(), 'wallet_topups', topupId, 'failed', {
    failureReason: 'PROVIDER_DECLINED',
    metadata,
  });
  if (failed) return { ...failed, justFailed: true };
  const cur = await getPool().query('SELECT * FROM wallet_topups WHERE id = $1', [topupId]);
  return { ...cur.rows[0], justFailed: false };
}

/**
 * A top-up prompt nobody answered within PAYMENT_EXPIRY_SECONDS is closed
 * as expired; the wallet is unchanged and the rider can start another.
 */
async function expireTopupIfStale(topupId) {
  const { rows } = await getPool().query(
    `SELECT 1 FROM wallet_topups WHERE id = $1 AND status = 'pending'
        AND created_at < now() - ($2 || ' seconds')::interval`,
    [topupId, String(config.paymentExpirySeconds)]
  );
  if (!rows[0]) return null;
  return transition(getPool(), 'wallet_topups', topupId, 'expired', {
    failureReason: 'PAYMENT_EXPIRED',
    metadata: { reason: 'expired' },
  });
}

/**
 * Asks the provider about one top-up and applies the answer; a prompt still
 * unanswered past the expiry is closed. Returns the top-up as it now stands.
 */
async function refreshTopup(topup) {
  if (topup.status !== 'pending' && topup.status !== 'failed' && topup.status !== 'expired') return topup;
  if (!topup.external_reference || !paypack.isConfigured()) {
    await expireTopupIfStale(topup.id);
  } else {
    const charge = await paypack.readCharge(topup.external_reference);
    const status = String(charge.status || '').toLowerCase();
    if (status === 'successful') {
      return creditTopup(topup.id, { providerStatus: status }, { providerAmount: charge.amount });
    }
    if (status === 'failed') return failTopup(topup.id, { providerStatus: status });
    await expireTopupIfStale(topup.id);
  }
  const { rows } = await getPool().query('SELECT * FROM wallet_topups WHERE id = $1', [topup.id]);
  return rows[0];
}

async function reconcilePendingTopups() {
  const { rows } = await getPool().query(
    `SELECT * FROM wallet_topups WHERE status='pending'
       AND created_at < now() - interval '30 seconds'
       ORDER BY created_at LIMIT 30`
  );
  for (const topup of rows) {
    // The provider is asked before anything expires, so an approved top-up
    // is credited rather than expired.
    try { await refreshTopup(topup); }
    catch (err) { console.error('[wallet] reconciliation failed', topup.id, err); }
  }
}

module.exports = { creditTopup, failTopup, refreshTopup, reconcilePendingTopups };
