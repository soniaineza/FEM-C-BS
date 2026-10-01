// Driver-app endpoints of the on-device backend. A driver who goes online is
// sent simulated ride requests from fictional riders; accepting, arriving,
// checking the rider's PIN, driving and collecting payment then run through the
// same states and money flow as the real service (earnings, commission, ratings).

import { hashPassword, iso, uid, type Db, type DriverRec, type RideRec, type RideStatus } from './db';
import { HttpError, created, makeToken, noContent, route, type Ctx } from './http';
import { driverToJson, formatRwf, notificationToJson, notify, requireString, rideToJson, ticketToJson } from './common';
import { offsetM, PLACES, reversePlace, seeded, haversineKm, KIGALI, type LatLng } from './geo';
import { priceFor, summariseTrip, vehicleById } from './pricing';
import { ensureRoad } from './roads';
import { TIMING, riderNameFor } from './sim';
import { payForCompletedTrip, releaseDriver, settlePayment, latestPayment } from './rides';
import { openTicket, recordEmergency, replyToTicket, ticketMessages } from './account';

const ACTIVE = new Set<RideStatus>(['driverAssigned', 'driverArriving', 'driverArrived', 'pinVerified', 'inProgress', 'paymentPending']);
/** Simulated riders all share this trip code (there is no second phone to read one from). */
export const DEMO_RIDER_PIN = '1234';
const DRIVER_CATEGORIES = new Set(['general', 'payment', 'report_passenger', 'app_issue', 'billing', 'vehicle_issue', 'lost_item']);
const DOC_TYPES = ['license', 'national_id', 'vehicle_registration', 'insurance', 'profile_photo', 'vehicle_photo', 'other'];

const me = (ctx: Ctx): DriverRec => ctx.driver!;
const digits = (s: string) => s.replace(/[^0-9+]/g, '');

// ------------------------------------------------------------------- auth

route('POST', '/drivers/register', 'none', ({ db, body, now }) => {
  const fullName = requireString(body.fullName, 'Full name, phone and password are required.');
  const phone = requireString(body.phone, 'Full name, phone and password are required.');
  if (typeof body.password !== 'string' || !body.password) throw new HttpError(400, 'Full name, phone and password are required.');
  if (body.password.length < 6) throw new HttpError(400, 'Password must be at least 6 characters.');
  if (db.drivers.some((d) => digits(d.phone) === digits(phone))) {
    throw new HttpError(409, 'An account with that phone number already exists.');
  }
  const salt = uid('salt', db);
  const driver: DriverRec = {
    id: uid('drv', db),
    fullName,
    phone,
    email: null,
    photoUrl: null,
    licenseNumber: typeof body.licenseNumber === 'string' && body.licenseNumber.trim() ? body.licenseNumber.trim() : null,
    // There is no operator to review documents on the phone, so drivers start verified.
    verified: true,
    status: 'offline',
    vehicleId: 'fem_economy',
    rating: null,
    totalTrips: 0,
    isProfileComplete: false,
    emergencyContactName: null,
    emergencyContactPhone: null,
    preferredLanguage: 'en',
    vehicleMake: null,
    vehicleModel: null,
    vehicleYear: null,
    vehicleColor: null,
    vehiclePlate: null,
    passHash: `${salt}$${hashPassword(body.password, salt)}`,
    createdAt: iso(now),
    latitude: null,
    longitude: null,
    heading: null,
    nextOfferAt: 0,
  };
  db.drivers.push(driver);
  return created({ driver: driverToJson(driver), token: makeToken('d', driver.id) });
});

route('POST', '/drivers/login', 'none', ({ db, body }) => {
  if (!body.phone || !body.password) throw new HttpError(400, 'Phone and password are required.');
  const driver = db.drivers.find((d) => digits(d.phone) === digits(String(body.phone)));
  const [salt, hash] = (driver?.passHash ?? '$').split('$');
  if (!driver || hashPassword(String(body.password), salt) !== hash) throw new HttpError(401, 'Invalid driver credentials.');
  return { driver: driverToJson(driver), token: makeToken('d', driver.id) };
});

// ---------------------------------------------------------------- profile

route('GET', '/driver/me', 'driver', (ctx) => ({ driver: driverToJson(me(ctx)) }));

