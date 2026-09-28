const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const { getPool } = require('../db');
const { config } = require('../config');
const { ApiError } = require('../utils/asyncHandler');
const { fareForRide } = require('./pricing');
const { transitionRide, loadRide } = require('./rideStateMachine');
const {
  findNearestDriver,
  findPoolableRide,
  assignDriver,
  assignToPool,
  releaseDriver,
} = require('./driverMatcher');
const { publishRideEvent } = require('./rideEvents');
const { pushNotification } = require('./notify');
const { pushDriverNotification } = require('./driverNotify');

const BOOKABLE_STATUSES = new Set([
  'searchingDriver',
  'driverAssigned',
  'driverArriving',
  'driverArrived',
]);

/**
 * Server-authoritative upfront fare over the real road route (see
 * services/pricing.js). The client never supplies fares — only coordinates,
 * vehicle, ride type and optionally the id of a quote it was shown.
 */
async function computeEstimate(vehicle, pickup, destination, rideType, quoteId) {
  const { distanceKm, durationMinutes, fare } = await fareForRide(
    vehicle,
    pickup,
    destination,
    rideType,
    quoteId
  );
  return { distanceKm, durationMinutes, estimatedFare: fare.total, fare };
}

/** Validates and applies an optional promotion to a fare. Returns the adjusted
 * fare (not the gross) plus the discount amount, or null discount when none. */
async function applyPromotion(passengerId, code, grossFare) {
  if (!code) return { discountedFare: grossFare, discount: 0, promotion: null };
  const { rows } = await getPool().query(
    `SELECT * FROM promotions
      WHERE code = $1 AND active = TRUE AND uses_count < COALESCE(max_uses, 2147483647)
        AND (starts_at IS NULL OR starts_at <= now())
        AND (ends_at IS NULL OR ends_at >= now())`,
    [String(code).trim().toUpperCase()]
  );
  const promo = rows[0];
  if (!promo) throw new ApiError(400, 'This promo code is invalid or has expired.');
  if (grossFare < promo.min_fare) {
    throw new ApiError(400, `This promo applies to trips from RWF ${promo.min_fare}.`);
  }
  const raw =
    promo.discount_type === 'percent'
      ? (grossFare * promo.discount_value) / 100
      : promo.discount_value;
  const discount = promo.max_discount ? Math.min(raw, promo.max_discount) : raw;
  const discountedFare = Math.max(0, grossFare - discount);
  await getPool().query('UPDATE promotions SET uses_count = uses_count + 1 WHERE id = $1', [
    promo.id,
  ]);
  return { discountedFare, discount, promotion: promo };
}

async function createRide(passengerId, body) {
  const {
    pickup,
    destination,
    vehicleId,
    paymentMethodId,
    rideType,
    rideNote,
    promotionCode,
    scheduledFor,
    quoteId,
  } = body || {};

  if (
    !pickup || !destination || !vehicleId || !paymentMethodId ||
    typeof pickup.latitude !== 'number' || typeof pickup.longitude !== 'number' ||
    typeof destination.latitude !== 'number' || typeof destination.longitude !== 'number'
  ) {
    throw new ApiError(400, 'Pickup, destination (with coordinates), vehicle and payment method are required.');
  }
  const type = rideType === 'shared' ? 'shared' : 'private';

  // Duplicate-request guard: a passenger with a live (non terminal) ride
  // must not be able to stack another booking — the driver matcher, simulator
  // and wallet flows all assume at most one active ride per passenger.
  const { rows: activeRows } = await getPool().query(
    `SELECT id FROM rides
      WHERE passenger_id = $1
        AND status NOT IN ('completed', 'cancelled')
      LIMIT 1`,
    [passengerId]
  );
  if (activeRows[0]) {
    throw new ApiError(409, 'You already have an active ride. Complete or cancel it before requesting another.');
  }

  const { rows: vehicleRows } = await getPool().query('SELECT * FROM vehicles WHERE id = $1', [
    vehicleId,
  ]);
  const vehicle = vehicleRows[0];
  if (!vehicle) throw new ApiError(400, 'Unknown vehicle.');

  const { distanceKm, durationMinutes, estimatedFare, fare } = await computeEstimate(
    vehicle,
    pickup,
    destination,
    type,
    quoteId
  );

  const { discountedFare, discount, promotion } = await applyPromotion(
    passengerId,
    promotionCode,
    estimatedFare
  );

  let status = 'searchingDriver';
  if (scheduledFor && new Date(scheduledFor).getTime() > Date.now() + 60 * 1000) {
    status = 'scheduled';
  }

  const { rows } = await getPool().query(
    `INSERT INTO rides (
       passenger_id, vehicle_id, ride_type,
       pickup_address, pickup_latitude, pickup_longitude,
       dest_address, dest_latitude, dest_longitude,
       distance_km, duration_minutes, payment_method, estimated_fare,
       status, ride_note, promotion_id, applied_discount, scheduled_for,
       fare_breakdown, surge_multiplier
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
     RETURNING *`,
    [
      passengerId,
      vehicle.id,
      type,
      pickup.address || 'Pickup',
      pickup.latitude,
      pickup.longitude,
      destination.address || 'Destination',
      destination.latitude,
      destination.longitude,
      distanceKm,
      durationMinutes,
      paymentMethodId,
      discountedFare,
      status,
      rideNote || null,
      promotion ? promotion.id : null,
      discount || null,
      status === 'scheduled' ? new Date(scheduledFor).toISOString() : null,
      JSON.stringify(fare),
      fare.surgeMultiplier,
    ]
  );
  const ride = rows[0];

  await getPool().query(
    `INSERT INTO ride_status_history (ride_id, from_status, to_status, changed_by)
     VALUES ($1, NULL, $2, 'passenger')`,
    [ride.id, status]
  );

  await pushNotification(passengerId, {
    title: status === 'scheduled' ? 'Ride scheduled' : 'Looking for your driver',
    body:
      status === 'scheduled'
        ? `Your ride is booked for ${new Date(scheduledFor).toLocaleString()}.`
        : 'Hang tight — we are finding the nearest available driver.',
    type: 'ride',
    rideId: ride.id,
  });

  publishRideEvent(ride.id, { type: 'status', status, rideId: ride.id });

  if (status === 'searchingDriver') {
    // Matching is deliberately not awaited — the search is asynchronous and
    // the passenger can cancel at any moment.
    matchAndAssign(ride.id).catch((err) =>
      console.error('[rides] matching failed:', err)
    );
  }

  return ride;
}

