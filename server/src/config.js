require('dotenv').config();
const crypto = require('crypto');

/** True when DATABASE_URL points at this machine — a developer's database. */
function isLocalDatabase(url) {
  try {
    return ['localhost', '127.0.0.1', '::1', '[::1]'].includes(new URL(url).hostname);
  } catch {
    return false;
  }
}

// App-wide server configuration. Every value can be overridden with an
// environment variable (see .env.example). Secrets must never be committed —
// missing ones cause the server to refuse to start in production rather than
// silently running with insecure defaults.
const config = {
  env: process.env.NODE_ENV || 'development',

  port: Number(process.env.PORT || 3000),

  // A running PostgreSQL instance the API connects to, e.g.
  // postgres://user:password@localhost:5432/kimutransport
  databaseUrl: process.env.DATABASE_URL || '',
  // Development and demo switches are honoured only against a local
  // database. On any hosted database they are ignored, whatever NODE_ENV
  // says — see lockDownHostedServer() below.
  localDatabase: isLocalDatabase(process.env.DATABASE_URL || ''),

  // Reserved for the MongoDB migration. The current API still uses the
  // PostgreSQL data layer in src/db.js and requires DATABASE_URL.
  mongoUri: process.env.MONGODB_URI || '',

  // JWT signing secret. In production this MUST be set — no fallback secret.
  // In development an ephemeral random secret is generated so the server
  // boots without a configured secret (sessions reset on restart).
  jwtSecret: process.env.JWT_SECRET || '',

  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '30d',

  // Number of days a mobile-app session token stays valid before the
  // passenger must log in again. Kept short; refresh tokens can be added to
  // the auth routes without touching the JWT flow.
  sessionDays: Number(process.env.SESSION_DAYS || 30),

  otpLength: Number(process.env.OTP_LENGTH || 6),
  otpTtlSeconds: Number(process.env.OTP_TTL_SECONDS || 300),
  // How often a single phone/email may request a new OTP (seconds).
  otpResendCooldownSeconds: Number(process.env.OTP_RESEND_COOLDOWN || 60),
  // How many failed OTP verifications are allowed per code before it is
  // invalidated (brute-force protection).
  otpMaxAttempts: Number(process.env.OTP_MAX_ATTEMPTS || 5),

  // When true, OTP codes are returned in API responses (development only).
  // Production must send them through the configured SMS/email gateway.
  devRevealCodes: process.env.DEV_REVEAL_CODES === '1',

  // Local tests only: lets seeded drivers that never report a GPS position
  // be shown and matched. Never set on a real server — riders would see and
  // be assigned drivers who are not there.
  devAllowStaleDrivers: process.env.DEV_ALLOW_STALE_DRIVERS === '1',

  // Rate limiting (express-rate-limit): per-identity window for auth routes.
  rateLimitWindowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
  rateLimitMax: Number(process.env.RATE_LIMIT_MAX || 20),

  // ---- External services (all secrets stay server-side) ----
  // Maps / geocoding / routing. The server proxies these so the Flutter app
  // never needs an API key.
  nominatimUrl: process.env.NOMINATIM_URL || 'https://nominatim.openstreetmap.org/search',
  nominatimReverseUrl:
    process.env.NOMINATIM_REVERSE_URL || 'https://nominatim.openstreetmap.org/reverse',
  photonUrl: process.env.PHOTON_URL || 'https://photon.komoot.io/api/',
  photonReverseUrl: process.env.PHOTON_REVERSE_URL || 'https://photon.komoot.io/reverse',
  osrmUrl:
    process.env.OSRM_URL || 'https://router.project-osrm.org/route/v1/driving',
  // ---- Map providers (services/maps/) ----
  // Which provider computes routes and which answers place search / reverse
  // geocoding. Keys stay on the server; the apps only call /api/maps/*.
  //   routing:   osrm (OSRM_URL; self-hosted, or the public demo for
  //              development) | geoapify (MAP_ROUTING_API_KEY)
  //   geocoding: photon (PHOTON_URL; self-hosted, or the public server for
  //              development) | geoapify (MAP_GEOCODING_API_KEY)
  mapRoutingProvider: (process.env.MAP_ROUTING_PROVIDER || 'osrm').toLowerCase(),
  mapGeocodingProvider: (process.env.MAP_GEOCODING_PROVIDER || 'photon').toLowerCase(),
  mapRoutingApiKey: process.env.MAP_ROUTING_API_KEY || '',
  mapGeocodingApiKey: process.env.MAP_GEOCODING_API_KEY || process.env.MAP_ROUTING_API_KEY || '',
  mapProviderTimeoutMs: Number(process.env.MAP_PROVIDER_TIMEOUT_MS || 8000),
  // The MapLibre style the apps draw the map with, served to them by
  // GET /api/maps/config so it can change without an app release.
  mapStyleUrl: process.env.MAP_TILE_URL || 'https://tiles.openfreemap.org/styles/positron',
  mapAttribution: process.env.MAP_ATTRIBUTION || '© OpenFreeMap © OpenMapTiles © OpenStreetMap contributors',
  // Requests per account per rate-limit window.
  mapsSearchLimit: Number(process.env.MAPS_SEARCH_LIMIT || 300),
  mapsReverseLimit: Number(process.env.MAPS_REVERSE_LIMIT || 120),
  mapsRouteLimit: Number(process.env.MAPS_ROUTE_LIMIT || 120),

  // ---- Driver GPS ----
  // A driver is shown to riders and offered rides only while their position
  // is newer than this.
  driverLocationMaxAgeSeconds: Number(process.env.DRIVER_LOCATION_MAX_AGE_SECONDS || 45),
  // A fix less accurate than this, or taken by the phone longer ago than
  // this, is not used as the driver's position.
  driverMaxAccuracyMeters: Number(process.env.DRIVER_MAX_ACCURACY_METERS || 150),
  driverMaxSampleAgeSeconds: Number(process.env.DRIVER_MAX_SAMPLE_AGE_SECONDS || 60),
  driverMinUpdateIntervalMs: Number(process.env.DRIVER_MIN_UPDATE_INTERVAL_MS || 1000),

  // ---- Login codes ----
  // 'sms'  — codes are sent by the SMS provider below and never shown.
  // Paypack (Rwanda mobile money). Credentials are read ONLY here, on the
  // server — never shipped to the Flutter app.
  paypackClientId: process.env.PAYPACK_CLIENT_ID || '',
  paypackClientSecret: process.env.PAYPACK_CLIENT_SECRET || '',
  paypackBaseUrl: process.env.PAYPACK_BASE_URL || 'https://payments.paypack.rw',
  // Shared secret used to authenticate Paypack webhook deliveries.
  paypackWebhookSecret: process.env.PAYPACK_WEBHOOK_SECRET || '',

  // SMS delivery for OTP codes (services/otpSender.js): 'pindo',
  // 'africastalking' or 'generic' (JSON POST to SMS_GATEWAY_URL).
  smsProvider: (
    process.env.SMS_PROVIDER || (process.env.SMS_GATEWAY_URL ? 'generic' : '')
  ).toLowerCase(),
  smsApiKey: process.env.SMS_API_KEY || process.env.SMS_GATEWAY_API_KEY || '',
  smsGatewayUrl: process.env.SMS_GATEWAY_URL || '',
  // Africa's Talking account username ('sandbox' for their test env).
  atUsername: process.env.AT_USERNAME || '',
  // Sender ID shown on the SMS. Most providers require it to be registered.
  smsSenderName: process.env.SMS_SENDER_NAME || 'KIMU',

  // Optional integration key retained for trusted scripts; the operator page
  // authenticates with the username/password and a short-lived JWT instead.
  adminApiKey: process.env.ADMIN_API_KEY || '',
  adminUsername: process.env.ADMIN_USERNAME || '',
  adminPassword: process.env.ADMIN_PASSWORD || '',

  // Average city speed (km/h) used to estimate trip duration server-side.
  estimateAverageSpeedKmh: Number(process.env.ESTIMATE_AVG_SPEED_KMH || 25),

  // Ride security: PIN length (4) and trip-share token lifetime (hours).
  ridePinLength: Number(process.env.RIDE_PIN_LENGTH || 4),
  tripShareTtlHours: Number(process.env.TRIP_SHARE_TTL_HOURS || 24),

  // The Kimu Transport call center the app's SOS button dials (server/src/routes/
  // emergency.routes.js). Server-side so it can be rotated without an app
  // release. In production this MUST be set to the real call-center number.
  emergencyCallCenterPhone: process.env.EMERGENCY_CALL_CENTER_PHONE || '',

  // A driver who does not accept within this many seconds is released and the
  // ride goes back to searchingDriver for another match.
  assignAcceptTimeoutSeconds: Number(process.env.ASSIGN_ACCEPT_TIMEOUT_SECONDS || 120),

  // Share of each settled fare kept by the platform; the rest is credited to
  // the driver's balance (server/src/services/payments.js's
  // settleSucceededPayment()). 1 = the whole fare goes to the platform's
  // Paypack account and drivers hold no withdrawable balance — the current
  // arrangement. Set e.g. 0.15 to pay drivers 85% of each fare.
  driverCommissionRate: Number(process.env.DRIVER_COMMISSION_RATE ?? 1),
  // Unpaid cash-trip commission (RWF) a driver may owe before they must pay
  // it to go online again, and the smallest payout a driver can request.
  driverMaxCommissionDebt: Number(process.env.DRIVER_MAX_COMMISSION_DEBT || 5000),
  driverMinPayout: Number(process.env.DRIVER_MIN_PAYOUT || 1000),
  // The provider's cash-out fee, deducted from each driver payout (Paypack
  // charges 2.3% on money sent out).
  payoutFeeRate: Number(process.env.PAYOUT_FEE_RATE || 0.023),
  // A mobile-money prompt nobody answers is treated as failed after this
  // long, so the rider can retry or pay cash instead of waiting forever.
  paymentExpirySeconds: Number(process.env.PAYMENT_EXPIRY_SECONDS || 180),
  // How long a driver has to confirm they were paid in cash before the ride
  // is handed to an operator and the rider and driver are both freed.
  cashConfirmTimeoutSeconds: Number(process.env.CASH_CONFIRM_TIMEOUT_SECONDS || 900),
  // How often the background sweeps run.
  schedulerIntervalMs: Number(process.env.SCHEDULER_INTERVAL_MS || 30000),

};