route('PUT', '/driver/me', 'driver', (ctx) => {
  const d = me(ctx);
  const b = ctx.body;
  if (['vehicleMake', 'vehicleModel', 'vehicleYear', 'vehicleColor', 'vehiclePlate'].some((k) => b[k] !== undefined)) {
    throw new HttpError(400, 'Update vehicle details through /driver/vehicle.');
  }
  const text = (v: unknown) => (typeof v === 'string' ? v : undefined);
  d.fullName = text(b.fullName) ?? d.fullName;
  d.email = text(b.email) ?? d.email;
  d.photoUrl = text(b.photoUrl) ?? d.photoUrl;
  d.emergencyContactName = text(b.emergencyContactName) ?? d.emergencyContactName;
  d.emergencyContactPhone = text(b.emergencyContactPhone) ?? d.emergencyContactPhone;
  d.preferredLanguage = text(b.preferredLanguage) ?? d.preferredLanguage;
  d.isProfileComplete = d.fullName !== '' && d.email != null;
  return { driver: driverToJson(d) };
});

route('DELETE', '/driver/account', 'driver', ({ db, driver }) => {
  const id = driver!.id;
  db.drivers = db.drivers.filter((d) => d.id !== id);
  db.rides = db.rides.filter((r) => r.driverId !== id);
  db.earnings = db.earnings.filter((e) => e.driverId !== id);
  db.ratings = db.ratings.filter((r) => r.driverId !== id);
  db.documents = db.documents.filter((x) => x.driverId !== id);
  db.payments = db.payments.filter((p) => p.driverId !== id);
  db.notifications = db.notifications.filter((n) => !(n.role === 'driver' && n.ownerId === id));
  const ticketIds = new Set(db.tickets.filter((t) => t.role === 'driver' && t.ownerId === id).map((t) => t.id));
  db.tickets = db.tickets.filter((t) => !ticketIds.has(t.id));
  db.ticketMessages = db.ticketMessages.filter((m) => !ticketIds.has(m.ticketId));
  return noContent();
});

route('PUT', '/driver/status', 'driver', (ctx) => {
  const d = me(ctx);
  const status = ctx.body.status;
  if (status !== 'offline' && status !== 'active') throw new HttpError(400, 'Status must be "offline" or "active".');
  if (status === 'active' && !d.verified) throw new HttpError(403, 'Your account is still being verified.');
  if (d.status === 'busy' || d.status === 'suspended') throw new HttpError(400, 'Cannot change status while busy or suspended.');
  if (status === 'active' && d.status !== 'active') d.nextOfferAt = ctx.now + TIMING.offerDelayMs;
  if (status === 'offline') discardOpenOffers(ctx.db, d);
  d.status = status;
  return { driver: driverToJson(d) };
});

route('GET', '/driver/vehicle', 'driver', (ctx) => {
  const d = me(ctx);
  return {
    vehicle: {
      currentVehicleId: d.vehicleId,
      make: d.vehicleMake ?? '',
      model: d.vehicleModel ?? '',
      year: d.vehicleYear,
      color: d.vehicleColor ?? '',
      plate: d.vehiclePlate ?? '',
      licenseNumber: d.licenseNumber ?? '',
    },
  };
});

route('PUT', '/driver/vehicle', 'driver', (ctx) => {
  const d = me(ctx);
  const b = ctx.body;
  if (d.status === 'busy') throw new HttpError(409, 'Vehicle details cannot change during a trip.');
  const text = (v: unknown) => (typeof v === 'string' ? v : undefined);
  d.vehicleMake = text(b.vehicleMake) ?? d.vehicleMake;
  d.vehicleModel = text(b.vehicleModel) ?? d.vehicleModel;
  d.vehicleColor = text(b.vehicleColor) ?? d.vehicleColor;
  d.vehiclePlate = text(b.vehiclePlate) ?? d.vehiclePlate;
  d.licenseNumber = text(b.licenseNumber) ?? d.licenseNumber;
  if (b.vehicleYear !== undefined) d.vehicleYear = Number(b.vehicleYear) || d.vehicleYear;
  return { driver: driverToJson(d) };
});

// -------------------------------------------------------------- documents

