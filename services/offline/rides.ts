// Ride endpoints of the on-device backend, passenger side: quotes, booking,
// tracking, cancelling, payment and rating. A booked ride is played forward by
// the simulator in sim.ts (a fictional driver found, driving over, waiting,
// driving you), evaluated lazily from the clock every time the ride is read.

import {
  iso,
  randomDigits,
  uid,
  VEHICLES,
  walletBalance,
  type Db,
  type DriverRec,
  type PaymentRec,
  type RideRec,
  type RideStatus,
} from './db';
import { alerts } from './alerts';
import { HttpError, created, noContent, route, type Ctx } from './http';
import { formatRwf, notify, parseLatLng, paymentToJson, rideToJson } from './common';
import { SMS_BRAND, sendSms, smsEnabled } from './sms';
import { buildRoute, seeded, type LatLng } from './geo';
import { lockedFare, priceFor, quoteKey, rememberQuote, routeSource, summariseTrip, vehicleById } from './pricing';
import { ensureRoad } from './roads';
import {
  ambientCars,
  approachStartFor,
  carPositionAt,
  carTrail,
  driverInfoFor,
  forgetRidePaths,
  pickupEtas,
  ridePathsOf,
  statusAt,
  timeline,
  TIMING,
  tripDurationMs,
} from './sim';

export const DRIVER_COMMISSION = 0.15;
const BOOKABLE = ['cash', 'mtn_momo', 'airtel_money', 'wallet', 'card'];
const ORDER: RideStatus[] = [
  'scheduled',
  'searchingDriver',
  'driverAssigned',
  'driverArriving',
  'driverArrived',
  'pinVerified',
  'inProgress',
  'paymentPending',
];
const CANCELLABLE = new Set<RideStatus>(['scheduled', 'searchingDriver', 'driverAssigned', 'driverArriving', 'driverArrived']);
const isTerminal = (s: RideStatus) => s === 'completed' || s === 'cancelled';

const point = (p: { latitude?: number; longitude?: number }): LatLng => ({ latitude: p.latitude as number, longitude: p.longitude as number });

// ------------------------------------------------------- lifecycle engine

function notifyOnce(db: Db, ride: RideRec, key: string, title: string, body: string, at: number, type = 'ride'): void {
  if (!ride.passengerId || ride.notified.includes(key)) return;
  ride.notified.push(key);
  notify(db, 'passenger', ride.passengerId, { title, body, type, rideId: ride.id, at });
}

/** Texts the passenger about their ride, once per milestone (never for stale catch-up). */
function textPassenger(db: Db, ride: RideRec, key: string, text: string): void {
  if (!ride.passengerId || ride.notified.includes(key) || !smsEnabled('ride')) return;
  const passenger = db.passengers.find((p) => p.id === ride.passengerId);
  if (!passenger) return;
  ride.notified.push(key);
  void sendSms('ride', passenger.phone, `${SMS_BRAND}: ${text}`);
}

const STALE_MS = 2 * 60 * 1000;

function enterStatus(db: Db, ride: RideRec, status: RideStatus, now: number): void {
  const sim = ride.sim!;
  const tl = timeline(sim);
  if (status === 'driverAssigned') {
    ride.driver = driverInfoFor(sim.seed, ride.vehicleId);
    ride.acceptedAt = iso(tl.tAssign);
    notifyOnce(
      db, ride, 'driverAssigned', 'Driver found',
      `${ride.driver.name} (${ride.driver.vehicleColor} ${ride.driver.vehicleModel}, ${ride.driver.licensePlate}) is on the way.`,
      tl.tAssign
    );
    if (now - tl.tAssign < STALE_MS) {
      textPassenger(
        db, ride, 'sms:driverAssigned',
        `${ride.driver.name} (${ride.driver.vehicleColor} ${ride.driver.vehicleModel}, ${ride.driver.licensePlate}) is on the way. Your trip PIN is ${ride.pin}.`
      );
    }
  } else if (status === 'driverArrived') {
    ride.arrivedAt = iso(tl.tArrive);
    notifyOnce(db, ride, 'driverArrived', 'Your driver has arrived', `Give your driver the trip PIN ${ride.pin} to start the trip.`, tl.tArrive);
  } else if (status === 'inProgress') {
    ride.startedAt = iso(tl.tStart);
    notifyOnce(db, ride, 'inProgress', 'Trip started', `On the way to ${ride.destination.address}.`, tl.tStart);
  } else if (status === 'paymentPending') {
    ride.finalFare = ride.estimatedFare;
    notifyOnce(db, ride, 'paymentPending', "You've arrived", `Pay ${formatRwf(ride.estimatedFare)} to finish your trip.`, tl.tEnd, 'payment');
  }
  ride.status = status;
}

