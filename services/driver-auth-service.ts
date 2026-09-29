import { driverApiClient } from './driver-api-client';
import { getDriverToken, setDriverToken, setDriverId, clearDriverSession } from '../storage/driverSession';
import { DriverProfile, driverFromBackendJson } from '../types/driver';

// Mirrors services/auth-service.ts. Response shapes verified against
// server/src/routes/drivers.routes.js (register/login) and
// server/src/routes/driverProfile.routes.js (me/update).
async function saveSession(token: string, driverId: string): Promise<void> {
  await setDriverToken(token);
  await setDriverId(driverId);
}

export async function restoreDriverSession(): Promise<DriverProfile | null> {
  const token = await getDriverToken();
  if (!token) return null;
  try {
    const json = await driverApiClient.get<{ driver: any }>('/driver/me');
    return driverFromBackendJson(json.driver);
  } catch {
    await clearDriverSession();
    return null;
  }
}

export async function registerDriver(params: {
  fullName: string;
  phone: string;
  password: string;
  licenseNumber?: string;
}): Promise<DriverProfile> {
  const json = await driverApiClient.post<{ driver: any; token: string }>('/drivers/register', params, false);
  await saveSession(json.token, json.driver.id);
  return driverFromBackendJson(json.driver);
}

export async function driverLogIn(params: { phone: string; password: string }): Promise<DriverProfile> {
  const json = await driverApiClient.post<{ driver: any; token: string }>('/drivers/login', params, false);
  await saveSession(json.token, json.driver.id);
  return driverFromBackendJson(json.driver);
}

export async function updateDriverProfile(patch: {
  fullName?: string;
  email?: string;
  photoUrl?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  preferredLanguage?: string;
  // NOTE: no vehicle* keys — PUT /driver/me answers those with 400
  // "Update vehicle details through /driver/vehicle." Use
  // updateDriverVehicle() in services/driver-profile-service.ts instead.
}): Promise<DriverProfile> {
  const json = await driverApiClient.put<{ driver: any }>('/driver/me', patch);
  return driverFromBackendJson(json.driver);
}

export async function driverLogout(): Promise<void> {
  await clearDriverSession();
}

export async function deleteDriverAccount(): Promise<void> {
  await driverApiClient.delete('/driver/account');
  await clearDriverSession();
}
