// Passenger-side and shared endpoints of the on-device backend: auth, saved
// places, wallet, notifications, support, safety and the place/route lookups.
// Response envelopes follow server/src/routes/*.js.

import {
  hashPassword,
  iso,
  randomDigits,
  uid,
  VEHICLES,
  walletBalance,
  type Db,
  type PassengerRec,
  type TicketRec,
} from './db';
import { HttpError, created, makeToken, noContent, route, type Ctx } from './http';
import {
  CALL_CENTER_PHONE,
  formatRwf,
  notificationToJson,
  notify,
  passengerToJson,
  requireString,
  ticketToJson,
} from './common';
import { reversePlace, searchPlaces } from './geo';
import { routeSource, summariseTrip } from './pricing';
import { ensureRoad } from './roads';
import { SMS_BRAND, checkVerification, sendSms, startVerification } from './sms';

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const WELCOME_CREDIT = 10_000;

function findByIdentifier(db: Db, identifier: string): PassengerRec | undefined {
  const id = identifier.trim().toLowerCase();
  const digits = id.replace(/[^0-9+]/g, '');
  return db.passengers.find((p) => p.email.toLowerCase() === id || p.phone.replace(/[^0-9+]/g, '') === digits);
}

function issueOtp(p: PassengerRec, purpose: 'signup' | 'reset', now: number): string {
  const code = randomDigits(6);
  p.otp[purpose] = { code, issuedAt: now, attempts: 0 };
  return code;
}

/** Texts the code to the passenger's phone; true when the SMS was accepted by the gateway. */
function textOtp(p: PassengerRec, code: string, purpose: 'signup' | 'reset'): Promise<boolean> {
  const label = purpose === 'reset' ? 'password reset' : 'verification';
  return sendSms(
    'otp',
    p.phone,
    `${SMS_BRAND}: your ${label} code is ${code}. It expires in ${OTP_TTL_MS / 60_000} minutes. Do not share it with anyone.`
  );
}

/**
 * Sends the passenger a code the best available way, in order:
 *  1. A hosted OTP service (Twilio Verify): it owns the code, nothing to show.
 *  2. A code the app issues, texted through the SMS gateway when one is set up.
 *  3. The same code, returned so the app shows it on screen (no signal, no
 *     gateway, or the provider refused), so sign-up never gets stuck.
 */
async function deliverOtp(p: PassengerRec, purpose: 'signup' | 'reset', now: number): Promise<{ devCode?: string }> {
  if (await startVerification(p.phone)) {
    p.otp[purpose] = { code: '', issuedAt: now, attempts: 0, via: 'verify' };
    return {};
  }
  const code = issueOtp(p, purpose, now);
  return (await textOtp(p, code, purpose)) ? {} : { devCode: code };
}

/** true when `code` redeems the passenger's current OTP (and burns it). */
async function redeemOtp(p: PassengerRec, purpose: 'signup' | 'reset', code: string, now: number): Promise<boolean> {
  const otp = p.otp[purpose];
  if (!otp || now - otp.issuedAt > OTP_TTL_MS || otp.attempts >= OTP_MAX_ATTEMPTS) return false;
  if (otp.via === 'verify') {
    const result = await checkVerification(p.phone, String(code).trim());
    if (result === 'unavailable') {
      // The code was texted by the hosted service; without a connection it can't be checked.
      throw new HttpError(503, 'We could not reach the verification service. Check your connection and try again.');
    }
    if (result === 'rejected') {
      otp.attempts += 1;
      return false;
    }
  } else if (otp.code !== String(code).trim()) {
    otp.attempts += 1;
    return false;
  }
  delete p.otp[purpose];
  return true;
}

// ------------------------------------------------------------------- auth