/** Brings a passenger-booked ride up to date with the clock. */
export function refreshRide(db: Db, ride: RideRec, now: number): RideRec {
  if (ride.source !== 'passenger' || !ride.sim || isTerminal(ride.status)) return ride;
  if (ride.status !== 'paymentPending') {
    const target = ORDER.indexOf(statusAt(ride.sim, now));
    let current = ORDER.indexOf(ride.status);
    while (current < target) {
      current += 1;
      enterStatus(db, ride, ORDER[current], now);
    }
  }
  if (ride.status === 'paymentPending') {
    const cash = latestPayment(db, ride.id);
    if (cash && cash.method === 'cash' && cash.status === 'pending' && cash.cashConfirmAt != null && cash.cashConfirmAt <= now) {
      settlePayment(db, ride, cash, now);
    }
  }
  return ride;
}

export function latestPayment(db: Db, rideId: string): PaymentRec | undefined {
  return db.payments.filter((p) => p.rideId === rideId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}

// ------------------------------------------------------------- payments

function newPayment(db: Db, ride: RideRec, method: string, now: number): PaymentRec {
  const payment: PaymentRec = {
    id: uid('pay', db),
    rideId: ride.id,
    passengerId: ride.passengerId,
    driverId: ride.driverId,
    amount: ride.finalFare ?? ride.estimatedFare,
    method,
    status: 'pending',
    state: 'pending',
    provider: method === 'cash' ? null : 'offline-demo',
    reference: `PAY-${randomDigits(8)}`,
    createdAt: iso(now),
    updatedAt: iso(now),
    cashConfirmAt: null,
  };
  db.payments.push(payment);
  return payment;
}

/** Marks the payment paid, completes the ride and credits the driver (if a real driver account drove it). */
export function settlePayment(db: Db, ride: RideRec, payment: PaymentRec, now: number): void {
  payment.status = 'succeeded';
  payment.state = 'succeeded';
  payment.updatedAt = iso(now);
  payment.cashConfirmAt = null;
  ride.status = 'completed';
  ride.completedAt = iso(now);
  ride.finalFare = ride.finalFare ?? ride.estimatedFare;
  if (ride.passengerId) {
    notify(db, 'passenger', ride.passengerId, {
      title: 'Trip completed',
      body: `Your trip is complete. Fare: ${formatRwf(payment.amount)}.`,
      type: 'payment',
      rideId: ride.id,
      at: now,
    });
    textPassenger(db, ride, 'sms:completed', `trip completed. ${formatRwf(payment.amount)} paid by ${payment.method.replace('_', ' ')}. Thank you for riding!`);
  }
  if (ride.driverId) creditDriver(db, ride, payment, now);
}

const RIDER_COMMENTS = ['Great driver, very polite.', 'Smooth ride, thank you!', null, 'Arrived quickly.', null, 'Friendly and safe driving.'];

function creditDriver(db: Db, ride: RideRec, payment: PaymentRec, now: number): void {
  const driver = db.drivers.find((d) => d.id === ride.driverId);
  if (!driver) return;
  const gross = payment.amount;
  const commission = Math.round(gross * DRIVER_COMMISSION * 100) / 100;
  const net = Math.round((gross - commission) * 100) / 100;
  db.earnings.push({
    id: uid('ern', db),
    driverId: driver.id,
    rideId: ride.id,
    grossAmount: gross,
    commission,
    netAmount: net,
    paymentMethod: payment.method,
    status: 'settled',
    pickupAddress: ride.pickup.address,
    destAddress: ride.destination.address,
    distanceKm: ride.distanceKm,
    rideType: ride.rideType,
    createdAt: iso(now),
    settledAt: iso(now),
  });
  driver.totalTrips += 1;
  releaseDriver(db, driver, now);
  notify(db, 'driver', driver.id, {
    title: 'Trip completed',
    body: `You earned ${formatRwf(net)} from ${ride.riderName ?? 'your rider'}.`,
    type: 'payment',
    rideId: ride.id,
    at: now,
  });
  // The simulated rider leaves a rating, so the ratings screen is not empty.
  const rnd = seeded(`rating:${ride.id}`);
  db.ratings.push({
    id: uid('rtg', db),
    driverId: driver.id,
    rideId: ride.id,
    rating: rnd() < 0.75 ? 5 : 4,
    comment: RIDER_COMMENTS[Math.floor(rnd() * RIDER_COMMENTS.length)],
    passengerName: ride.riderName ?? 'Passenger',
    createdAt: iso(now),
  });
  const mine = db.ratings.filter((r) => r.driverId === driver.id);
  driver.rating = Math.round((mine.reduce((s, r) => s + r.rating, 0) / mine.length) * 10) / 10;
}

/** Frees a driver after a trip / cancellation so the next simulated request can arrive. */
export function releaseDriver(db: Db, driver: DriverRec, now: number): void {
  // A driver pooling shared riders stays busy until the last passenger is done.
  const carrying = db.rides.some(
    (r) => r.driverId === driver.id && ['driverArriving', 'driverArrived', 'pinVerified', 'inProgress', 'paymentPending'].includes(r.status)
  );
  if (driver.status === 'busy' && !carrying) driver.status = 'active';
  driver.nextOfferAt = now + TIMING.offerGapMs;
}

/** Runs the payment for a ride that is awaiting it, by the ride's chosen method. */
function chargePayment(db: Db, ride: RideRec, payment: PaymentRec, now: number): void {
  if (payment.method === 'cash') {
    payment.status = 'pending';
    payment.state = 'awaiting_cash';
    // A simulated driver collects the cash; a real driver account confirms it in their app.
    if (ride.source === 'passenger') payment.cashConfirmAt = now + TIMING.cashConfirmMs;
    return;
  }
  if (payment.method === 'wallet' && ride.passengerId) {
    if (walletBalance(db, ride.passengerId) < payment.amount) {
      payment.status = 'failed';
      payment.state = 'failed';
      payment.updatedAt = iso(now);
      notify(db, 'passenger', ride.passengerId, {
        title: 'Payment failed',
        body: 'Your FEM Wallet balance is too low. Top up, or pay in cash.',
        type: 'payment',
        rideId: ride.id,
        at: now,
      });
      return;
    }
    db.walletTxns.push({
      id: uid('wtx', db),
      passengerId: ride.passengerId,
      amount: payment.amount,
      type: 'debit',
      source: 'ride',
      reference: ride.id,
      createdAt: iso(now),
    });
  }
  // Mobile money / card: no gateway on the phone, the charge is simulated and approved.
  settlePayment(db, ride, payment, now);
}

/** Used by the driver app when a simulated rider's trip ends. */
export function payForCompletedTrip(db: Db, ride: RideRec, now: number): PaymentRec {
  const payment = newPayment(db, ride, ride.paymentMethodId, now);
  chargePayment(db, ride, payment, now);
  return payment;
}

// --------------------------------------------------------------- loading

function ownRide(ctx: Ctx, id: string): RideRec {
  const ride = ctx.db.rides.find((r) => r.id === id && r.passengerId === ctx.passenger!.id);
  if (!ride) throw new HttpError(404, 'Ride not found.');
  return refreshRide(ctx.db, ride, ctx.now);
}

const view = (ride: RideRec) => rideToJson(ride, { passengerView: true });

// ------------------------------------------------------- quote & estimate

route('GET', '/rides/quote', 'passenger', async ({ db, query, now }) => {
  const pickup = parseLatLng(query.pickup);
  const destination = parseLatLng(query.destination);
  if (!pickup || !destination) throw new HttpError(400, 'pickup and destination are required as lat,lng.');
  const rideType = query.rideType === 'shared' ? 'shared' : 'private';
  await ensureRoad(pickup, destination);
  const trip = summariseTrip(pickup, destination);
  const etas = pickupEtas(pickup, now);
  let expiresAt = now;
  const options = VEHICLES.map((v) => {
    const fare = priceFor(v, trip, rideType);
    const quoteId = uid('qt', db);
    expiresAt = rememberQuote(quoteId, quoteKey(pickup, destination, v.id, rideType), fare);
    return {
      quoteId,
      vehicleId: v.id,
      name: v.name,
      description: v.description,
      capacity: v.capacity,
      pickupEtaMinutes: etas[v.id] ?? null,
      fare,
    };
  });
  return {
    quote: {
      route: { coordinates: trip.path.coords, source: routeSource(pickup, destination), distanceKm: trip.distanceKm, durationMinutes: trip.durationMinutes },
      surge: { multiplier: 1, demand: 0, supply: ambientCars(pickup, now, 1_000).length },
      expiresAt: iso(expiresAt),
      options,
    },
  };
});

route('GET', '/rides/estimate', 'passenger', async ({ query }) => {
  const pickup = parseLatLng(query.pickup);
  const destination = parseLatLng(query.destination);
  if (!pickup || !destination) throw new HttpError(400, 'pickup and destination are required as lat,lng.');
  const vehicle = vehicleById(String(query.vehicleId));
  if (!vehicle) throw new HttpError(400, 'Unknown vehicle.');
  const rideType = query.rideType === 'shared' ? 'shared' : 'private';
  await ensureRoad(pickup, destination);
  const trip = summariseTrip(pickup, destination);
  const fare = lockedFare(query.quoteId, quoteKey(pickup, destination, vehicle.id, rideType)) ?? priceFor(vehicle, trip, rideType);
  return { estimate: { distanceKm: trip.distanceKm, durationMinutes: trip.durationMinutes, estimatedFare: fare.total } };
});

// ------------------------------------------------------------------ nearby

route('GET', '/drivers/nearby', 'passenger', ({ query, now }) => {
  const latitude = Number(query.lat);
  const longitude = Number(query.lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) throw new HttpError(400, 'lat and lng are required.');
  const since = Number(query.since);
  const cars = ambientCars({ latitude, longitude }, now, Number.isFinite(since) ? since : undefined);
  return {
    serverTime: now,
    drivers: cars.map((c) => ({
      id: c.id,
      latitude: c.latitude,
      longitude: c.longitude,
      heading: c.heading,
      vehicleId: c.vehicleId,
      color: c.color,
      trail: c.trail,
    })),
  };
});

// ------------------------------------------------------------- booking

route('POST', '/rides', 'passenger', async ({ db, passenger, body, now }) => {
  const { pickup, destination, vehicleId, paymentMethodId } = body;
  const okPoint = (p: any) => p && typeof p.latitude === 'number' && typeof p.longitude === 'number';
  if (!okPoint(pickup) || !okPoint(destination) || !vehicleId || !paymentMethodId) {
    throw new HttpError(400, 'Pickup, destination (with coordinates), vehicle and payment method are required.');
  }
  if (!BOOKABLE.includes(paymentMethodId)) throw new HttpError(400, 'That payment method is not available.');
  const vehicle = vehicleById(vehicleId);
  if (!vehicle) throw new HttpError(400, 'Unknown vehicle.');
  const active = db.rides.find((r) => r.passengerId === passenger!.id && !isTerminal(refreshRide(db, r, now).status));
  if (active) throw new HttpError(409, 'You already have an active ride. Complete or cancel it before requesting another.');

  const rideType = body.rideType === 'shared' ? 'shared' : 'private';
  const id = uid('ride', db);
  const approachStart = approachStartFor(point(pickup), id);
  await ensureRoad(point(pickup), point(destination));
  await ensureRoad(approachStart, point(pickup)); // the car's way to you follows streets too
  const trip = summariseTrip(point(pickup), point(destination));
  const fare =
    lockedFare(body.quoteId, quoteKey(point(pickup), point(destination), vehicle.id, rideType)) ?? priceFor(vehicle, trip, rideType);

  const scheduledMs = body.scheduledFor ? new Date(body.scheduledFor).getTime() : NaN;
  const scheduled = Number.isFinite(scheduledMs) && scheduledMs > now + 60_000;
  const ride: RideRec = {
    id,
    source: 'passenger',
    passengerId: passenger!.id,
    driverId: null,
    riderName: null,
    rideType,
    note: typeof body.rideNote === 'string' && body.rideNote.trim() ? body.rideNote.trim() : null,
    pickup: { address: String(pickup.address ?? ''), latitude: pickup.latitude, longitude: pickup.longitude },
    destination: { address: String(destination.address ?? ''), latitude: destination.latitude, longitude: destination.longitude },
    vehicleId: vehicle.id,
    paymentMethodId,
    status: scheduled ? 'scheduled' : 'searchingDriver',
    distanceKm: trip.distanceKm,
    durationMinutes: trip.durationMinutes,
    estimatedFare: fare.total,
    fareBreakdown: fare,
    surgeMultiplier: 1,
    finalFare: null,
    appliedDiscount: null,
    driver: null,
    pin: randomDigits(4),
    cancellationReason: null,
    cancelledBy: null,
    scheduledFor: scheduled ? iso(scheduledMs) : null,
    createdAt: iso(now),
    acceptedAt: null,
    arrivedAt: null,
    startedAt: null,
    completedAt: null,
    cancelledAt: null,
    rating: null,
    ratingComment: null,
    sim: {
      t0: scheduled ? scheduledMs : now,
      approachStart,
      tripMs: tripDurationMs(trip.distanceKm),
      seed: id,
      alertIds: [],
      // Saved with the ride so it drives the same streets after an app restart.
      approachCoords: buildRoute(approachStart, point(pickup)).coords,
      tripCoords: trip.path.coords,
    },
    notified: [],
  };
  db.rides.push(ride);

  // Ask the phone to raise real notifications at the milestones, even if the app is closed.
  const tl = timeline(ride.sim!);
  const driver = driverInfoFor(ride.sim!.seed, ride.vehicleId);
  const milestones: [number, string, string][] = [
    [tl.tAssign, 'Driver found', `${driver.name} (${driver.vehicleModel}, ${driver.licensePlate}) is on the way.`],
    [tl.tArrive, 'Your driver has arrived', 'Meet your driver at the pickup point and share your trip PIN.'],
    [tl.tEnd, "You've arrived", `Pay ${formatRwf(fare.total)} to finish your trip.`],
  ];
  for (const [at, title, text] of milestones) {
    if (at > now + 2_000) {
      const alertId = await alerts.schedule(at, title, text);
      if (alertId) ride.sim!.alertIds.push(alertId);
    }
  }
  return created({ ride: view(ride) });
});

route('POST', '/rides/location', 'passenger', ({ db, passenger, body, now }) => {
  if (typeof body.latitude !== 'number' || typeof body.longitude !== 'number') {
    throw new HttpError(400, 'latitude and longitude are required.');
  }
  db.passengerLocations[passenger!.id] = { latitude: body.latitude, longitude: body.longitude, heading: body.heading ?? null, at: now };
  return noContent();
});

route('GET', '/rides', 'passenger', ({ db, passenger, now }) => ({
  rides: db.rides
    .filter((r) => r.passengerId === passenger!.id)
    .map((r) => refreshRide(db, r, now))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 100)
    .map(view),
}));

