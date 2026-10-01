// Upfront fares for the on-device backend. Mirrors server/src/services/pricing.js
// (the FEM tariff in utils/tariff.ts, shared discount, rounded up to 100 RWF) so the numbers match the server-backed apps. The route
// follows real streets when a routing service answered (roads.ts) and is a local
// curve otherwise; there is no surge.

import { VEHICLES, type VehicleRec } from './db';
import { tariffFare, waitingCharge } from './tariff';
import { buildRoute, haversineKm, hasRoad, type LatLng, type Path } from './geo';

const SHARED_FACTOR = 0.7;
const ROUND_TO = 100;
/** Straight-ish local route -> real streets wind about this much more. */
const ROAD_FACTOR = 1.15;
const AVG_KMH = 25;
export const QUOTE_TTL_MS = 5 * 60 * 1000;

export interface TripSummary {
  path: Path;
  distanceKm: number;
  durationMinutes: number;
}

export function summariseTrip(from: LatLng, to: LatLng): TripSummary {
  const path = buildRoute(from, to);
  // Real street geometry is already the driven distance; the local curve is not.
  const distanceKm = Math.round((path.lengthM / 1000) * (hasRoad(from, to) ? 1 : ROAD_FACTOR) * 100) / 100;
  const durationMinutes = Math.max(1, Math.round((distanceKm / AVG_KMH) * 60));
  return { path, distanceKm, durationMinutes };
}

/** 'osrm' when the route follows real streets, 'estimate' for the local curve. */
export const routeSource = (from: LatLng, to: LatLng): 'osrm' | 'estimate' => (hasRoad(from, to) ? 'osrm' : 'estimate');

export interface FareBreakdown {
  currency: 'RWF';
  baseFare: number;
  distanceFare: number;
  timeFare: number;
  bookingFee: number;
  surgeMultiplier: number;
  minimumFare: number;
  minimumApplied: boolean;
  sharedDiscountPercent: number;
  total: number;
}

export function priceFor(
  _vehicle: VehicleRec,
  trip: { distanceKm: number; durationMinutes: number },
  rideType: 'private' | 'shared',
  surge = 1,
  waitingMinutes = 0
): FareBreakdown {
  // One rate card for every vehicle class (utils/tariff.ts).
  const fare = tariffFare(trip.distanceKm, waitingMinutes);
  const total = fare.total * surge * (rideType === 'shared' ? SHARED_FACTOR : 1);
  return {
    currency: 'RWF',
    baseFare: Math.round(fare.baseFare),
    distanceFare: Math.round(fare.distanceFare),
    timeFare: Math.round(fare.waitingFare), // waiting charge
    bookingFee: 0,
    surgeMultiplier: surge,
    minimumFare: Math.round(fare.baseFare),
    minimumApplied: false,
    sharedDiscountPercent: rideType === 'shared' ? Math.round((1 - SHARED_FACTOR) * 100) : 0,
    total: Math.ceil(total / ROUND_TO) * ROUND_TO,
  };
}

// A quote locks its price for a few minutes so the number shown is the number
// charged. Held in memory only: a quote that outlives the app is simply
// re-priced with the same formula.
const quotes = new Map<string, { expiresAt: number; key: string; fare: FareBreakdown }>();

const r4 = (n: number) => n.toFixed(4);
export function quoteKey(pickup: LatLng, destination: LatLng, vehicleId: string, rideType: string): string {
  return `${r4(pickup.latitude)},${r4(pickup.longitude)}|${r4(destination.latitude)},${r4(destination.longitude)}|${vehicleId}|${rideType}`;
}

export function rememberQuote(id: string, key: string, fare: FareBreakdown): number {
  const now = Date.now();
  for (const [k, q] of quotes) if (q.expiresAt < now) quotes.delete(k);
  const expiresAt = now + QUOTE_TTL_MS;
  quotes.set(id, { expiresAt, key, fare });
  return expiresAt;
}

export function lockedFare(quoteId: string | undefined, key: string): FareBreakdown | null {
  const q = quoteId ? quotes.get(quoteId) : undefined;
  return q && q.expiresAt > Date.now() && q.key === key ? q.fare : null;
}

export function vehicleById(id: string): VehicleRec | undefined {
  return VEHICLES.find((v) => v.id === id);
}

export { haversineKm };

/**
 * What the trip finally costs: the quoted fare plus the waiting charge for the
 * time the driver stood at the pickup before the trip started (free for the
 * first 15 minutes — see tariff.ts).
 */
export function finalFareFor(ride: { estimatedFare: number; arrivedAt: string | null; startedAt: string | null }): number {
  if (!ride.arrivedAt || !ride.startedAt) return ride.estimatedFare;
  const waitedMinutes = Math.max(0, Date.parse(ride.startedAt) - Date.parse(ride.arrivedAt)) / 60_000;
  return ride.estimatedFare + waitingCharge(waitedMinutes);
}
