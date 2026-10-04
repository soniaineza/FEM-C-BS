const bcrypt = require('bcryptjs');

const { getPool, transaction, afterCommit } = require('../db');
const { locationSample } = require('../utils/location');
const { ApiError } = require('../utils/asyncHandler');
const { transitionRide } = require('./rideStateMachine');
const { generateRidePin, changeDestination, matchAndAssign } = require('./rideService');
const { pushNotification } = require('./notify');
const { createPaymentForRide, chargePayment } = require('./payments');
const { recordSample } = require('./driverTrails');
const { releaseDriver } = require('./driverMatcher');

const DRIVER_ACTIVE_RIDE_STATUSES = [
  'driverAssigned',
  'driverArriving',
  'driverArrived',
  'pinVerified',
  'inProgress',
  'paymentPending',
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
       LEFT JOIN passenger_locations pl ON pl.passenger_id = r.passenger_id AND pl.ride_id=r.id
        AND r.status IN ('driverAssigned','driverArriving','driverArrived')
        AND pl.measured_at > now() - interval '30 seconds'
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
       LEFT JOIN passenger_locations pl ON pl.passenger_id = r.passenger_id AND pl.ride_id=r.id
        AND r.status IN ('driverAssigned','driverArriving','driverArrived')
        AND pl.measured_at > now() - interval '30 seconds'
      WHERE r.id = $1 AND r.driver_id = $2 AND r.status = ANY($3)`,
    [rideId, driverId, DRIVER_ACTIVE_RIDE_STATUSES]
  );
  return rows[0] || null;
}

async function updateDriverLocation(driverId, body) {
  const { latitude, longitude, heading, measuredAt, accuracy } = locationSample(body);
  return transaction(async () => {
    // Serialize location and matching writes on the same driver row.
    await getPool().query('SELECT id FROM drivers WHERE id=$1 FOR UPDATE', [driverId]);
    const { rows } = await getPool().query(
      `INSERT INTO driver_locations (driver_id, latitude, longitude, heading, measured_at, accuracy, recorded_at)
       VALUES ($1,$2,$3,$4,$5,$6,now()) ON CONFLICT (driver_id) DO UPDATE SET
       latitude=EXCLUDED.latitude, longitude=EXCLUDED.longitude, heading=EXCLUDED.heading,
       measured_at=EXCLUDED.measured_at, accuracy=EXCLUDED.accuracy, recorded_at=now()
       WHERE driver_locations.measured_at IS NULL OR driver_locations.measured_at < EXCLUDED.measured_at RETURNING *`,
      [driverId, latitude, longitude, heading ?? null, measuredAt, accuracy]);
    if (!rows[0]) return;
    await getPool().query(`UPDATE drivers SET current_latitude=$2, current_longitude=$3,
      current_heading=COALESCE($4,current_heading), last_online_at=now() WHERE id=$1`,
      [driverId,latitude,longitude,heading ?? null]);
    await getPool().query(`INSERT INTO ride_route_points (ride_id,latitude,longitude,recorded_at)
      SELECT id,$2,$3,$4 FROM rides WHERE driver_id=$1 AND status=ANY($5)`,
      [driverId,latitude,longitude,measuredAt,DRIVER_ACTIVE_RIDE_STATUSES]);
    afterCommit(() => recordSample(driverId, { latitude, longitude, heading }, measuredAt.getTime()));
  });
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

// Driver actions use the same lock order as dispatch, and re-check ownership.
async function ownedAction(driverId, rideId, work) {
  return transaction(async (db) => {
    await db.query('SELECT id FROM drivers WHERE id=$1 FOR UPDATE', [driverId]);
    const row = (await db.query('SELECT driver_id FROM rides WHERE id=$1 FOR UPDATE',[rideId])).rows[0];
    if (!row || row.driver_id !== driverId) throw new ApiError(404, 'No assigned ride found.');
    return work();
  });
}

async function acceptRide(driverId, rideId) {
  return ownedAction(driverId, rideId, () => acceptRideLocked(driverId, rideId));
}
async function acceptRideLocked(driverId, rideId) {
  const ride = await getActiveRideById(driverId, rideId);
  if (!ride) throw new ApiError(404, 'No assigned ride found.');
  if (ride.status !== 'driverAssigned') {
    throw new ApiError(400, 'Acceptance only applies to a newly assigned ride.');
  }
  await transitionRide(rideId, 'driverArriving', { changedBy: 'driver' });
  afterCommit(() => pushNotification(ride.passenger_id, {
    title: 'Driver on the way',
    body: `${ride.driver_name} is heading to your pickup point.`,
    type: 'ride',
    rideId,
  }));
}

/** Driver declines a newly assigned ride (the timed-offer overlay's "Decline"
 * action, which our matcher never had — it only ever offered a single
 * silently-accepted assignment before this). The ride goes back to
 * searchingDriver and is immediately re-matched against another driver;
 * this driver is released back to the active pool. */
async function declineRide(driverId, rideId) {
  return ownedAction(driverId, rideId, () => declineRideLocked(driverId, rideId));
}
async function declineRideLocked(driverId, rideId) {
  const ride = await getActiveRideById(driverId, rideId);
  if (!ride) throw new ApiError(404, 'No assigned ride found.');
  if (ride.status !== 'driverAssigned') {
    throw new ApiError(400, 'Only a newly assigned ride can be declined.');
  }
  await getPool().query(
    `UPDATE rides SET driver_id = NULL, driver_name = NULL, driver_phone = NULL,
       driver_rating = NULL, driver_vehicle_model = NULL, driver_vehicle_color = NULL,
       driver_license_plate = NULL, pool_group_id = NULL, accepted_at = NULL
     WHERE id = $1`,
    [rideId]
  );
  await transitionRide(rideId, 'searchingDriver', { changedBy: 'driver', reason: 'declined' });
  // The re-match below must go to someone else, not straight back to this driver.
  await getPool().query('INSERT INTO ride_declined_drivers (ride_id, driver_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [rideId, driverId]);
  await releaseDriver(driverId);
  afterCommit(() => matchAndAssign(rideId));
}

async function markArrived(driverId, rideId) {
  return ownedAction(driverId, rideId, () => markArrivedLocked(driverId, rideId));
}
async function markArrivedLocked(driverId, rideId) {
  const ride = await getActiveRideById(driverId, rideId);
  if (!ride) throw new ApiError(404, 'No assigned ride found.');
  if (ride.status !== 'driverArriving') {
    throw new ApiError(400, 'Arrival can only be reported while on the way.');
  }
  await transitionRide(rideId, 'driverArrived', { changedBy: 'driver' });

  const pin = await generateRidePin(rideId);
  afterCommit(() => pushNotification(ride.passenger_id, {
    title: 'Your driver has arrived',
    body: `Meet ${ride.driver_name}. Your ride PIN is ${pin}.`,
    type: 'ride',
    rideId,
  }));
  // Never return the code to the driver who must request it from the rider.
}

async function verifyPin(driverId, rideId, pin) {
  const result = await ownedAction(driverId, rideId, () => verifyPinLocked(driverId, rideId, pin));
  if (result instanceof ApiError) throw result;
}
async function verifyPinLocked(driverId, rideId, pin) {
  if (!/^\d{4}$/.test(String(pin))) throw new ApiError(400, 'Enter the 4-digit ride PIN.');
  const ride = await getActiveRideById(driverId, rideId);
  if (!ride) throw new ApiError(404, 'No assigned ride found.');
  if (ride.status !== 'driverArrived') {
    throw new ApiError(400, 'The PIN can only be verified after arrival.');
  }
  const { rows: attempts } = await getPool().query(
    `UPDATE rides SET pin_attempts=pin_attempts+1
       WHERE id=$1 AND status='driverArrived' AND pin_attempts<5 RETURNING pin_attempts`,
    [rideId]
  );
  if (!attempts[0]) throw new ApiError(429, 'Too many PIN attempts. Contact support.');
  if (!ride.ride_pin_hash || !(await bcrypt.compare(String(pin), ride.ride_pin_hash))) {
    return new ApiError(400, 'Incorrect PIN.');
  }
  await transitionRide(rideId, 'pinVerified', { changedBy: 'driver' });
  // Entering the correct PIN is exactly the "start trip" action, so the ride
  // immediately moves in-progress.
  await transitionRide(rideId, 'inProgress', { changedBy: 'driver' });
  afterCommit(() => pushNotification(ride.passenger_id, {
    title: 'Ride started',
    body: 'Your driver started the trip. Buckle up!',
    type: 'ride',
    rideId,
  }));
}

/** Ends one passenger's leg of the trip: final fare appears, a payment is
 * created and charged. In a pooled ride the driver keeps driving the other
 * passenger(s) still aboard — only this ride moves to payment. */
async function completeTrip(driverId, rideId) {
  const prepared = await transaction(async () => {
    const ride = (await getPool().query('SELECT * FROM rides WHERE id=$1 AND driver_id=$2 FOR UPDATE', [rideId,driverId])).rows[0];
    if (!ride) throw new ApiError(404, 'No assigned ride found.');
    if (!['inProgress','arrived','paymentPending','completed'].includes(ride.status)) throw new ApiError(400, 'Only an in-progress ride can be completed.');
    if (ride.status === 'inProgress') {
      await getPool().query('UPDATE rides SET final_fare=estimated_fare WHERE id=$1', [rideId]);
      await transitionRide(rideId, 'arrived', { changedBy: 'driver' });
    }
    if (ride.status === 'inProgress' || ride.status === 'arrived') await transitionRide(rideId, 'paymentPending', { changedBy: 'payments' });
    const current = (await getPool().query('SELECT * FROM rides WHERE id=$1', [rideId])).rows[0];
    return { ride: current, payment: await createPaymentForRide(current) };
  });
  // The passenger is out of the car: the driver can take the next ride (unless
  // other pooled passengers are still aboard). Waiting for the payment to
  // settle left a driver unable to work whenever mobile money stalled.
  await releaseDriver(driverId);
  const payment = prepared.ride.status === 'completed' ? prepared.payment : await chargePayment(prepared.payment, prepared.ride);
  const ride = (await getPool().query('SELECT * FROM rides WHERE id=$1', [rideId])).rows[0];
  return { ride, payment };
}

/** Driver-initiated cancellation of an already-accepted ride (before pickup
 * is confirmed) — the passenger-side cancelRide() in rideService.js only
 * ever checked passenger ownership, so a driver had no way to bail on a
 * no-show passenger once they'd accepted. Mirrors that function's shape. */
async function cancelRideAsDriver(driverId, rideId, reason) {
  return ownedAction(driverId, rideId, () => cancelRideAsDriverLocked(driverId, rideId, reason));
}
async function cancelRideAsDriverLocked(driverId, rideId, reason) {
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
  afterCommit(() => pushNotification(ride.passenger_id, {
    title: 'Ride cancelled',
    body: 'Your driver cancelled this ride. No fare was charged.',
    type: 'ride',
    rideId,
  }));
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
