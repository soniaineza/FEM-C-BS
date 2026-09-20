import { driverApiClient } from './driver-api-client';
import { fetchVehicles } from './ride-service';
import { DEFAULT_PAYMENT_METHODS } from '../types/payment';
import { Ride, resolveRideFromBackendJson } from '../types/ride';
import { DriverProfile, DriverStatus, driverFromBackendJson } from '../types/driver';

// Ride-operation calls against server/src/routes/drivers.routes.js (the
// "active" sub-router, all requireDriverAuth) and the online/offline toggle
// on server/src/routes/driverProfile.routes.js. Response envelopes verified
// against both files plus server/scripts/driver-console.js, the reference
// CLI actor these same endpoints were built for.

// GET /vehicles carries no auth requirement (see vehicles.routes.js), so the
// passenger-side catalogue fetch is safely reusable here to resolve a ride's
// vehicleId into a full Vehicle for display.
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

export async function reportDriverLocation(params: {
  latitude: number;
  longitude: number;
  heading?: number;
}): Promise<void> {
  await driverApiClient.post('/drivers/location', params);
}

/** Every ride currently assigned to this driver (a pooled trip can be more
 * than one), oldest-picked-up-first. */
export async function getActiveDriverRides(): Promise<Ride[]> {
  const json = await driverApiClient.get<{ rides: any[] }>('/drivers/rides/active');
  const catalogues = await ridesCatalogues();
  return json.rides.map((r) => resolveRideFromBackendJson(r, catalogues));
}

export async function acceptDriverRide(rideId: string): Promise<void> {
  await driverApiClient.post(`/drivers/rides/${rideId}/accept`);
}

export async function declineDriverRide(rideId: string): Promise<void> {
  await driverApiClient.post(`/drivers/rides/${rideId}/decline`);
}

export async function markDriverArrived(rideId: string): Promise<{ pin: string }> {
  return driverApiClient.post<{ pin: string; rideId: string; message: string }>(
    `/drivers/rides/${rideId}/arrived`
  );
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