const docToJson = (x: Db['documents'][number]) => ({
  id: x.id,
  docType: x.docType,
  fileUrl: null,
  fileName: x.fileName,
  status: x.status,
  rejectionReason: null,
  expiresAt: x.expiresAt,
  uploadedAt: x.uploadedAt,
  reviewedAt: x.reviewedAt,
});

route('GET', '/driver/documents', 'driver', ({ db, driver }) => ({
  documents: db.documents
    .filter((x) => x.driverId === driver!.id)
    .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))
    .map(docToJson),
}));

route('POST', '/driver/documents', 'driver', ({ db, driver, body, now }) => {
  if (!body.docType || !DOC_TYPES.includes(body.docType)) throw new HttpError(400, `docType must be one of: ${DOC_TYPES.join(', ')}`);
  // Nobody reviews uploads on the phone, so a submitted document is approved straight away.
  const doc = {
    id: uid('doc', db),
    driverId: driver!.id,
    docType: String(body.docType),
    fileName: typeof body.fileName === 'string' ? body.fileName : null,
    status: 'approved' as const,
    expiresAt: typeof body.expiresAt === 'string' ? body.expiresAt : null,
    uploadedAt: iso(now),
    reviewedAt: iso(now),
  };
  db.documents.push(doc);
  return created({ document: { id: doc.id, docType: doc.docType, status: doc.status, uploadedAt: doc.uploadedAt } });
});

// ------------------------------------------------------- history & earnings

const withRider = (r: RideRec) => rideToJson(r);

route('GET', '/driver/rides', 'driver', ({ db, driver }) => ({
  rides: db.rides
    .filter((r) => r.driverId === driver!.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 100)
    .map(withRider),
}));

route('GET', '/driver/rides/:id', 'driver', ({ db, driver, params }) => {
  const ride = db.rides.find((r) => r.id === params.id && r.driverId === driver!.id);
  if (!ride) throw new HttpError(404, 'Ride not found.');
  return { ride: withRider(ride) };
});

route('GET', '/driver/earnings', 'driver', ({ db, driver, now }) => {
  const mine = db.earnings.filter((e) => e.driverId === driver!.id && e.status === 'settled');
  const day = new Date(now);
  day.setHours(0, 0, 0, 0);
  const startOfDay = day.getTime();
  const startOfWeek = startOfDay - ((day.getDay() + 6) % 7) * 86_400_000; // Monday
  const startOfMonth = new Date(day.getFullYear(), day.getMonth(), 1).getTime();
  const since = (t: number) => {
    const rows = mine.filter((e) => Date.parse(e.createdAt) >= t);
    return { amount: rows.reduce((s, e) => s + e.netAmount, 0), rides: rows.length };
  };
  return {
    earnings: {
      today: since(startOfDay),
      week: since(startOfWeek),
      month: since(startOfMonth),
      total: since(0),
      pendingBalance: db.earnings.filter((e) => e.driverId === driver!.id && e.status === 'pending').reduce((s, e) => s + e.netAmount, 0),
      rating: driver!.rating,
      totalTrips: driver!.totalTrips,
    },
  };
});

route('GET', '/driver/earnings/history', 'driver', ({ db, driver }) => ({
  earnings: db.earnings
    .filter((e) => e.driverId === driver!.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 100)
    .map(({ driverId: _d, ...e }) => e),
}));

// Payouts need a bank / mobile-money rail, which a server-free build does not have.
route('GET', '/driver/payouts', 'driver', () => ({ payouts: [] }));

