const crypto = require('crypto');

const { getPool } = require('../db');
const { haversineKm } = require('../utils/distance');
const { getFareRoute, getTravelTimes, estimateSeconds } = require('./routing');
const { eligibleDriverSql } = require('./driverKyc');
const { MAX_ADDED_MINUTES } = require('./poolPlanner');


const SHARED_FACTOR = 0.7;

const MAX_SHARED_SEATS = 2;
const SHARED_EXTRA_SEAT_FACTOR = 1.25;
// Whole francs. This used to round up to the nearest 100, which quietly broke
// the published tariff: a true 1 km + 4 km trip is 1800 + 4x1080 = 6120, and
// rounding served 6200. The fare table is what the rider is charged.
const ROUND_TO = 1;
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

/**
 * Distance money under Kimu's published tariff, which is tiered rather than
 * one flat rate per km:
 *   - the base fare already covers the first `included_km`
 *   - every km from there up to `long_distance_km` costs `fare_per_km`
 *   - every km beyond that costs `fare_per_km_long`
 *
 * A class with no tier columns set falls back to the flat rate, so an
 * operator-added vehicle still prices sensibly.
 */
function distanceFareFor(vehicle, distanceKm) {
  const includedKm = Number(vehicle.included_km || 0);
  const nearRate = Number(vehicle.fare_per_km || 0);
  const longFromKm = vehicle.long_distance_km == null ? Infinity : Number(vehicle.long_distance_km);
  const farRate = vehicle.fare_per_km_long == null ? nearRate : Number(vehicle.fare_per_km_long);

  // Kilometres in the normal band, then the long-distance band. Both clamp at
  // zero so a trip shorter than the included distance costs only the base.
  const nearKm = Math.max(0, Math.min(distanceKm, longFromKm) - includedKm);
  const farKm = Math.max(0, distanceKm - Math.max(longFromKm, includedKm));
  return nearKm * nearRate + farKm * farRate;
}

/** Itemised fare for one vehicle class over a known road route. */
function priceFor(vehicle, { distanceKm, durationMinutes }, rideType, surge, seats = 1) {
  const base = Number(vehicle.base_fare);
  const distanceFare = distanceFareFor(vehicle, distanceKm);
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
    // The published rates this fare was built from, so a receipt can be
    // checked against the fare table without another lookup.
    tariff: tariffOf(vehicle),
    total: rounded,
  };
}

/** The published fare table for one vehicle class, as the apps display it. */
function tariffOf(vehicle) {
  return {
    currency: 'RWF',
    baseFare: Math.round(Number(vehicle.base_fare || 0)),
    includedKm: Number(vehicle.included_km || 0),
    perKm: Math.round(Number(vehicle.fare_per_km || 0)),
    longDistanceKm: vehicle.long_distance_km == null ? null : Number(vehicle.long_distance_km),
    perKmLong: vehicle.fare_per_km_long == null ? null : Math.round(Number(vehicle.fare_per_km_long)),
    // Published so riders know the policy. Nothing measures waiting time yet,
    // so no waiting money is ever added to a fare.
    waitingFee: vehicle.waiting_fee == null ? null : Math.round(Number(vehicle.waiting_fee)),
    waitingFeeMinutes: vehicle.waiting_fee_minutes == null ? null : Number(vehicle.waiting_fee_minutes),
    freeWaitingMinutes: vehicle.free_waiting_minutes == null ? null : Number(vehicle.free_waiting_minutes),
  };
}

function routeSummary(route) {
  const distanceKm = Math.round((route.distanceMeters / 1000) * 100) / 100;
  const providerMinutes = Math.round(route.durationSeconds / 60);
  // Keep the ETA in step with the distance. A realistic Kigali city pace is
  // about 22 km/h (~2.7 min per km), so the shown minutes never drop below
  // that even when a provider returns an optimistic free-flow duration — the
  // minutes always track the kilometres.
  const cityPaceMinutes = Math.round((distanceKm / 22) * 60);
  return {
    distanceKm,
    durationMinutes: Math.max(1, providerMinutes, cityPaceMinutes),
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
    getFareRoute(pickup, destination),
    surgeAt(pickup),
    pickupEtas(pickup),
    getPool().query('SELECT * FROM vehicles ORDER BY base_fare ASC'),
  ]);
  const trip = routeSummary(route);
  pruneQuotes();
  const expiresAt = Date.now() + QUOTE_TTL_MS;
  // A driver who has not registered a vehicle class counts as the cheapest
  // class (as in matching), so their ETA is shown there too.
  const etaFor = (vehicle, index) => {
    const own = etas[vehicle.id];
    if (index !== 0 || etas.any == null) return own ?? null;
    return own == null ? etas.any : Math.min(own, etas.any);
  };
  const options = vehicles.map((vehicle, index) => {
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
      pickupEtaMinutes: etaFor(vehicle, index),
      fare,
    };
  });
  return {
    route: { coordinates: route.coordinates, source: route.source, provider: route.provider, ...trip },
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
  const [route, surge] = await Promise.all([getFareRoute(pickup, destination), surgeAt(pickup)]);
  const trip = routeSummary(route);
  return { ...trip, fare: priceFor(vehicle, trip, rideType, surge.multiplier, seats), locked: false };
}

module.exports = { quoteTrip, fareForRide, priceFor, distanceFareFor, tariffOf, surgeAt, roundUp, normalizeSeats, QUOTE_TTL_MS };
