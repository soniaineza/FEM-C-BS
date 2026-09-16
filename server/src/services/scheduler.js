const { getPool } = require('../db');
const { config } = require('../config');
const { transitionRide } = require('./rideStateMachine');
const { activateScheduledRide, matchAndAssign } = require('./rideService');
const driverMatcher = require('./driverMatcher');

let timer = null;
const RUN_EVERY_MS = 30 * 1000;

/** Activates and (re)starts matching for every scheduled ride due now. */
async function sweepDueScheduledRides() {
  const { rows } = await getPool().query(
    `SELECT id FROM rides
      WHERE status = 'scheduled' AND scheduled_for <= now()
      ORDER BY scheduled_for LIMIT 50`
  );
  for (const { id } of rows) {
    try {
      await activateScheduledRide(id);
    } catch (err) {
      console.error(`[scheduler] failed to start ride ${id}:`, err.message);
    }
  }
}

/** A driver who never accepts within the timeout windows gets released and the
 * ride retried against the next nearest driver. Prevents stuck drivers. */
async function sweepStaleAssignments() {
  const { rows } = await getPool().query(
    `SELECT id, driver_id, passenger_id, driver_name FROM rides
      WHERE status = 'driverAssigned'
        AND accepted_at < now() - ($1 || ' seconds')::interval
      LIMIT 20`,
    [config.assignAcceptTimeoutSeconds]
  );
  for (const ride of rows) {
    try {
      if (ride.driver_id) {
        await driverMatcher.releaseDriver(ride.driver_id);
        await getPool().query(
          `INSERT INTO ride_events (ride_id, event_type, payload)
           VALUES ($1, 'acceptTimeout', $2)`,
          [ride.id, JSON.stringify({ expiredDriverId: ride.driver_id }) ]
        );
      }
      await getPool().query(
        `UPDATE rides SET driver_id = NULL, accepted_at = NULL,
                driver_name = NULL, driver_phone = NULL, driver_rating = NULL,
                driver_vehicle_model = NULL, driver_vehicle_color = NULL,
                driver_license_plate = NULL
          WHERE id = $1`,
        [ride.id]
      );
      await transitionRide(ride.id, 'searchingDriver', { changedBy: 'scheduler', reason: 'driver_accept_timeout' });
      await matchAndAssign(ride.id);
    } catch (err) {
      console.error(`[scheduler] stale-assignment handling failed for ${ride.id}:`, err.message);
    }
  }
}

function startScheduler() {
  if (timer) return;
  timer = setInterval(() => {
    Promise.all([sweepDueScheduledRides(), sweepStaleAssignments()]).catch((err) =>
      console.error('[scheduler] sweep failed:', err)
    );
  }, RUN_EVERY_MS);
}

function stopScheduler() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

module.exports = { startScheduler, stopScheduler, sweepDueScheduledRides, sweepStaleAssignments };