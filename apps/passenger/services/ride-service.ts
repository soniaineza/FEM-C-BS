import { apiClient } from './api-client';
import type { TrailSample } from '@kimu/shared/components/map/map-types';
import { Place } from '@kimu/shared/types/place';
import { PaymentMethod, DEFAULT_PAYMENT_METHODS, BOOKABLE_PAYMENT_METHOD_IDS } from '@kimu/shared/types/payment';
import { Vehicle, vehicleFromBackendJson } from '@kimu/shared/types/vehicle';
import type { FareBreakdown } from '@kimu/shared/types/ride';
import {
  Ride,
  RideType,
  RideCompanion,
  RoutePoint,
  FareEstimate,
  rideCompanionFromBackendJson,
  routePointFromBackendJson,
  resolveRideFromBackendJson,
  rideTypeFareFactor,
} from '@kimu/shared/types/ride';

// Direct TS port of lib/services/ride_service.dart's REST calls. Response
// envelopes verified against server/src/routes/rides.routes.js. Departure
// from the Dart original: fare estimation now always calls the backend's
// GET /rides/estimate (server-authoritative — "the client's estimate is
// never trusted", per rideService.js's own comment) instead of relying
// purely on a duplicated local formula, so the number shown before booking
// can never drift from what's actually charged. straightLineKm/
// estimateDurationMinutesLocal are kept only for instant per-vehicle price
// list UI (vehicle-selection screen) before a network round trip is worth it.

const AVG_SPEED_KMH = 25;

