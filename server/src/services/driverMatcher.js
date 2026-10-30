const { getPool } = require('../db');
const { getTravelTimes } = require('./routing');
const { haversineKm } = require('../utils/distance');
const { eligibleDriverSql } = require('./driverKyc');
const { evaluatePoolJoin } = require('./poolPlanner');
const { config } = require('../config');

const MATCH_CANDIDATES = 8;
const DEFAULT_MAX_MATCH_KM = 5;

// Must track rideDriverOps.js's DRIVER_ACTIVE_RIDE_STATUSES — kept as a
// separate literal here to avoid a require() cycle (rideDriverOps ->
// rideService -> driverMatcher).
const DRIVER_ACTIVE_RIDE_STATUSES = [
  'driverAssigned',
  'driverArriving',
  'driverArrived',
  'pinVerified',
  'inProgress',
];

// Statuses in which a shared ride still occupies seats in its vehicle, and
// so can be joined by another shared booking. Whether joining is acceptable
// is decided by the added travel time, not by how far along the trip is.
const POOLABLE_STATUSES = ['driverAssigned', 'driverArriving', 'driverArrived', 'pinVerified', 'inProgress'];

// Only the few pools nearest the new pickup are timed by road.
const POOL_CANDIDATES = 3;

/**
 * Finds an existing shared-ride pool this new ride can join: a vehicle of
 * the same class already carrying shared riders, with enough free seats,
 * where serving this rider keeps everyone (them included) within the
 * promised extra travel time by road — see poolPlanner.evaluatePoolJoin.
 * Returns { driverId, poolGroupId, members, pickupSeconds } or null.
 */
async function findPoolableRide(ride) {
  if (ride.ride_type !== 'shared') return null;

  const { rows: candidates } = await getPool().query(
    `SELECT r.*, v.capacity AS vehicle_capacity,
            d.current_latitude AS driver_latitude, d.current_longitude AS driver_longitude
       FROM rides r
       JOIN vehicles v ON v.id = r.vehicle_id
       JOIN drivers d ON d.id = r.driver_id
      WHERE r.ride_type = 'shared'
        AND r.vehicle_id = $1
        AND r.status = ANY($2)
        AND r.driver_id IS NOT NULL
        AND r.passenger_id != $3
        AND d.current_latitude IS NOT NULL
        AND d.current_longitude IS NOT NULL
        AND d.verified = TRUE ${eligibleDriverSql}
      ORDER BY r.created_at ASC`,
    [ride.vehicle_id, POOLABLE_STATUSES, ride.passenger_id]
  );
  if (!candidates.length) return null;

  // One pool per vehicle: every shared ride a driver is currently serving.
  const pools = new Map();
  for (const c of candidates) {
    if (!pools.has(c.driver_id)) pools.set(c.driver_id, []);
    pools.get(c.driver_id).push(c);
  }

  const seats = ride.seats || 1;
  const nearby = [];
  for (const [driverId, members] of pools) {
    const capacity = members[0].vehicle_capacity || 4;
    const taken = members.reduce((sum, m) => sum + (m.seats || 1), 0);
    if (taken + seats > capacity) continue;
    const position = { latitude: members[0].driver_latitude, longitude: members[0].driver_longitude };
    const km = haversineKm(ride.pickup_latitude, ride.pickup_longitude, position.latitude, position.longitude);
    if (km > DEFAULT_MAX_MATCH_KM) continue;
    nearby.push({ driverId, members, position, km });
  }
  nearby.sort((a, b) => a.km - b.km);

  let best = null;
  for (const pool of nearby.slice(0, POOL_CANDIDATES)) {
    const verdict = await evaluatePoolJoin(pool.position, pool.members, ride);
    if (!verdict.ok) continue;
    if (!best || verdict.pickupSeconds < best.pickupSeconds) {
      best = { ...pool, pickupSeconds: verdict.pickupSeconds };
    }
  }
  if (!best) return null;

  return {
    driverId: best.driverId,
    poolGroupId: best.members[0].pool_group_id || best.members[0].id,
    members: best.members,
    pickupSeconds: best.pickupSeconds,
  };
}

/**
 * Real driver matching: finds the nearest available, verified, online driver
 * to the ride's pickup point using their live reported location. Returns the
 * driver row (including their vehicle) or null when no driver is available —
 * which is reported honestly to the client as a continuing search.
 */
