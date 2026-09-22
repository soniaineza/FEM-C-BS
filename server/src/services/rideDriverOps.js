const bcrypt = require('bcryptjs');

const { getPool } = require('../db');
const { ApiError } = require('../utils/asyncHandler');
const { transitionRide } = require('./rideStateMachine');
const { generateRidePin, changeDestination, matchAndAssign } = require('./rideService');
const { pushNotification } = require('./notify');
const { createPaymentForRide, chargePayment } = require('./payments');
const { releaseDriver } = require('./driverMatcher');

const DRIVER_ACTIVE_RIDE_STATUSES = [
  'driverAssigned',
  'driverArriving',
  'driverArrived',
  'pinVerified',
  'inProgress',
];

async function authenticateDriver(phone, password) {
  const { rows } = await getPool().query('SELECT * FROM drivers WHERE phone = $1', [phone]);
  const driver = rows[0];
  if (!driver || !driver.password_hash) throw new ApiError(401, 'Invalid driver credentials.');
  if (!(await bcrypt.compare(password, driver.password_hash))) {
    throw new ApiError(401, 'Invalid driver credentials.');
  }
  return driver;
}

/** Every ride currently assigned to this driver (a shared/pooled trip can be
 * more than one), oldest first — the order the driver picked them up in. */
async function getActiveRides(driverId) {
  const { rows } = await getPool().query(
    `SELECT r.*, p.full_name AS passenger_name,
            pl.latitude AS passenger_latitude, pl.longitude AS passenger_longitude
       FROM rides r
       JOIN passengers p ON p.id = r.passenger_id
       LEFT JOIN passenger_locations pl ON pl.passenger_id = r.passenger_id
      WHERE r.driver_id = $1
        AND r.status = ANY($2)
      ORDER BY r.created_at ASC`,
    [driverId, DRIVER_ACTIVE_RIDE_STATUSES]
  );
  return rows;
}

/** The driver's single "current" ride for screens that only show one at a
 * time — the most recently assigned. Prefer [getActiveRides] once a screen
 * needs to represent a whole pooled trip. */
async function getActiveRide(driverId) {
  const rides = await getActiveRides(driverId);
  return rides[rides.length - 1] || null;
}

/** Loads exactly the ride [rideId] for this driver, but only while it's still
 * active for them. Used by every per-ride driver action so a pooled ride that
 * is not the "most recent" one is never mistaken for a missing assignment. */
async function getActiveRideById(driverId, rideId) {
  const { rows } = await getPool().query(
    `SELECT r.*, p.full_name AS passenger_name,
            pl.latitude AS passenger_latitude, pl.longitude AS passenger_longitude
       FROM rides r
       JOIN passengers p ON p.id = r.passenger_id
       LEFT JOIN passenger_locations pl ON pl.passenger_id = r.passenger_id
      WHERE r.id = $1 AND r.driver_id = $2 AND r.status = ANY($3)`,
    [rideId, driverId, DRIVER_ACTIVE_RIDE_STATUSES]
  );
  return rows[0] || null;
}

async function updateDriverLocation(driverId, { latitude, longitude, heading }) {
  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    throw new ApiError(400, 'latitude and longitude are required.');
  }
  await getPool().query(
    `INSERT INTO driver_locations (driver_id, latitude, longitude, heading, recorded_at)
     VALUES ($1,$2,$3,$4, now())
     ON CONFLICT (driver_id) DO UPDATE SET
       latitude = EXCLUDED.latitude,
       longitude = EXCLUDED.longitude,
       heading = EXCLUDED.heading,
       recorded_at = now()`,
    [driverId, latitude, longitude, heading ?? null]
  );
  await getPool().query(
    'UPDATE drivers SET current_latitude = $2, current_longitude = $3, last_online_at = now() WHERE id = $1',
    [driverId, latitude, longitude]
  );

  // Lay down a breadcrumb for every ride this driver is currently on (a
  // pooled trip can be more than one), so each passenger can be shown the
  // actual road path travelled once their leg ends.
  const activeRides = await getActiveRides(driverId);
  for (const activeRide of activeRides) {
    await getPool().query(
      `INSERT INTO ride_route_points (ride_id, latitude, longitude, recorded_at)
       VALUES ($1, $2, $3, now())`,
      [activeRide.id, latitude, longitude]
    );
  }
}

/** Other passengers currently pooled into the same vehicle as [ride]. */
async function poolCompanions(ride) {
  if (!ride.pool_group_id) return [];
  const { rows } = await getPool().query(
    `SELECT * FROM rides
      WHERE pool_group_id = $1 AND id != $2
        AND status = ANY($3)`,
    [ride.pool_group_id, ride.id, DRIVER_ACTIVE_RIDE_STATUSES]
  );
  return rows;
}

async function acceptRide(driverId, rideId) {
  const ride = await getActiveRideById(driverId, rideId);
  if (!ride) throw new ApiError(404, 'No assigned ride found.');
  if (ride.status !== 'driverAssigned') {
    throw new ApiError(400, 'Acceptance only applies to a newly assigned ride.');
  }
  await transitionRide(rideId, 'driverArriving', { changedBy: 'driver' });
  await pushNotification(ride.passenger_id, {
    title: 'Driver on the way',
    body: `${ride.driver_name} is heading to your pickup point.`,
    type: 'ride',
    rideId,
  });
}

/** Driver declines a newly assigned ride (the KIMU-style offer's "Decline"
 * action, which our matcher never had — it only ever offered a single
 * silently-accepted assignment before this). The ride goes back to
 * searchingDriver and is immediately re-matched against another driver;
 * this driver is released back to the active pool. */