route('POST', '/auth/signup', 'none', async ({ db, body, now }) => {
  const fullName = requireString(body.fullName, 'Full name, phone, email and password are required.');
  const phone = requireString(body.phone, 'Full name, phone, email and password are required.');
  const email = requireString(body.email, 'Full name, phone, email and password are required.').toLowerCase();
  if (typeof body.password !== 'string' || !body.password) {
    throw new HttpError(400, 'Full name, phone, email and password are required.');
  }
  if (body.password.length < 6) throw new HttpError(400, 'Password must be at least 6 characters.');
  if (findByIdentifier(db, email) || findByIdentifier(db, phone)) {
    throw new HttpError(409, 'An account with that email or phone number already exists.');
  }
  const salt = uid('salt', db);
  const passenger: PassengerRec = {
    id: uid('pax', db),
    fullName,
    phone,
    email,
    photoUrl: null,
    emergencyContactName: null,
    emergencyContactPhone: null,
    isProfileComplete: false,
    verifiedAt: null,
    passHash: `${salt}$${hashPassword(body.password, salt)}`,
    createdAt: iso(now),
    otp: {},
  };
  db.passengers.push(passenger);
  // devCode is present only when the code could not be texted (like the
  // server's DEV_REVEAL_CODES): the app then shows it on screen.
  const { devCode } = await deliverOtp(passenger, 'signup', now);
  return created({ passenger: passengerToJson(passenger), token: makeToken('p', passenger.id), ...(devCode ? { devCode } : {}) });
});

route('POST', '/auth/login', 'none', ({ db, body }) => {
  if (!body.identifier || !body.password) throw new HttpError(400, 'Enter your email/phone and password.');
  const passenger = findByIdentifier(db, String(body.identifier));
  if (!passenger) throw new HttpError(401, 'No account found with those details.');
  const [salt, hash] = passenger.passHash.split('$');
  if (hashPassword(String(body.password), salt) !== hash) throw new HttpError(401, 'Incorrect password.');
  return { passenger: passengerToJson(passenger), token: makeToken('p', passenger.id) };
});

route('POST', '/auth/verify-otp', 'none', async ({ db, body, now }) => {
  if (!body.passengerId || !body.code) throw new HttpError(400, 'Missing passengerId or code.');
  const passenger = db.passengers.find((p) => p.id === body.passengerId);
  if (!passenger || !(await redeemOtp(passenger, 'signup', body.code, now))) {
    throw new HttpError(400, 'Invalid or expired verification code.');
  }
  if (!passenger.verifiedAt) {
    passenger.verifiedAt = iso(now);
    // A self-contained wallet so "pay with FEM Wallet" can be tried straight away.
    db.walletTxns.push({
      id: uid('wtx', db),
      passengerId: passenger.id,
      amount: WELCOME_CREDIT,
      type: 'credit',
      source: 'welcome_bonus',
      reference: null,
      createdAt: iso(now),
    });
    notify(db, 'passenger', passenger.id, {
      title: 'Welcome to FEM C@BS',
      body: `We added ${formatRwf(WELCOME_CREDIT)} of demo credit to your wallet.`,
      type: 'general',
    });
  }
  return { verified: true };
});

route('POST', '/auth/resend-otp', 'passenger', async ({ passenger, body, now }) => {
  const purpose = body.purpose === 'reset' ? 'reset' : 'signup';
  // "Resend" means the first text did not arrive. Ask the hosted service again;
  // if that isn't available, fall back to a code the app issues and shows.
  const sent = await deliverOtp(passenger!, purpose, now);
  const devCode = sent.devCode ?? (passenger!.otp[purpose]?.via === 'verify' ? undefined : passenger!.otp[purpose]?.code);
  return { ...(devCode ? { devCode } : {}), message: 'A new verification code was sent.' };
});

route('POST', '/auth/reset-password/request', 'none', async ({ db, body, now }) => {
  const identifier = requireString(body.identifier, 'Enter your email or phone number.');
  const passenger = findByIdentifier(db, identifier);
  const message = `We sent a verification code to ${identifier}.`;
  if (!passenger) return { message }; // same answer whether or not the account exists
  const { devCode } = await deliverOtp(passenger, 'reset', now);
  return devCode ? { message, devCode } : { message };
});

route('POST', '/auth/reset-password/confirm', 'none', async ({ db, body, now }) => {
  if (!body.identifier || !body.code || !body.newPassword) {
    throw new HttpError(400, 'Missing identifier, code or new password.');
  }
  if (String(body.newPassword).length < 6) throw new HttpError(400, 'Password must be at least 6 characters.');
  const passenger = findByIdentifier(db, String(body.identifier));
  if (!passenger || !(await redeemOtp(passenger, 'reset', body.code, now))) {
    throw new HttpError(400, 'Invalid or expired code.');
  }
  const salt = uid('salt', db);
  passenger.passHash = `${salt}$${hashPassword(String(body.newPassword), salt)}`;
  return { message: 'Password updated. You can now log in.' };
});

route('GET', '/auth/me', 'passenger', ({ passenger }) => ({ passenger: passengerToJson(passenger!) }));