async function findNearestDriver(ride) {
  const { rows } = await getPool().query(
    `SELECT d.*, v.name  AS vehicle_name,
            v.description AS vehicle_description,
            v.capacity AS vehicle_capacity
       FROM drivers d
       LEFT JOIN vehicles v ON v.id = d.current_vehicle_id
      WHERE d.verified = TRUE
        AND d.status = 'active'
        AND d.current_latitude IS NOT NULL
        AND d.current_longitude IS NOT NULL
        ${eligibleDriverSql}
      ORDER BY d.rating DESC
      LIMIT 100`
  );

  // Vehicle class: the requested class first; otherwise an upgrade (a
  // pricier class with at least as many seats), never a downgrade. A driver
  // with no registered vehicle counts as the cheapest class.
  const { rows: classes } = await getPool().query('SELECT id, base_fare, capacity FROM vehicles');
  const byId = new Map(classes.map((c) => [c.id, c]));
  const cheapest = classes.reduce((a, c) => (!a || c.base_fare < a.base_fare ? c : a), null);
  const wanted = byId.get(ride.vehicle_id) || cheapest;
  const tierOf = (driver) => {
    const cls = byId.get(driver.current_vehicle_id) || cheapest;
    if (!wanted || !cls) return 0;
    if (cls.id === wanted.id) return 0;
    if (cls.base_fare >= wanted.base_fare && cls.capacity >= wanted.capacity) return 1;
    return null; // would be a downgrade
  };

  const pickup = { latitude: ride.pickup_latitude, longitude: ride.pickup_longitude };
  const eligible = [];
  for (const driver of rows) {
    const tier = tierOf(driver);
    if (tier == null) continue;
    const dist = haversineKm(pickup.latitude, pickup.longitude, driver.current_latitude, driver.current_longitude);
    if (dist <= DEFAULT_MAX_MATCH_KM) eligible.push({ driver, tier, dist });
  }
  if (!eligible.length) return null;

  // Within the best available class, the few nearest cars as the crow flies
  // are re-ranked by real road travel time (Kigali's hills and one-ways make
  // straight-line distance a poor proxy); falls back to distance.
  const bestTier = Math.min(...eligible.map((e) => e.tier));
  const candidates = eligible
    .filter((e) => e.tier === bestTier)
    .sort((a, b) => a.dist - b.dist)
    .slice(0, MATCH_CANDIDATES);
  const times = await getTravelTimes(
    candidates.map((c) => ({ latitude: c.driver.current_latitude, longitude: c.driver.current_longitude })),
    pickup
  );
  let bestIdx = 0;
  if (times) {
    let bestTime = Infinity;
    times.forEach((t, i) => {
      if (t != null && t < bestTime) {
        bestTime = t;
        bestIdx = i;
      }
    });
  }
  const best = candidates[bestIdx].driver;
  const bestDistance = candidates[bestIdx].dist;

  return { driver: best, distanceKm: bestDistance };
}

/**
 * Assigns the chosen driver to a ride (denormalising for cheap reads).
 *
 * [poolGroupId], when given, joins this ride onto an existing shared pool
 * (the driver is already busy driving that pool, so their status is left
 * alone). Otherwise a fresh shared ride becomes its own pool anchor — its
 * own id — so later shared requests can find and join it; a private ride's
 * pool_group_id stays NULL.
 */
async function assignDriver(rideId, driver, { poolGroupId = null } = {}) {
  const pool = getPool();

  const { rows } = await pool.query(
    `UPDATE rides SET
       driver_id = $1,
       driver_name = $2,
       driver_phone = $3,
       driver_rating = $4,
       driver_vehicle_model = $5,
       driver_vehicle_color = $6,
       driver_license_plate = $7,
       pool_group_id = CASE
         WHEN $9::uuid IS NOT NULL THEN $9::uuid
         WHEN ride_type = 'shared' THEN id
         ELSE NULL
       END
     WHERE id = $8 AND status = 'searchingDriver'
     RETURNING *`,
    [
      driver.id,
      driver.full_name,
      driver.phone,
      driver.rating,
      driver.vehicle_model || null,
      driver.vehicle_color || null,
      driver.vehicle_plate || null,
      rideId,
      poolGroupId,
    ]
  );
  const ride = rows[0];
  if (!ride) return null;

  if (!poolGroupId) {
    // Only the driver who is newly picked up from the free pool needs their
    // status flipped — a driver already driving a pool stays 'busy'.
    await pool.query(
      `UPDATE drivers SET status = 'busy' WHERE id = $1 AND status = 'active'`,
      [driver.id]
    );
    // Local tests may use a parked position; real drivers must report GPS
    // from their own device before they can be matched.
    if (config.devAllowStaleDrivers) await pool.query(
      `INSERT INTO driver_locations (driver_id, latitude, longitude, recorded_at)
       VALUES ($1,$2,$3, now())
       ON CONFLICT (driver_id)
       DO UPDATE SET latitude = EXCLUDED.latitude,
                     longitude = EXCLUDED.longitude,
                     recorded_at = now()`,
      [driver.id, driver.current_latitude, driver.current_longitude]
    );
  }
  return ride;
}

/** Assigns a ride directly onto an already-driving pool (no fresh nearest-
 * driver search needed — the driver is already found). */
async function assignToPool(rideId, poolMatch) {
  const { rows } = await getPool().query('SELECT * FROM drivers WHERE id = $1', [
    poolMatch.driverId,
  ]);
  const driver = rows[0];
  if (!driver) return null;
  return assignDriver(rideId, driver, { poolGroupId: poolMatch.poolGroupId });
}

/** Releases a driver back to the active pool once they have no other ride
 * still in progress (a pooled driver may still be driving a companion). */
async function releaseDriver(driverId) {
  const { rows } = await getPool().query(
    `SELECT 1 FROM rides WHERE driver_id = $1 AND status = ANY($2) LIMIT 1`,
    [driverId, DRIVER_ACTIVE_RIDE_STATUSES]
  );
  if (rows.length) return; // still driving another pooled passenger

  await getPool().query(
    `UPDATE drivers SET status = 'active' WHERE id = $1 AND status = 'busy'`,
    [driverId]
  );
}

module.exports = {
  findNearestDriver,
  findPoolableRide,
  assignDriver,
  assignToPool,
  releaseDriver,
  DEFAULT_MAX_MATCH_KM,
};