async function declineRide(driverId, rideId) {
  const ride = await getActiveRideById(driverId, rideId);
  if (!ride) throw new ApiError(404, 'No assigned ride found.');
  if (ride.status !== 'driverAssigned') {
    throw new ApiError(400, 'Only a newly assigned ride can be declined.');
  }
  await getPool().query(
    `UPDATE rides SET driver_id = NULL, driver_name = NULL, driver_phone = NULL,
       driver_rating = NULL, driver_vehicle_model = NULL, driver_vehicle_color = NULL,
       driver_license_plate = NULL
     WHERE id = $1`,
    [rideId]
  );
  await transitionRide(rideId, 'searchingDriver', { changedBy: 'driver', reason: 'declined' });
  await releaseDriver(driverId);
  matchAndAssign(rideId).catch((err) => console.error('[rides] re-match after decline failed:', err));
}

async function markArrived(driverId, rideId) {
  const ride = await getActiveRideById(driverId, rideId);
  if (!ride) throw new ApiError(404, 'No assigned ride found.');
  if (ride.status !== 'driverArriving') {
    throw new ApiError(400, 'Arrival can only be reported while on the way.');
  }
  await transitionRide(rideId, 'driverArrived', { changedBy: 'driver' });

  const pin = await generateRidePin(rideId);
  await pushNotification(ride.passenger_id, {
    title: 'Your driver has arrived',
    body: `Meet ${ride.driver_name}. Your ride PIN is ${pin}.`,
    type: 'ride',
    rideId,
  });
  return pin;
}

async function verifyPin(driverId, rideId, pin) {
  const ride = await getActiveRideById(driverId, rideId);
  if (!ride) throw new ApiError(404, 'No assigned ride found.');
  if (ride.status !== 'driverArrived') {
    throw new ApiError(400, 'The PIN can only be verified after arrival.');
  }
  if (!ride.ride_pin_hash || String(pin) !== String(ride.ride_pin)) {
    throw new ApiError(400, 'Incorrect PIN.');
  }
  await transitionRide(rideId, 'pinVerified', { changedBy: 'driver' });
  // Entering the correct PIN is exactly the "start trip" action, so the ride
  // immediately moves in-progress.
  await transitionRide(rideId, 'inProgress', { changedBy: 'driver' });
  await pushNotification(ride.passenger_id, {
    title: 'Ride started',
    body: 'Your driver started the trip. Buckle up!',
    type: 'ride',
    rideId,
  });
}

/** Ends one passenger's leg of the trip: final fare appears, a payment is
 * created and charged. In a pooled ride the driver keeps driving the other
 * passenger(s) still aboard — only this ride moves to payment. */
async function completeTrip(driverId, rideId) {
  const ride = await getActiveRideById(driverId, rideId);
  if (!ride) throw new ApiError(404, 'No assigned ride found.');
  if (ride.status !== 'inProgress') {
    throw new ApiError(400, 'Only an in-progress ride can be completed.');
  }

  await getPool().query('UPDATE rides SET final_fare = estimated_fare WHERE id = $1', [rideId]);
  await transitionRide(rideId, 'arrived', { changedBy: 'driver' });
  await transitionRide(rideId, 'paymentPending', { changedBy: 'payments' });

  const updated = await getPool().query('SELECT * FROM rides WHERE id = $1', [rideId]);
  const payment = await createPaymentForRide(updated.rows[0]);
  const paymentAfter = await chargePayment(payment, updated.rows[0]);

  const { rows } = await getPool().query('SELECT * FROM rides WHERE id = $1', [rideId]);
  return { ride: rows[0], payment: paymentAfter || payment };
}

/** Driver-initiated cancellation of an already-accepted ride (before pickup
 * is confirmed) — the passenger-side cancelRide() in rideService.js only
 * ever checked passenger ownership, so a driver had no way to bail on a
 * no-show passenger once they'd accepted. Mirrors that function's shape. */
async function cancelRideAsDriver(driverId, rideId, reason) {
  const ride = await getActiveRideById(driverId, rideId);
  if (!ride) throw new ApiError(404, 'No assigned ride found.');
  const cancellable = ['driverAssigned', 'driverArriving', 'driverArrived'];
  if (!cancellable.includes(ride.status)) {
    throw new ApiError(400, 'This ride can no longer be cancelled.');
  }
  await getPool().query(
    `UPDATE rides SET cancellation_reason = $1, cancelled_by = 'driver' WHERE id = $2`,
    [reason || null, rideId]
  );
  const updated = await transitionRide(rideId, 'cancelled', { changedBy: 'driver', reason: reason || null });
  await releaseDriver(driverId);
  await pushNotification(ride.passenger_id, {
    title: 'Ride cancelled',
    body: 'Your driver cancelled this ride. No fare was charged.',
    type: 'ride',
    rideId,
  });
  return updated;
}

async function changeDestinationAsDriver(driverId, rideId, destination) {
  const ride = await getActiveRideById(driverId, rideId);
  if (!ride) throw new ApiError(404, 'No assigned ride found.');
  return changeDestination(ride.passenger_id, rideId, destination);
}

module.exports = {
  authenticateDriver,
  getActiveRide,
  getActiveRides,
  getActiveRideById,
  poolCompanions,
  updateDriverLocation,
  acceptRide,
  declineRide,
  markArrived,
  verifyPin,
  completeTrip,
  cancelRideAsDriver,
  changeDestinationAsDriver,
};