route('PUT', '/auth/profile', 'passenger', ({ passenger, body }) => {
  const p = passenger!;
  const text = (v: unknown) => (typeof v === 'string' ? v : undefined);
  p.fullName = text(body.fullName) ?? p.fullName;
  p.phone = text(body.phone) ?? p.phone;
  p.email = text(body.email) ?? p.email;
  p.photoUrl = text(body.photoUrl) ?? p.photoUrl;
  p.emergencyContactName = text(body.emergencyContactName) ?? p.emergencyContactName;
  p.emergencyContactPhone = text(body.emergencyContactPhone) ?? p.emergencyContactPhone;
  p.isProfileComplete = p.fullName !== '' && p.phone !== '';
  return { passenger: passengerToJson(p) };
});

route('DELETE', '/auth/account', 'passenger', ({ db, passenger }) => {
  const id = passenger!.id;
  const keep = <T extends { passengerId?: string | null }>(rows: T[]) => rows.filter((r) => r.passengerId !== id);
  db.passengers = db.passengers.filter((p) => p.id !== id);
  db.rides = keep(db.rides);
  db.payments = keep(db.payments);
  db.walletTxns = keep(db.walletTxns);
  db.topups = keep(db.topups);
  db.savedPlaces = keep(db.savedPlaces);
  db.recentPlaces = keep(db.recentPlaces);
  db.shares = keep(db.shares);
  db.notifications = db.notifications.filter((n) => !(n.role === 'passenger' && n.ownerId === id));
  const ticketIds = new Set(db.tickets.filter((t) => t.role === 'passenger' && t.ownerId === id).map((t) => t.id));
  db.tickets = db.tickets.filter((t) => !ticketIds.has(t.id));
  db.ticketMessages = db.ticketMessages.filter((m) => !ticketIds.has(m.ticketId));
  delete db.passengerLocations[id];
  return noContent();
});

// ------------------------------------------------------- catalogue / config

route('GET', '/config', 'none', () => ({
  // The offline build has no card processor or mobile-money gateway: every
  // payment method is a simulation, and the apps label it as such.
  demoPayments: true,
  paymentMethods: ['cash', 'mtn_momo', 'airtel_money', 'wallet', 'card'],
}));

route('GET', '/vehicles', 'none', () => ({
  vehicles: VEHICLES.map((v) => ({
    id: v.id,
    name: v.name,
    description: v.description,
    capacity: v.capacity,
    baseFare: v.baseFare,
    farePerKm: v.farePerKm,
    etaMinutes: v.etaMinutes,
    isMock: false,
  })),
}));

// --------------------------------------------------------------- locations

route('GET', '/locations/search', 'none', ({ query }) => {
  const q = (query.q ?? '').trim();
  if (q.length < 2) throw new HttpError(400, 'Provide at least 2 characters.');
  return { results: searchPlaces(q) };
});

route('GET', '/locations/reverse', 'none', ({ query }) => {
  const latitude = Number(query.lat);
  const longitude = Number(query.lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) throw new HttpError(400, 'lat and lng are required.');
  return { address: reversePlace({ latitude, longitude }), latitude, longitude };
});

route('GET', '/locations/route', 'none', async ({ query }) => {
  const [fromLat, fromLng, toLat, toLng] = [query.fromLat, query.fromLng, query.toLat, query.toLng].map(Number);
  if (![fromLat, fromLng, toLat, toLng].every(Number.isFinite)) {
    throw new HttpError(400, 'fromLat, fromLng, toLat and toLng are required.');
  }
  const from = { latitude: fromLat, longitude: fromLng };
  const to = { latitude: toLat, longitude: toLng };
  await ensureRoad(from, to); // real streets when a routing service is reachable
  const trip = summariseTrip(from, to);
  return {
    points: trip.path.coords.map(([longitude, latitude]) => ({ latitude, longitude })),
    distanceMeters: Math.round(trip.distanceKm * 1000),
    durationSeconds: trip.durationMinutes * 60,
    source: routeSource(from, to),
  };
});

// ----------------------------------------------------------- saved places

const savedToJson = (s: Db['savedPlaces'][number]) => ({
  id: s.id,
  type: s.type,
  name: s.name,
  place: { address: s.address, latitude: s.latitude, longitude: s.longitude, isCurrentLocation: false },
});

