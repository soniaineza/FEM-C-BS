const { config, ensureEmbeddedReady } = require('./config');
const { ensureDatabase, applySchema, initPool } = require('./db');
const { createApp } = require('./app');
const { startScheduler } = require('./services/scheduler');
const { retireSeedAccounts } = require('./services/seedAccounts');

async function main() {
  ensureEmbeddedReady();
  const dsn = await ensureDatabase();
  await applySchema(dsn);
  initPool(dsn);

  // Routes, middleware and the static pages live in app.js so the test
  // suite can mount the same application on an ephemeral port.
  const app = createApp();

  await retireSeedAccounts();
  app.listen(config.port, () => {
    console.log(`[server] Kimu Transport API listening on port ${config.port}`);
  });
  startScheduler();
}

main().catch((err) => {
  console.error('[server] fatal startup error:', err);
  process.exit(1);
});
