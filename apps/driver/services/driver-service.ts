import { driverApiClient } from './driver-api-client';
import { DEFAULT_PAYMENT_METHODS } from '@kimu/shared/types/payment';
import { Vehicle, vehicleFromBackendJson } from '@kimu/shared/types/vehicle';
import { Ride, resolveRideFromBackendJson } from '@kimu/shared/types/ride';
import { DriverProfile, DriverStatus, driverFromBackendJson } from '../types/driver';

// Ride-operation calls against server/src/routes/drivers.routes.js (the
// "active" sub-router, all requireDriverAuth) and the online/offline toggle
// on server/src/routes/driverProfile.routes.js. Response envelopes verified
// against both files plus server/scripts/driver-console.js, the reference
// CLI actor these same endpoints were built for.

// The vehicle catalogue (GET /vehicles, no auth needed — see
// vehicles.routes.js), used to resolve a ride's vehicleId into a full Vehicle
// for display and by the tariff screen.
export async function fetchVehicles(): Promise<Vehicle[]> {
  const json = await driverApiClient.get<{ vehicles: any[] }>('/vehicles');
  return json.vehicles.map(vehicleFromBackendJson);
}

async function ridesCatalogues() {
  return { vehicles: await fetchVehicles(), paymentMethods: DEFAULT_PAYMENT_METHODS };
}

async function resolveOne(json: any): Promise<Ride> {
  return resolveRideFromBackendJson(json, await ridesCatalogues());
}

export async function setDriverStatus(status: DriverStatus): Promise<DriverProfile> {
  const json = await driverApiClient.put<{ driver: any }>('/driver/status', { status });
  return driverFromBackendJson(json.driver);
}

/** What the server did with a reported fix. A fix it does not trust (too
 * old, too inaccurate, an impossible jump...) is ignored, with the reason. */
export interface LocationReportResult {
  accepted: boolean;
  reason?: 'invalid' | 'stale' | 'low_accuracy' | 'too_frequent' | 'jump';
}

export async function reportDriverLocation(params: {
  latitude: number;
  longitude: number;
  heading?: number;
  /** Radius of uncertainty reported by the phone, in metres. */
  accuracy?: number;
  /** When the phone took the fix (epoch ms). */
  recordedAt?: number;
}): Promise<LocationReportResult> {
  const json = await driverApiClient.post<LocationReportResult | undefined>('/drivers/location', params);
  return json && typeof json.accepted === 'boolean' ? json : { accepted: true };
}

/** Every ride currently assigned to this driver (a pooled trip can be more
 * than one), oldest-picked-up-first. */
export async function getActiveDriverRides(): Promise<Ride[]> {
  const json = await driverApiClient.get<{ rides: any[] }>('/drivers/rides/active');
  const catalogues = await ridesCatalogues();
  return json.rides.map((r) => resolveRideFromBackendJson(r, catalogues));
}

/** One pickup or drop-off in the driver's ordered stop plan. */
export interface DriverStop {
  type: 'pickup' | 'dropoff';
  rideId: string;
  address: string;
  latitude: number;
  longitude: number;
  etaMinutes: number;
  passengerName: string;
  seats: number;
  rideStatus: string;
}

/** Every remaining pickup and drop-off across the driver's active rides, in
 * the order to drive them (server/src/services/poolPlanner.js). */
export async function getDriverStops(): Promise<DriverStop[]> {
  const json = await driverApiClient.get<{ stops: DriverStop[] }>('/drivers/rides/stops');
  return json.stops;
}

export async function acceptDriverRide(rideId: string): Promise<void> {
  await driverApiClient.post(`/drivers/rides/${rideId}/accept`);
}

export async function declineDriverRide(rideId: string): Promise<void> {
  await driverApiClient.post(`/drivers/rides/${rideId}/decline`);
}

export async function markDriverArrived(rideId: string): Promise<{ pin: string }> {
  const json = await driverApiClient.post<{ rideId: string; message: string; pin: string }>(
    `/drivers/rides/${rideId}/arrived`
  );
  return { pin: json.pin };
}

export async function confirmDriverCashPayment(rideId: string): Promise<void> {
  await driverApiClient.post(`/drivers/rides/${rideId}/confirm-cash`);
}

export async function verifyDriverRidePin(rideId: string, pin: string): Promise<void> {
  await driverApiClient.post(`/drivers/rides/${rideId}/verify-pin`, { pin });
}

export interface CompleteTripResult {
  ride: Ride;
  payment: { id: string; amount: number; method: string; status: string; state: string };
}

export async function completeDriverTrip(rideId: string): Promise<CompleteTripResult> {
  const json = await driverApiClient.post<{ ride: any; payment: CompleteTripResult['payment'] }>(
    `/drivers/rides/${rideId}/complete-trip`
  );
  return { ride: await resolveOne(json.ride), payment: json.payment };
}

export async function cancelDriverRide(rideId: string, reason?: string): Promise<Ride> {
  const json = await driverApiClient.post<{ ride: any }>(`/drivers/rides/${rideId}/cancel`, { reason });
  return resolveOne(json.ride);
}

export async function getDriverRideHistory(): Promise<Ride[]> {
  const json = await driverApiClient.get<{ rides: any[] }>('/driver/rides');
  const catalogues = await ridesCatalogues();
  return json.rides.map((r) => resolveRideFromBackendJson(r, catalogues));
}

export async function getDriverRideDetails(rideId: string): Promise<Ride> {
  const json = await driverApiClient.get<{ ride: any }>(`/driver/rides/${rideId}`);
  return resolveOne(json.ride);
}