route('GET', '/driver/ratings', 'driver', ({ db, driver }) => {
  const mine = db.ratings.filter((r) => r.driverId === driver!.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const avg = mine.length ? mine.reduce((s, r) => s + r.rating, 0) / mine.length : 0;
  return {
    ratings: mine.slice(0, 50).map((r) => ({ rating: r.rating, comment: r.comment, passengerName: r.passengerName, createdAt: r.createdAt })),
    summary: {
      average: Number(avg.toFixed(1)),
      total: mine.length,
      breakdown: [1, 2, 3, 4, 5]
        .map((stars) => ({ stars, count: mine.filter((r) => r.rating === stars).length }))
        .filter((b) => b.count > 0),
    },
  };
});

// ---------------------------------------------------------- notifications

const ownNotifications = (ctx: Ctx) => ctx.db.notifications.filter((n) => n.role === 'driver' && n.ownerId === me(ctx).id);

route('GET', '/driver/notifications', 'driver', (ctx) => ({
  notifications: ownNotifications(ctx).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 100).map(notificationToJson),
}));
route('GET', '/driver/notifications/unread-count', 'driver', (ctx) => ({ count: ownNotifications(ctx).filter((n) => !n.read).length }));
route('POST', '/driver/notifications/read-all', 'driver', (ctx) => {
  ownNotifications(ctx).forEach((n) => (n.read = true));
  return { marked: true };
});
route('POST', '/driver/notifications/device-token', 'driver', () => noContent());
route('POST', '/driver/device-token', 'driver', () => noContent());
route('POST', '/driver/notifications/:id/read', 'driver', (ctx) => {
  const n = ownNotifications(ctx).find((x) => x.id === ctx.params.id);
  if (!n) throw new HttpError(404, 'Notification not found.');
  n.read = true;
  return { notification: notificationToJson(n) };
});

// ----------------------------------------------------------------- support

const ownTickets = (ctx: Ctx) => ctx.db.tickets.filter((t) => t.role === 'driver' && t.ownerId === me(ctx).id);

route('GET', '/driver/support', 'driver', (ctx) => ({
  tickets: ownTickets(ctx).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(ticketToJson),
}));
route('POST', '/driver/support', 'driver', (ctx) => created({ ticket: ticketToJson(openTicket(ctx, 'driver', me(ctx).id, DRIVER_CATEGORIES)) }));
route('GET', '/driver/support/:id', 'driver', (ctx) => {
  const ticket = ownTickets(ctx).find((t) => t.id === ctx.params.id);
  if (!ticket) throw new HttpError(404, 'Ticket not found.');
  return { ticket: ticketToJson(ticket), messages: ticketMessages(ctx.db, ticket.id) };
});
route('POST', '/driver/support/:id/messages', 'driver', (ctx) => {
  const ticket = ownTickets(ctx).find((t) => t.id === ctx.params.id);
  if (!ticket) throw new HttpError(404, 'Ticket not found.');
  return replyToTicket(ctx, ticket, 'driver');
});

route('POST', '/driver/emergency', 'driver', (ctx) => recordEmergency(ctx, 'driver', me(ctx).id));

// ------------------------------------------------- simulated ride requests

function discardRide(db: Db, ride: RideRec): void {
  db.rides = db.rides.filter((r) => r.id !== ride.id);
  db.payments = db.payments.filter((p) => p.rideId !== ride.id);
}

/** A request the driver never answered (or an offer left when going offline) just disappears. */
function discardOpenOffers(db: Db, driver: DriverRec): void {
  for (const ride of db.rides.filter((r) => r.source === 'demoRider' && r.driverId === driver.id && r.status === 'driverAssigned')) {
    discardRide(db, ride);
  }
}

