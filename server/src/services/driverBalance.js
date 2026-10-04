const crypto = require('crypto');

const { getPool } = require('../db');
const { config } = require('../config');
const { ApiError } = require('../utils/asyncHandler');
const paypack = require('./paypackClient');
const { pushDriverNotification } = require('./driverNotify');

// The driver's running account with the platform.
//
//   + net fare of every ride paid digitally (the platform holds that money)
//   - commission on every cash ride (the driver holds the whole fare)
//   - payouts requested or sent
//   + commission settlements the driver has paid in
//
// A positive balance is money the platform owes the driver and can be paid
// out; a negative balance is commission the driver owes. It is always
// derived from the ledgers, never stored, so it cannot drift from them.

const OPEN_PAYOUT_STATUSES = ['pending', 'processing'];

function money(n) {
  return Math.round(Number(n) * 100) / 100;
}

async function getDriverBalance(driverId, db = getPool()) {
  const { rows } = await db.query(
    `SELECT
       (SELECT COALESCE(SUM(net_amount), 0) FROM driver_earnings
         WHERE driver_id = $1 AND status = 'settled' AND payment_method != 'cash') AS digital_net,
       (SELECT COALESCE(SUM(commission), 0) FROM driver_earnings
         WHERE driver_id = $1 AND status = 'settled' AND payment_method = 'cash') AS cash_commission,
       (SELECT COALESCE(SUM(amount), 0) FROM driver_payouts
         WHERE driver_id = $1 AND status IN ('pending', 'processing', 'completed')) AS paid_out,
       (SELECT COALESCE(SUM(amount), 0) FROM driver_settlements
         WHERE driver_id = $1 AND status = 'succeeded') AS settled`,
    [driverId]
  );
  const r = rows[0];
  const balance = money(Number(r.digital_net) - Number(r.cash_commission) - Number(r.paid_out) + Number(r.settled));
  return {
    balance,
    available: Math.max(0, balance),
    owed: Math.max(0, -balance),
    debtLimit: config.driverMaxCommissionDebt,
    minPayout: config.driverMinPayout,
    payoutFeeRate: config.payoutFeeRate,
    // The driver's share of each fare; 0 means every fare goes to the platform.
    driverShareRate: Math.max(0, 1 - config.driverCommissionRate),
    blocked: balance < -config.driverMaxCommissionDebt,
  };
}

/**
 * After a cash fare settles: a driver whose unpaid commission passed the
 * limit is taken offline once free and told how to get back online. The
 * simulated fleet is exempt (it never pays anything in).
 */
async function enforceDebtLimit(driverId) {
  if (config.demoFleet) return;
  const balance = await getDriverBalance(driverId);
  if (!balance.blocked) return;
  const { rows } = await getPool().query(
    `UPDATE drivers SET status = 'offline' WHERE id = $1 AND status = 'active' RETURNING id`,
    [driverId]
  );
  if (!rows[0]) return; // still busy with another rider, or already offline
  await pushDriverNotification(driverId, {
    title: 'Commission payment needed',
    body: `You owe RWF ${balance.owed.toLocaleString()} in commission on cash trips. Pay it to go back online.`,
    type: 'payment',
  });
}

/** The provider's cash-out fee on a payout: whole francs, rounded up. The
 * rate is applied in tenths of a percent so no float rounding creeps in. */
function payoutFee(amount) {
  const perMille = Math.round(config.payoutFeeRate * 1000);
  return Math.ceil((Math.round(Number(amount)) * perMille) / 1000);
}

/**
 * What a payout of [amount] means for this driver, checked against their
 * balance: the amount taken from the balance, the fee, and what arrives on
 * their phone. The same numbers requestPayout then records.
 */
async function quotePayout(driverId, amount, db = getPool()) {
  const value = Math.floor(Number(amount));
  if (!Number.isFinite(value) || value <= 0) throw new ApiError(400, 'Enter the amount to withdraw.');
  const { rows } = await db.query('SELECT phone FROM drivers WHERE id = $1', [driverId]);
  if (!rows[0]) throw new ApiError(404, 'Driver not found.');
  const network = paypack.networkOf(rows[0].phone);
  if (!network) {
    throw new ApiError(400, 'Payouts go to your account phone, which must be an MTN or Airtel mobile-money number. Contact support to update it.');
  }
  const balance = await getDriverBalance(driverId, db);
  if (value < balance.minPayout) {
    throw new ApiError(400, `The minimum payout is RWF ${balance.minPayout.toLocaleString()}.`);
  }
  if (value > balance.available) {
    throw new ApiError(400, `You can withdraw up to RWF ${Math.floor(balance.available).toLocaleString()}.`);
  }
  const fee = payoutFee(value);
  return { requestedAmount: value, fee, amountReceived: value - fee, phone: rows[0].phone, network };
}

