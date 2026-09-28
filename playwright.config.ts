import { defineConfig } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// End-to-end tests of the web build (same React Native screens via
// react-native-web) against a running API + demo fleet:
//
//   1. API:  cd server && DEV_REVEAL_CODES=1 DEMO_PAYMENTS=1 DEMO_FLEET=1 \
//              ADMIN_API_KEY=e2e-admin-key-0123456789abcdef npm start
//   2. Web:  EXPO_PUBLIC_API_BASE_URL=http://localhost:3000/api npx expo start --web
//   3.       npm run test:e2e
//
// Native-only behaviour (Android WebView map, keyboard, status bar, dialer)
// needs a device/emulator run (e.g. Maestro); see tests/e2e/README.md.

function findChromium(): string | undefined {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const cache = path.join(os.homedir(), '.cache', 'ms-playwright');
  if (!fs.existsSync(cache)) return undefined;
  const builds = fs.readdirSync(cache).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse();
  for (const b of builds) {
    for (const bin of ['chrome-linux64/chrome', 'chrome-linux/chrome', 'chrome-win/chrome.exe']) {
      const p = path.join(cache, b, bin);
      if (fs.existsSync(p)) return p;
    }
  }
  return undefined;
}

export default defineConfig({
  testDir: 'tests/e2e',
  // One shared API/fleet/database: run serially so flows don't race.
  workers: 1,
  fullyParallel: false,
  timeout: 4 * 60_000,
  expect: { timeout: 20_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'tests/e2e/report' }]],
  outputDir: 'tests/e2e/results',
  use: {
    baseURL: process.env.E2E_APP_URL ?? 'http://localhost:8081',
    viewport: { width: 390, height: 844 },
    geolocation: { latitude: -1.9447, longitude: 30.0612 }, // Kigali City Tower
    permissions: ['geolocation'],
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    actionTimeout: 20_000,
    launchOptions: {
      executablePath: findChromium(),
      // WebGL maps need a GL implementation in headless Linux.
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    },
  },
});
