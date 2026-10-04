import { fetchResponse } from './http-response';
import { getDriverToken } from '../storage/driverSession';
import { ApiError } from './api-client';
import { useLocaleStore } from '../stores/useLocaleStore';
import { tFor } from '../utils/i18n-errors';
import { offlineRequest } from './offline';
import { OFFLINE_DEMO } from './offline/mode';

// Driver-side counterpart to services/api-client.ts. Duplicated rather than
// parameterizing the passenger client so the two auth contexts (and their
// separately stored tokens — see storage/driverSession.ts) can never leak
// into each other's requests; same base URL / timeout / error-shape
// behavior otherwise.
const BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:3000/api';
// Same cold-start reasoning as services/api-client.ts (Render free tier
// sleeps the API; first request after idle took a measured ~24s).
const REQUEST_TIMEOUT_MS = 45_000;
// Silent retry for idempotent GETs only — non-GETs (booking, payments,
// SOS...) are never retried automatically since they may not be idempotent.

function translatedError(kind: 'unreachable' | 'timeout' | 'failed', status?: number): ApiError {
  const key = kind === 'timeout' ? 'networkTimeout' : kind === 'unreachable' ? 'networkUnreachable' : 'requestFailed';
  const locale = useLocaleStore.getState().locale;
  return new ApiError(tFor(locale, key), status);
}


// Standalone build: answered by the on-device backend (see services/api-client.ts).
async function sendOffline<T>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  body: unknown,
  auth: boolean
): Promise<T> {
  const res = await offlineRequest(method, path, body, auth ? await getDriverToken() : null);
  if (res.status >= 400) {
    const message = typeof res.body?.error === 'string' ? res.body.error : translatedError('failed', res.status).message;
    throw new ApiError(message, res.status);
  }
  return res.body as T;
}

async function send<T>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown,
  auth = true
): Promise<T> {
  if (OFFLINE_DEMO) return sendOffline<T>(method, path, body, auth);
  const token = auth ? await getDriverToken() : null;

  const attempt = () => fetchResponse(`${BASE_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  }, REQUEST_TIMEOUT_MS);

  let response: Awaited<ReturnType<typeof fetchResponse>>;
  try {
    response = await attempt();
  } catch (err) {
    const canRetry = method === 'GET';
    if (canRetry) {
      try {
        response = await attempt();
      } catch (retryErr) {
        throw toNetworkError(retryErr);
      }
    } else {
      throw toNetworkError(err);
    }
  }

  const { res, json } = response;
  if (!res.ok) {
    const message = typeof json?.error === 'string' ? json.error : translatedError('failed', res.status).message;
    throw new ApiError(message, res.status);
  }
  return json as T;
}

function toNetworkError(err: unknown): ApiError {
  if ((err as { name?: string }).name === 'AbortError') return translatedError('timeout');
  return translatedError('unreachable');
}

export const driverApiClient = {
  get: <T>(path: string) => send<T>('GET', path),
  post: <T>(path: string, body?: unknown, auth = true) => send<T>('POST', path, body, auth),
  put: <T>(path: string, body?: unknown) => send<T>('PUT', path, body),
  delete: <T>(path: string) => send<T>('DELETE', path),
};

export { ApiError };
