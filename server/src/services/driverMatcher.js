const { getPool } = require('../db');
const { haversineKm, bearingDegrees, bearingDiffDegrees } = require('../utils/distance');

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

// A shared ride may only join an existing pool while the driver has not yet
// reached anyone's pickup point — once they have, adding a new stop would
// mean turning back, which defeats the point of pooling.
const POOLABLE_STATUSES = ['driverAssigned', 'driverArriving'];

// How far out of the way a pooled pickup is allowed to be, and how close the
// two trips' overall directions must be, to count as "going the same way".
const POOL_MAX_PICKUP_DETOUR_KM = 3;
const POOL_MAX_BEARING_DIFF_DEGREES = 45;

/**
 * Finds an existing shared-ride pool this new ride can join: another shared
 * ride, in the same vehicle class, whose driver hasn't reached a pickup yet,
 * with a free seat, heading the same general direction and not too far out
 * of the way. Returns { driver, poolGroupId, distanceKm } or null.
 */
async function findPoolableRide(ride) {
  if (ride.ride_type !== 'shared') return null;

  const { rows: candidates } = await getPool().query(
    `SELECT r.*, v.capacity AS vehicle_capacity
       FROM rides r
       JOIN vehicles v ON v.id = r.vehicle_id
      WHERE r.ride_type = 'shared'
        AND r.vehicle_id = $1
        AND r.status = ANY($2)
        AND r.driver_id IS NOT NULL`,
    [ride.vehicle_id, POOLABLE_STATUSES]
  );
  if (!candidates.length) return null;

  // Group candidates by pool (a pool may already have more than one member)
  // and drop any pool that's already full.
  const pools = new Map();
  for (const c of candidates) {
    const groupId = c.pool_group_id || c.id;
    if (!pools.has(groupId)) pools.set(groupId, []);
    pools.get(groupId).push(c);
  }

  const newBearing = bearingDegrees(
    ride.pickup_latitude,
    ride.pickup_longitude,
    ride.dest_latitude,
    ride.dest_longitude
  );

  let best = null;
  let bestDistance = Infinity;
  for (const [groupId, members] of pools) {
    const capacity = members[0].vehicle_capacity || 4;
    if (members.length >= capacity) continue;

    for (const member of members) {
      const pickupDetourKm = haversineKm(
        ride.pickup_latitude,
        ride.pickup_longitude,
        member.pickup_latitude,
        member.pickup_longitude
      );
      if (pickupDetourKm > POOL_MAX_PICKUP_DETOUR_KM) continue;

      const memberBearing = bearingDegrees(
        member.pickup_latitude,
        member.pickup_longitude,
        member.dest_latitude,
        member.dest_longitude
      );
      if (bearingDiffDegrees(newBearing, memberBearing) > POOL_MAX_BEARING_DIFF_DEGREES) {
        continue;
      }

      if (pickupDetourKm < bestDistance) {
        bestDistance = pickupDetourKm;
        best = { member, groupId };
      }
    }
  }

  if (!best) return null;
  return {
    driverId: best.member.driver_id,
    poolGroupId: best.groupId,
    distanceKm: bestDistance,
    anchorRide: best.member,
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
      ORDER BY d.rating DESC NULLS LAST
      LIMIT 100`
  );

  let best = null;
  let bestDistance = Infinity;
  for (const driver of rows) {
    const dist = haversineKm(
      ride.pickup_latitude,
      ride.pickup_longitude,
      driver.current_latitude,
      driver.current_longitude
    );
    if (dist < bestDistance) {
      bestDistance = dist;
      best = driver;
    }
  }
  if (!best || bestDistance > DEFAULT_MAX_MATCH_KM) return null;

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
    // Fallback: persist live location even if this driver hasn't enabled the
    // location stream yet.
    await pool.query(
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