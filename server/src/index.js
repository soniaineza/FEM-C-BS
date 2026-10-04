const express = require('express');
const cors = require('cors');
const path = require('path');

const { config, corsOrigins, ensureEmbeddedReady } = require('./config');
const { ensureDatabase, applySchema, initPool } = require('./db');
const { errorHandler, notFound } = require('./middleware/errorHandler');
const { startScheduler } = require('./services/scheduler');
const { retireSeedAccounts } = require('./services/seedAccounts');

const authRoutes = require('./routes/auth.routes');
const vehiclesRoutes = require('./routes/vehicles.routes');
const placesRoutes = require('./routes/places.routes');
const ridesRoutes = require('./routes/rides.routes');
const driversRoutes = require('./routes/drivers.routes');
const driverProfileRoutes = require('./routes/driverProfile.routes');
const paymentsRoutes = require('./routes/payments.routes');
const promotionsRoutes = require('./routes/promotions.routes');
const notificationsRoutes = require('./routes/notifications.routes');
const supportRoutes = require('./routes/support.routes');
const mapsRoutes = require('./routes/maps.routes');
const emergencyRoutes = require('./routes/emergency.routes');
const shareRoutes = require('./routes/share.routes');
const walletRoutes = require('./routes/wallet.routes');
const webhookRoutes = require('./routes/webhooks.routes');
const adminRoutes = require('./routes/admin.routes');

async function main() {
  ensureEmbeddedReady();
  const dsn = await ensureDatabase();
  await applySchema(dsn);
  initPool(dsn);

  const app = express();
  app.disable('x-powered-by');
  // Behind the host's reverse proxy every request arrives from the proxy's
  // address; trust its X-Forwarded-For so req.ip is the real client and the
  // rate limiters do not lump every user into one bucket.
  app.set('trust proxy', 1);
  // Which other websites may call the API from a browser. The web app is
  // served by this same server and the mobile apps are not browsers, so
  // neither needs an entry. "*" (any website) is honoured only on a local
  // database; on a hosted one only origins listed explicitly are allowed.
  const anyOrigin = corsOrigins.includes('*') && config.localDatabase;
  if (corsOrigins.includes('*') && !config.localDatabase) {
    console.warn('[security] CORS_ORIGINS="*" is ignored on a hosted database. List exact origins, or leave it empty.');
  }
  app.use(
    cors({
      origin: anyOrigin ? true : corsOrigins.filter((o) => o && o !== '*'),
    })
  );

  // Webhooks need the raw body for Paypack signature verification — mount
  // this BEFORE the JSON parser.
  app.use('/api/webhooks', express.raw({ type: 'application/json' }), (req, res, next) => {
    req.rawBody = Buffer.isBuffer(req.body) ? req.body : null;
    if (req.rawBody && req.rawBody.length) {
      try {
        req.body = JSON.parse(req.rawBody.toString('utf8'));
      } catch {
        return res.status(400).json({ error: 'Invalid JSON.' });
      }
    } else {
      req.body = {};
    }
    next();
  }, webhookRoutes);

  app.use(express.json());

  app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

  app.use('/api/auth', authRoutes);
  app.use('/api/vehicles', vehiclesRoutes);
  app.use('/api/places', placesRoutes);
  app.use('/api/rides', ridesRoutes);
  app.use('/api/drivers', driversRoutes);
  app.use('/api/driver', driverProfileRoutes);
  app.use('/api/payments', paymentsRoutes);
  app.use('/api/promotions', promotionsRoutes);
  app.use('/api/notifications', notificationsRoutes);
  app.use('/api/support', supportRoutes);
  app.use('/api/maps', mapsRoutes);
  // Same endpoints under their old path, for app builds already installed.
  app.use('/api/locations', mapsRoutes);
  app.use('/api/emergency', emergencyRoutes);
  app.use('/api/share', shareRoutes);
  app.use('/api/wallet', walletRoutes);
  app.use('/api/admin', adminRoutes);

  // `npx expo export --platform web` (replacing `flutter build web`) outputs
  // to dist/ at the Expo project root, which is now also the repo root:
  // server/src -> server -> repo root, two levels up (not three — the
  // previous `build/web` path here was off by one and pointed above the
  // repo root; verified against the actual directory layout).
  const webBuildPath = path.join(__dirname, '..', '..', 'dist');
  app.use(express.static(webBuildPath));

  // The web app handles its own routes; an unknown /api path, or any path
  // when no web build has been deployed, is a plain 404 rather than an error.
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(webBuildPath, 'index.html'), (err) => {
      if (err) next();
    });
  });

  app.use(notFound);
  app.use(errorHandler);

  app.listen(config.port, () => {
    console.log(`[server] Kimu Transport API listening on port ${config.port}`);
  });
  await retireSeedAccounts();
  startScheduler();
  if (config.demoFleet) {
    require('./services/demoFleet')
      .startDemoFleet()
      .catch((err) => console.error('[fleet] failed to start:', err));
  }
}

main().catch((err) => {
  console.error('[server] fatal startup error:', err);
  process.exit(1);
});