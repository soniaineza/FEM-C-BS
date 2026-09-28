// Translation checks for locales/{en,fr,rw}.json.
//
//   node --test 'tests/jev/*.test.mjs'           # structural checks only
//   TYPESAFE_API_KEY=... node --test 'tests/jev/*.test.mjs'  # + Jev
//
// Structural rules (every key in every locale, identical {placeholders})
// are plain code. Whether a French/Kinyarwanda string *means* the same as
// the English is a judgment, asked of TypeSafe's Jev model (one Noul per
// string). Jev is strongest in English and weaker in other languages, so
// each language is first calibrated: real pairs vs deliberately mismatched
// pairs. Only a language Jev clearly separates is hard-failed; otherwise the
// low scorers are printed for human review.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const load = (l) => JSON.parse(fs.readFileSync(path.join(ROOT, 'locales', `${l}.json`), 'utf8'));
const en = load('en');
const others = { fr: { name: 'French', dict: load('fr') }, rw: { name: 'Kinyarwanda', dict: load('rw') } };
const placeholders = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

const KEY = process.env.TYPESAFE_API_KEY;
const BATCH = 30;
const PASS = 0.5; // Noul: probability the translation means the same
const MIN_SEPARATION = 0.35; // calibration: mean(real) - mean(mismatched)
// Only the strings changed recently by default; JEV_ALL_KEYS=1 checks all.
// Keys whose value is deliberately not a translation of the English.
const NOT_TRANSLATIONS = new Set(['languageName']);
const RECENT_KEYS = [
  'minAway', 'dropoffAt', 'noCarsNearby', 'fareBreakdown', 'baseFare', 'distanceFare', 'timeFare',
  'bookingFee', 'surgeApplied', 'minimumFareApplied', 'sharedDiscount', 'totalLabel', 'upfrontPriceNote',
  'surgeNotice', 'routeEstimateNotice', 'carsNearby', 'driverArrivingIn', 'driverHere', 'tripEndsAt',
  'onTheWayToDestination', 'shareYourPin', 'confirmPickup', 'confirmDestination', 'movePinHint',
  'cashAwaitingDriver',
];

test('every locale has every English key', () => {
  for (const [code, { dict }] of Object.entries(others)) {
    const missing = Object.keys(en).filter((k) => !(k in dict));
    assert.deepEqual(missing, [], `${code} is missing keys`);
  }
});

test('placeholders match the English string exactly', () => {
  const bad = [];
  for (const [code, { dict }] of Object.entries(others)) {
    for (const k of Object.keys(en)) {
      if (k in dict && placeholders(en[k]).join() !== placeholders(dict[k]).join()) {
        bad.push(`${code}.${k}: ${JSON.stringify(dict[k])}`);
      }
    }
  }
  assert.deepEqual(bad, []);
});

async function jev(state, questions) {
  const res = await fetch('https://api.typesafe.ai/v1/systemone', {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'jev-latest', state, questions }),
  });
  if (!res.ok) throw new Error(`TypeSafe ${res.status}: ${await res.text()}`);
  return (await res.json()).answers;
}

/** Probability each pair means the same, batched to keep the state small. */
async function sameMeaning(language, pairs) {
  const out = {};
  for (let i = 0; i < pairs.length; i += BATCH) {
    const chunk = pairs.slice(i, i + BATCH);
    const state = {
      context: 'User-interface strings of a ride-hailing app in Kigali, Rwanda. Words in {braces} are variables filled in by the app.',
      language,
      pairs: Object.fromEntries(chunk.map((p) => [p.id, { english: p.english, candidate: p.candidate }])),
    };
    const questions = Object.fromEntries(
      chunk.map((p) => [
        p.id,
        {
          type: 'noul',
          instructions: `Does \`pairs.${p.id}.candidate\` (written in ${language}) say the same thing as \`pairs.${p.id}.english\` for a user of this app?`,
          criteria: {
            true: 'Same meaning; a user would understand the same message or action.',
            false: 'Different meaning, missing an important part, or not a translation of it.',
          },
        },
      ])
    );
    const answers = await jev(state, questions);
    for (const p of chunk) out[p.id] = answers[p.id].noul;
  }
  return out;
}

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / Math.max(xs.length, 1);

for (const [code, { name, dict }] of Object.entries(others)) {
  test(`Jev: ${name} strings mean the same as English`, { skip: !KEY && 'set TYPESAFE_API_KEY' }, async () => {
    const keys = (process.env.JEV_ALL_KEYS === '1' ? Object.keys(en) : RECENT_KEYS)
      .filter((k) => k in dict && !NOT_TRANSLATIONS.has(k));

    // Calibration: real pairs vs the same strings deliberately mismatched.
    const sample = keys.slice(0, 12);
    const real = sample.map((k) => ({ id: `real_${k}`, english: en[k], candidate: dict[k] }));
    const mismatched = sample.map((k, i) => {
      const other = sample[(i + 5) % sample.length];
      return { id: `swap_${k}`, english: en[k], candidate: dict[other] };
    });
    const cal = await sameMeaning(name, [...real, ...mismatched]);
    const separation = mean(real.map((p) => cal[p.id])) - mean(mismatched.map((p) => cal[p.id]));
    const reliable = separation >= MIN_SEPARATION;
    console.log(`  ${name}: calibration separation ${separation.toFixed(2)} -> ${reliable ? 'enforced' : 'advisory only'}`);

    const scores = await sameMeaning(
      name,
      keys.map((k) => ({ id: k, english: en[k], candidate: dict[k] }))
    );
    const flagged = keys
      .filter((k) => scores[k] < PASS)
      .map((k) => `${k} (${scores[k].toFixed(2)}): "${en[k]}" -> "${dict[k]}"`);
    if (flagged.length) console.log(`  ${name} strings to review:\n    ${flagged.join('\n    ')}`);
    if (reliable) assert.deepEqual(flagged, [], `${name} strings that don't match the English`);
  });
}
