import { apiClient } from './api-client';
import { getToken, setToken, getPassengerId, setPassengerId, clearSession } from '../storage/session';
import { Passenger, passengerFromBackendJson } from '../types/passenger';

// Direct TS port of lib/services/auth_service.dart, minus its dev-preview
// local-only fallback path (the RN app always has a real backend configured
// via EXPO_PUBLIC_API_BASE_URL, so that branch doesn't apply here). Response
// shapes verified against server/src/routes/auth.routes.js.
async function saveSession(token: string, passengerId: string): Promise<void> {
  await setToken(token);
  await setPassengerId(passengerId);
}

export async function restoreSession(): Promise<Passenger | null> {
  const token = await getToken();
  if (!token) return null;
  try {
    const json = await apiClient.get<{ passenger: any }>('/auth/me');
    return passengerFromBackendJson(json.passenger);
  } catch {
    await clearSession();
    return null;
  }
}

export async function signUp(params: {
  fullName: string;
  phone: string;
  email: string;
  password: string;
}): Promise<{ passenger: Passenger; devCode?: string; otpSent?: boolean }> {
  const json = await apiClient.post<{ passenger: any; token: string; devCode?: string; otpSent?: boolean }>('/auth/signup', params, false);
  await saveSession(json.token, json.passenger.id);
  return {
    passenger: passengerFromBackendJson(json.passenger),
    devCode: json.devCode,
    otpSent: json.otpSent,
  };
}

export async function logIn(params: { identifier: string; password: string }): Promise<{ passenger: Passenger; otpSent?: boolean }> {
  const json = await apiClient.post<{ passenger: any; token: string; otpSent?: boolean }>('/auth/login', params, false);
  await saveSession(json.token, json.passenger.id);
  return { passenger: passengerFromBackendJson(json.passenger), otpSent: json.otpSent };
}

export async function resetPassword(identifier: string): Promise<{ message: string; devCode?: string }> {
  const json = await apiClient.post<{ message: string; devCode?: string }>('/auth/reset-password/request', { identifier }, false);
  return { message: json.message ?? '', devCode: json.devCode };
}

export async function confirmResetPassword(params: {
  identifier: string;
  code: string;
  newPassword: string;
}): Promise<void> {
  await apiClient.post('/auth/reset-password/confirm', params, false);
}

// verify-otp only returns { verified: true } — no token/passenger. The
// session (token + passenger id) was already saved by signUp(); after a
// successful verify, the caller refreshes via restoreSession()/GET auth/me
// to pick up the now-verified state.
export async function verifyOtp(params: { passengerId: string; code: string }): Promise<void> {
  await apiClient.post('/auth/verify-otp', params);
}

export async function resendOtp(purpose: string = 'signup'): Promise<{ devCode?: string }> {
  const json = await apiClient.post<{ devCode?: string }>('/auth/resend-otp', { purpose });
  return { devCode: json.devCode };
}

export async function updateProfile(passenger: Passenger): Promise<Passenger> {
  const json = await apiClient.put<{ passenger: any }>('/auth/profile', {
    fullName: passenger.fullName,
    phone: passenger.phone,
    email: passenger.email,
    photoUrl: passenger.photoUrl,
    emergencyContactName: passenger.emergencyContactName,
    emergencyContactPhone: passenger.emergencyContactPhone,
  });
  return passengerFromBackendJson(json.passenger);
}

export async function logout(): Promise<void> {
  await clearSession();
}

export async function deleteAccount(): Promise<void> {
  await apiClient.delete('/auth/account');
  await clearSession();
}

export { getPassengerId };
