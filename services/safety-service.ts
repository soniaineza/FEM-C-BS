import { Linking } from 'react-native';

import { apiClient } from './api-client';

// Response envelopes verified against server/src/routes/{emergency,share}.routes.js.

// The share viewer page lives on the same host as the API (server/src/index.js
// serves the web export + /share/:token from one origin), so the link is
// derived from the configured API base URL rather than hardcoded — the hard
//-coded fem-cabs-api.onrender.com value broke when pointing the app at a
// local/different backend.

export interface SosConfig {
  callCenterPhone: string;
}

export interface EmergencyResult {
  id: string;
  status: string;
  reference: string;
  // The FEM C@BS call-center number (EMERGENCY_CALL_CENTER_PHONE in the
  // server's .env) — the client dials it with the OS dialer right after the
  // event is recorded, so the call center hears from the rider directly.
  callCenterPhone?: string;
}

// GET /api/emergency/config — served unauthenticated by the backend so the
// safety screen can render the call-center number before any SOS is sent.
export async function getSosConfig(): Promise<SosConfig> {
  const json = await apiClient.get<{ callCenterPhone: string }>('/emergency/config');
  return { callCenterPhone: json.callCenterPhone };
}

export async function triggerEmergency(params: {
  rideId?: string;
  latitude?: number;
  longitude?: number;
  address?: string;
  details?: string;
}): Promise<EmergencyResult> {
  const json = await apiClient.post<{ emergency: EmergencyResult }>('/emergency', params);
  return json.emergency;
}

// Dials the FEM C@BS call center through the OS dialer (tel: works on
// Android/iOS and never requires CALL_PHONE permission — the user confirms
// the call themselves, which is what you want on an SOS button).
export function callPhoneNumber(phone: string): void {
  if (!phone) return;
  Linking.openURL(`tel:${phone}`).catch(() => {});
}

export async function createTripShare(rideId: string): Promise<{ token: string; expiresAt: string; url: string }> {
  const json = await apiClient.post<{ share: { token: string; expires_at: string } }>('/share', { rideId });
  const origin = new URL(apiClientBase()).origin;
  return {
    token: json.share.token,
    expiresAt: json.share.expires_at,
    url: `${origin}/share/${json.share.token}`,
  };
}

function apiClientBase(): string {
  // EXPO_PUBLIC_API_BASE_URL is inlined at build time; fall back to the
  // api-client default so both stay in sync.
  return process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:3000/api';
}
