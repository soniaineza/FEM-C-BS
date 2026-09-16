const express = require('express');
const cors = require('cors');
const path = require('path');

const { config, corsOrigins, ensureEmbeddedReady } = require('./config');
const { ensureDatabase, applySchema, initPool } = require('./db');
const { errorHandler, notFound } = require('./middleware/errorHandler');
const { startScheduler } = require('./services/scheduler');

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
const locationsRoutes = require('./routes/locations.routes');
const emergencyRoutes = require('./routes/emergency.routes');
const shareRoutes = require('./routes/share.routes');
const walletRoutes = require('./routes/wallet.routes');
const webhookRoutes = require('./routes/webhooks.routes');

async function main() {
  ensureEmbeddedReady();
  const dsn = await ensureDatabase();
  await applySchema(dsn);
  initPool(dsn);

  const app = express();
  app.disable('x-powered-by');
  app.use(
    cors({
      origin: corsOrigins.includes('*') ? true : corsOrigins,
    })
  );

  // Webhooks need the raw body for Paypack signature verification — mount
  // this BEFORE the JSON parser.
  app.use('/api/webhooks', express.raw({ type: 'application/json' }), (req, _res, next) => {
    req.rawBody = req.body;
    if (req.body && req.body.length) {
      req.body = JSON.parse(req.body.toString('utf8'));
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
  app.use('/api/locations', locationsRoutes);
  app.use('/api/emergency', emergencyRoutes);
  app.use('/api/share', shareRoutes);
  app.use('/api/wallet', walletRoutes);

  const webBuildPath = path.join(__dirname, '..', '..', '..', 'build', 'web');
  app.use(express.static(webBuildPath));

  app.get('*', (req, res) => {
    res.sendFile(path.join(webBuildPath, 'index.html'));
  });

  app.use(notFound);
  app.use(errorHandler);

  app.listen(config.port, () => {
    console.log(`[server] FEM C@BS API listening on port ${config.port}`);
  });
  startScheduler();
}

main().catch((err) => {
  console.error('[server] fatal startup error:', err);
  process.exit(1);
});