route('GET', '/rides/current', 'passenger', ({ db, passenger, now }) => {
  const ride = db.rides
    .filter((r) => r.passengerId === passenger!.id)
    .map((r) => refreshRide(db, r, now))
    .filter((r) => !isTerminal(r.status))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  return { ride: ride ? view(ride) : null };
});

route('GET', '/rides/:id', 'passenger', (ctx) => ({ ride: view(ownRide(ctx, ctx.params.id)) }));

route('GET', '/rides/:id/driver-location', 'passenger', (ctx) => {
  const ride = ownRide(ctx, ctx.params.id);
  const pos = ride.driver && !isTerminal(ride.status) ? carPositionAt(ride, ctx.now) : null;
  if (!pos) return { serverTime: ctx.now, location: null };
  return {
    serverTime: ctx.now,
    location: {
      latitude: pos.latitude,
      longitude: pos.longitude,
      heading: Math.round(pos.heading),
      recordedAt: iso(ctx.now),
      trail: carTrail(ride, ctx.now),
    },
  };
});

// Breadcrumbs of the road actually driven so far (the trip path, up to the car).
route('GET', '/rides/:id/route', 'passenger', (ctx) => {
  const ride = ownRide(ctx, ctx.params.id);
  if (!ride.sim || !ride.startedAt) return { points: [] };
  const tl = timeline(ride.sim);
  const { trip } = ridePathsOf(ride);
  const done = ride.status === 'inProgress' ? Math.min(1, Math.max(0, (ctx.now - tl.tStart) / ride.sim.tripMs)) : 1;
  const start = Date.parse(ride.startedAt);
  const end = ride.completedAt ? Date.parse(ride.completedAt) : Math.min(ctx.now, tl.tEnd);
  const steps = 30;
  return {
    points: Array.from({ length: steps + 1 }, (_, i) => {
      const p = trip.at((i / steps) * done * trip.lengthM);
      return { latitude: p.latitude, longitude: p.longitude, recordedAt: iso(start + ((end - start) * i) / steps) };
    }),
  };
});