function payoutToJson(r) {
  return {
    id: r.id,
    driverId: r.driver_id,
    amount: Number(r.amount),
    requestedAmount: Number(r.amount),
    fee: Number(r.fee || 0),
    amountReceived: Number(r.amount) - Number(r.fee || 0),
    method: r.method,
    status: r.status,
    phone: r.phone || null,
    reference: r.reference,
    failureReason: r.failure_reason || null,
    createdAt: r.created_at,
    processedAt: r.processed_at,
  };
}

function settlementToJson(r) {
  return {
    id: r.id,
    amount: Number(r.amount),
    method: r.method,
    status: r.status,
    reference: r.reference,
    createdAt: r.created_at,
  };
}

/** Driver asks for [amount] of their available balance to be paid out. */
async function requestPayout(driverId, amount) {
  const value = Math.floor(Number(amount));
  if (!Number.isFinite(value) || value <= 0) throw new ApiError(400, 'Enter the amount to withdraw.');

  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    // Serialise this driver's payout requests so two taps cannot both pass
    // the balance check.
    const { rows: drivers } = await client.query('SELECT phone FROM drivers WHERE id = $1 FOR UPDATE', [driverId]);
    if (!drivers[0]) throw new ApiError(404, 'Driver not found.');
    const { rows: open } = await client.query(
      'SELECT 1 FROM driver_payouts WHERE driver_id = $1 AND status = ANY($2) LIMIT 1',
      [driverId, OPEN_PAYOUT_STATUSES]
    );
    if (open[0]) throw new ApiError(409, 'You already have a payout in progress.');
    const quote = await quotePayout(driverId, value, client);
    const reference = `PO-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
    const { rows } = await client.query(
      `INSERT INTO driver_payouts (driver_id, amount, method, status, reference, phone, fee)
       VALUES ($1, $2, 'mobile_money', 'pending', $3, $4, $5) RETURNING *`,
      [driverId, quote.requestedAmount, reference, quote.phone, quote.fee]
    );
    await client.query('COMMIT');
    return rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Closes a payout that was sent to the provider (or paid by hand). */
async function finalizePayout(payoutId, success, { failureReason = null } = {}) {
  const { rows } = await getPool().query(
    `UPDATE driver_payouts SET status = $2, failure_reason = $3, processed_at = now()
      WHERE id = $1 AND status = ANY($4) RETURNING *`,
    [payoutId, success ? 'completed' : 'failed', success ? null : failureReason, OPEN_PAYOUT_STATUSES]
  );
  const payout = rows[0];
  if (!payout) return null; // already closed by a racing webhook/poll
  await pushDriverNotification(payout.driver_id, success
    ? {
        title: 'Payout sent',
        body: `RWF ${(Number(payout.amount) - Number(payout.fee || 0)).toLocaleString()} was sent to ${payout.phone || 'your mobile money'}.`,
        type: 'payment',
      }
    : {
        title: 'Payout not sent',
        body: `Your payout of RWF ${Number(payout.amount).toLocaleString()} could not be sent. The amount is back in your balance.`,
        type: 'payment',
      });
  return payout;
}

/**
 * Operator approves a pending payout. With Paypack configured the money is
 * sent by mobile-money cash-out and the payout completes when Paypack
 * confirms; otherwise the operator pays by hand and must give the transfer's
 * [reference].
 */
async function approvePayout(payoutId, { reviewer, reference } = {}) {
  if (!String(reviewer || '').trim()) throw new ApiError(400, 'reviewer is required.');
  // Claim the payout first so two operators cannot both send it.
  const { rows } = await getPool().query(
    `UPDATE driver_payouts SET status = 'processing', reviewed_by = $2
      WHERE id = $1 AND status = 'pending' RETURNING *`,
    [payoutId, String(reviewer).trim()]
  );
  const payout = rows[0];
  if (!payout) throw new ApiError(404, 'Pending payout not found.');

  const release = () =>
    getPool().query(`UPDATE driver_payouts SET status = 'pending' WHERE id = $1 AND status = 'processing'`, [payoutId]);

  if (config.demoPayments) {
    return finalizePayout(payout.id, true);
  }
  if (!paypack.isConfigured()) {
    if (!String(reference || '').trim()) {
      await release();
      throw new ApiError(400, 'Mobile-money payouts are not configured: pay the driver, then approve with the transfer reference.');
    }
    await getPool().query('UPDATE driver_payouts SET external_reference = $2 WHERE id = $1', [
      payout.id,
      String(reference).trim(),
    ]);
    return finalizePayout(payout.id, true);
  }
  // The driver receives the payout minus the provider's cash-out fee.
  const net = Number(payout.amount) - Number(payout.fee || 0);
  try {
    // A cash-out is paid from the merchant balance on the recipient's own
    // network; say so plainly rather than let the transfer fail.
    const network = paypack.networkOf(payout.phone);
    const balances = await paypack.getBalances();
    if (!network) {
      await release();
      throw new ApiError(400, 'This payout number is not an MTN or Airtel mobile-money number.');
    }
    if (balances[network] < Number(payout.amount)) {
      // The figures stay in the server log; the API answer carries none.
      console.error(`[payouts] insufficient ${network} balance for payout ${payout.id}: have ${balances[network]}, need ${payout.amount}`);
      await release();
      throw new ApiError(
        409,
        `Payouts to ${network === 'mtn' ? 'MTN' : 'Airtel'} are temporarily unavailable because there is not enough payout balance. Please try again later.`,
        'INSUFFICIENT_PROVIDER_BALANCE'
      );
    }
  } catch (err) {
    if (err instanceof ApiError) throw err;
    console.error('[payouts] Paypack balance check failed:', err.message);
    await release();
    throw new ApiError(502, 'Could not read the Paypack balance. Try again.');
  }
  try {
    const transfer = await paypack.createCashout({
      amount: net,
      phone: payout.phone,
      idempotencyKey: payout.reference,
    });
    const { rows: updated } = await getPool().query(
      'UPDATE driver_payouts SET external_reference = $2 WHERE id = $1 RETURNING *',
      [payout.id, String(transfer.ref)]
    );
    return updated[0];
  } catch (err) {
    console.error('[payouts] Paypack cashout failed:', err.message);
    await release();
    throw new ApiError(502, 'The mobile-money transfer could not be started. Try again.');
  }
}

async function rejectPayout(payoutId, { reviewer, reason } = {}) {
  if (!String(reviewer || '').trim() || !String(reason || '').trim()) {
    throw new ApiError(400, 'reviewer and reason are required.');
  }
  const { rows } = await getPool().query(
    `UPDATE driver_payouts SET reviewed_by = $2 WHERE id = $1 AND status = 'pending' RETURNING id`,
    [payoutId, String(reviewer).trim()]
  );
  if (!rows[0]) throw new ApiError(404, 'Pending payout not found.');
  return finalizePayout(payoutId, false, { failureReason: String(reason).trim() });
}

/** Credits a commission settlement exactly once. */
async function finalizeSettlement(settlementId, success) {
  const { rows } = await getPool().query(
    `UPDATE driver_settlements SET status = $2, updated_at = now()
      WHERE id = $1 AND status = 'pending' RETURNING *`,
    [settlementId, success ? 'succeeded' : 'failed']
  );
  const settlement = rows[0];
  if (!settlement) return null;
  await pushDriverNotification(settlement.driver_id, success
    ? {
        title: 'Commission paid',
        body: `We received RWF ${Number(settlement.amount).toLocaleString()}. Thank you.`,
        type: 'payment',
      }
    : {
        title: 'Commission payment failed',
        body: 'Your mobile-money payment was not completed. Please try again.',
        type: 'payment',
      });
  return settlement;
}

/** Driver pays commission they owe from their own mobile money. */
async function startSettlement(driverId, amount) {
  const balance = await getDriverBalance(driverId);
  if (balance.owed <= 0) throw new ApiError(400, 'You do not owe any commission.');
  const value = amount == null ? Math.ceil(balance.owed) : Math.floor(Number(amount));
  if (!Number.isFinite(value) || value <= 0) throw new ApiError(400, 'Enter the amount to pay.');
  if (value > Math.ceil(balance.owed)) {
    throw new ApiError(400, `You owe RWF ${Math.ceil(balance.owed).toLocaleString()}.`);
  }
  if (!config.demoPayments && !paypack.isConfigured()) {
    throw new ApiError(503, 'Mobile-money payment is not available yet. Please pay at the Kimu Transport office.');
  }

  const { rows: drivers } = await getPool().query('SELECT phone FROM drivers WHERE id = $1', [driverId]);
  const reference = `CS-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
  const { rows } = await getPool().query(
    `INSERT INTO driver_settlements (driver_id, amount, method, status, reference)
     VALUES ($1, $2, 'mobile_money', 'pending', $3) RETURNING *`,
    [driverId, value, reference]
  );
  const settlement = rows[0];

  if (config.demoPayments) {
    return (await finalizeSettlement(settlement.id, true)) || settlement;
  }
  try {
    const charge = await paypack.createCharge({
      amount: value,
      phone: drivers[0].phone,
      idempotencyKey: reference,
    });
    const { rows: updated } = await getPool().query(
      'UPDATE driver_settlements SET external_reference = $2, updated_at = now() WHERE id = $1 RETURNING *',
      [settlement.id, String(charge.ref)]
    );
    return updated[0];
  } catch (err) {
    console.error('[settlements] Paypack cashin failed:', err.message);
    await finalizeSettlement(settlement.id, false);
    throw new ApiError(502, 'We could not start the mobile-money payment. Please try again.');
  }
}

