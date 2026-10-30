const express = require('express');

const { getPool } = require('../db');
const { asyncHandler, ApiError } = require('../utils/asyncHandler');
const { promotionToJson } = require('../utils/serialize');
const { requireAuth } = require('../middleware/auth');
const { applyPromotion } = require('../services/rideService');

const router = express.Router();
router.use(requireAuth);

// GET /api/promotions — currently active promotions for the passenger.
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { rows } = await getPool().query(
      `SELECT * FROM promotions
        WHERE active = TRUE
          AND uses_count < COALESCE(max_uses, 2147483647)
          AND (starts_at IS NULL OR starts_at <= now())
          AND (ends_at IS NULL OR ends_at >= now())
        ORDER BY ends_at IS NULL, ends_at ASC`
    );
    res.json({ promotions: rows.map(promotionToJson) });
  })
);

// POST /api/promotions/validate — checks a code against a gross fare and
// reports the discount that would apply (does not consume it).
router.post(
  '/validate',
  asyncHandler(async (req, res) => {
    const { code, grossFare } = req.body || {};
    const fare = Number(grossFare);
    if (!code || !Number.isFinite(fare)) {
      throw new ApiError(400, 'A promo code and gross fare are required.');
    }
    const { discountedFare, discount, promotion } = await applyPromotion(
      req.passengerId,
      code,
      fare
    );
    // applyPromotion consumed a use — compensate, because validation must be
    // cheap to retry and never burn a promotion on a preview.
    if (promotion) {
      await getPool().query(
        'UPDATE promotions SET uses_count = GREATEST(0, uses_count - 1) WHERE id = $1',
        [promotion.id]
      );
    }
    res.json({
      valid: true,
      discountedFare,
      discount,
      promotion: promotionToJson(promotion),
    });
  })
);

module.exports = router;