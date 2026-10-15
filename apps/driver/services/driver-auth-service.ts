import { driverApiClient, ApiError } from './driver-api-client';
import {
  getDriverToken,
  setDriverToken,
  setDriverId,
  clearDriverSession,
  getCachedDriverProfile,
  setCachedDriverProfile,
} from '../storage/driverSession';
import { DriverProfile, driverFromBackendJson } from '../types/driver';

// Mirrors services/auth-service.ts. Response shapes verified against
// server/src/routes/drivers.routes.js (register/login) and
// server/src/routes/driverProfile.routes.js (me/update).
async function saveSession(token: string, driverJson: any): Promise<void> {
  await setDriverToken(token);
  await setDriverId(driverJson.id);
  await setCachedDriverProfile(driverJson);
}

/**
 * The signed-in driver, or null when there is no session.
 *
 * Only a refused session ends it: 401 (expired, account closed) or 403
 * (suspended). A network failure, a timeout while the API cold-starts, or a
 * server error keeps the token and returns the last profile the server sent.
 * Clearing the session on every error is what used to send applicants back
 * to a login screen that then refused them until approval.
 */
export async function restoreDriverSession(): Promise<DriverProfile | null> {
  const token = await getDriverToken();
  if (!token) return null;
  try {
    const json = await driverApiClient.get<{ driver: any }>('/driver/me');
    await setCachedDriverProfile(json.driver);
    return driverFromBackendJson(json.driver);
  } catch (err) {
    const status = err instanceof ApiError ? err.status : undefined;
    if (status === 401 || status === 403) {
      await clearDriverSession();
      return null;
    }
    const cached = await getCachedDriverProfile();
    return cached ? driverFromBackendJson(cached) : null;
  }
}

export async function registerDriver(params: {
  fullName: string;
  phone: string;
  password: string;
  licenseNumber?: string;
}): Promise<DriverProfile> {
  const json = await driverApiClient.post<{ driver: any; token: string }>('/drivers/register', params, false);
  await saveSession(json.token, json.driver);
  return driverFromBackendJson(json.driver);
}

/**
 * Signs in. A driver whose documents are not yet approved gets a session
 * too (`pendingApproval` in the response); the (driver) layout then keeps
 * them on the documents screen until an operator verifies the account.
 */
export async function driverLogIn(params: { phone: string; password: string }): Promise<DriverProfile> {
  const json = await driverApiClient.post<{ driver: any; token: string; pendingApproval?: boolean }>('/drivers/login', params, false);
  await saveSession(json.token, json.driver);
  return driverFromBackendJson(json.driver);
}

export async function updateDriverProfile(patch: {
  fullName?: string;
  email?: string;
  photoUrl?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  preferredLanguage?: string;
  vehicleMake?: string;
  vehicleModel?: string;
  vehicleYear?: number;
  vehicleColor?: string;
  vehiclePlate?: string;
}): Promise<DriverProfile> {
  const json = await driverApiClient.put<{ driver: any }>('/driver/me', patch);
  await setCachedDriverProfile(json.driver);
  return driverFromBackendJson(json.driver);
}

export async function driverLogout(): Promise<void> {
  await clearDriverSession();
}

export async function deleteDriverAccount(): Promise<void> {
  await driverApiClient.delete('/driver/account');
  await clearDriverSession();
}