route('GET', '/places/saved', 'passenger', ({ db, passenger }) => ({
  savedPlaces: db.savedPlaces
    .filter((s) => s.passengerId === passenger!.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(savedToJson),
}));

route('POST', '/places/saved', 'passenger', ({ db, passenger, body, now }) => {
  if (!body.type || !body.name || !body.address) throw new HttpError(400, 'A type, name and address are required.');
  const rec = {
    id: uid('plc', db),
    passengerId: passenger!.id,
    type: String(body.type),
    name: String(body.name),
    address: String(body.address),
    latitude: typeof body.latitude === 'number' ? body.latitude : null,
    longitude: typeof body.longitude === 'number' ? body.longitude : null,
    createdAt: iso(now),
  };
  db.savedPlaces.push(rec);
  return created({ savedPlace: savedToJson(rec) });
});

route('DELETE', '/places/saved/:id', 'passenger', ({ db, passenger, params }) => {
  db.savedPlaces = db.savedPlaces.filter((s) => !(s.id === params.id && s.passengerId === passenger!.id));
  return noContent();
});

route('GET', '/places/recent', 'passenger', ({ db, passenger }) => ({
  recent: db.recentPlaces
    .filter((r) => r.passengerId === passenger!.id)
    .sort((a, b) => b.lastUsedAt.localeCompare(a.lastUsedAt))
    .slice(0, 20)
    .map(({ address, latitude, longitude, timesUsed, lastUsedAt }) => ({ address, latitude, longitude, timesUsed, lastUsedAt })),
}));

route('POST', '/places/recent', 'passenger', ({ db, passenger, body, now }) => {
  if (!body.address || typeof body.latitude !== 'number' || typeof body.longitude !== 'number') {
    throw new HttpError(400, 'Address and coordinates are required.');
  }
  const existing = db.recentPlaces.find((r) => r.passengerId === passenger!.id && r.address === body.address);
  if (existing) {
    existing.timesUsed += 1;
    existing.lastUsedAt = iso(now);
  } else {
    db.recentPlaces.push({
      passengerId: passenger!.id,
      address: String(body.address),
      latitude: body.latitude,
      longitude: body.longitude,
      timesUsed: 1,
      lastUsedAt: iso(now),
    });
  }
  return noContent();
});

// ------------------------------------------------------------------ wallet

const topupToJson = (t: Db['topups'][number]) => ({
  id: t.id,
  amount: t.amount,
  phone: t.phone,
  status: t.status,
  state: t.state,
  provider: t.provider,
  reference: t.reference,
  createdAt: t.createdAt,
  updatedAt: t.updatedAt,
});

route('GET', '/wallet', 'passenger', ({ db, passenger }) => ({
  wallet: {
    balance: walletBalance(db, passenger!.id),
    transactions: db.walletTxns
      .filter((t) => t.passengerId === passenger!.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(({ id, amount, type, source, reference, createdAt }) => ({ id, amount, type, source, reference, createdAt })),
  },
}));

route('POST', '/wallet/topup', 'passenger', ({ db, passenger, body, now }) => {
  const amount = Number(body.amount);
  if (!body.phone) throw new HttpError(400, 'A phone number is required.');
  if (!Number.isFinite(amount) || amount <= 0) throw new HttpError(400, 'Enter a valid amount.');
  const reference = `TOPUP-${randomDigits(8)}`;
  // No mobile-money gateway on the phone: the top-up is approved on the spot.
  const topup = {
    id: uid('tpu', db),
    passengerId: passenger!.id,
    amount,
    phone: String(body.phone).trim(),
    status: 'succeeded' as const,
    state: 'succeeded',
    provider: 'offline-demo',
    reference,
    createdAt: iso(now),
    updatedAt: iso(now),
  };
  db.topups.push(topup);
  db.walletTxns.push({
    id: uid('wtx', db),
    passengerId: passenger!.id,
    amount,
    type: 'credit',
    source: 'topup',
    reference,
    createdAt: iso(now),
  });
  notify(db, 'passenger', passenger!.id, {
    title: 'Wallet topped up',
    body: `${formatRwf(amount)} was added to your FEM Wallet.`,
    type: 'payment',
  });
  return created({ topup: topupToJson(topup) });
});

route('GET', '/wallet/topups', 'passenger', ({ db, passenger }) => ({
  topups: db.topups
    .filter((t) => t.passengerId === passenger!.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 50)
    .map(topupToJson),
}));

route('POST', '/wallet/topups/:id/refresh', 'passenger', ({ db, passenger, params }) => {
  const topup = db.topups.find((t) => t.id === params.id && t.passengerId === passenger!.id);
  if (!topup) throw new HttpError(404, 'Top-up not found.');
  return { topup: topupToJson(topup) };
});

// ----------------------------------------------------------- notifications

function ownNotifications(ctx: Ctx) {
  return ctx.db.notifications.filter((n) => n.role === 'passenger' && n.ownerId === ctx.passenger!.id);
}

route('GET', '/notifications', 'passenger', (ctx) => ({
  notifications: ownNotifications(ctx)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 100)
    .map(notificationToJson),
}));

route('GET', '/notifications/unread-count', 'passenger', (ctx) => ({
  count: ownNotifications(ctx).filter((n) => !n.read).length,
}));

route('POST', '/notifications/read-all', 'passenger', (ctx) => {
  ownNotifications(ctx).forEach((n) => (n.read = true));
  return { marked: true };
});

route('POST', '/notifications/device-token', 'passenger', () => noContent());

route('POST', '/notifications/:id/read', 'passenger', (ctx) => {
  const n = ownNotifications(ctx).find((x) => x.id === ctx.params.id);
  if (!n) throw new HttpError(404, 'Notification not found.');
  n.read = true;
  return { notification: notificationToJson(n) };
});

// ----------------------------------------------------------------- support

const PASSENGER_CATEGORIES = new Set(['general', 'payment', 'lost_item', 'report_driver', 'app_issue', 'billing']);

/** Files a ticket for either app; a note explains there is no agent on the other end. */
export function openTicket(
  ctx: Ctx,
  role: 'passenger' | 'driver',
  ownerId: string,
  categories: Set<string>
): TicketRec {
  const { db, body, now } = ctx;
  if (!body.category || !body.subject || !body.message) {
    throw new HttpError(400, 'A category, subject and message are required.');
  }
  if (!categories.has(body.category)) throw new HttpError(400, 'Unknown support category.');
  let rideId: string | null = null;
  if (body.rideId) {
    const ride = db.rides.find((r) => r.id === body.rideId && (role === 'passenger' ? r.passengerId === ownerId : r.driverId === ownerId));
    if (!ride) throw new HttpError(404, 'Ride not found.');
    rideId = ride.id;
  }
  const ticket: TicketRec = {
    id: uid('tkt', db),
    role,
    ownerId,
    rideId,
    category: body.category,
    subject: String(body.subject),
    message: String(body.message),
    status: 'open',
    createdAt: iso(now),
    updatedAt: iso(now),
  };
  db.tickets.push(ticket);
  db.ticketMessages.push({ id: uid('msg', db), ticketId: ticket.id, senderRole: role, message: ticket.message, createdAt: iso(now) });
  db.ticketMessages.push({
    id: uid('msg', db),
    ticketId: ticket.id,
    senderRole: 'support',
    message:
      'Thanks for contacting FEM C@BS. This build runs without a server, so your request is saved on this phone and no support agent will reply. For anything urgent, please call us.',
    createdAt: iso(now + 1000),
  });
  return ticket;
}

export function ticketMessages(db: Db, ticketId: string) {
  return db.ticketMessages
    .filter((m) => m.ticketId === ticketId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((m) => ({ id: m.id, senderRole: m.senderRole, message: m.message, content: m.message, createdAt: m.createdAt }));
}

export function replyToTicket(ctx: Ctx, ticket: TicketRec, role: 'passenger' | 'driver') {
  const text = requireString(ctx.body.message, 'A message is required.');
  if (ticket.status === 'resolved') throw new HttpError(400, 'This ticket is resolved. Open a new one if needed.');
  const msg = { id: uid('msg', ctx.db), ticketId: ticket.id, senderRole: role, message: text, createdAt: iso(ctx.now) };
  ctx.db.ticketMessages.push(msg);
  ticket.updatedAt = iso(ctx.now);
  return created({ message: { id: msg.id, senderRole: role, message: text, content: text, createdAt: msg.createdAt } });
}

const ownTickets = (ctx: Ctx) => ctx.db.tickets.filter((t) => t.role === 'passenger' && t.ownerId === ctx.passenger!.id);

route('POST', '/support', 'passenger', (ctx) => created({ ticket: ticketToJson(openTicket(ctx, 'passenger', ctx.passenger!.id, PASSENGER_CATEGORIES)) }));

route('GET', '/support', 'passenger', (ctx) => ({
  tickets: ownTickets(ctx).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(ticketToJson),
}));

route('GET', '/support/:id', 'passenger', (ctx) => {
  const ticket = ownTickets(ctx).find((t) => t.id === ctx.params.id);
  if (!ticket) throw new HttpError(404, 'Ticket not found.');
  return { ticket: ticketToJson(ticket), messages: ticketMessages(ctx.db, ticket.id) };
});

route('POST', '/support/:id/messages', 'passenger', (ctx) => {
  const ticket = ownTickets(ctx).find((t) => t.id === ctx.params.id);
  if (!ticket) throw new HttpError(404, 'Ticket not found.');
  return replyToTicket(ctx, ticket, 'passenger');
});

route('POST', '/support/:id/close', 'passenger', (ctx) => {
  const ticket = ownTickets(ctx).find((t) => t.id === ctx.params.id);
  if (!ticket) throw new HttpError(404, 'Ticket not found.');
  ticket.status = 'closed';
  ticket.updatedAt = iso(ctx.now);
  return { ticket: ticketToJson(ticket) };
});

// ------------------------------------------------------------------ safety

/**
 * Records an SOS on the phone and texts the person's emergency contact with a
 * map link (when SMS is available); the app then opens the phone's dialer on
 * the call-centre number.
 */
export async function recordEmergency(ctx: Ctx, role: 'passenger' | 'driver', ownerId: string) {
  const { db, body, now } = ctx;
  const reference = `EM-${randomDigits(3)}${Math.floor(Math.random() * 46656).toString(36).toUpperCase().padStart(3, '0')}${randomDigits(3)}`;
  const event = {
    id: uid('sos', db),
    role,
    ownerId,
    rideId: (body.rideId as string) || null,
    reference,
    latitude: typeof body.latitude === 'number' ? body.latitude : null,
    longitude: typeof body.longitude === 'number' ? body.longitude : null,
    address: (body.address as string) ?? null,
    details: (body.details as string) ?? null,
    createdAt: iso(now),
  };
  db.emergencies.push(event);

  const person = role === 'passenger' ? db.passengers.find((p) => p.id === ownerId) : db.drivers.find((d) => d.id === ownerId);
  const where =
    event.latitude != null && event.longitude != null
      ? `https://maps.google.com/?q=${event.latitude},${event.longitude}`
      : (event.address ?? 'location unavailable');
  const texted = await sendSms(
    'sos',
    person?.emergencyContactPhone,
    `${SMS_BRAND} SOS ${reference}: ${person?.fullName ?? 'Your contact'} sent an emergency alert from a FEM C@BS trip. Location: ${where}. Please call them now.`
  );
  notify(db, role, ownerId, {
    title: role === 'passenger' ? 'SOS alert recorded' : 'Emergency recorded',
    body: texted
      ? 'Your emergency contact was sent a text with your location. Please call the emergency number now.'
      : 'Your alert was saved on this phone. Please call the emergency number now.',
    type: 'safety',
    rideId: event.rideId,
  });
  return created({
    emergency: { id: event.id, status: 'dispatched', createdAt: event.createdAt, reference, callCenterPhone: CALL_CENTER_PHONE },
  });
}

route('GET', '/emergency/config', 'none', () => ({ callCenterPhone: CALL_CENTER_PHONE }));
route('POST', '/emergency', 'passenger', (ctx) => recordEmergency(ctx, 'passenger', ctx.passenger!.id));
route('GET', '/emergency', 'passenger', ({ db, passenger }) => ({
  events: db.emergencies.filter((e) => e.role === 'passenger' && e.ownerId === passenger!.id),
}));

route('POST', '/share', 'passenger', ({ db, passenger, body, now }) => {
  const ride = db.rides.find((r) => r.id === body.rideId && r.passengerId === passenger!.id);
  if (!body.rideId) throw new HttpError(400, 'rideId is required.');
  if (!ride) throw new HttpError(404, 'Ride not found.');
  if (ride.status === 'completed' || ride.status === 'cancelled') throw new HttpError(400, 'Only active rides can be shared.');
  const token = `${randomDigits(6)}${Math.floor(Math.random() * 1679616).toString(36)}`;
  const expiresAt = iso(now + 6 * 60 * 60 * 1000);
  db.shares.push({ token, rideId: ride.id, passengerId: passenger!.id, expiresAt });
  return created({ share: { token, expires_at: expiresAt, created_at: iso(now) } });
});
