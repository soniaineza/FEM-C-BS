import { getDriverToken } from '../storage/driverSession';
import { ApiError } from './api-client';
import { useLocaleStore } from '../stores/useLocaleStore';
import { tFor } from '../utils/i18n-errors';

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

async function safeJson(res: Response): Promise<any> {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

async function send<T>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown,
  auth = true
): Promise<T> {
  const token = auth ? await getDriverToken() : null;

  const attempt = async (): Promise<Response> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      return await fetch(`${BASE_URL}${path}`, {
        method,
        headers: {
          ...(typeof FormData !== 'undefined' && body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body === undefined ? undefined : typeof FormData !== 'undefined' && body instanceof FormData ? body : JSON.stringify(body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  };

  let res: Response;
  try {
    res = await attempt();
  } catch (err) {
    const canRetry = method === 'GET';
    if (canRetry) {
      try {
        res = await attempt();
      } catch (retryErr) {
        throw toNetworkError(retryErr);
      }
    } else {
      throw toNetworkError(err);
    }
  }

  const json = await safeJson(res);
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
