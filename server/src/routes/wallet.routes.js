const express = require('express');
const crypto = require('crypto');

const { getPool } = require('../db');
const { asyncHandler, ApiError } = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const paypack = require('../services/paypackClient');

const router = express.Router();
router.use(requireAuth);

function topupToJson(row) {
  return {
    id: row.id,
    amount: Number(row.amount),
    phone: row.phone,
    status: row.status,
    state: row.state || row.status,
    provider: row.provider || null,
    reference: row.reference,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// GET /api/wallet — balance and transaction history.
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { rows } = await getPool().query(
      `INSERT INTO wallets (passenger_id) VALUES ($1)
       ON CONFLICT (passenger_id) DO NOTHING`,
      [req.passengerId]
    );
    const balance = await getPool().query('SELECT balance FROM wallets WHERE passenger_id = $1', [
      req.passengerId,
    ]);
    const txns = await getPool().query(
      `SELECT id, amount, type, source, reference, created_at
         FROM wallet_transactions WHERE passenger_id = $1 ORDER BY created_at DESC`,
      [req.passengerId]
    );
    res.json({
      wallet: {
        balance: Number(balance.rows[0]?.balance ?? 0),
        transactions: txns.rows.map((t) => ({
          id: t.id,
          amount: Number(t.amount),
          type: t.type,
          source: t.source,
          reference: t.reference,
          createdAt: t.created_at,
        })),
      },
    });
  })
);

// POST /api/wallet/topup — deposit money into the wallet via mobile money.
// Goes through the same real Paypack collect flow as a ride payment
// (server/src/services/payments.js's chargePayment) — never fakes a
// successful deposit when the provider isn't configured.
router.post(
  '/topup',
  asyncHandler(async (req, res) => {
    const { phone, amount } = req.body || {};
    const value = Number(amount);
    if (!phone) throw new ApiError(400, 'A phone number is required.');
    if (!Number.isFinite(value) || value <= 0) throw new ApiError(400, 'Enter a valid amount.');

    const reference = `TOPUP-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
    const { rows } = await getPool().query(
      `INSERT INTO wallet_topups (passenger_id, amount, phone, status, state, reference, provider)
       VALUES ($1,$2,$3,'pending','pending',$4,'paypack') RETURNING *`,
      [req.passengerId, value, String(phone).trim(), reference]
    );
    let topup = rows[0];

    if (!paypack.isConfigured()) {
      const updated = await getPool().query(
        `UPDATE wallet_topups SET metadata = $2::jsonb, updated_at = now() WHERE id = $1 RETURNING *`,
        [topup.id, JSON.stringify({ reason: 'provider_not_configured' })]
      );
      topup = updated.rows[0];
      return res.status(201).json({ topup: topupToJson(topup) });
    }

    const charge = await paypack.createCharge({
      amount: value,
      phone: String(phone).trim(),
      description: `FEM C@BS wallet top-up ${reference}`,
    });
    const updated = await getPool().query(
      `UPDATE wallet_topups SET state='processing', external_reference=$2, updated_at=now() WHERE id = $1 RETURNING *`,
      [topup.id, String(charge.id || charge.reference || '')]
    );
    res.status(201).json({ topup: topupToJson(updated.rows[0]) });
  })
);

// GET /api/wallet/topups — deposit history.
router.get(
  '/topups',
  asyncHandler(async (req, res) => {
    const { rows } = await getPool().query(
      'SELECT * FROM wallet_topups WHERE passenger_id = $1 ORDER BY created_at DESC LIMIT 50',
      [req.passengerId]
    );
    res.json({ topups: rows.map(topupToJson) });
  })
);

// POST /api/wallet/topups/:id/refresh — pull the latest Paypack status and,
// the first time it reports success, credit the wallet exactly once.
router.post(
  '/topups/:id/refresh',
  asyncHandler(async (req, res) => {
    const { rows } = await getPool().query(
      'SELECT * FROM wallet_topups WHERE id = $1 AND passenger_id = $2',
      [req.params.id, req.passengerId]
    );
    const topup = rows[0];
    if (!topup) throw new ApiError(404, 'Top-up not found.');
    if (topup.status === 'succeeded' || !topup.external_reference || !paypack.isConfigured()) {
      return res.json({ topup: topupToJson(topup) });
    }

    const charge = await paypack.readCharge(topup.external_reference);
    const chargeStatus = String(charge.status || '').toLowerCase();

    if (chargeStatus === 'successful') {
      const client = await getPool().connect();
      try {
        await client.query('BEGIN');
        const settled = await client.query(
          `UPDATE wallet_topups SET status='succeeded', state='succeeded', updated_at=now()
             WHERE id = $1 AND status != 'succeeded' RETURNING *`,
          [topup.id]
        );
        if (settled.rows[0]) {
          await client.query(
            `INSERT INTO wallets (passenger_id, balance) VALUES ($1, $2)
             ON CONFLICT (passenger_id) DO UPDATE SET balance = wallets.balance + $2, updated_at = now()`,
            [req.passengerId, Number(topup.amount)]
          );
          await client.query(
            `INSERT INTO wallet_transactions (passenger_id, amount, type, source, reference)
             VALUES ($1, $2, 'credit', 'topup', $3)`,
            [req.passengerId, Number(topup.amount), topup.reference]
          );
        }
        await client.query('COMMIT');
        return res.json({ topup: topupToJson(settled.rows[0] || topup) });
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }

    const failed = chargeStatus === 'failed';
    const updated = await getPool().query(
      `UPDATE wallet_topups SET state = $2, status = $3, updated_at = now() WHERE id = $1 RETURNING *`,
      [topup.id, chargeStatus || topup.state, failed ? 'failed' : topup.status]
    );
    res.json({ topup: topupToJson(updated.rows[0]) });
  })
);

module.exports = router;
