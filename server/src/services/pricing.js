const crypto = require('crypto');

const { getPool } = require('../db');
const { haversineKm } = require('../utils/distance');
const { getRoadRoute, getTravelTimes, estimateSeconds } = require('./routing');
const { eligibleDriverSql } = require('./driverKyc');
const { MAX_ADDED_MINUTES } = require('./poolPlanner');

// Upfront, server-authoritative pricing in the style of Uber's upfront fares:
//
//   subtotal = base + perKm * roadKm + perMinute * roadMinutes
//   fare     = max(minimumFare, subtotal * surge) + bookingFee
//   shared   = fare * 0.7 (a second seat adds 25% of that)
//   rounded UP to the nearest 100 RWF
//
// Distance and duration come from the real road route (OSRM), not the
// straight line. Surge reflects local demand vs available cars around the
// pickup. A quote is locked for QUOTE_TTL_MS so the price shown is the price
// charged, even if surge moves while the rider decides.

const SHARED_FACTOR = 0.7;
// A shared booking may take a second seat. It is priced well under two
// fares so two people sharing still pay less than a private car.
const MAX_SHARED_SEATS = 2;
const SHARED_EXTRA_SEAT_FACTOR = 1.25;
const ROUND_TO = 100;
const SURGE_RADIUS_KM = 3;
const MAX_SURGE = 2.0;
const QUOTE_TTL_MS = 5 * 60 * 1000;

const quotes = new Map(); // quoteId -> { expiresAt, key, fare }

function roundUp(amount) {
  return Math.ceil(amount / ROUND_TO) * ROUND_TO;
}

/**
 * Demand/supply surge around a point. Demand = rides still searching for a
 * driver nearby in the last 10 minutes; supply = online verified drivers
 * nearby. Returns a multiplier in [1.0, MAX_SURGE], in 0.1 steps.
 */
async function surgeAt(point) {
  const [{ rows: demandRows }, { rows: supplyRows }] = await Promise.all([
    getPool().query(
      `SELECT pickup_latitude AS lat, pickup_longitude AS lng FROM rides
        WHERE status = 'searchingDriver' AND created_at > now() - interval '10 minutes'`
    ),
    getPool().query(
      `SELECT d.current_latitude AS lat, d.current_longitude AS lng FROM drivers d
        WHERE d.verified = TRUE AND d.status = 'active'
          AND d.current_latitude IS NOT NULL AND d.current_longitude IS NOT NULL
          ${eligibleDriverSql}`
    ),
  ]);
  const near = (r) => haversineKm(point.latitude, point.longitude, r.lat, r.lng) <= SURGE_RADIUS_KM;
  const demand = demandRows.filter(near).length;
  const supply = supplyRows.filter(near).length;
  if (demand <= supply) return { multiplier: 1, demand, supply };
  const ratio = demand / Math.max(supply, 1);
  const multiplier = Math.min(MAX_SURGE, Math.round((1 + (ratio - 1) * 0.5) * 10) / 10);
  return { multiplier: Math.max(1, multiplier), demand, supply };
}

const etaCache = new Map(); // rounded pickup -> { at, etas }
const ETA_CACHE_MS = 15_000;
const ETA_CANDIDATES_PER_CLASS = 4;

/**
 * Minutes until the nearest online car of each vehicle class could reach the
 * pickup by road: the few nearest cars per class (as the crow flies) are
 * timed in one OSRM table request; straight-line estimate if OSRM is down.
 */
async function pickupEtas(point) {
  const cacheKey = `${point.latitude.toFixed(3)},${point.longitude.toFixed(3)}`;
  const hit = etaCache.get(cacheKey);
  if (hit && Date.now() - hit.at < ETA_CACHE_MS) return hit.etas;

  const { rows } = await getPool().query(
    `SELECT d.current_vehicle_id AS vehicle_id, d.current_latitude AS lat, d.current_longitude AS lng
       FROM drivers d
      WHERE d.verified = TRUE AND d.status = 'active'
        AND d.current_latitude IS NOT NULL AND d.current_longitude IS NOT NULL
        ${eligibleDriverSql}`
  );
  const perClass = new Map();
  for (const r of rows) {
    const km = haversineKm(point.latitude, point.longitude, r.lat, r.lng);
    if (km > 8) continue;
    const key = r.vehicle_id || 'any';
    if (!perClass.has(key)) perClass.set(key, []);
    perClass.get(key).push({ key, km, latitude: r.lat, longitude: r.lng });
  }
  const candidates = [...perClass.values()].flatMap((list) =>
    list.sort((a, b) => a.km - b.km).slice(0, ETA_CANDIDATES_PER_CLASS)
  );
  const times = await getTravelTimes(candidates, point);
  const etas = {};
  candidates.forEach((c, i) => {
    const seconds = times?.[i] ?? estimateSeconds(c, point);
    const minutes = Math.max(1, Math.round(seconds / 60));
    if (etas[c.key] == null || minutes < etas[c.key]) etas[c.key] = minutes;
  });
  etaCache.set(cacheKey, { at: Date.now(), etas });
  if (etaCache.size > 200) etaCache.delete(etaCache.keys().next().value);
  return etas;
}

