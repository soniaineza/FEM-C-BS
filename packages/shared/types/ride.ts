import { Place } from './place';
import { Vehicle } from './vehicle';
import { PaymentMethod } from './payment';

// Fare breakdown the server returns with each quote.
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

// Must match server/src/services/rideStateMachine.js's TRANSITIONS graph
// exactly — that state machine is authoritative; the client only displays
// and reacts to status, never invents a transition.
export type RideStatus =
  | 'scheduled'
  | 'searchingDriver'
  | 'driverAssigned'
  | 'driverArriving'
  | 'driverArrived'
  | 'pinVerified'
  | 'inProgress'
  | 'arrived'
  | 'paymentPending'
  | 'completed'
  | 'cancelled';

export function canCancelRide(status: RideStatus): boolean {
  return (
    status === 'scheduled' ||
    status === 'searchingDriver' ||
    status === 'driverAssigned' ||
    status === 'driverArriving' ||
    status === 'driverArrived'
  );
}

// Maps a raw ride status to its translation key — status codes were
// previously rendered verbatim (e.g. "driverAssigned", "cancelled") in both
// apps, which is always English regardless of the selected locale. Callers
// do `t(rideStatusKey(ride.status))`.
const RIDE_STATUS_KEYS: Record<RideStatus, string> = {
  scheduled: 'rideStatusScheduled',
  searchingDriver: 'rideStatusSearchingDriver',
  driverAssigned: 'rideStatusDriverAssigned',
  driverArriving: 'rideStatusDriverArriving',
  driverArrived: 'rideStatusDriverArrived',
  pinVerified: 'rideStatusPinVerified',
  inProgress: 'rideStatusInProgress',
  arrived: 'rideStatusArrived',
  paymentPending: 'rideStatusPaymentPending',
  completed: 'rideStatusCompleted',
  cancelled: 'rideStatusCancelled',
};

export function rideStatusKey(status: RideStatus): any {
  return RIDE_STATUS_KEYS[status] ?? status;
}

export type RideType = 'private' | 'shared';

export function rideTypeFromId(id: string): RideType {
  return id === 'shared' ? 'shared' : 'private';
}

export function rideTypeFareFactor(type: RideType): number {
  return type === 'shared' ? 0.7 : 1.0;
}

export function rideTypeDiscountPercent(type: RideType): number {
  return type === 'shared' ? 30 : 0;
}

export interface Driver {
  name: string;
  phone: string;
  rating: number;
  vehicleModel: string;
  vehicleColor: string;
  licensePlate: string;
  photoUrl?: string;
  latitude?: number;
  longitude?: number;
  etaMinutes?: number;
}

// Backend's rideToJson() (server/src/utils/serialize.js) already nests this
// as ride.driver: { name, phone, rating, vehicleModel, vehicleColor,
// licensePlate } | null.
export function driverFromBackendJson(json: any): Driver {
  return {
    name: json.name ?? '',
    phone: json.phone ?? '',
    rating: json.rating ?? 0,
    vehicleModel: json.vehicleModel ?? '',
    vehicleColor: json.vehicleColor ?? '',
    licensePlate: json.licensePlate ?? '',
    photoUrl: undefined,
  };
}

// The driver-app counterpart of Driver — who the driver is picking up. Only
// populated when the server query joined passengers (see
// server/src/utils/serialize.js's riderFromRide()); passenger-facing
// screens never receive this. Deliberately has no phone number — a driver
// can identify and reach the rider through the ride itself, never see their
// raw number (see riderFromRide's comment). latitude/longitude are the
// rider's live position, reported by their own phone pre-pickup.
export interface Rider {
  name: string;
  latitude: number | null;
  longitude: number | null;
}

export function riderFromBackendJson(json: any): Rider {
  return { name: json.name ?? '', latitude: json.latitude ?? null, longitude: json.longitude ?? null };
}

export interface FareEstimate {
  vehicle: Vehicle;
  distanceKm: number;
  durationMinutes: number;
  estimatedFare: number;
  rideType: RideType;
  isEstimate: boolean;
  /** Locks this upfront price when the ride is requested. */
  quoteId?: string;
  breakdown?: FareBreakdown;
  pickupEtaMinutes?: number | null;
  /** Road route as [lng, lat] pairs, for the map. */
  routeCoordinates?: [number, number][];
  routeSource?: 'provider' | 'osrm' | 'estimate';
}

