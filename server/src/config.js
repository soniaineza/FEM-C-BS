require('dotenv').config();

// App-wide server configuration. All values can be overridden with
// environment variables (see .env.example).
const config = {
  port: Number(process.env.PORT || 3000),

  // A running PostgreSQL instance the API connects to, e.g.
  // postgres://user:password@localhost:5432/femcabs
  databaseUrl: process.env.DATABASE_URL || '',

  // Reserved for the MongoDB migration. The current API still uses the
  // PostgreSQL data layer in src/db.js and requires DATABASE_URL.
  mongoUri: process.env.MONGODB_URI || '',

  jwtSecret:
    process.env.JWT_SECRET ||
    'fem-cabs-dev-secret-change-me-before-release',

  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '30d',

  otpTtlSeconds: Number(process.env.OTP_TTL_SECONDS || 300),

  // When true, OTP codes and simulated payment references are returned in API
  // responses (development only). Production must send them by SMS/wallet.
  devRevealCodes: process.env.DEV_REVEAL_CODES !== '0',

  // Simulator pacing (seconds) — how fast a simulated driver advances.
  simEtaSecondsPerKm: Number(process.env.SIM_SECONDS_PER_KM || 8),
  simAcceptDelaySeconds: Number(process.env.SIM_ACCEPT_DELAY || 3),
  simWaitAtPickupSeconds: Number(process.env.SIM_WAIT_AT_PICKUP || 5),

  // Public third-party services used for real map data (dev usage).
  nominatimUrl: 'https://nominatim.openstreetmap.org/search',
  osrmUrl: process.env.OSRM_URL || 'https://router.project-osrm.org/route/v1/driving',

  // Average city speed (km/h) used to estimate trip duration server-side.
  // Mirrors AppConstants.estimateAverageSpeedKmh on the client.
  estimateAverageSpeedKmh: Number(process.env.ESTIMATE_AVG_SPEED_KMH || 25),
};

// CORS origins allowed by the API.
const corsOrigins = (process.env.CORS_ORIGINS || '*')
  .split(',')
  .map((s) => s.trim());

function ensureEmbeddedReady() {
  // Kept for compatibility with existing call sites — there is no embedded
  // database anymore, the API requires DATABASE_URL to point at a real
  // PostgreSQL instance (see .env.example).
  if (!config.databaseUrl) {
    console.error(
      '[config] DATABASE_URL is not set. Point it at a PostgreSQL instance, ' +
        'e.g. postgres://user:password@localhost:5432/femcabs — see server/.env.example.'
    );
    process.exit(1);
  }
}

module.exports = { config, corsOrigins, ensureEmbeddedReady };
