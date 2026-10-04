import { fetchResponse } from './http-response';
import { getToken } from '../storage/session';
import { useLocaleStore } from '../stores/useLocaleStore';
import { tFor } from '../utils/i18n-errors';
import { offlineRequest } from './offline';
import { OFFLINE_DEMO } from './offline/mode';

// Direct TS port of the Flutter app's lib/services/api_client.dart. Every
// domain service module (auth-service.ts, ride-service.ts, ...) goes
// through this — same base URL / auth-header / timeout / error-shape
// behavior the passenger app already relied on.
export class ApiError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

const BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:3000/api';
// Render's free tier sleeps the API after ~15 min idle; the first request
// after that took a measured ~24s to cold-start (and failed at the old 20s
// timeout with "We could not reach the Kimu Transport servers"). 45s covers a
// full cold boot plus a slow 3G round trip.
const REQUEST_TIMEOUT_MS = 45_000;
// One silent retry for idempotent GETs that fail at the transport level
// (timeout / connection reset) — covers the cold-start blip without any UI
// change. Non-GETs are never retried automatically (they may not be
// idempotent: booking, payments, SOS...).

function translatedError(kind: 'unreachable' | 'timeout' | 'failed', status?: number): ApiError {
  const key = kind === 'timeout' ? 'networkTimeout' : kind === 'unreachable' ? 'networkUnreachable' : 'requestFailed';
  // Read the locale straight off the zustand store (works outside React;
  // defaults to 'rw' before hydration, same as the UI's initial render).
  const locale = useLocaleStore.getState().locale;
  return new ApiError(tFor(locale, key), status);
}


// Standalone build (EXPO_PUBLIC_OFFLINE_DEMO=1): the request is answered by the
// on-device backend in services/offline/ instead of going over the network;
// success and error handling downstream are exactly the same.
async function sendOffline<T>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  body: unknown,
  auth: boolean
): Promise<T> {
  const res = await offlineRequest(method, path, body, auth ? await getToken() : null);
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
  const token = auth ? await getToken() : null;

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
    // server/src/middleware/errorHandler.js always responds
    // { error: message } — verified live against the running backend.
    // (The old Flutter client read json['message'] here, which never
    // matched a real response field; that bug is not ported forward.)
    const message = typeof json?.error === 'string' ? json.error : translatedError('failed', res.status).message;
    throw new ApiError(message, res.status);
  }
  return json as T;
}

function toNetworkError(err: unknown): ApiError {
  if ((err as { name?: string }).name === 'AbortError') return translatedError('timeout');
  return translatedError('unreachable');
}

export const apiClient = {
  get: <T>(path: string) => send<T>('GET', path),
  post: <T>(path: string, body?: unknown, auth = true) => send<T>('POST', path, body, auth),
  put: <T>(path: string, body?: unknown) => send<T>('PUT', path, body),
  delete: <T>(path: string) => send<T>('DELETE', path),
};