// Development-only switches. Driver approval and Paypack charges have no
// bypass switches.
const DEV_SWITCHES = {
  devRevealCodes: 'DEV_REVEAL_CODES',
  devAllowStaleDrivers: 'DEV_ALLOW_STALE_DRIVERS',
};
const requestedDevSwitches = Object.keys(DEV_SWITCHES).filter((key) => config[key]);

/**
 * A server on a hosted database serves real people, so none of the
 * development switches may take effect there — even when NODE_ENV was never
 * set to production or a switch was left on by mistake.
 */
function lockDownHostedServer() {
  if (config.localDatabase) return;
  for (const key of requestedDevSwitches) config[key] = false;
  if (requestedDevSwitches.length) {
    console.warn(
      `[security] ignored on a hosted database: ${requestedDevSwitches.map((k) => DEV_SWITCHES[k]).join(', ')}. ` +
        'Remove these variables from the server environment.'
    );
  }
}
lockDownHostedServer();

// Things an operator should see in the log at every start.
if (process.env.DEMO_FLEET === '1') {
  console.warn('[drivers] DEMO_FLEET is no longer supported; only real driver accounts are served.');
}
if (process.env.DEV_AUTO_VERIFY_DRIVERS === '1') {
  console.warn('[security] DEV_AUTO_VERIFY_DRIVERS is no longer supported; all drivers require admin approval.');
}
if (process.env.DEMO_PAYMENTS === '1') {
  console.warn('[payments] DEMO_PAYMENTS is no longer supported; mobile-money transactions require Paypack.');
}
if (process.env.OTP_MODE === 'demo') {
  console.warn('[security] OTP_MODE=demo is no longer supported; OTP delivery uses the configured SMS provider.');
}
if (!config.localDatabase) {
  if (config.mapRoutingProvider === 'osrm' && /router\.project-osrm\.org/.test(config.osrmUrl)) {
    console.warn('[maps] routing uses the public OSRM demo server. Set MAP_ROUTING_PROVIDER=geoapify with MAP_ROUTING_API_KEY, or your own OSRM_URL.');
  }
  if (config.mapGeocodingProvider === 'photon' && /photon\.komoot\.io/.test(config.photonUrl)) {
    console.warn('[maps] place search uses the public Photon server. Set MAP_GEOCODING_PROVIDER=geoapify with MAP_GEOCODING_API_KEY, or your own PHOTON_URL.');
  }
}

