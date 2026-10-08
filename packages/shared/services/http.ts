import { useLocaleStore } from '../stores/useLocaleStore';
import { tFor } from '../utils/i18n-errors';

// Shared HTTP client for the rider and driver apps. Each app builds its own
// client with createApiClient(), passing the function that reads its own
// stored token, so the two auth contexts never leak into each other.
export class ApiError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:3000/api';
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

async function safeJson(res: Response): Promise<any> {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function toNetworkError(err: unknown): ApiError {
  if ((err as { name?: string }).name === 'AbortError') return translatedError('timeout');
  return translatedError('unreachable');
}

export interface ApiClient {
  get: <T>(path: string) => Promise<T>;
  post: <T>(path: string, body?: unknown, auth?: boolean) => Promise<T>;
  put: <T>(path: string, body?: unknown) => Promise<T>;
  delete: <T>(path: string) => Promise<T>;
}

export function createApiClient(getToken: () => Promise<string | null>): ApiClient {
  async function send<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    body?: unknown,
    auth = true
  ): Promise<T> {
    const token = auth ? await getToken() : null;
    const isForm = typeof FormData !== 'undefined' && body instanceof FormData;

    const attempt = async (): Promise<Response> => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        return await fetch(`${API_BASE_URL}${path}`, {
          method,
          headers: {
            ...(isForm ? {} : { 'Content-Type': 'application/json' }),
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
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
      if (method !== 'GET') throw toNetworkError(err);
      try {
        res = await attempt();
      } catch (retryErr) {
        throw toNetworkError(retryErr);
      }
    }

    const json = await safeJson(res);
    if (!res.ok) {
      // server/src/middleware/errorHandler.js always responds { error: message }.
      const message = typeof json?.error === 'string' ? json.error : translatedError('failed', res.status).message;
      throw new ApiError(message, res.status);
    }
    return json as T;
  }

  return {
    get: <T>(path: string) => send<T>('GET', path),
    post: <T>(path: string, body?: unknown, auth = true) => send<T>('POST', path, body, auth),
    put: <T>(path: string, body?: unknown) => send<T>('PUT', path, body),
    delete: <T>(path: string) => send<T>('DELETE', path),
  };
}

// The signed-in user's client, used by the shared modules that both apps call
// (map lookups, support contacts). Each app registers its own client once at
// startup in its root layout.
let appClient: ApiClient | null = null;

export function setAppApiClient(client: ApiClient): void {
  appClient = client;
}

export function appApiClient(): ApiClient {
  if (!appClient) throw new Error('setAppApiClient() must be called in the root layout before any request');
  return appClient;
}
