import { getToken } from '../storage/session';

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
const REQUEST_TIMEOUT_MS = 20_000;

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
  const token = auth ? await getToken() : null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (err) {
    if ((err as { name?: string }).name === 'AbortError') {
      throw new ApiError('The FEM C@BS servers are taking too long to respond. Please try again.');
    }
    throw new ApiError('We could not reach the FEM C@BS servers. Check your connection and try again.');
  } finally {
    clearTimeout(timer);
  }

  const json = await safeJson(res);
  if (!res.ok) {
    // server/src/middleware/errorHandler.js always responds
    // { error: message } — verified live against the running backend.
    // (The old Flutter client read json['message'] here, which never
    // matched a real response field; that bug is not ported forward.)
    const message = typeof json?.error === 'string' ? json.error : 'Something went wrong. Please try again.';
    throw new ApiError(message, res.status);
  }
  return json as T;
}

export const apiClient = {
  get: <T>(path: string) => send<T>('GET', path),
  post: <T>(path: string, body?: unknown, auth = true) => send<T>('POST', path, body, auth),
  put: <T>(path: string, body?: unknown) => send<T>('PUT', path, body),
  delete: <T>(path: string) => send<T>('DELETE', path),
};
