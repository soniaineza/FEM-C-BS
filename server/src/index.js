const express = require('express');
const cors = require('cors');

const { config, corsOrigins, ensureEmbeddedReady } = require('./config');
const { ensureDatabase, applySchema, initPool } = require('./db');
const { errorHandler, notFound } = require('./middleware/errorHandler');

const authRoutes = require('./routes/auth.routes');
const vehiclesRoutes = require('./routes/vehicles.routes');
const placesRoutes = require('./routes/places.routes');
const ridesRoutes = require('./routes/rides.routes');
const paymentsRoutes = require('./routes/payments.routes');
const notificationsRoutes = require('./routes/notifications.routes');
const supportRoutes = require('./routes/support.routes');

async function main() {
  ensureEmbeddedReady();
  const dsn = await ensureDatabase();
  await applySchema(dsn);
  initPool(dsn);

  const app = express();
  app.use(
    cors({
      origin: corsOrigins.includes('*') ? true : corsOrigins,
    })
  );
  app.use(express.json());

  app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

  app.use('/api/auth', authRoutes);
  app.use('/api/vehicles', vehiclesRoutes);
  app.use('/api/places', placesRoutes);
  app.use('/api/rides', ridesRoutes);
  app.use('/api/payments', paymentsRoutes);
  app.use('/api/notifications', notificationsRoutes);
  app.use('/api/support', supportRoutes);

  app.use(notFound);
  app.use(errorHandler);

  app.listen(config.port, () => {
    console.log(`[server] FEM C@BS API listening on port ${config.port}`);
  });
}

main().catch((err) => {
  console.error('[server] fatal startup error:', err);
  process.exit(1);
});