async function createOffer(db: Db, driver: DriverRec, now: number, forceShared = false): Promise<RideRec> {
  const id = uid('ride', db);
  const rnd = seeded(`offer:${id}`);
  // About one request in three is a shared (pooled) ride at the lower shared fare.
  const rideType: 'private' | 'shared' = forceShared || rnd() < 0.34 ? 'shared' : 'private';
  const origin: LatLng =
    driver.latitude != null && driver.longitude != null ? { latitude: driver.latitude, longitude: driver.longitude } : KIGALI;
  const angle = rnd() * Math.PI * 2;
  const away = 400 + rnd() * 1000;
  const pickup = offsetM(origin, Math.cos(angle) * away, Math.sin(angle) * away);

  // Prefer a real known place a few km away; anywhere else, drop a pin nearby.
  const candidates = PLACES.filter((p) => {
    const km = haversineKm(pickup, { latitude: p[1], longitude: p[2] });
    return km >= 2 && km <= 10;
  });
  let destination: LatLng;
  if (candidates.length) {
    const p = candidates[Math.floor(rnd() * candidates.length)];
    destination = { latitude: p[1], longitude: p[2] };
  } else {
    const a2 = rnd() * Math.PI * 2;
    const far = 2500 + rnd() * 3000;
    destination = offsetM(pickup, Math.cos(a2) * far, Math.sin(a2) * far);
  }

  const vehicle = vehicleById(driver.vehicleId ?? 'fem_economy') ?? vehicleById('fem_economy')!;
  await ensureRoad(pickup, destination);
  const trip = summariseTrip(pickup, destination);
  const fare = priceFor(vehicle, trip, rideType);
  const roll = rnd();
  const paymentMethodId = roll < 0.55 ? 'cash' : roll < 0.8 ? 'mtn_momo' : roll < 0.85 ? 'airtel_money' : 'wallet';
  const ride: RideRec = {
    id,
    source: 'demoRider',
    passengerId: null,
    driverId: driver.id,
    riderName: riderNameFor(id),
    rideType,
    note: null,
    pickup: { address: reversePlace(pickup), latitude: pickup.latitude, longitude: pickup.longitude },
    destination: { address: reversePlace(destination), latitude: destination.latitude, longitude: destination.longitude },
    vehicleId: vehicle.id,
    paymentMethodId,
    status: 'driverAssigned',
    distanceKm: trip.distanceKm,
    durationMinutes: trip.durationMinutes,
    estimatedFare: fare.total,
    fareBreakdown: fare,
    surgeMultiplier: 1,
    finalFare: null,
    appliedDiscount: null,
    driver: null,
    pin: DEMO_RIDER_PIN,
    cancellationReason: null,
    cancelledBy: null,
    scheduledFor: null,
    createdAt: iso(now),
    acceptedAt: null,
    arrivedAt: null,
    startedAt: null,
    completedAt: null,
    cancelledAt: null,
    rating: null,
    ratingComment: null,
    sim: null,
    notified: [],
  };
  db.rides.push(ride);
  notify(db, 'driver', driver.id, {
    title: 'New ride request',
    body: `${ride.riderName} · ${formatRwf(ride.estimatedFare)} · ${ride.distanceKm} km`,
    type: 'ride',
    rideId: id,
    at: now,
  });
  return ride;
}

const activeRides = (db: Db, driver: DriverRec) =>
  db.rides.filter((r) => r.driverId === driver.id && ACTIVE.has(r.status)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));

/** Lapses stale requests and, when the driver is free and online, sends the next one. */
async function tickOffers(db: Db, driver: DriverRec, now: number): Promise<void> {
  for (const ride of db.rides.filter((r) => r.source === 'demoRider' && r.driverId === driver.id && r.status === 'driverAssigned')) {
    if (now - Date.parse(ride.createdAt) > TIMING.offerExpireMs) {
      discardRide(db, ride);
      driver.nextOfferAt = now + TIMING.offerGapMs;
    }
  }
  if (driver.status !== 'active' && driver.status !== 'busy') return;
  if (now < driver.nextOfferAt) return;
  const active = activeRides(db, driver);
  if (active.length === 0) {
    if (driver.status === 'active') await createOffer(db, driver, now);
    return;
  }
  // A driver carrying shared passengers keeps getting shared requests (one waiting at a time),
  // up to the vehicle's limit, so they can pool several riders into one trip.
  const allShared = active.every((r) => r.rideType === 'shared');
  const waiting = active.some((r) => r.status === 'driverAssigned');
  if (allShared && !waiting && active.length < TIMING.maxPooledRiders) await createOffer(db, driver, now, true);
}

// ------------------------------------------------------- driver ride actions

route('POST', '/drivers/location', 'driver', ({ driver, body }) => {
  if (typeof body.latitude !== 'number' || typeof body.longitude !== 'number') {
    throw new HttpError(400, 'latitude and longitude are required.');
  }
  driver!.latitude = body.latitude;
  driver!.longitude = body.longitude;
  if (typeof body.heading === 'number') driver!.heading = body.heading;
  return noContent();
});

route('GET', '/drivers/rides/active', 'driver', async ({ db, driver, now }) => {
  await tickOffers(db, driver!, now);
  return { rides: activeRides(db, driver!).map(withRider) };
});