export interface Ride {
  id: string;
  pickup: Place;
  destination: Place;
  vehicle: Vehicle;
  paymentMethod: PaymentMethod;
  status: RideStatus;
  estimatedFare: number;
  distanceKm: number;
  durationMinutes: number;
  rideType: RideType;
  note?: string;
  driver?: Driver;
  rider?: Rider;
  createdAt?: string;
  startedAt?: string;
  completedAt?: string;
  finalFare?: number;
  rating?: number;
  pin?: string;
  scheduledFor?: string;
  appliedDiscount?: number;
  isPooled: boolean;
  seats: number;
  /** Set when unconfirmed cash was handed to an operator; the rider is free to go. */
  cashDisputedAt?: string;
  cancellationReason?: string;
  cancelledBy?: string;
}

export interface RideCompanion {
  firstName: string;
  status: string;
}

export function rideCompanionFromBackendJson(json: any): RideCompanion {
  return { firstName: json.firstName ?? json.first_name ?? '', status: json.status ?? '' };
}

export interface RoutePoint {
  latitude: number;
  longitude: number;
  recordedAt?: string;
}

export function routePointFromBackendJson(json: any): RoutePoint {
  return {
    latitude: json.latitude,
    longitude: json.longitude,
    recordedAt: json.recordedAt ?? json.recorded_at ?? undefined,
  };
}

// json is the unwrapped ride object from the backend's rideToJson() — the
// caller unwraps the {ride: ...} envelope first. vehicleId/paymentMethodId
// are ids only; the caller resolves them against its own fetched vehicle
// catalogue / DEFAULT_PAYMENT_METHODS and passes the resolved objects in,
// same pattern as the old Dart Ride.fromBackendJson.
export function rideFromBackendJson(
  json: any,
  opts: { vehicle: Vehicle; paymentMethod: PaymentMethod }
): Ride {
  return {
    id: json.id,
    pickup: {
      address: json.pickup?.address ?? '',
      latitude: json.pickup?.latitude ?? undefined,
      longitude: json.pickup?.longitude ?? undefined,
    },
    destination: {
      address: json.destination?.address ?? '',
      latitude: json.destination?.latitude ?? undefined,
      longitude: json.destination?.longitude ?? undefined,
    },
    vehicle: opts.vehicle,
    paymentMethod: opts.paymentMethod,
    status: json.status,
    estimatedFare: json.estimatedFare ?? 0,
    distanceKm: json.distanceKm ?? 0,
    durationMinutes: json.durationMinutes ?? 0,
    rideType: rideTypeFromId(json.rideType ?? 'private'),
    note: json.note ?? undefined,
    driver: json.driver ? driverFromBackendJson(json.driver) : undefined,
    rider: json.rider ? riderFromBackendJson(json.rider) : undefined,
    createdAt: json.createdAt ?? undefined,
    startedAt: json.startedAt ?? undefined,
    completedAt: json.completedAt ?? undefined,
    finalFare: json.finalFare ?? undefined,
    rating: json.rating ?? undefined,
    pin: json.pin ?? undefined,
    scheduledFor: json.scheduledFor ?? undefined,
    appliedDiscount: json.appliedDiscount ?? undefined,
    isPooled: Boolean(json.isPooled),
    seats: json.seats ?? 1,
    cashDisputedAt: json.cashDisputedAt ?? undefined,
    cancellationReason: json.cancellationReason ?? undefined,
    cancelledBy: json.cancelledBy ?? undefined,
  };
}

// Resolves a ride's vehicleId/paymentMethodId (ids only, per rideToJson)
// against fetched catalogues, then delegates to rideFromBackendJson.
export function resolveRideFromBackendJson(
  json: any,
  catalogues: { vehicles: Vehicle[]; paymentMethods: PaymentMethod[] }
): Ride {
  const vehicle =
    catalogues.vehicles.find((v) => v.id === json.vehicleId) ??
    ({ id: json.vehicleId, name: json.vehicleId, description: '', capacity: 4, baseFare: 0, farePerKm: 0, etaMinutes: 0 } as Vehicle);
  const paymentMethod =
    catalogues.paymentMethods.find((m) => m.id === json.paymentMethodId) ??
    ({ id: json.paymentMethodId, name: json.paymentMethodId, type: 'cash', detail: '' } as PaymentMethod);
  return rideFromBackendJson(json, { vehicle, paymentMethod });
}

export function formatFare(amount: number): string {
  return `${Math.round(amount).toLocaleString('en-US')} RWF`;
}
