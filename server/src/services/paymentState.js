// The states a payment attempt (a ride payment or a wallet top-up) can be
// in, and the only moves allowed between them. Every status change goes
// through transition(), which applies the move in a single guarded UPDATE —
// so two racing callers (webhook, poll, scheduler) can never both win, and a
// closed attempt can never be reopened.
//
//   pending ──► succeeded           money received and applied
//   pending ──► failed              provider/wallet said no
//   pending ──► expired             nobody answered the prompt in time
//   failed | expired ──► refund_pending   the provider took the money AFTER
//                                   we gave up on the attempt: it is never
//                                   applied, it is owed back to the rider
//   pending | succeeded ──► refund_pending   money received that cannot be
//                                   applied (fare paid another way, wrong amount)
//   refund_pending ──► refunded     an operator sent it back
const TRANSITIONS = {
  pending: ['succeeded', 'failed', 'expired', 'refund_pending'],
  failed: ['refund_pending'],
  expired: ['refund_pending'],
  succeeded: ['refund_pending'],
  refund_pending: ['refunded'],
  refunded: [],
};

const TABLES = new Set(['payments', 'wallet_topups']);

// An attempt that is over without the fare/top-up being paid by it.
const UNPAID_FINAL = new Set(['failed', 'expired', 'refund_pending', 'refunded']);

function canTransition(from, to) {
  return (TRANSITIONS[from] || []).includes(to);
}

function isUnpaidFinal(status) {
  return UNPAID_FINAL.has(status);
}

/**
 * Moves one attempt to [to], only from a state that allows it. Returns the
 * updated row, or null when the attempt was not in such a state (someone
 * else already moved it) — callers treat null as "nothing to do".
 */
async function transition(db, table, id, to, { failureReason = null, metadata = null } = {}) {
  if (!TABLES.has(table)) throw new Error(`paymentState: unknown table ${table}`);
  const from = Object.keys(TRANSITIONS).filter((s) => canTransition(s, to));
  const { rows } = await db.query(
    `UPDATE ${table} SET status = $2, state = $2, updated_at = now(),
       failure_reason = COALESCE($3, failure_reason),
       metadata = COALESCE(metadata, '{}'::jsonb) || $4::jsonb
      WHERE id = $1 AND status = ANY($5) RETURNING *`,
    [id, to, failureReason, JSON.stringify(metadata || {}), from]
  );
  return rows[0] || null;
}

module.exports = { transition, canTransition, isUnpaidFinal, TRANSITIONS };