/** Itemised fare for one vehicle class over a known road route. */
function priceFor(vehicle, { distanceKm, durationMinutes }, rideType, surge, seats = 1) {
  const base = Number(vehicle.base_fare);
  const distanceFare = distanceKm * Number(vehicle.fare_per_km);
  const timeFare = durationMinutes * Number(vehicle.per_minute || 0);
  const bookingFee = Number(vehicle.booking_fee || 0);
  const minimumFare = Number(vehicle.min_fare || 0);
  const subtotal = base + distanceFare + timeFare;
  const surged = subtotal * surge;
  const minimumApplied = surged < minimumFare;
  let total = Math.max(minimumFare, surged) + bookingFee;
  if (rideType === 'shared') {
    total *= SHARED_FACTOR;
    if (seats > 1) total *= SHARED_EXTRA_SEAT_FACTOR;
  }
  const rounded = roundUp(total);
  return {
    currency: 'RWF',
    baseFare: Math.round(base),
    distanceFare: Math.round(distanceFare),
    timeFare: Math.round(timeFare),
    bookingFee: Math.round(bookingFee),
    surgeMultiplier: surge,
    minimumFare: Math.round(minimumFare),
    minimumApplied,
    sharedDiscountPercent: rideType === 'shared' ? Math.round((1 - SHARED_FACTOR) * 100) : 0,
    seats,
    total: rounded,
  };
}

function routeSummary(route) {
  return {
    distanceKm: Math.round((route.distanceMeters / 1000) * 100) / 100,
    durationMinutes: Math.max(1, Math.round(route.durationSeconds / 60)),
  };
}

/** Seats a booking takes: 1 or 2 on a shared ride; a private ride is the whole car. */
function normalizeSeats(rideType, seats) {
  if (rideType !== 'shared') return 1;
  const n = Math.round(Number(seats));
  return Number.isFinite(n) ? Math.min(MAX_SHARED_SEATS, Math.max(1, n)) : 1;
}

function quoteKey(pickup, destination, vehicleId, rideType, seats) {
  const r = (n) => Number(n).toFixed(4);
  return `${r(pickup.latitude)},${r(pickup.longitude)}|${r(destination.latitude)},${r(destination.longitude)}|${vehicleId}|${rideType}|${seats}`;
}

function pruneQuotes() {
  const now = Date.now();
  for (const [id, q] of quotes) if (q.expiresAt < now) quotes.delete(id);
}

/**
 * Prices every vehicle class for a trip in one go (one route lookup), for the
 * vehicle-choice screen. Each quote carries a quoteId that locks its price.
 */
async function quoteTrip(pickup, destination, rideType = 'private', seats = 1) {
  seats = normalizeSeats(rideType, seats);
  const [route, surge, etas, { rows: vehicles }] = await Promise.all([
    getRoadRoute(pickup, destination),
    surgeAt(pickup),
    pickupEtas(pickup),
    getPool().query('SELECT * FROM vehicles ORDER BY base_fare ASC'),
  ]);
  const trip = routeSummary(route);
  pruneQuotes();
  const expiresAt = Date.now() + QUOTE_TTL_MS;
  const options = vehicles.map((vehicle) => {
    const fare = priceFor(vehicle, trip, rideType, surge.multiplier, seats);
    const quoteId = crypto.randomBytes(9).toString('base64url');
    quotes.set(quoteId, {
      expiresAt,
      key: quoteKey(pickup, destination, vehicle.id, rideType, seats),
      fare,
      trip,
    });
    return {
      quoteId,
      vehicleId: vehicle.id,
      name: vehicle.name,
      description: vehicle.description,
      capacity: vehicle.capacity,
      pickupEtaMinutes: etas[vehicle.id] ?? null,
      fare,
    };
  });
  return {
    route: { coordinates: route.coordinates, source: route.source, ...trip },
    surge,
    expiresAt: new Date(expiresAt).toISOString(),
    // What a shared rider is promised: the most other riders may add to
    // their trip, and how many seats one booking may take.
    shared: rideType === 'shared' ? { maxAddedMinutes: MAX_ADDED_MINUTES, maxSeats: MAX_SHARED_SEATS, seats } : null,
    options,
  };
}

/**
 * The fare to charge for a new ride: the locked quote when a valid one for
 * exactly this trip is supplied, otherwise a fresh upfront price.
 */
async function fareForRide(vehicle, pickup, destination, rideType, quoteId, seats = 1) {
  seats = normalizeSeats(rideType, seats);
  const locked = quoteId ? quotes.get(quoteId) : null;
  if (
    locked &&
    locked.expiresAt > Date.now() &&
    locked.key === quoteKey(pickup, destination, vehicle.id, rideType, seats)
  ) {
    return { ...locked.trip, fare: locked.fare, locked: true };
  }
  const [route, surge] = await Promise.all([getRoadRoute(pickup, destination), surgeAt(pickup)]);
  const trip = routeSummary(route);
  return { ...trip, fare: priceFor(vehicle, trip, rideType, surge.multiplier, seats), locked: false };
}

module.exports = { quoteTrip, fareForRide, priceFor, surgeAt, roundUp, normalizeSeats, QUOTE_TTL_MS };