/** Fired each time a ride enters the searching state (initial + scheduled).
 *
 * A shared ride first tries to join an already-driving pool going the same
 * way (real pooling — the driver picks up more than one passenger); only
 * when no such pool exists does it fall back to the normal nearest-free-
 * driver search, becoming a new pool that later shared requests can join. */
async function matchAndAssign(rideId) {
  const ride = await loadRide(rideId);
  if (!ride || ride.status !== 'searchingDriver') return;

  let assigned = null;
  let driverName = null;
  let pooled = false;

  const poolMatch = await findPoolableRide(ride);
  if (poolMatch) {
    assigned = await assignToPool(rideId, poolMatch);
    if (assigned) {
      driverName = assigned.driver_name;
      pooled = true;
    }
  }

  if (!assigned) {
    const result = await findNearestDriver(ride);
    if (!result) return; // stays searchingDriver — client sees an honest wait
    assigned = await assignDriver(rideId, result.driver);
    if (!assigned) return;
    driverName = result.driver.full_name;
  }

  try {
    await transitionRide(rideId, 'driverAssigned', { changedBy: 'system' });
  } catch (err) {
    // The passenger cancelled while we were assigning: don't leave the
    // driver marked busy for a ride that no longer exists.
    await releaseDriver(assigned.driver_id);
    throw err;
  }
  const updated = await loadRide(rideId);

  await pushNotification(ride.passenger_id, {
    title: 'Driver on the way',
    body: pooled
      ? `${driverName} accepted your shared ride — you'll share the trip with another passenger.`
      : `${driverName} accepted your ride.`,
    type: 'ride',
    rideId: ride.id,
  });

  // Let the passenger already in the vehicle know they now have company.
  if (pooled) {
    await pushNotification(poolMatch.anchorRide.passenger_id, {
      title: 'Another passenger joined your ride',
      body: 'Your driver is picking up another passenger heading the same way.',
      type: 'ride',
      rideId: poolMatch.anchorRide.id,
    });
    publishRideEvent(poolMatch.anchorRide.id, {
      type: 'poolJoined',
      rideId: poolMatch.anchorRide.id,
    });
  }

  publishRideEvent(ride.id, { type: 'driverAssigned', rideId: ride.id });
  return updated;
}

async function cancelRide(passengerId, rideId, reason) {
  const ride = await loadRide(rideId);
  if (!ride || ride.passenger_id !== passengerId) throw new ApiError(404, 'Ride not found.');

  // A completed physical trip cannot be cancelled while collection is in
  // flight: a provider can settle after the cancellation request arrives.
  const canCancel = [
    'scheduled',
    'searchingDriver',
    'driverAssigned',
    'driverArriving',
    'driverArrived',
  ].includes(ride.status);
  if (!canCancel) {
    throw new ApiError(400, 'This ride can no longer be cancelled.');
  }
  await getPool().query(
    `UPDATE rides SET cancellation_reason = $1, cancelled_by = 'passenger' WHERE id = $2`,
    [reason || null, rideId]
  );
  const updated = await transitionRide(rideId, 'cancelled', {
    changedBy: 'passenger',
    reason: reason || null,
  });
  if (updated.driver_id) {
    await releaseDriver(updated.driver_id);
    // The driver had already been assigned/en route — they need to know the
    // trip is off, not just silently lose it off their active-rides list on
    // their next poll (drivers.routes.js's GET /rides/active has no other
    // way to distinguish "cancelled" from "never existed").
    await pushDriverNotification(updated.driver_id, {
      title: 'Ride cancelled',
      body: 'The rider cancelled this trip. No action needed.',
      type: 'ride',
      rideId,
    });
  }
  await pushNotification(passengerId, {
    title: 'Ride cancelled',
    body: 'Your ride was cancelled. No fare was charged.',
    type: 'ride',
    rideId,
  });
  return updated;
}