// CORS origins allowed by the API.
const corsOrigins = (process.env.CORS_ORIGINS || '*')
  .split(',')
  .map((s) => s.trim());

function ensureConfig() {
  const problems = [];
  if (!config.databaseUrl) {
    problems.push('DATABASE_URL');
  }
  const isProduction = config.env === 'production';
  if (isProduction) {
    if (!config.jwtSecret) problems.push('JWT_SECRET');
    // Checked as requested, not as in effect: production must not even ask.
    for (const key of requestedDevSwitches) problems.push(`${DEV_SWITCHES[key]} (must be "0")`);
    // The public demo servers are refused; a keyed provider needs no URL.
    if (config.mapRoutingProvider === 'osrm' && (!process.env.OSRM_URL || /router\.project-osrm\.org/.test(config.osrmUrl))) {
      problems.push('OSRM_URL (your own server), or MAP_ROUTING_PROVIDER=geoapify');
    }
    if (config.mapGeocodingProvider === 'photon') {
      if (!process.env.PHOTON_URL || /photon\.komoot\.io/.test(config.photonUrl)) problems.push('PHOTON_URL (your own server), or MAP_GEOCODING_PROVIDER=geoapify');
      if (!process.env.PHOTON_REVERSE_URL || /photon\.komoot\.io/.test(config.photonReverseUrl)) problems.push('PHOTON_REVERSE_URL (your own server), or MAP_GEOCODING_PROVIDER=geoapify');
    }
    if (process.env.NOMINATIM_URL && /nominatim\.openstreetmap\.org/.test(config.nominatimUrl)) problems.push('NOMINATIM_URL (public service disallowed)');
    if (process.env.NOMINATIM_REVERSE_URL && /nominatim\.openstreetmap\.org/.test(config.nominatimReverseUrl)) problems.push('NOMINATIM_REVERSE_URL (public service disallowed)');

    // Real OTP delivery.
    if (!['pindo', 'africastalking', 'generic'].includes(config.smsProvider)) {
      problems.push('SMS_PROVIDER (pindo | africastalking | generic)');
    }
    if (config.mapRoutingProvider === 'geoapify' && !config.mapRoutingApiKey) problems.push('MAP_ROUTING_API_KEY');
    if (config.mapGeocodingProvider === 'geoapify' && !config.mapGeocodingApiKey) problems.push('MAP_GEOCODING_API_KEY');
    if (config.smsProvider && !config.smsApiKey) problems.push('SMS_API_KEY');
    if (config.smsProvider === 'generic' && !config.smsGatewayUrl) problems.push('SMS_GATEWAY_URL');
    if (config.smsProvider === 'africastalking' && !config.atUsername) problems.push('AT_USERNAME');

    // Real mobile-money payments.
    if (!config.paypackClientId) problems.push('PAYPACK_CLIENT_ID');
    if (!config.paypackClientSecret) problems.push('PAYPACK_CLIENT_SECRET');
    if (!config.paypackWebhookSecret) problems.push('PAYPACK_WEBHOOK_SECRET');

    // The SOS button must reach a real call center.
    if (!config.emergencyCallCenterPhone) problems.push('EMERGENCY_CALL_CENTER_PHONE');

    // Without operator credentials no driver can ever be verified.
    if (!config.adminUsername) problems.push('ADMIN_USERNAME');
    if (!config.adminPassword || config.adminPassword.length < 12) {
      problems.push('ADMIN_PASSWORD (at least 12 characters)');
    }
  }
  if (problems.length) {
    console.error(
      `[config] Missing or invalid environment variable${problems.length > 1 ? 's' : ''}: ` +
        [...problems, 'See server/.env.example.'].join(', ')
    );
    process.exit(1);
  }
  if (!config.jwtSecret && !config.localDatabase) {
    console.error('[config] JWT_SECRET is required on a hosted database.');
    process.exit(1);
  }
  if (!config.jwtSecret) {
    config.jwtSecret = crypto
      .randomBytes(32)
      .toString('hex')
      .concat(`:dev-${Date.now()}`);
    console.warn(
      '[config] JWT_SECRET not set — using an ephemeral development secret. ' +
        'Sessions will be invalidated when the server restarts.'
    );
  }
}

module.exports = { config, corsOrigins, ensureEmbeddedReady: ensureConfig };
