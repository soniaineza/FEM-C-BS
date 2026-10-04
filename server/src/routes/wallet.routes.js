const express = require('express');
const crypto = require('crypto');

const { getPool } = require('../db');
const { asyncHandler, ApiError } = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const { config } = require('../config');
const paypack = require('../services/paypackClient');
const { creditTopup, failTopup, initiateTopup } = require('../services/walletTopups');

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
    if (!Number.isSafeInteger(value) || value <= 0) throw new ApiError(400, 'Enter a positive whole RWF amount.');

    const reference = `TOPUP-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
    const { rows } = await getPool().query(
      `INSERT INTO wallet_topups (passenger_id, amount, phone, status, state, reference, provider)
       VALUES ($1,$2,$3,'pending','pending',$4,'paypack') RETURNING *`,
      [req.passengerId, value, String(phone).trim(), reference]
    );
    let topup = rows[0];

    if (config.demoPayments) {
      // Demo mode: credit the wallet immediately instead of going through
      // Paypack, so top-ups are testable without real mobile-money creds.
      topup = await creditTopup(topup.id, { reason: 'demo_acceptance' });
      return res.status(201).json({ topup: topupToJson(topup) });
    }

    if (!paypack.isConfigured()) {
      const updated = await getPool().query(
        `UPDATE wallet_topups SET metadata = $2::jsonb, updated_at = now() WHERE id = $1 RETURNING *`,
        [topup.id, JSON.stringify({ reason: 'provider_not_configured' })]
      );
      topup = updated.rows[0];
      return res.status(201).json({ topup: topupToJson(topup) });
    }

    topup = await initiateTopup(topup);
    if (topup.status === 'failed') {
      throw new ApiError(502, 'We could not start the mobile-money payment. Check the number and try again.');
    }
    res.status(201).json({ topup: topupToJson(topup) });
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
    if (topup.status === 'pending' && !topup.external_reference) {
      const latest = await initiateTopup(topup);
      return res.json({ topup: topupToJson(latest) });
    }
    if (topup.status === 'succeeded' || !topup.external_reference || !paypack.isConfigured()) {
      return res.json({ topup: topupToJson(topup) });
    }

    const charge = await paypack.readCharge(topup.external_reference);
    paypack.assertChargeMatches(charge, topup);
    const chargeStatus = String(charge.status || '').toLowerCase();

    let latest = topup;
    if (chargeStatus === 'successful') {
      latest = await creditTopup(topup.id, { providerStatus: chargeStatus });
    } else if (chargeStatus === 'failed') {
      latest = await failTopup(topup.id, { providerStatus: chargeStatus });
    }
    res.json({ topup: topupToJson(latest) });
  })
);

module.exports = router;