/** Destination changes are allowed while the driver has not picked you up. */
async function changeDestination(passengerId, rideId, destination) {
  const ride = await loadRide(rideId);
  if (!ride || ride.passenger_id !== passengerId) throw new ApiError(404, 'Ride not found.');
  if (!BOOKABLE_STATUSES.has(ride.status)) {
    throw new ApiError(400, 'The destination can only be changed before pickup.');
  }
  if (
    typeof destination?.latitude !== 'number' ||
    typeof destination?.longitude !== 'number'
  ) {
    throw new ApiError(400, 'Destination coordinates are required.');
  }

  const { rows: vehicleRows } = await getPool().query(
    'SELECT * FROM vehicles WHERE id = $1',
    [ride.vehicle_id]
  );
  const { distanceKm, durationMinutes, estimatedFare, fare } = await computeEstimate(
    vehicleRows[0],
    { latitude: ride.pickup_latitude, longitude: ride.pickup_longitude },
    destination,
    ride.ride_type
  );

  // A previously applied promotion keeps the ride's own discount; it is not
  // consumed a second time on an itinerary change.
  const settledFare = Math.max(0, estimatedFare - (ride.applied_discount || 0));

  const { rows } = await getPool().query(
    `UPDATE rides SET
       dest_address = $1, dest_latitude = $2, dest_longitude = $3,
       distance_km = $4, duration_minutes = $5, estimated_fare = $6,
       fare_breakdown = $8, surge_multiplier = $9
     WHERE id = $7 RETURNING *`,
    [
      destination.address || 'Changed destination',
      destination.latitude,
      destination.longitude,
      distanceKm,
      durationMinutes,
      settledFare,
      rideId,
      JSON.stringify(fare),
      fare.surgeMultiplier,
    ]
  );
  await getPool().query(
    `INSERT INTO ride_events (ride_id, event_type, payload)
     VALUES ($1, 'destinationChanged', $2)`,
    [rideId, JSON.stringify({ distanceKm, durationMinutes, estimatedFare })]
  );
  publishRideEvent(rideId, { type: 'destinationChanged', rideId });
  return rows[0];
}

/** Generates the 4-digit ride PIN shown to the passenger at driver arrival. */
async function generateRidePin(rideId) {
  const pin = String(crypto.randomInt(0, 10000)).padStart(config.ridePinLength, '0');
  const pinHash = await bcrypt.hash(pin, 8);
  await getPool().query('UPDATE rides SET ride_pin = $1, ride_pin_hash = $2, pin_attempts=0 WHERE id = $3', [
    pin,
    pinHash,
    rideId,
  ]);
  publishRideEvent(rideId, { type: 'pinGenerated', rideId });
  return pin;
}

async function rateRide(passengerId, rideId, rating, comment) {
  const value = Number(rating);
  if (!Number.isInteger(value) || value < 1 || value > 5) {
    throw new ApiError(400, 'Rating must be an integer from 1 to 5.');
  }
  const ride = await loadRide(rideId);
  if (!ride || ride.passenger_id !== passengerId) throw new ApiError(404, 'Ride not found.');
  if (ride.status !== 'completed') {
    throw new ApiError(400, 'Only completed rides can be rated.');
  }

  const existing = await getPool().query('SELECT id FROM ratings WHERE ride_id = $1', [rideId]);
  if (existing.rows[0]) throw new ApiError(400, 'This ride has already been rated.');

  await getPool().query(
    `INSERT INTO ratings (ride_id, passenger_id, driver_id, rating, comment)
     VALUES ($1,$2,$3,$4,$5)`,
    [rideId, passengerId, ride.driver_id, value, comment || null]
  );
  await getPool().query(
    'UPDATE rides SET rating = $1, rating_comment = $2 WHERE id = $3',
    [value, comment || null, rideId]
  );
  if (ride.driver_id) {
    const agg = await getPool().query(
      `SELECT AVG(rating)::double precision AS avg FROM ratings WHERE driver_id = $1`,
      [ride.driver_id]
    );
    await getPool().query('UPDATE drivers SET rating = $1 WHERE id = $2', [
      agg.rows[0].avg,
      ride.driver_id,
    ]);
  }
  return { ...ride, rating: value, rating_comment: comment || null };
}

/** Marks a booked scheduled ride as searchable (invoked by the scheduler). */
async function activateScheduledRide(rideId) {
  const ride = await loadRide(rideId);
  if (!ride || ride.status !== 'scheduled') return null;
  await transitionRide(rideId, 'searchingDriver', { changedBy: 'scheduler' });
  return matchAndAssign(rideId);
}

module.exports = {
  computeEstimate,
  applyPromotion,
  createRide,
  cancelRide,
  changeDestination,
  generateRidePin,
  rateRide,
  activateScheduledRide,
  matchAndAssign,
};
