import { test as base, expect, type Page } from '@playwright/test';

export const API = process.env.E2E_API_URL ?? 'http://localhost:3000/api';
export const ADMIN_KEY = process.env.E2E_ADMIN_KEY ?? 'e2e-admin-key-0123456789abcdef';

// Huye, ~100 km from Kigali: outside the demo fleet's 5 km matching radius,
// so rides booked here go to the test's own driver, deterministically.
export const HUYE = { latitude: -2.5967, longitude: 29.7394 };
export const HUYE_DEST = { latitude: -2.6090, longitude: 29.7440 };

export async function api<T = any>(method: string, path: string, body?: unknown, token?: string, headers: Record<string, string> = {}): Promise<{ status: number; data: T }> {
  const res = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: res.status, data };
}

let seq = 0;
export function uniquePhone(prefix = '7') {
  seq += 1;
  const n = `${Date.now()}`.slice(-6) + String(seq).padStart(2, '0');
  return `+250${prefix}${n}`; // +2507xxxxxxxx
}

export interface Passenger {
  id: string;
  token: string;
  phone: string;
  email: string;
  password: string;
  name: string;
}

/** A verified passenger with a complete profile, created through the API. */
export async function createPassenger(name = 'E2E Rider'): Promise<Passenger> {
  const phone = uniquePhone();
  const email = `e2e${phone.slice(-9)}@example.com`;
  const password = 'Secret123';
  const su = await api('POST', '/auth/signup', { fullName: name, phone, email, password });
  expect(su.status, JSON.stringify(su.data)).toBe(201);
  await api('POST', '/auth/verify-otp', { passengerId: su.data.passenger.id, code: su.data.devCode });
  await api('PUT', '/auth/profile', { fullName: name, phone }, su.data.token);
  return { id: su.data.passenger.id, token: su.data.token, phone, email, password, name };
}

export interface Driver {
  id: string;
  token: string;
  phone: string;
  password: string;
}

/** A driver account; verified and online at `at` unless told otherwise. */
export async function createDriver(opts: { verified?: boolean; online?: boolean; at?: { latitude: number; longitude: number } } = {}): Promise<Driver> {
  const phone = uniquePhone('7');
  const password = 'Secret123';
  const reg = await api('POST', '/drivers/register', { fullName: 'E2E Driver', phone, password, licenseNumber: 'DL-E2E' });
  expect(reg.status, JSON.stringify(reg.data)).toBe(201);
  const d = { id: reg.data.driver.id, token: reg.data.token, phone, password };
  await api('PUT', '/driver/me', {
    fullName: 'E2E Driver',
    email: `drv${phone.slice(-9)}@example.com`,
    vehicleMake: 'Toyota', vehicleModel: 'Corolla', vehicleYear: 2019, vehicleColor: 'Red', vehiclePlate: 'RAE 123 T',
  }, d.token);
  if (opts.verified !== false) {
    // The test database has no real KYC uploads. Exercise the same review
    // contract with clearly synthetic document references.
    for (const docType of ['license', 'national_id', 'vehicle_registration', 'insurance']) {
      const uploaded = await api('POST', '/driver/documents', {
        docType, fileUrl: `https://example.invalid/e2e/${docType}`, fileName: `e2e-${docType}.pdf`,
      }, d.token);
      expect(uploaded.status, `${docType} upload: ${JSON.stringify(uploaded.data)}`).toBe(201);
      const reviewed = await api('POST', `/admin/documents/${uploaded.data.document.id}/review`, {
        status: 'approved', reviewer: 'E2E fixture', method: 'in_person', evidenceReference: `e2e-${docType}`,
      }, undefined, { 'X-Admin-Key': ADMIN_KEY });
      expect(reviewed.status, `${docType} review: ${JSON.stringify(reviewed.data)}`).toBe(200);
    }
    if (!reg.data.driver.verified) {
      const v = await api('POST', `/admin/drivers/${d.id}/verify`, undefined, undefined, { 'X-Admin-Key': ADMIN_KEY });
      expect(v.status, `admin verify: ${JSON.stringify(v.data)}`).toBe(200);
    }
  }
  if (opts.at) await api('POST', '/drivers/location', { ...opts.at, heading: 0 }, d.token);
  if (opts.online) expect((await api('PUT', '/driver/status', { status: 'active' }, d.token)).status).toBe(200);
  return d;
}

