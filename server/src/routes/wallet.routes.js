const express = require('express');

const { getPool } = require('../db');
const { asyncHandler, ApiError } = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

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

module.exports = router;