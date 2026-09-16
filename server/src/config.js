require('dotenv').config();
const crypto = require('crypto');

// App-wide server configuration. Every value can be overridden with an
// environment variable (see .env.example). Secrets must never be committed —
// missing ones cause the server to refuse to start in production rather than
// silently running with insecure defaults.
const config = {
  env: process.env.NODE_ENV || 'development',

  port: Number(process.env.PORT || 3000),

  // A running PostgreSQL instance the API connects to, e.g.
  // postgres://user:password@localhost:5432/femcabs
  databaseUrl: process.env.DATABASE_URL || '',

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

  // Rate limiting (express-rate-limit): per-identity window for auth routes.
  rateLimitWindowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
  rateLimitMax: Number(process.env.RATE_LIMIT_MAX || 20),

  // ---- External services (all secrets stay server-side) ----
  // Maps / geocoding / routing. The server proxies these so the Flutter app
  // never needs an API key.
  nominatimUrl: process.env.NOMINATIM_URL || 'https://nominatim.openstreetmap.org/search',
  nominatimReverseUrl:
    process.env.NOMINATIM_REVERSE_URL || 'https://nominatim.openstreetmap.org/reverse',
  osrmUrl:
    process.env.OSRM_URL || 'https://router.project-osrm.org/route/v1/driving',
  // Maps provider key (e.g. Mapbox) — used only when NOMINATIM_URL is private.
  mapsApiKey: process.env.MAPS_API_KEY || '',

  // Paypack (Rwanda mobile money). Credentials are read ONLY here, on the
  // server — never shipped to the Flutter app.
  paypackClientId: process.env.PAYPACK_CLIENT_ID || '',
  paypackClientSecret: process.env.PAYPACK_CLIENT_SECRET || '',
  paypackBaseUrl: process.env.PAYPACK_BASE_URL || 'https://payments.paypack.rw',
  // Shared secret used to authenticate Paypack webhook deliveries.
  paypackWebhookSecret: process.env.PAYPACK_WEBHOOK_SECRET || '',

  // Firebase Cloud Messaging (push notifications).
  fcmServerKey: process.env.FCM_SERVER_KEY || '',
  fcmProjectId: process.env.FCM_PROJECT_ID || '',
  fcmSenderId: process.env.FCM_SENDER_ID || '',

  // SMS gateway used to deliver OTP codes (generic HTTP JSON endpoint).
  smsGatewayUrl: process.env.SMS_GATEWAY_URL || '',
  smsGatewayApiKey: process.env.SMS_GATEWAY_API_KEY || '',
  smsSenderName: process.env.SMS_SENDER_NAME || 'FEM CABS',

  // Average city speed (km/h) used to estimate trip duration server-side.
  estimateAverageSpeedKmh: Number(process.env.ESTIMATE_AVG_SPEED_KMH || 25),

  // Ride security: PIN length (4) and trip-share token lifetime (hours).
  ridePinLength: Number(process.env.RIDE_PIN_LENGTH || 4),
  tripShareTtlHours: Number(process.env.TRIP_SHARE_TTL_HOURS || 24),

  // A driver who does not accept within this many seconds is released and the
  // ride goes back to searchingDriver for another match.
  assignAcceptTimeoutSeconds: Number(process.env.ASSIGN_ACCEPT_TIMEOUT_SECONDS || 120),

  // Dependency-free development simulator. Replaced entirely by the real
  // driver-matching service — kept only for local UI previews.
  simEnabled: process.env.SIM_ENABLED === '1' && process.env.NODE_ENV !== 'production',
  simAcceptDelaySeconds: Number(process.env.SIM_ACCEPT_DELAY || 3),
  simWaitAtPickupSeconds: Number(process.env.SIM_WAIT_AT_PICKUP || 5),
};

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
    if (config.devRevealCodes) problems.push('DEV_REVEAL_CODES (must be "0")');
  }
  if (problems.length) {
    console.error(
      `[config] Missing required environment variable${problems.length > 1 ? 's' : ''}: ` +
        [...problems, 'See server/.env.example.'].join(', ')
    );
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
