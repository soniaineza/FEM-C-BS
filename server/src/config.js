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

  // Where verification codes go (services/otpSender.js): 'whatsapp' sends a
  // WhatsApp message through Meta's WhatsApp Cloud API and falls back to the
  // SMS provider below if WhatsApp cannot deliver; 'sms' uses only SMS.
  otpChannel: (process.env.OTP_CHANNEL || (process.env.WHATSAPP_ACCESS_TOKEN ? 'whatsapp' : 'sms')).toLowerCase(),
  // WhatsApp Cloud API (Meta for Developers > WhatsApp > API setup): a
  // permanent system-user access token, the sender phone number's ID, and an
  // approved *authentication* template with a copy-code button.
  whatsappAccessToken: process.env.WHATSAPP_ACCESS_TOKEN || '',
  whatsappPhoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
  whatsappOtpTemplate: process.env.WHATSAPP_OTP_TEMPLATE || 'kimu_otp',
  // Must be the exact locale the template was created in ('en' and 'en_US'
  // are different templates to Meta; Kinyarwanda is 'rw_RW').
  whatsappTemplateLanguage: process.env.WHATSAPP_TEMPLATE_LANGUAGE || 'en_US',
  // Graph API versions live about two years; v24.0 is supported until
  // February 2028. An expired version rolls forward on Meta's side, but keep
  // this current.
  whatsappApiVersion: process.env.WHATSAPP_API_VERSION || 'v24.0',

  // Email delivery for OTP codes (services/otpSender.js), used when the
  // rider signs in with an e-mail, and as the last fallback after WhatsApp
  // and SMS. Any SMTP server works (Gmail app password, SendGrid, Mailgun,
  // your own). Set SMTP_HOST + SMTP_USER + SMTP_PASS to turn it on.
  smtpHost: process.env.SMTP_HOST || '',
  smtpPort: Number(process.env.SMTP_PORT || 587),
  // true for port 465 (implicit TLS); false for 587/25 (STARTTLS).
  smtpSecure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : Number(process.env.SMTP_PORT || 587) === 465,
  smtpUser: process.env.SMTP_USER || '',
  smtpPass: process.env.SMTP_PASS || '',
  // The From address shown on the e-mail; defaults to the SMTP user.
  smtpFrom: process.env.SMTP_FROM || process.env.SMTP_USER || '',

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

  // ---- Public addresses ----
  // Where this API is reachable from the internet, without a trailing slash
  // (Render sets RENDER_EXTERNAL_URL automatically). Google is told to send
  // people back to <publicUrl>/api/auth/google/callback, so it must be the
  // exact address registered in the Google Cloud console.
  publicUrl: (process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || '').replace(/\/+$/, ''),
  // Where the rider web app lives. It is served by this same server, so the
  // default is the public URL above; set WEB_APP_URL only when the web app is
  // hosted elsewhere. Google sign-in on the web returns to <webAppUrl>/auth/google.
  webAppUrl: (process.env.WEB_APP_URL || process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || '').replace(/\/+$/, ''),
  // The rider app's deep-link scheme (apps/passenger/app.json "scheme"):
  // Google sign-in on a phone returns to <appScheme>://auth/google.
  appScheme: process.env.APP_SCHEME || 'femcabs',

  // ---- Google sign-in (services/googleAuth.js) ----
  // A "Web application" OAuth client from the Google Cloud console. Both
  // values stay on the server; the apps only ever see whether Google login
  // is available (GET /api/auth/providers). Leave both empty and the apps
  // hide the Google button.
  googleClientId: (process.env.GOOGLE_CLIENT_ID || '').trim(),
  googleClientSecret: (process.env.GOOGLE_CLIENT_SECRET || '').trim(),
  // Normally derived from PUBLIC_URL; set only to register a different
  // callback address with Google.
  googleRedirectUri: (process.env.GOOGLE_REDIRECT_URI || '').trim(),
  // Google's endpoints. Overridable only for the local test suite, which
  // stands in a fake Google (see lockDownHostedServer()).
  googleAuthUrl: process.env.GOOGLE_AUTH_URL || 'https://accounts.google.com/o/oauth2/v2/auth',
  googleTokenUrl: process.env.GOOGLE_TOKEN_URL || 'https://oauth2.googleapis.com/token',
  googleJwksUrl: process.env.GOOGLE_JWKS_URL || 'https://www.googleapis.com/oauth2/v3/certs',
  googleIssuers: ['https://accounts.google.com', 'accounts.google.com'],
  // How long a one-time login code handed to the app after Google sign-in
  // stays valid (seconds). It is exchanged for a session within moments.
  loginCodeTtlSeconds: Number(process.env.LOGIN_CODE_TTL_SECONDS || 300),

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

  // How riders and drivers reach human support outside the in-app tickets
  // (GET /api/support/contacts). Both optional: the apps hide the WhatsApp
  // and e-mail buttons when a value is unset, and never show a made-up one.
  // WhatsApp is the number in international format, digits only (2507...).
  supportWhatsappNumber: String(process.env.SUPPORT_WHATSAPP_NUMBER || '').replace(/\D/g, ''),
  supportEmail: (process.env.SUPPORT_EMAIL || '').trim(),

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
  // Only the real Google may vouch for a Google account on a hosted server.
  const googleOverrides = ['GOOGLE_AUTH_URL', 'GOOGLE_TOKEN_URL', 'GOOGLE_JWKS_URL'].filter((k) => process.env[k]);
  if (googleOverrides.length) {
    config.googleAuthUrl = 'https://accounts.google.com/o/oauth2/v2/auth';
    config.googleTokenUrl = 'https://oauth2.googleapis.com/token';
    config.googleJwksUrl = 'https://www.googleapis.com/oauth2/v3/certs';
    console.warn(`[security] ignored on a hosted database: ${googleOverrides.join(', ')}. Google's own endpoints are used.`);
  }
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

    // Real OTP delivery: at least one of the three channels must be set up —
    // WhatsApp, SMS, or e-mail (SMTP). They are tried in that order.
    const hasWhatsapp = Boolean(config.whatsappAccessToken && config.whatsappPhoneNumberId);
    const hasSms = ['pindo', 'africastalking', 'generic'].includes(config.smsProvider);
    const hasEmail = Boolean(config.smtpHost && config.smtpUser && config.smtpPass);
    if (!hasWhatsapp && !hasSms && !hasEmail) {
      problems.push('an OTP channel: WHATSAPP_ACCESS_TOKEN + WHATSAPP_PHONE_NUMBER_ID, or SMS_PROVIDER (+ keys), or SMTP_HOST + SMTP_USER + SMTP_PASS');
    }
    // A WhatsApp token with no phone-number id (or the reverse) is a mistake.
    if (Boolean(config.whatsappAccessToken) !== Boolean(config.whatsappPhoneNumberId)) {
      problems.push('both WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID (set both or neither)');
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
    // Support contacts are optional, but a value that is set must be usable.
    if (process.env.SUPPORT_WHATSAPP_NUMBER && !/^[1-9]\d{7,14}$/.test(config.supportWhatsappNumber)) {
      problems.push('SUPPORT_WHATSAPP_NUMBER (international format, digits only, e.g. 2507XXXXXXXX)');
    }
    if (process.env.SUPPORT_EMAIL && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.supportEmail)) {
      problems.push('SUPPORT_EMAIL (a valid e-mail address)');
    }

    // Google sign-in is optional, but half a configuration is a mistake.
    if (config.googleClientId && !config.googleClientSecret) problems.push('GOOGLE_CLIENT_SECRET');
    if (config.googleClientSecret && !config.googleClientId) problems.push('GOOGLE_CLIENT_ID');
    if (config.googleClientId && !config.publicUrl && !config.googleRedirectUri) {
      problems.push('PUBLIC_URL (needed to build the Google callback address)');
    }

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
