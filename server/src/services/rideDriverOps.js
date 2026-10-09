const bcrypt = require('bcryptjs');

const { getPool } = require('../db');
const { ApiError } = require('../utils/asyncHandler');
const { transitionRide } = require('./rideStateMachine');
const { generateRidePin, generatePairCode, changeDestination, matchAndAssign } = require('./rideService');
const { pushNotification } = require('./notify');
const { pushDriverNotification } = require('./driverNotify');
const { createPaymentForRide, chargePayment } = require('./payments');
const { toE164 } = require('./otpSender');
const { recordSample } = require('./driverTrails');
const { releaseDriver } = require('./driverMatcher');
const { planStops } = require('./poolPlanner');
const { config } = require('../config');
const { publishRideEvent } = require('./rideEvents');
const { isValidCoordinate, assessLocationSample } = require('./maps/geo');

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
       -- only a rider position reported in the last two minutes is shown as live
       LEFT JOIN passenger_locations pl ON pl.passenger_id = r.passenger_id
         AND pl.recorded_at > now() - interval '120 seconds'
      WHERE r.driver_id = $1
        AND r.status = ANY($2)
        -- A finished trip awaiting a digital payment is no longer the
        -- driver's to act on; only a cash fare still needs their confirmation.
        AND NOT (r.status = 'paymentPending' AND r.payment_method != 'cash')
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
       -- only a rider position reported in the last two minutes is shown as live
       LEFT JOIN passenger_locations pl ON pl.passenger_id = r.passenger_id
         AND pl.recorded_at > now() - interval '120 seconds'
      WHERE r.id = $1 AND r.driver_id = $2 AND r.status = ANY($3)`,
    [rideId, driverId, DRIVER_ACTIVE_RIDE_STATUSES]
  );
  return rows[0] || null;
}

/**
 * The driver's remaining stops in the order to serve them — every pickup and
 * drop-off across all rides they are carrying. A private trip is simply its
 * own two stops; a shared trip interleaves riders by road time.
 */
async function getStopPlan(driverId) {
  const rides = (await getActiveRides(driverId)).filter((r) => r.status !== 'paymentPending');
  if (!rides.length) return { stops: [], totalSeconds: 0 };
  const { rows } = await getPool().query(
    'SELECT current_latitude, current_longitude FROM drivers WHERE id = $1',
    [driverId]
  );
  const here = rows[0]?.current_latitude != null
    ? { latitude: rows[0].current_latitude, longitude: rows[0].current_longitude }
    : { latitude: rides[0].pickup_latitude, longitude: rides[0].pickup_longitude };
  const plan = await planStops(here, rides);
  const byId = new Map(rides.map((r) => [r.id, r]));
  return {
    totalSeconds: plan.totalSeconds,
    stops: plan.stops.map((stop) => {
      const ride = byId.get(stop.rideId);
      return {
        type: stop.type,
        rideId: stop.rideId,
        address: stop.address,
        latitude: stop.latitude,
        longitude: stop.longitude,
        etaMinutes: Math.max(1, Math.round(stop.etaSeconds / 60)),
        passengerName: ride.passenger_name,
        seats: ride.seats || 1,
        rideStatus: ride.status,
      };
    }),
  };
}

/**
 * Records a GPS fix reported by the driver's phone — if it can be trusted.
 * The phone is not believed blindly: a fix outside the service area, taken
 * too long ago, too inaccurate, arriving faster than the allowed rate, or
 * implying an impossible jump from the last accepted position is ignored
 * and the previous position stands. Returns { accepted, reason? }.
 *
 * An accepted fix becomes the driver's latest location (with its accuracy,
 * the phone's own timestamp and what the driver was doing), lays a
 * breadcrumb on each ride they are carrying, and is pushed straight to the
 * riders watching those rides.
 */
async function updateDriverLocation(driverId, { latitude, longitude, heading, accuracy, recordedAt } = {}) {
  if (!isValidCoordinate(latitude, longitude)) {
    throw new ApiError(400, 'latitude and longitude are required.', 'INVALID_COORDINATES');
  }
  const now = Date.now();
  const deviceTime = recordedAt == null ? null : new Date(recordedAt).getTime();
  const { rows: last } = await getPool().query(
    `SELECT dl.latitude, dl.longitude, dl.recorded_at, d.status
       FROM drivers d LEFT JOIN driver_locations dl ON dl.driver_id = d.id
      WHERE d.id = $1`,
    [driverId]
  );
  const previous = last[0]?.recorded_at
    ? { latitude: last[0].latitude, longitude: last[0].longitude, at: new Date(last[0].recorded_at).getTime() }
    : null;
  const verdict = assessLocationSample(
    previous,
    { latitude, longitude, accuracy: accuracy == null ? null : Number(accuracy), recordedAt: deviceTime },
    now,
    {
      maxAccuracyMeters: config.driverMaxAccuracyMeters,
      maxSampleAgeSeconds: config.driverMaxSampleAgeSeconds,
      minIntervalMs: config.driverMinUpdateIntervalMs,
    }
  );
  if (!verdict.accepted) return verdict;

  const state = last[0]?.status === 'busy' ? 'on_trip' : last[0]?.status === 'active' ? 'available' : 'offline';
  const cleanHeading = Number.isFinite(Number(heading)) && heading != null ? Number(heading) : null;
  await getPool().query(
    `INSERT INTO driver_locations (driver_id, latitude, longitude, heading, accuracy, device_recorded_at, state, recorded_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7, now())
     ON CONFLICT (driver_id) DO UPDATE SET
       latitude = EXCLUDED.latitude,
       longitude = EXCLUDED.longitude,
       heading = EXCLUDED.heading,
       accuracy = EXCLUDED.accuracy,
       device_recorded_at = EXCLUDED.device_recorded_at,
       state = EXCLUDED.state,
       recorded_at = now()`,
    [driverId, latitude, longitude, cleanHeading, accuracy == null ? null : Number(accuracy),
      // A phone clock running ahead is not trusted as-is.
      deviceTime == null ? null : new Date(Math.min(deviceTime, now)), state]
  );
  await getPool().query(
    `UPDATE drivers SET current_latitude = $2, current_longitude = $3,
       current_heading = COALESCE($4, current_heading), last_online_at = now()
     WHERE id = $1`,
    [driverId, latitude, longitude, cleanHeading]
  );
  recordSample(driverId, { latitude, longitude, heading: cleanHeading });

  // Lay down a breadcrumb for every ride this driver is currently on (a
  // pooled trip can be more than one), and push the new position to each
  // rider watching (GET /api/rides/:id/stream) rather than waiting for them
  // to ask.
  const activeRides = await getActiveRides(driverId);
  for (const activeRide of activeRides) {
    await getPool().query(
      `INSERT INTO ride_route_points (ride_id, latitude, longitude, recorded_at)
       VALUES ($1, $2, $3, now())`,
      [activeRide.id, latitude, longitude]
    );
    publishRideEvent(activeRide.id, {
      type: 'driverLocation',
      serverTime: now,
      location: { latitude, longitude, heading: cleanHeading, accuracy: accuracy ?? null, recordedAt: new Date(now).toISOString() },
    });
  }
  return { accepted: true };
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

/** Driver declines a newly assigned ride (the timed-offer overlay's "Decline"
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
  // Also mint the Pair Ride code the driver shows as a QR for the rider to scan.
  await generatePairCode(rideId);
  await pushNotification(ride.passenger_id, {
    title: 'Your driver has arrived',
    body: `Meet ${ride.driver_name}. Scan their QR to start, or share PIN ${pin}.`,
    type: 'ride',
    rideId,
  });
  // Never return the PIN to the driver who must request it from the rider.
}

/**
 * Pair Ride: the rider scanned (or typed) the driver's code, which verified
 * the car and moved the ride to pinVerified. The driver now taps Start, which
 * this begins — the same transition the PIN path makes, kept as a separate
 * step so the driver confirms before the meter effectively runs.
 */
async function startTrip(driverId, rideId) {
  const ride = await getActiveRideById(driverId, rideId);
  if (!ride) throw new ApiError(404, 'No assigned ride found.');
  if (ride.status === 'inProgress') return; // idempotent: a double tap is harmless
  if (ride.status !== 'pinVerified') {
    throw new ApiError(400, 'The trip can only start once the rider has paired.');
  }
  await transitionRide(rideId, 'inProgress', { changedBy: 'driver' });
  await pushNotification(ride.passenger_id, {
    title: 'Ride started',
    body: 'Your driver started the trip. Buckle up!',
    type: 'ride',
    rideId,
  });
}

/**
 * Pair Ride, rider side: the rider scanned the driver's QR (or typed the
 * code). Verifies it against their arrived ride and moves it to pinVerified,
 * so the driver's Start button unlocks. Guessing is bounded by the route's
 * rate limiter.
 */
async function pairByCode(passengerId, code) {
  const value = String(code || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{8}$/.test(value)) throw new ApiError(400, 'That pairing code is not valid.');
  const { rows } = await getPool().query(
    `SELECT * FROM rides WHERE passenger_id = $1 AND status = 'driverArrived' ORDER BY created_at DESC LIMIT 1`,
    [passengerId]
  );
  const ride = rows[0];
  if (!ride) throw new ApiError(404, 'You have no ride waiting to start. Ask the driver to confirm they have arrived.');
  if (!ride.pair_code || ride.pair_code !== value) {
    throw new ApiError(400, "That code does not match your driver's. Check the screen and try again.");
  }
  await transitionRide(ride.id, 'pinVerified', { changedBy: 'passenger' });
  await pushDriverNotification(ride.driver_id, {
    title: 'Rider paired',
    body: 'Your rider scanned the code. Tap Start to begin the trip.',
    type: 'ride',
    rideId: ride.id,
  });
  const { rows: updated } = await getPool().query('SELECT * FROM rides WHERE id = $1', [ride.id]);
  return updated[0];
}

async function verifyPin(driverId, rideId, pin) {
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

  // The fare is not charged automatically. The driver now collects it: they
  // ask the passenger for their mobile-money number and send the MTN/Airtel
  // prompt (chargeRide below), or confirm cash. The driver stays on this ride
  // until the money is in.
  const { rows } = await getPool().query('SELECT * FROM rides WHERE id = $1', [rideId]);
  return { ride: rows[0] };
}

/** MTN (078/079) or Airtel (072/073) Rwandan number -> the matching method. */
function momoMethodFor(phone) {
  const digits = toE164(phone).replace(/\D/g, '');
  const prefix = digits.startsWith('250') ? digits.slice(3, 5) : '';
  if (['78', '79'].includes(prefix)) return 'mtn_momo';
  if (['72', '73'].includes(prefix)) return 'airtel_money';
  return null;
}

/**
 * The driver collects the fare by mobile money: they type the passenger's
 * number, and this sends the MTN/Airtel prompt to it. The passenger approves
 * on their phone; once the provider confirms, the ride settles and completes.
 */
async function chargeRide(driverId, rideId, phone) {
  const ride = await getActiveRideById(driverId, rideId);
  if (!ride) throw new ApiError(404, 'No assigned ride found.');
  if (ride.status !== 'paymentPending') {
    throw new ApiError(400, 'You can request payment only after completing the trip.');
  }
  const method = momoMethodFor(phone);
  if (!method) throw new ApiError(400, 'Enter a valid MTN (078/079) or Airtel (072/073) number.');
  const e164 = toE164(phone);
  await getPool().query('UPDATE rides SET payment_method = $2, payment_phone = $3 WHERE id = $1', [rideId, method, e164]);
  const { rows } = await getPool().query('SELECT * FROM rides WHERE id = $1', [rideId]);
  const payment = await createPaymentForRide(rows[0]);
  const charged = await chargePayment(payment, rows[0]);
  await releaseDriver(driverId);
  await pushNotification(ride.passenger_id, {
    title: 'Approve your payment',
    body: `Approve the ${method === 'mtn_momo' ? 'MTN MoMo' : 'Airtel Money'} prompt on your phone to pay for your trip.`,
    type: 'payment',
    rideId,
  });
  return { payment: charged || payment, method };
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
  getStopPlan,
  updateDriverLocation,
  acceptRide,
  declineRide,
  markArrived,
  verifyPin,
  startTrip,
  pairByCode,
  completeTrip,
  chargeRide,
  cancelRideAsDriver,
  changeDestinationAsDriver,
};