export function straightLineKm(from: Place, to: Place): number {
  if (!from.latitude || !from.longitude || !to.latitude || !to.longitude) return 0;
  const R = 6371.0;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(to.latitude - from.latitude);
  const dLng = toRad(to.longitude - from.longitude);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(from.latitude)) * Math.cos(toRad(to.latitude)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function estimateDurationMinutesLocal(distanceKm: number): number {
  const minutes = Math.round((distanceKm / AVG_SPEED_KMH) * 60);
  return Math.min(600, Math.max(2, minutes));
}

// Local, instant preview only — mirrors server/src/utils/distance.js exactly
// so the two never visibly disagree, but the confirm-ride screen always
// re-fetches the authoritative number via fetchServerEstimate() before
// requesting the ride.
export function estimateFareLocal(vehicle: Vehicle, distanceKm: number, rideType: RideType): FareEstimate {
  const base = vehicle.baseFare + distanceKm * vehicle.farePerKm;
  const estimatedFare = base * rideTypeFareFactor(rideType);
  return {
    vehicle,
    distanceKm,
    durationMinutes: estimateDurationMinutesLocal(distanceKm),
    estimatedFare,
    rideType,
    isEstimate: true,
  };
}

export async function fetchServerEstimate(params: {
  pickup: Place;
  destination: Place;
  vehicle: Vehicle;
  rideType: RideType;
  seats?: number;
}): Promise<FareEstimate> {
  const { pickup, destination, vehicle, rideType, seats = 1 } = params;
  const json = await apiClient.get<{ estimate: { distanceKm: number; durationMinutes: number; estimatedFare: number } }>(
    `/rides/estimate?vehicleId=${vehicle.id}&rideType=${rideType}&seats=${seats}` +
      `&pickup=${pickup.latitude},${pickup.longitude}&destination=${destination.latitude},${destination.longitude}`
  );
  return {
    vehicle,
    distanceKm: json.estimate.distanceKm,
    durationMinutes: json.estimate.durationMinutes,
    estimatedFare: json.estimate.estimatedFare,
    rideType,
    isEstimate: false,
  };
}

// Server-authoritative vehicle catalogue. No fake fallback: if the backend
// is unreachable the UI shows an explicit error/empty state instead of
// pretending mock vehicles (with mock prices) are bookable — the spec
// forbids fake data in production flows.
export async function fetchVehicles(): Promise<Vehicle[]> {
  const json = await apiClient.get<{ vehicles: any[] }>('/vehicles');
  return json.vehicles.map(vehicleFromBackendJson);
}

export function getAvailablePaymentMethods(): PaymentMethod[] {
  return DEFAULT_PAYMENT_METHODS;
}

// Only methods the backend can actually charge today (see
// BOOKABLE_PAYMENT_METHOD_IDS — 'card' excluded until a processor exists).
export function getBookablePaymentMethods(): PaymentMethod[] {
  return DEFAULT_PAYMENT_METHODS.filter((m) => BOOKABLE_PAYMENT_METHOD_IDS.includes(m.id));
}

async function ridesCatalogues(): Promise<{ vehicles: Vehicle[]; paymentMethods: PaymentMethod[] }> {
  return { vehicles: await fetchVehicles(), paymentMethods: DEFAULT_PAYMENT_METHODS };
}

export async function requestRide(params: {
  pickup: Place;
  destination: Place;
  vehicle: Vehicle;
  paymentMethod: PaymentMethod;
  rideType: RideType;
  /** Seats to book on a shared ride (1 or 2). */
  seats?: number;
  /** Mobile-money number to charge instead of the account phone. */
  paymentPhone?: string;
  note?: string;
  promotionCode?: string;
  scheduledFor?: string;
  /** Locks the upfront price the rider was shown (from fetchTripQuote). */
  quoteId?: string;
}): Promise<Ride> {
  const body = {
    pickup: { address: params.pickup.address, latitude: params.pickup.latitude, longitude: params.pickup.longitude },
    destination: {
      address: params.destination.address,
      latitude: params.destination.latitude,
      longitude: params.destination.longitude,
    },
    vehicleId: params.vehicle.id,
    paymentMethodId: params.paymentMethod.id,
    rideType: params.rideType,
    seats: params.seats,
    paymentPhone: params.paymentPhone,
    rideNote: params.note,
    promotionCode: params.promotionCode,
    scheduledFor: params.scheduledFor,
    quoteId: params.quoteId,
  };
  const json = await apiClient.post<{ ride: any }>('/rides', body);
  const catalogues = await ridesCatalogues();
  return resolveRideFromBackendJson(json.ride, catalogues);
}

export async function getCurrentRide(): Promise<Ride | null> {
  const json = await apiClient.get<{ ride: any | null }>('/rides/current');
  if (!json.ride) return null;
  return resolveRideFromBackendJson(json.ride, await ridesCatalogues());
}

export async function getRideDetails(rideId: string): Promise<Ride> {
  const json = await apiClient.get<{ ride: any }>(`/rides/${rideId}`);
  return resolveRideFromBackendJson(json.ride, await ridesCatalogues());
}

export async function getRideHistory(): Promise<Ride[]> {
  const json = await apiClient.get<{ rides: any[] }>('/rides');
  const catalogues = await ridesCatalogues();
  return json.rides.map((r) => resolveRideFromBackendJson(r, catalogues));
}

export async function cancelRide(rideId: string, reason?: string): Promise<Ride> {
  const json = await apiClient.post<{ ride: any }>(`/rides/${rideId}/cancel`, { reason });
  return resolveRideFromBackendJson(json.ride, await ridesCatalogues());
}

// Pair Ride: the rider scanned (or typed) the driver's QR code. This verifies
// the car and moves the ride to pinVerified so the driver can start it.
export async function pairRide(code: string): Promise<Ride> {
  const json = await apiClient.post<{ ride: any }>('/rides/pair', { code: code.trim().toUpperCase() });
  return resolveRideFromBackendJson(json.ride, await ridesCatalogues());
}

export async function changeDestination(rideId: string, destination: Place): Promise<Ride> {
  const json = await apiClient.post<{ ride: any }>(`/rides/${rideId}/change-destination`, { destination });
  return resolveRideFromBackendJson(json.ride, await ridesCatalogues());
}

export async function rateRide(rideId: string, rating: number, comment?: string): Promise<Ride> {
  const json = await apiClient.post<{ ride: any }>(`/rides/${rideId}/rate`, { rating, comment });
  return resolveRideFromBackendJson(json.ride, await ridesCatalogues());
}

export interface DriverLocation {
  latitude: number;
  longitude: number;
  heading: number | null;
  recordedAt: string;
  /** Recent [serverEpochMs, lat, lng, heading] samples for smooth animation. */
  trail?: TrailSample[];
  /** Server clock when this was sent, to line samples up with local time. */
  serverTime?: number;
}

export async function getDriverLocation(rideId: string): Promise<DriverLocation | null> {
  const json = await apiClient.get<{ location: DriverLocation | null; serverTime?: number }>(
    `/rides/${rideId}/driver-location`
  );
  return json.location ? { ...json.location, serverTime: json.serverTime } : null;
}

export async function getRideRoute(rideId: string): Promise<RoutePoint[]> {
  const json = await apiClient.get<{ points: any[] }>(`/rides/${rideId}/route`);
  return json.points.map(routePointFromBackendJson);
}

export async function getRideCompanions(rideId: string): Promise<RideCompanion[]> {
  const json = await apiClient.get<{ companions: any[] }>(`/rides/${rideId}/companions`);
  return json.companions.map(rideCompanionFromBackendJson);
}

// Reports the passenger's own live GPS while a ride is active, so their
// assigned driver can see where they actually are pre-pickup (mirrors
// services/driver-service.ts's reportDriverLocation()).
export async function reportPassengerLocation(params: {
  latitude: number;
  longitude: number;
  heading?: number;
}): Promise<void> {
  await apiClient.post('/rides/location', params);
}

export interface NearbyDriver {
  id: string;
  latitude: number;
  longitude: number;
  heading: number | null;
  vehicleId: string | null;
  trail: TrailSample[];
}

export async function getNearbyDrivers(params: {
  latitude: number;
  longitude: number;
}): Promise<{ drivers: NearbyDriver[]; serverTime: number }> {
  const json = await apiClient.get<{ drivers: NearbyDriver[]; serverTime?: number }>(
    `/drivers/nearby?lat=${params.latitude}&lng=${params.longitude}`
  );
  return { drivers: json.drivers ?? [], serverTime: json.serverTime ?? Date.now() };
}

export type { FareBreakdown } from '@kimu/shared/types/ride';

export interface TripQuoteOption {
  quoteId: string;
  vehicleId: string;
  name: string;
  description: string;
  capacity: number;
  pickupEtaMinutes: number | null;
  fare: FareBreakdown;
}

export interface TripQuote {
  route: {
    coordinates: [number, number][];
    source: 'provider' | 'osrm' | 'estimate';
    distanceKm: number;
    durationMinutes: number;
  };
  surge: { multiplier: number; demand: number; supply: number };
  expiresAt: string;
  /** Shared rides only: the longest other riders may add to this trip. */
  shared: { maxAddedMinutes: number; maxSeats: number; seats: number } | null;
  options: TripQuoteOption[];
}

/**
 * Upfront prices for every vehicle class over the real road route, with the
 * route geometry, surge and pickup ETAs — one request for the whole
 * vehicle-choice sheet. Each option's quoteId locks its price when booking.
 */
export async function fetchTripQuote(params: { pickup: Place; destination: Place; rideType: RideType; seats?: number }): Promise<TripQuote> {
  const { pickup, destination, rideType, seats = 1 } = params;
  const json = await apiClient.get<{ quote: TripQuote }>(
    `/rides/quote?rideType=${rideType}&seats=${seats}` +
      `&pickup=${pickup.latitude},${pickup.longitude}&destination=${destination.latitude},${destination.longitude}`
  );
  return json.quote;
}
