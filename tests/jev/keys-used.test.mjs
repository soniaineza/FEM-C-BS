// Every translation key the code asks for must exist in every locale —
// a missing key shows its raw name on screen (e.g. "rideStatusCompleted").
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const locales = Object.fromEntries(['en', 'fr', 'rw'].map((l) => [l, JSON.parse(fs.readFileSync(path.join(root, 'locales', `${l}.json`), 'utf8'))]));

function sources(dir, out = []) {
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) sources(rel, out);
    else if (/\.tsx?$/.test(entry.name)) out.push(rel);
  }
  return out;
}

// Literal t('key') calls, plus keys built from lookup tables (status / category maps).
const TABLE_KEY = /'((?:rideStatus|payoutStatus|ticketStatus|earningStatus|supportCategory|driverCancel|payMethod)[A-Z][A-Za-z0-9]*)'/g;
const used = new Map();
for (const file of ['app', 'components', 'hooks', 'utils', 'types'].flatMap((d) => sources(d))) {
  const text = fs.readFileSync(path.join(root, file), 'utf8');
  for (const m of text.matchAll(/\bt\(\s*'([A-Za-z0-9_]+)'/g)) used.set(m[1], file);
  for (const m of text.matchAll(TABLE_KEY)) used.set(m[1], file);
}

describe('translation keys used in code', () => {
  for (const [name, dict] of Object.entries(locales)) {
    it(`all exist in ${name}.json`, () => {
      const missing = [...used].filter(([key]) => !(key in dict)).map(([key, file]) => `${key} (${file})`);
      assert.deepEqual(missing, []);
    });
  }
});
