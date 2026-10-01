// A tiny in-process stand-in for the Express server: a route table plus a
// dispatcher that speaks the same shape the real API does (status codes,
// `{ error }` bodies, bearer-token auth), so services/api-client.ts and the
// driver client stay identical apart from where the response comes from.

import { getDb, saveDb, type Db, type DriverRec, type PassengerRec } from './db';

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

export interface Ctx {
  db: Db;
  now: number;
  params: Record<string, string>;
  query: Record<string, string>;
  body: any;
  passenger: PassengerRec | null;
  driver: DriverRec | null;
}

/** A handler's non-200 result. */
export class Reply {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown = {}) {
    this.status = status;
    this.body = body;
  }
}

export const created = (body: unknown) => new Reply(201, body);
export const noContent = () => new Reply(204, {});

type Auth = 'none' | 'passenger' | 'driver';
type Handler = (ctx: Ctx) => unknown | Promise<unknown>;

interface Route {
  method: string;
  re: RegExp;
  keys: string[];
  auth: Auth;
  handler: Handler;
}

const routes: Route[] = [];

export function route(method: 'GET' | 'POST' | 'PUT' | 'DELETE', pattern: string, auth: Auth, handler: Handler): void {
  const keys: string[] = [];
  const source = pattern.replace(/:([A-Za-z]+)/g, (_m, key: string) => {
    keys.push(key);
    return '([^/]+)';
  });
  routes.push({ method, re: new RegExp(`^${source}$`), keys, auth, handler });
}

// Session tokens: not secrets (nothing here is reachable from outside the
// phone), just "which local account is signed in".
export const makeToken = (role: 'p' | 'd', id: string) => `offline-${role}:${id}`;

function parseQuery(raw: string): Record<string, string> {
  const query: Record<string, string> = {};
  for (const pair of raw.split('&')) {
    if (!pair) continue;
    const eq = pair.indexOf('=');
    const key = eq < 0 ? pair : pair.slice(0, eq);
    const value = eq < 0 ? '' : pair.slice(eq + 1);
    try {
      query[decodeURIComponent(key)] = decodeURIComponent(value.replace(/\+/g, ' '));
    } catch {
      query[key] = value;
    }
  }
  return query;
}

export interface OfflineResponse {
  status: number;
  body: any;
}

export async function dispatch(
  method: string,
  rawPath: string,
  body: unknown,
  token: string | null
): Promise<OfflineResponse> {
  try {
    const [path, rawQuery = ''] = rawPath.split('?');
    let matched: { route: Route; params: Record<string, string> } | null = null;
    let pathKnown = false;
    for (const r of routes) {
      const m = r.re.exec(path);
      if (!m) continue;
      pathKnown = true;
      if (r.method !== method) continue;
      const params: Record<string, string> = {};
      r.keys.forEach((key, i) => {
        params[key] = decodeURIComponent(m[i + 1]);
      });
      matched = { route: r, params };
      break;
    }
    if (!matched) throw new HttpError(pathKnown ? 405 : 404, pathKnown ? 'Method not allowed.' : 'Not found.');

    const db = await getDb();
    let passenger: PassengerRec | null = null;
    let driver: DriverRec | null = null;
    if (matched.route.auth !== 'none') {
      const expected = matched.route.auth === 'passenger' ? 'offline-p:' : 'offline-d:';
      const id = token && token.startsWith(expected) ? token.slice(expected.length) : null;
      if (matched.route.auth === 'passenger') passenger = db.passengers.find((p) => p.id === id) ?? null;
      else driver = db.drivers.find((d) => d.id === id) ?? null;
      if (!passenger && !driver) throw new HttpError(401, 'Please sign in to continue.');
    }

    const result = await matched.route.handler({
      db,
      now: Date.now(),
      params: matched.params,
      query: parseQuery(rawQuery),
      body: body ?? {},
      passenger,
      driver,
    });
    saveDb();
    if (result instanceof Reply) return { status: result.status, body: result.body };
    return { status: 200, body: result ?? {} };
  } catch (err) {
    if (err instanceof HttpError) return { status: err.status, body: { error: err.message } };
    return { status: 500, body: { error: err instanceof Error ? err.message : 'Something went wrong on this device.' } };
  }
}
