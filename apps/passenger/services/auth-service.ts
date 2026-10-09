import { apiClient } from './api-client';
import { API_BASE_URL } from '@kimu/shared/services/http';
import { getToken, setToken, getPassengerId, setPassengerId, clearSession } from '../storage/session';
import { Passenger, passengerFromBackendJson } from '../types/passenger';

export type OtpChannel = 'whatsapp' | 'sms' | 'none';

export interface AuthProviders {
  password: boolean;
  google: { enabled: boolean };
  phone: { enabled: boolean; channel: 'whatsapp' | 'sms' | 'email' | 'none' };
  email: { enabled: boolean };
}

// Which sign-in methods the server offers (GET /auth/providers): the Google
// button only appears when the server has Google credentials; phone and email
// passwordless sign-in are always offered.
export async function getProviders(): Promise<AuthProviders> {
  const json = await apiClient.get<any>('/auth/providers');
  const channel = json.phone?.channel;
  return {
    password: json.password !== false,
    google: { enabled: Boolean(json.google?.enabled) },
    phone: { enabled: json.phone?.enabled !== false, channel: ['whatsapp', 'sms', 'email', 'none'].includes(channel) ? channel : 'none' },
    email: { enabled: json.email?.enabled !== false },
  };
}

// --- Passwordless e-mail sign-in ---
export async function emailStart(email: string): Promise<{ otpSent?: boolean; otpChannel?: OtpChannel; devCode?: string; message?: string }> {
  return apiClient.post('/auth/email/start', { email }, false);
}

export async function emailVerify(email: string, code: string): Promise<{ passenger: Passenger; needsPhone: boolean }> {
  const json = await apiClient.post<{ passenger: any; token: string }>('/auth/email/verify', { email, code }, false);
  await saveSession(json.token, json.passenger.id);
  return { passenger: passengerFromBackendJson(json.passenger), needsPhone: false };
}

// --- Passwordless WhatsApp / phone sign-in ---
// Start sends a one-time code to the phone (WhatsApp when configured, else
// SMS); verify exchanges the code for a session. The same pair signs in an
// existing rider and signs up a new one.
export async function whatsappStart(phone: string): Promise<{ otpSent?: boolean; otpChannel?: OtpChannel; devCode?: string; message?: string }> {
  return apiClient.post('/auth/whatsapp/start', { phone }, false);
}

export async function whatsappVerify(phone: string, code: string): Promise<{ passenger: Passenger; needsPhone: boolean }> {
  const json = await apiClient.post<{ passenger: any; token: string }>('/auth/whatsapp/verify', { phone, code }, false);
  await saveSession(json.token, json.passenger.id);
  return { passenger: passengerFromBackendJson(json.passenger), needsPhone: false };
}

// --- Google sign-in (server-side OAuth flow) ---
// The app opens this URL in the system browser; the server brings it back to
// femcabs://google?code=… (native) or <web app>/google?code=… (web).
export function googleStartUrl(platform: 'native' | 'web', returnTo?: string): string {
  const params = new URLSearchParams({ platform });
  if (returnTo) params.set('return', returnTo);
  return `${API_BASE_URL}/auth/google/start?${params.toString()}`;
}

export async function exchangeGoogleCode(code: string): Promise<{ passenger: Passenger; needsPhone: boolean }> {
  const json = await apiClient.post<{ passenger: any; token: string; needsPhone?: boolean }>('/auth/google/exchange', { code }, false);
  await saveSession(json.token, json.passenger.id);
  return { passenger: passengerFromBackendJson(json.passenger), needsPhone: Boolean(json.needsPhone) };
}

// A Google rider (no phone yet) adds their number; the verification code is
// sent to it at once, then verifyOtp() below confirms it.
export async function addPhone(phone: string): Promise<{ passenger: Passenger; otpSent?: boolean; otpChannel?: OtpChannel; devCode?: string; message?: string }> {
  const json = await apiClient.post<{ passenger: any; otpSent?: boolean; otpChannel?: OtpChannel; devCode?: string }>('/auth/phone', { phone });
  return { passenger: passengerFromBackendJson(json.passenger), otpSent: json.otpSent, otpChannel: json.otpChannel, devCode: json.devCode };
}

// Direct TS port of lib/services/auth_service.dart, minus its dev-preview
// local-only fallback path (the RN app always has a real backend configured
// via EXPO_PUBLIC_API_BASE_URL, so that branch doesn't apply here). Response
// shapes verified against server/src/routes/auth.routes.js.
// persist=false ("Remember me" unticked) keeps the session in memory only.
async function saveSession(token: string, passengerId: string, persist = true): Promise<void> {
  await setToken(token, persist);
  await setPassengerId(passengerId, persist);
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

export async function logIn(params: {
  identifier: string;
  password: string;
  remember?: boolean;
}): Promise<{ passenger: Passenger; otpSent?: boolean }> {
  const { identifier, password, remember = true } = params;
  const json = await apiClient.post<{ passenger: any; token: string; otpSent?: boolean }>('/auth/login', { identifier, password }, false);
  await saveSession(json.token, json.passenger.id, remember);
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
