import { Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';

import { apiClient } from './api-client';
import { getRideDetails } from './ride-service';
import { OFFLINE_DEMO } from './offline/mode';

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
  // The Kimu Transport call-center number (EMERGENCY_CALL_CENTER_PHONE in the
  // server's .env) — the client dials it with the OS dialer right after the
  // event is recorded, so the call center hears from the rider directly.
  callCenterPhone?: string;
}

// GET /api/emergency/config — served unauthenticated by the backend so the
// safety screen can render the call-center number before any SOS is sent.
export async function getSosConfig(): Promise<SosConfig> {
  const json = await apiClient.get<{ callCenterPhone: string }>('/emergency/config');
  rememberCallCenterPhone(json.callCenterPhone);
  return { callCenterPhone: json.callCenterPhone };
}

// An SOS must be able to place a call with no data connection at all, so the
// number never depends on a request made at that moment: the last number the
// server gave us is kept on the device, and before any has been seen the
// build-time number (or Rwanda's national emergency line) is used.
const CALL_CENTER_KEY = 'kimu_call_center_phone';
export const EMERGENCY_FALLBACK_PHONE = process.env.EXPO_PUBLIC_EMERGENCY_PHONE || '112';

export function rememberCallCenterPhone(phone?: string | null): void {
  if (phone) AsyncStorage.setItem(CALL_CENTER_KEY, phone).catch(() => {});
}

export async function getStoredCallCenterPhone(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(CALL_CENTER_KEY);
  } catch {
    return null;
  }
}

/** Where the rider is, from the device's last fix: instant, and never prompts. */
export async function lastKnownCoordinates(): Promise<{ latitude: number; longitude: number } | null> {
  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== Location.PermissionStatus.GRANTED) return null;
    const fix = await Location.getLastKnownPositionAsync({ maxAge: 5 * 60 * 1000 });
    return fix ? { latitude: fix.coords.latitude, longitude: fix.coords.longitude } : null;
  } catch {
    return null;
  }
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

// Dials the Kimu Transport call center through the OS dialer (tel: works on
// Android/iOS and never requires CALL_PHONE permission — the user confirms
// the call themselves, which is what you want on an SOS button).
export function callPhoneNumber(phone: string): void {
  if (!phone) return;
  Linking.openURL(`tel:${phone}`).catch(() => {});
}

export async function createTripShare(rideId: string): Promise<{ token: string; expiresAt: string; url: string }> {
  const json = await apiClient.post<{ share: { token: string; expires_at: string } }>('/share', { rideId });
  return {
    token: json.share.token,
    expiresAt: json.share.expires_at,
    url: OFFLINE_DEMO ? await directionsLink(rideId) : `${new URL(apiClientBase()).origin}/share/${json.share.token}`,
  };
}

// The standalone build has no web page for a friend to follow, so the shared
// link opens the trip's route in whatever maps app the friend's phone has.
async function directionsLink(rideId: string): Promise<string> {
  const ride = await getRideDetails(rideId);
  const at = (p: { latitude?: number; longitude?: number }) => `${p.latitude},${p.longitude}`;
  return `https://www.google.com/maps/dir/?api=1&origin=${at(ride.pickup)}&destination=${at(ride.destination)}`;
}

function apiClientBase(): string {
  // EXPO_PUBLIC_API_BASE_URL is inlined at build time; fall back to the
  // api-client default so both stay in sync.
  return process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:3000/api';
}
