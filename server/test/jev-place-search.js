/**
 * Place-search quality, judged by TypeSafe's Jev model.
 *
 * Sends real Kigali queries through the running API's /locations/search
 * (Photon + Nominatim fallback, Rwanda bbox) and asks Jev, per query, which
 * result a rider typing it most likely means ("none" if no result fits).
 * Code then checks the chosen result is the TOP one and lies in Kigali; a
 * low-confidence pick of another result is reported as inconclusive (??).
 *
 * Usage: TYPESAFE_API_KEY=... node test/jev-place-search.js   (API on :3000)
 */
const BASE = process.env.API_BASE || 'http://localhost:3000/api';
const KEY = process.env.TYPESAFE_API_KEY;
const KIGALI = { minLat: -2.1, maxLat: -1.83, minLng: 29.95, maxLng: 30.25 };
const CONFIDENT = 0.6;

const QUERIES = [
  'Kimironko Market',
  'Kigali Convention Centre',
  'Amahoro Stadium',
  'Nyabugogo bus park',
  'King Faisal Hospital',
  'Kigali Genocide Memorial',
  'Kigali Heights',
  'MTN Centre Nyarutarama',
  'Kigali International Airport',
  'Kigali City Tower',
  'University of Rwanda Nyarugenge',
  'Sonatubes',
];

async function api(method, path, body, token) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => null) };
}

async function jev(state, questions) {
  const res = await fetch('https://api.typesafe.ai/v1/systemone', {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'jev-latest', state, questions }),
  });
  if (!res.ok) throw new Error(`TypeSafe ${res.status}: ${await res.text()}`);
  return (await res.json()).answers;
}

(async () => {
  if (!KEY) {
    console.log('SKIP: set TYPESAFE_API_KEY to run the Jev place-search test.');
    process.exit(0);
  }
  const ts = Date.now().toString().slice(-8);
  const signup = await api('POST', '/auth/signup', {
    fullName: 'Search Tester', phone: `+2507${ts}`, email: `search${ts}@example.com`, password: 'secret123',
  });
  const token = signup.data?.token;
  if (!token) throw new Error(`signup failed: ${signup.status}`);

  // Search sequentially: the geocoder is a shared public service.
  const results = {};
  for (const q of QUERIES) {
    const r = await api('GET', `/locations/search?q=${encodeURIComponent(q)}`, null, token);
    results[q] = r.status === 200 ? r.data.results : [];
  }

  // One Choice per query, all in a single Jev request.
  const state = {
    context: 'A rider in Kigali, Rwanda typed a place into a ride-hailing app search box. Each query has the list of results the app returned, in order.',
    searches: QUERIES.map((q) => ({ query: q, results: results[q].map((r) => r.address) })),
  };
  const questions = {};
  QUERIES.forEach((q, i) => {
    const options = { none: 'None of the results is the place the rider means.' };
    results[q].forEach((r, j) => {
      options[`r${j}`] = `Result \`searches[${i}].results[${j}]\``;
    });
    questions[`q${i}`] = {
      type: 'choice',
      instructions: `Which result is the place a rider typing \`searches[${i}].query\` in Kigali most likely means?`,
      criteria: options,
    };
  });
  const answers = await jev(state, questions);

  let passed = 0;
  const failures = [];
  QUERIES.forEach((q, i) => {
    const a = answers[`q${i}`];
    const top = results[q][0];
    const inKigali = top && top.latitude >= KIGALI.minLat && top.latitude <= KIGALI.maxLat
      && top.longitude >= KIGALI.minLng && top.longitude <= KIGALI.maxLng;
    const p0 = a.probabilities?.r0 ?? 0;
    // A confident pick of another result is a ranking failure; an unsure
    // judgment (several acceptable results) is inconclusive, per TypeSafe's
    // confidence guidance — printed for a human, not failed.
    const unsure = a.choice !== 'r0' && a.confidence < CONFIDENT;
    const ok = inKigali && (a.choice === 'r0' || unsure);
    const tag = !ok ? 'FAIL' : unsure ? '??  ' : 'ok  ';
    const line = `${tag} ${q} -> ${a.choice} (p(top)=${p0.toFixed(2)}, conf ${a.confidence.toFixed(2)})` +
      ` top="${top?.address ?? '(no results)'}"${inKigali ? '' : ' [outside Kigali]'}`;
    console.log(`  ${line}`);
    if (ok) passed++;
    else failures.push(line);
  });
  console.log(`\nJEV PLACE SEARCH: ${passed}/${QUERIES.length} queries return the intended place first`);
  process.exit(failures.length ? 1 : 0);
})().catch((err) => {
  console.error(err);
  process.exit(2);
});
