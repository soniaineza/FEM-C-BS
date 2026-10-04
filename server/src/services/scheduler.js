const { getPool } = require('../db');
const { config } = require('../config');
const { transitionRide } = require('./rideStateMachine');
const { activateScheduledRide, matchAndAssign } = require('./rideService');
const { pushNotification } = require('./notify');
const driverMatcher = require('./driverMatcher');
const { retryEmergencies } = require('./emergencyDispatch');
const { reconcilePendingPayments } = require('./payments');
const { reconcilePendingTopups } = require('./walletTopups');
const { reconcileDriverMoney } = require('./driverBalance');
const { LOCATION_MAX_AGE_SECONDS } = require('./driverKyc');
const { pushDriverNotification } = require('./driverNotify');

let timer = null;
const RUN_EVERY_MS = config.schedulerIntervalMs;

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
      const expiredDriverId = ride.driver_id;
      // Clear this ride's own driver assignment BEFORE releasing the driver:
      // releaseDriver() checks whether the driver has any other ride still in
      // an active status, and until this row itself is cleared/transitioned
      // away from 'driverAssigned', that check always finds THIS ride and
      // wrongly concludes the driver is still busy, leaving them stranded at
      // status='busy' forever with nothing assigned to them.
      await getPool().query(
        `UPDATE rides SET driver_id = NULL, accepted_at = NULL,
                driver_name = NULL, driver_phone = NULL, driver_rating = NULL,
                driver_vehicle_model = NULL, driver_vehicle_color = NULL,
                driver_license_plate = NULL
          WHERE id = $1`,
        [ride.id]
      );
      await transitionRide(ride.id, 'searchingDriver', { changedBy: 'scheduler', reason: 'driver_accept_timeout' });

      if (expiredDriverId) {
        await driverMatcher.releaseDriver(expiredDriverId);
        await getPool().query(
          `INSERT INTO ride_events (ride_id, event_type, payload)
           VALUES ($1, 'acceptTimeout', $2)`,
          [ride.id, JSON.stringify({ expiredDriverId }) ]
        );
      }
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
      await getPool().query(
        `UPDATE rides SET cancellation_reason = $1, cancelled_by = 'system' WHERE id = $2`,
        ['no_drivers_available', ride.id]
      );
      await transitionRide(ride.id, 'cancelled', { changedBy: 'scheduler', reason: 'search_timeout' });
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

async function sweepStaleOnlineDrivers() {
  await getPool().query(
    `UPDATE drivers d SET status='offline'
       WHERE d.status='active' AND COALESCE(d.last_online_at, 'epoch') < now() - interval '90 seconds'
         AND NOT EXISTS (SELECT 1 FROM driver_locations dl WHERE dl.driver_id=d.id
           AND dl.recorded_at > now() - ($1 || ' seconds')::interval)`,
    [LOCATION_MAX_AGE_SECONDS]
  );
}

/**
 * A cash fare the driver has not confirmed within CASH_CONFIRM_TIMEOUT_SECONDS
 * would otherwise hold both people forever: the rider cannot book again and
 * the driver stays busy. The ride is handed to an operator instead (a
 * 'cash_unconfirmed' payment exception) and both are freed. Nothing is
 * marked paid: the payment stays pending until the driver confirms after
 * all, or an operator records whether the cash was received.
 */
async function sweepUnconfirmedCash() {
  const { rows } = await getPool().query(
    `SELECT r.id, r.driver_id, r.passenger_id, p.id AS payment_id
       FROM rides r
       JOIN LATERAL (SELECT * FROM payments WHERE ride_id = r.id ORDER BY created_at DESC LIMIT 1) p ON TRUE
      WHERE r.status = 'paymentPending' AND r.payment_method = 'cash' AND r.cash_disputed_at IS NULL
        AND p.method = 'cash' AND p.status = 'pending'
        AND p.created_at < now() - ($1 || ' seconds')::interval
      LIMIT 50`,
    [String(config.cashConfirmTimeoutSeconds)]
  );
  for (const ride of rows) {
    const claimed = await getPool().query(
      `UPDATE rides SET cash_disputed_at = now()
        WHERE id = $1 AND status = 'paymentPending' AND cash_disputed_at IS NULL RETURNING id`,
      [ride.id]
    );
    if (!claimed.rows[0]) continue;
    await getPool().query(
      `INSERT INTO payment_exceptions (payment_id, ride_id, reason)
       VALUES ($1, $2, 'cash_unconfirmed') ON CONFLICT (payment_id) DO NOTHING`,
      [ride.payment_id, ride.id]
    );
    if (ride.driver_id) {
      await driverMatcher.releaseDriver(ride.driver_id);
      await pushDriverNotification(ride.driver_id, {
        title: 'Confirm the cash payment',
        body: 'You have not confirmed the cash for your last trip. Confirm it now, or our team will contact you.',
        type: 'payment',
        rideId: ride.id,
      });
    }
    await pushNotification(ride.passenger_id, {
      title: 'Cash payment under review',
      body: 'Your driver has not confirmed the cash payment yet. You can keep using Kimu while our team checks it.',
      type: 'payment',
      rideId: ride.id,
    });
    console.warn(`[scheduler] cash for ride ${ride.id} was not confirmed in time; sent to operators`);
  }
}

function startScheduler() {
  if (timer) return;
  timer = setInterval(() => {
    Promise.all([sweepDueScheduledRides(), sweepStaleAssignments(), sweepExpiredSearches(), sweepStaleOnlineDrivers(), retryEmergencies(), reconcilePendingPayments(), reconcilePendingTopups(), reconcileDriverMoney(), sweepUnconfirmedCash()]).catch((err) =>
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

module.exports = { startScheduler, stopScheduler, sweepDueScheduledRides, sweepStaleAssignments, sweepExpiredSearches, sweepStaleOnlineDrivers };