route('GET', '/rides/:id/companions', 'passenger', (ctx) => {
  ownRide(ctx, ctx.params.id);
  return { companions: [] }; // shared rides are priced, but no other rider is simulated
});

// ---------------------------------------------------- cancel / change / rate

route('POST', '/rides/:id/cancel', 'passenger', async (ctx) => {
  const ride = ownRide(ctx, ctx.params.id);
  if (!CANCELLABLE.has(ride.status)) throw new HttpError(400, 'This ride can no longer be cancelled.');
  ride.status = 'cancelled';
  ride.cancelledAt = iso(ctx.now);
  ride.cancelledBy = 'passenger';
  ride.cancellationReason = typeof ctx.body.reason === 'string' ? ctx.body.reason : null;
  if (ride.sim) {
    await alerts.cancel(ride.sim.alertIds);
    ride.sim.alertIds = [];
  }
  return { ride: view(ride) };
});

route('POST', '/rides/:id/change-destination', 'passenger', async (ctx) => {
  const ride = ownRide(ctx, ctx.params.id);
  const dest = ctx.body.destination;
  if (!dest || typeof dest.latitude !== 'number' || typeof dest.longitude !== 'number') {
    throw new HttpError(400, 'A destination with coordinates is required.');
  }
  if (isTerminal(ride.status) || ride.status === 'paymentPending') {
    throw new HttpError(400, 'The destination can no longer be changed for this ride.');
  }
  const vehicle = vehicleById(ride.vehicleId)!;
  await ensureRoad(point(ride.pickup), point(dest));
  const trip = summariseTrip(point(ride.pickup), point(dest));
  const fare = priceFor(vehicle, trip, ride.rideType);
  ride.destination = { address: String(dest.address ?? ''), latitude: dest.latitude, longitude: dest.longitude };
  ride.distanceKm = trip.distanceKm;
  ride.durationMinutes = trip.durationMinutes;
  ride.estimatedFare = fare.total;
  ride.fareBreakdown = fare;
  if (ride.sim) {
    ride.sim.tripMs = tripDurationMs(trip.distanceKm);
    ride.sim.tripCoords = trip.path.coords;
    forgetRidePaths(ride.id);
  }
  return { ride: view(ride) };
});

