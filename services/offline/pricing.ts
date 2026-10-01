// Upfront fares for the on-device backend. Mirrors server/src/services/pricing.js
// (base + per-km + per-minute, minimum fare, booking fee, shared discount,
// rounded up to 100 RWF) so the numbers match the server-backed apps. The route
// follows real streets when a routing service answered (roads.ts) and is a local
// curve otherwise; there is no surge.

import { VEHICLES, type VehicleRec } from './db';
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
  vehicle: VehicleRec,
  trip: { distanceKm: number; durationMinutes: number },
  rideType: 'private' | 'shared',
  surge = 1
): FareBreakdown {
  const distanceFare = trip.distanceKm * vehicle.farePerKm;
  const timeFare = trip.durationMinutes * vehicle.perMinute;
  const surged = (vehicle.baseFare + distanceFare + timeFare) * surge;
  const minimumApplied = surged < vehicle.minFare;
  let total = Math.max(vehicle.minFare, surged) + vehicle.bookingFee;
  if (rideType === 'shared') total *= SHARED_FACTOR;
  return {
    currency: 'RWF',
    baseFare: Math.round(vehicle.baseFare),
    distanceFare: Math.round(distanceFare),
    timeFare: Math.round(timeFare),
    bookingFee: Math.round(vehicle.bookingFee),
    surgeMultiplier: surge,
    minimumFare: Math.round(vehicle.minFare),
    minimumApplied,
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
