import { apiClient } from './api-client';

// Response envelopes verified against server/src/routes/{emergency,share}.routes.js.

export async function triggerEmergency(params: {
  rideId?: string;
  latitude?: number;
  longitude?: number;
  address?: string;
  details?: string;
}): Promise<{ id: string; status: string; reference: string }> {
  const json = await apiClient.post<{ emergency: { id: string; status: string; reference: string } }>(
    '/emergency',
    params
  );
  return json.emergency;
}

export async function createTripShare(rideId: string): Promise<{ token: string; expiresAt: string }> {
  const json = await apiClient.post<{ share: { token: string; expires_at: string } }>('/share', { rideId });
  return { token: json.share.token, expiresAt: json.share.expires_at };
}