/** Signs the browser in as this passenger (English, passenger mode). */
export async function signInPassenger(page: Page, p: Passenger) {
  await page.addInitScript(([token, id]) => {
    localStorage.setItem('auth_token', token);
    localStorage.setItem('auth_passenger_id', id);
    localStorage.setItem('fem_locale', 'en');
    localStorage.setItem('fem_locale_chosen', '1');
    localStorage.setItem('app_mode', 'passenger');
  }, [p.token, p.id]);
}

/** Fresh visitor in English: no session, language already chosen or not. */
export async function freshVisitor(page: Page, { languageChosen = true, mode = 'passenger' } = {}) {
  await page.addInitScript(([chosen, m]) => {
    if (chosen === '1') {
      localStorage.setItem('fem_locale', 'en');
      localStorage.setItem('fem_locale_chosen', '1');
    }
    localStorage.setItem('app_mode', m);
  }, [languageChosen ? '1' : '0', mode]);
}

/** Books a ride through the API for this passenger. */
export async function bookRide(p: Passenger, opts: { pickup?: typeof HUYE; destination?: typeof HUYE; payment?: string; vehicleId?: string } = {}) {
  const pickup = opts.pickup ?? HUYE;
  const destination = opts.destination ?? HUYE_DEST;
  const r = await api('POST', '/rides', {
    pickup: { address: 'Huye Stadium', ...pickup },
    destination: { address: 'Huye Market', ...destination },
    vehicleId: opts.vehicleId ?? 'fem_economy',
    paymentMethodId: opts.payment ?? 'cash',
  }, p.token);
  expect(r.status, JSON.stringify(r.data)).toBe(201);
  return r.data.ride as { id: string; status: string };
}

/** Waits until the ride reaches one of the statuses (polling the API). */
export async function waitForRide(p: Passenger, rideId: string, statuses: string[], timeoutMs = 60_000) {
  const until = Date.now() + timeoutMs;
  let last = '';
  while (Date.now() < until) {
    const r = await api('GET', `/rides/${rideId}`, undefined, p.token);
    last = r.data?.ride?.status;
    if (statuses.includes(last)) return r.data.ride;
    await new Promise((res) => setTimeout(res, 1000));
  }
  throw new Error(`ride ${rideId} stuck at ${last}, wanted ${statuses.join('/')}`);
}

// Console noise that is known and harmless (see tests/e2e/README.md).
const BENIGN = [
  /Context Lost/i,
  /React DevTools/i,
  /expo-notifications/i,
  /"shadow\*" style props are deprecated/i,
  /props\.pointerEvents is deprecated/i,
  /Expected value to be of type number, but found null/i, // OpenFreeMap style
  /Download the React DevTools/i,
  /\[Reanimated\]/i,
];

type Fixtures = { appErrors: string[]; externalLinks: string[] };

/**
 * Every test fails if the page throws, logs an unexpected console error, or
 * gets a 5xx from the API. tel:/sms:/https links opened by the app are
 * recorded in `externalLinks` instead of navigating away.
 */
export const test = base.extend<Fixtures>({
  externalLinks: async ({ page }, use) => {
    const links: string[] = [];
    // react-native-web sends tel: through window.location; Chromium reports
    // that as an external-protocol navigation rather than an anchor click.
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Page.enable');
    cdp.on('Page.frameRequestedNavigation', (event) => {
      if (/^(tel|sms):/.test(event.url)) links.push(event.url);
    });
    await page.exposeFunction('__e2eOpened', (url: string) => links.push(url));
    await page.addInitScript(() => {
      const record = (url: unknown) => (window as any).__e2eOpened(String(url));
      window.open = ((url?: string | URL) => {
        record(url);
        return null;
      }) as typeof window.open;
      document.addEventListener(
        'click',
        (e) => {
          const a = (e.target as HTMLElement | null)?.closest?.('a[href^="tel:"],a[href^="sms:"],a[href^="mailto:"]');
          if (a) {
            e.preventDefault();
            record((a as HTMLAnchorElement).href);
          }
        },
        true
      );
    });
    await use(links);
  },
  appErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
      page.on('console', (m) => {
        if (m.type() !== 'error') return;
        const text = m.text();
        if (BENIGN.some((re) => re.test(text))) return;
        errors.push(`console: ${text.slice(0, 300)}`);
      });
      page.on('response', (r) => {
        if (r.url().startsWith(API) && r.status() >= 500) errors.push(`HTTP ${r.status()} ${r.request().method()} ${r.url()}`);
      });
      await use(errors);
      // The browser logs every non-2xx response as "Failed to load resource";
      // expected 4xx (a wrong password) are fine and 5xx are caught above.
      const real = errors.filter((e) => !/Failed to load resource/.test(e));
      expect(real, 'unexpected app errors').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
