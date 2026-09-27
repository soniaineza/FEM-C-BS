const { getPool } = require('../db');
const { ApiError } = require('../utils/asyncHandler');
const { publishRideEvent } = require('./rideEvents');

// The authoritative ride lifecycle. Every status change must go through
// transitionRide() so the history trail, ride events and revenue-driving
// timestamps stay consistent. `completed`, `cancelled` and `arrived` are
// terminal/stable ends; `paymentPending` stays until payment settles.
const TRANSITIONS = {
  scheduled: ['searchingDriver', 'cancelled'],
  searchingDriver: ['driverAssigned', 'cancelled'],
  // 'searchingDriver' here is a driver declining the offer — the ride goes
  // back to the matching pool for another driver (see rideDriverOps.js's
  // declineRide()), distinct from 'cancelled' which is the passenger opting
  // out entirely.
  driverAssigned: ['driverArriving', 'cancelled', 'searchingDriver'],
  driverArriving: ['driverArrived', 'cancelled'],
  driverArrived: ['pinVerified', 'cancelled'],
  pinVerified: ['inProgress', 'cancelled'],
  inProgress: ['arrived'],
  arrived: ['paymentPending'],
  paymentPending: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

const TIMESTAMP_COLUMNS = {
  driverAssigned: 'accepted_at',
  driverArrived: 'arrived_at',
  pinVerified: 'pin_verified_at',
  inProgress: 'started_at',
  completed: 'completed_at',
  cancelled: 'cancelled_at',
  paymentPending: null,
};

async function loadRide(rideId) {
  const { rows } = await getPool().query('SELECT * FROM rides WHERE id = $1', [rideId]);
  return rows[0] || null;
}

/**
 * Moves a ride to `toStatus` after validating the transition. Writes a
 * status-history row, a ride event (for SSE replay) and emits the live event.
 * Returns the updated ride row.
 *
 * Pass `db` (a client inside BEGIN) to make the transition part of a larger
 * transaction; the live event is then left to the caller to publish after
 * COMMIT (`publish: false`), so listeners never see a rolled-back change.
 */
async function transitionRide(
  rideId,
  toStatus,
  { changedBy = 'system', reason = null, db = getPool(), publish = true } = {}
) {
  const { rows: current } = await db.query('SELECT * FROM rides WHERE id = $1', [rideId]);
  const ride = current[0] || null;
  if (!ride) throw new ApiError(404, 'Ride not found.');
  if (ride.status === toStatus) return ride;

  const allowed = TRANSITIONS[ride.status] || [];
  if (!allowed.includes(toStatus)) {
    throw new ApiError(400, `Ride cannot move from '${ride.status}' to '${toStatus}'.`);
  }

  const stampColumn = TIMESTAMP_COLUMNS[toStatus];
  const stamp = stampColumn ? `, ${stampColumn} = now()` : '';

  const { rows } = await db.query(
    `UPDATE rides SET status = $1${stamp} WHERE id = $2 AND status = $3 RETURNING *`,
    [toStatus, rideId, ride.status]
  );
  const updated = rows[0];
  if (!updated) {
    // The ride changed status between our read and this guarded update (e.g.
    // a passenger cancel racing a re-match). Don't record a transition that
    // never happened.
    throw new ApiError(409, 'The ride was updated at the same time. Please try again.');
  }

  await db.query(
    `INSERT INTO ride_status_history (ride_id, from_status, to_status, changed_by, reason)
     VALUES ($1,$2,$3,$4,$5)`,
    [rideId, ride.status, toStatus, changedBy, reason]
  );
  await db.query(
    `INSERT INTO ride_events (ride_id, event_type, payload)
     VALUES ($1, 'statusChange', $2)`,
    [rideId, JSON.stringify({ from: ride.status, to: toStatus, by: changedBy, reason }) ]
  );

  if (publish) publishRideEvent(rideId, { type: 'status', status: toStatus, rideId });
  return updated;
}

module.exports = { transitionRide, TRANSITIONS, loadRide };