/** Operator records commission a driver paid in person or by transfer. */
async function recordOperatorSettlement(driverId, { amount, reference, recordedBy } = {}) {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) throw new ApiError(400, 'amount must be positive.');
  if (!String(reference || '').trim() || !String(recordedBy || '').trim()) {
    throw new ApiError(400, 'reference and recordedBy are required.');
  }
  const { rows } = await getPool().query(
    `INSERT INTO driver_settlements (driver_id, amount, method, status, reference, recorded_by)
     VALUES ($1, $2, 'operator', 'succeeded', $3, $4) RETURNING *`,
    [driverId, value, String(reference).trim(), String(recordedBy).trim()]
  );
  return rows[0];
}

/**
 * Applies a Paypack transaction outcome to a driver payout or commission
 * settlement. Returns false when [ref] belongs to neither.
 */
async function handleProviderTransaction(ref, success) {
  const { rows: payouts } = await getPool().query(
    'SELECT id FROM driver_payouts WHERE external_reference = $1 LIMIT 1',
    [ref]
  );
  if (payouts[0]) {
    await finalizePayout(payouts[0].id, success, { failureReason: 'provider_failed' });
    return true;
  }
  const { rows: settlements } = await getPool().query(
    'SELECT id FROM driver_settlements WHERE external_reference = $1 LIMIT 1',
    [ref]
  );
  if (settlements[0]) {
    await finalizeSettlement(settlements[0].id, success);
    return true;
  }
  return false;
}

/** Polls Paypack for payouts/settlements whose webhook never arrived. */
async function reconcileDriverMoney() {
  if (!paypack.isConfigured()) return;
  const { rows } = await getPool().query(
    `SELECT external_reference FROM driver_payouts
      WHERE status = 'processing' AND external_reference IS NOT NULL
        AND created_at < now() - interval '30 seconds'
     UNION ALL
     SELECT external_reference FROM driver_settlements
      WHERE status = 'pending' AND external_reference IS NOT NULL
        AND created_at < now() - interval '30 seconds'
     LIMIT 30`
  );
  for (const { external_reference: ref } of rows) {
    try {
      const status = String((await paypack.readCharge(ref)).status || '').toLowerCase();
      if (status === 'successful' || status === 'failed') {
        await handleProviderTransaction(ref, status === 'successful');
      }
    } catch (err) {
      console.error('[driverBalance] reconciliation failed', ref, err.message);
    }
  }
}

module.exports = {
  getDriverBalance,
  enforceDebtLimit,
  quotePayout,
  requestPayout,
  approvePayout,
  rejectPayout,
  startSettlement,
  recordOperatorSettlement,
  handleProviderTransaction,
  reconcileDriverMoney,
  payoutToJson,
  settlementToJson,
};
