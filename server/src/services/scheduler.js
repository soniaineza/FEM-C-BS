const { getPool, transaction } = require('../db');
const { config } = require('../config');
const { transitionRide } = require('./rideStateMachine');
const { activateScheduledRide, matchAndAssign } = require('./rideService');
const { pushNotification } = require('./notify');
const driverMatcher = require('./driverMatcher');
const { retryEmergencies } = require('./emergencyDispatch');
const { reconcilePendingPayments } = require('./payments');
const { reconcilePendingTopups } = require('./walletTopups');
const { LOCATION_MAX_AGE_SECONDS } = require('./driverKyc');

let timer = null;
const RUN_EVERY_MS = 30 * 1000;

/** Rides stuck in searchingDriver longer than this are auto-cancelled so the
 * passenger is freed to book again instead of staring at a spinner forever.
 * Long enough for a small driver pool to match; short enough not to strand
 * the passenger. */
const SEARCH_TIMEOUT_SECONDS = Number(process.env.RIDE_SEARCH_TIMEOUT_SECONDS || 300);

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
      const expired = await transaction(async (db) => {
        await db.query('SELECT id FROM drivers WHERE id=$1 FOR UPDATE',[ride.driver_id]);
        const current = (await db.query(`SELECT * FROM rides WHERE id=$1 AND driver_id=$2
          AND status='driverAssigned' AND accepted_at < now()-($3 || ' seconds')::interval FOR UPDATE`,
          [ride.id,ride.driver_id,config.assignAcceptTimeoutSeconds])).rows[0];
        if (!current) return false;
        await db.query(`UPDATE rides SET driver_id=NULL, accepted_at=NULL, pool_group_id=NULL,
          driver_name=NULL,driver_phone=NULL,driver_rating=NULL,driver_vehicle_model=NULL,
          driver_vehicle_color=NULL,driver_license_plate=NULL WHERE id=$1`,[ride.id]);
        await transitionRide(ride.id,'searchingDriver',{changedBy:'scheduler',reason:'driver_accept_timeout'});
        // An ignored offer goes to the next driver, not back to this one.
        await db.query('INSERT INTO ride_declined_drivers (ride_id, driver_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',[ride.id,ride.driver_id]);
        await driverMatcher.releaseDriver(ride.driver_id);
        await db.query("INSERT INTO ride_events(ride_id,event_type,payload) VALUES($1,'acceptTimeout',$2)",[ride.id,JSON.stringify({expiredDriverId:ride.driver_id})]);
        return true;
      });
      if (!expired) continue;
      await matchAndAssign(ride.id);
    } catch (err) {
      console.error(`[scheduler] stale-assignment handling failed for ${ride.id}:`, err.message);
    }
  }
}

/** Auto-cancels rides that have been searching for a driver for too long
 * (no driver ever matched — e.g. zero drivers online). Without this a ride
 * can sit in searchingDriver forever, and the passenger app's
 * useActiveRideRestore keeps dragging the user back to the searching screen.
 */
async function sweepExpiredSearches() {
  const { rows } = await getPool().query(
    `SELECT id, passenger_id, created_at FROM rides
      WHERE status = 'searchingDriver'
        AND created_at < now() - ($1 || ' seconds')::interval
      LIMIT 20`,
    [SEARCH_TIMEOUT_SECONDS]
  );
  for (const ride of rows) {
    try {
      const cancelled = await transaction(async (db) => {
        const current=(await db.query("SELECT id FROM rides WHERE id=$1 AND status='searchingDriver' AND driver_id IS NULL FOR UPDATE",[ride.id])).rows[0];
        if (!current) return false;
        await db.query("UPDATE rides SET cancellation_reason='no_drivers_available',cancelled_by='system' WHERE id=$1",[ride.id]);
        await transitionRide(ride.id,'cancelled',{changedBy:'scheduler',reason:'search_timeout'});
        return true;
      });
      if (!cancelled) continue;
      await pushNotification(ride.passenger_id, {
        title: 'No drivers available',
        body: 'We could not find a driver for your ride. Please try requesting again.',
        type: 'ride',
        rideId: ride.id,
      });
      console.log(`[scheduler] auto-cancelled expired search ${ride.id}`);
 } catch (err) {
      console.error(`[scheduler] search-timeout handling failed for ${ride.id}:`, err.message);
 }
 }
}

/** Offers still-unmatched rides to drivers who became available after the
 * booking (came online, finished a trip, moved into range). Matching otherwise
 * only runs at booking time and after a decline or an accept timeout. */
async function sweepWaitingSearches() {
  const { rows } = await getPool().query(
    `SELECT id FROM rides
      WHERE status = 'searchingDriver' AND driver_id IS NULL
        AND created_at >= now() - ($1 || ' seconds')::interval
      ORDER BY created_at LIMIT 20`,
    [SEARCH_TIMEOUT_SECONDS]
  );
  for (const { id } of rows) {
    try {
      await matchAndAssign(id);
    } catch (err) {
      console.error(`[scheduler] re-match failed for ${id}:`, err.message);
    }
  }
}

async function sweepStaleOnlineDrivers() {
  await getPool().query(
    `UPDATE drivers d SET status='offline'
       WHERE d.status='active' AND d.last_online_at < now() - interval '90 seconds'
         AND NOT EXISTS (SELECT 1 FROM driver_locations dl WHERE dl.driver_id=d.id
           AND dl.measured_at > now() - ($1 || ' seconds')::interval)`,
    [LOCATION_MAX_AGE_SECONDS]
  );
}

function startScheduler() {
  if (timer) return;
  // Two independent gates: the provider reconciliations make slow network
  // calls and must not delay the ride sweeps behind them.
  const gate = (sweeps) => {
    let running = false;
    return () => {
      if (running) return;
      running = true;
      Promise.allSettled(sweeps.map((sweep) => sweep())).then((results) => {
        for (const result of results) if (result.status === 'rejected') console.error('[scheduler] sweep failed:', result.reason);
      }).finally(() => { running = false; });
    };
  };
  const rideSweeps = gate([sweepDueScheduledRides, sweepStaleAssignments, sweepExpiredSearches, sweepWaitingSearches, sweepStaleOnlineDrivers, retryEmergencies]);
  const providerSweeps = gate([reconcilePendingPayments, reconcilePendingTopups]);
  timer = setInterval(() => {
    rideSweeps();
    providerSweeps();
  }, RUN_EVERY_MS);
}

function stopScheduler() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

module.exports = { startScheduler, stopScheduler, sweepDueScheduledRides, sweepStaleAssignments, sweepExpiredSearches, sweepWaitingSearches, sweepStaleOnlineDrivers };
