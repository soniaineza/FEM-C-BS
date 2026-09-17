import { Place } from './place';
import { Vehicle } from './vehicle';
import { PaymentMethod } from './payment';

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

export interface FareEstimate {
  vehicle: Vehicle;
  distanceKm: number;
  durationMinutes: number;
  estimatedFare: number;
  rideType: RideType;
  isEstimate: boolean;
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
  createdAt?: string;
  startedAt?: string;
  completedAt?: string;
  finalFare?: number;
  rating?: number;
  pin?: string;
  scheduledFor?: string;
  appliedDiscount?: number;
  isPooled: boolean;
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
    createdAt: json.createdAt ?? undefined,
    startedAt: json.startedAt ?? undefined,
    completedAt: json.completedAt ?? undefined,
    finalFare: json.finalFare ?? undefined,
    rating: json.rating ?? undefined,
    pin: json.pin ?? undefined,
    scheduledFor: json.scheduledFor ?? undefined,
    appliedDiscount: json.appliedDiscount ?? undefined,
    isPooled: Boolean(json.isPooled),
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