function ownActive(ctx: Ctx): RideRec {
  const ride = ctx.db.rides.find((r) => r.id === ctx.params.id && r.driverId === me(ctx).id && ACTIVE.has(r.status));
  if (!ride) throw new HttpError(404, 'No assigned ride found.');
  return ride;
}

function expect(ride: RideRec, status: RideStatus, message: string): void {
  if (ride.status !== status) throw new HttpError(400, message);
}

route('POST', '/drivers/rides/:id/accept', 'driver', (ctx) => {
  const ride = ownActive(ctx);
  expect(ride, 'driverAssigned', 'This ride is no longer awaiting your answer.');
  ride.status = 'driverArriving';
  ride.acceptedAt = iso(ctx.now);
  me(ctx).status = 'busy';
  notify(ctx.db, 'driver', me(ctx).id, {
    title: 'Trip code',
    body: `Ask ${ride.riderName} for their 4-digit trip code at pickup. In this offline build, every rider's code is ${DEMO_RIDER_PIN}.`,
    type: 'ride',
    rideId: ride.id,
    at: ctx.now,
  });
  return { accepted: true };
});

route('POST', '/drivers/rides/:id/decline', 'driver', (ctx) => {
  const ride = ownActive(ctx);
  expect(ride, 'driverAssigned', 'Only a new request can be declined.');
  discardRide(ctx.db, ride);
  me(ctx).nextOfferAt = ctx.now + TIMING.offerGapMs;
  return { declined: true };
});

route('POST', '/drivers/rides/:id/arrived', 'driver', (ctx) => {
  const ride = ownActive(ctx);
  expect(ride, 'driverArriving', 'You can only mark arrival while heading to the pickup.');
  ride.status = 'driverArrived';
  ride.arrivedAt = iso(ctx.now);
  return { rideId: ride.id, message: 'Arrival recorded.' };
});

route('POST', '/drivers/rides/:id/verify-pin', 'driver', (ctx) => {
  const ride = ownActive(ctx);
  if (!ctx.body.pin) throw new HttpError(400, 'A ride PIN is required.');
  expect(ride, 'driverArrived', 'Mark arrival before starting the trip.');
  if (String(ctx.body.pin).trim() !== ride.pin) {
    throw new HttpError(400, `Incorrect ride PIN. (Offline build: the rider's code is ${DEMO_RIDER_PIN}.)`);
  }
  ride.status = 'inProgress';
  ride.startedAt = iso(ctx.now);
  return { verified: true };
});

route('POST', '/drivers/rides/:id/complete-trip', 'driver', (ctx) => {
  const ride = ownActive(ctx);
  expect(ride, 'inProgress', 'Only an in-progress ride can be completed.');
  ride.finalFare = ride.estimatedFare;
  ride.status = 'paymentPending';
  const payment = payForCompletedTrip(ctx.db, ride, ctx.now);
  return {
    ride: withRider(ride),
    payment: { id: payment.id, amount: payment.amount, method: payment.method, status: payment.status, state: payment.state },
  };
});

route('POST', '/drivers/rides/:id/confirm-cash', 'driver', (ctx) => {
  const ride = ctx.db.rides.find((r) => r.id === ctx.params.id && r.driverId === me(ctx).id && r.status === 'paymentPending');
  const payment = ride ? latestPayment(ctx.db, ride.id) : undefined;
  if (!ride || !payment || payment.method !== 'cash' || payment.status !== 'pending') {
    throw new HttpError(404, 'Cash payment awaiting this driver was not found.');
  }
  settlePayment(ctx.db, ride, payment, ctx.now);
  return { payment: { id: payment.id, status: payment.status } };
});

route('POST', '/drivers/rides/:id/cancel', 'driver', (ctx) => {
  const ride = ownActive(ctx);
  if (!['driverAssigned', 'driverArriving', 'driverArrived'].includes(ride.status)) {
    throw new HttpError(400, 'This ride can no longer be cancelled.');
  }
  ride.status = 'cancelled';
  ride.cancelledAt = iso(ctx.now);
  ride.cancelledBy = 'driver';
  ride.cancellationReason = typeof ctx.body.reason === 'string' ? ctx.body.reason : null;
  releaseDriver(ctx.db, me(ctx), ctx.now);
  return { ride: withRider(ride) };
});
