const express = require('express');

const { getPool } = require('../db');
const { asyncHandler } = require('../utils/asyncHandler');
const { vehicleToJson } = require('../utils/serialize');

const router = express.Router();

// GET /api/vehicles
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { rows } = await getPool().query('SELECT * FROM vehicles ORDER BY base_fare ASC');
    res.json({ vehicles: rows.map(vehicleToJson) });
  })
);

module.exports = router;