route('POST', '/rides/:id/rate', 'passenger', (ctx) => {
  const ride = ownRide(ctx, ctx.params.id);
  const rating = Number(ctx.body.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new HttpError(400, 'Rating must be between 1 and 5.');
  if (ride.status !== 'completed') throw new HttpError(400, 'Only completed rides can be rated.');
  ride.rating = rating;
  ride.ratingComment = typeof ctx.body.comment === 'string' ? ctx.body.comment : null;
  return { ride: view(ride) };
});

// ---------------------------------------------------------------- payments

route('POST', '/payments', 'passenger', (ctx) => {
  const { db, body, now } = ctx;
  if (!body.rideId) throw new HttpError(400, 'rideId is required.');
  const ride = ownRide(ctx, String(body.rideId));
  if (ride.status !== 'paymentPending') throw new HttpError(400, 'Payment can only be initiated for an arrived ride.');
  const previous = latestPayment(db, ride.id);

  if (body.method === 'cash') {
    if (ride.paymentMethodId === 'cash' && previous) return { payment: paymentToJson(previous) };
    if (previous && previous.status !== 'failed') {
      throw new HttpError(409, 'Wait for the previous payment to fail before switching to cash.');
    }
    ride.paymentMethodId = 'cash';
    const cash = newPayment(db, ride, 'cash', now);
    chargePayment(db, ride, cash, now);
    return created({ payment: paymentToJson(cash) });
  }
  if (previous) return { payment: paymentToJson(previous) };

  const payment = newPayment(db, ride, ride.paymentMethodId, now);
  chargePayment(db, ride, payment, now);
  return created({ payment: paymentToJson(payment) });
});

route('GET', '/rides/:id/payment', 'passenger', (ctx) => {
  const ride = ownRide(ctx, ctx.params.id);
  return { payment: paymentToJson(latestPayment(ctx.db, ride.id) ?? null) };
});

route('POST', '/payments/:id/refresh', 'passenger', (ctx) => {
  const payment = ctx.db.payments.find((p) => p.id === ctx.params.id && p.passengerId === ctx.passenger!.id);
  if (!payment) throw new HttpError(404, 'Payment not found.');
  ownRide(ctx, payment.rideId); // playing the ride forward also settles due cash
  return { payment: paymentToJson(payment) };
});
