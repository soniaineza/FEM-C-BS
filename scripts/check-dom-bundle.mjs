// Checks the DOM-component bundle (the map page) that a release build put
// into the APK's assets: it must parse as ES2018, which is what Chromium 66
// (Android 9's factory WebView) understands. A single newer token anywhere in
// the 3 MB file is a SyntaxError that stops the whole map script before it
// runs, and the app can only show "the map script did not run".
//
//   node scripts/check-dom-bundle.mjs passenger      (run by build-apks.sh)
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const acorn = require('acorn');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function checkDomBundle(bundleDir) {
  const html = fs.readdirSync(bundleDir).filter((f) => f.endsWith('.html'));
  if (html.length !== 1) throw new Error(`expected one DOM page in ${bundleDir}, found ${html.length}`);
  const page = fs.readFileSync(path.join(bundleDir, html[0]), 'utf8');
  const scripts = [...page.matchAll(/<script src="\.\/([^"]+)"/g)].map((m) => m[1]);
  if (!scripts.length) throw new Error(`${html[0]} references no script`);
  const results = [];
  for (const rel of scripts) {
    const file = path.join(bundleDir, rel);
    const src = fs.readFileSync(file, 'utf8');
    try {
      acorn.parse(src, { ecmaVersion: 2018, sourceType: 'script' });
    } catch (err) {
      const at = err.pos ?? 0;
      throw new Error(
        `${rel} is not valid ES2018 (older Android WebViews would reject the whole map script): ${err.message}\n` +
          `  near: ${src.slice(Math.max(0, at - 80), at + 80).replace(/\n/g, ' ')}`
      );
    }
    results.push({ file: rel, bytes: src.length });
  }
  return { page: html[0], scripts: results };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const app = process.argv[2];
  if (!app) {
    console.error('usage: node scripts/check-dom-bundle.mjs <passenger|driver>');
    process.exit(2);
  }
  const dir = path.join(root, 'apps', app, 'android', 'app', 'build', 'generated', 'assets', 'react', 'release', 'www.bundle');
  if (!fs.existsSync(dir)) {
    console.error(`check-dom-bundle: ${dir} does not exist; the release build did not export the map page.`);
    process.exit(1);
  }
  try {
    const { page, scripts } = checkDomBundle(dir);
    for (const s of scripts) {
      console.log(`check-dom-bundle: ${app}: ${page} -> ${s.file} (${(s.bytes / 1024 / 1024).toFixed(2)} MB) parses as ES2018`);
    }
  } catch (err) {
    console.error('check-dom-bundle: ' + err.message);
    process.exit(1);
  }
}
