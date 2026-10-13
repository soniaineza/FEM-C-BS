// Small driver-script for checking the PHP dashboard end to end from a real
// browser-like client (undici fetch with a cookie jar by hand).
const BASE = 'http://127.0.0.1:8080';
let cookie = '';

async function req(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (cookie) headers.Cookie = cookie;
  const res = await fetch(BASE + path, { ...opts, headers });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  return res;
}

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ok  ', name); }
  else { fail++; console.log('  FAIL', name, extra); }
};

// 1. Sign-in page renders with a CSRF token
const page = await req('/index.php');
check('index.php 200', page.status === 200);
const html = await page.text();
const csrf = (html.match(/name="csrf" value="([^"]+)"/) || [])[1];
check('sign-in form carries a CSRF token', Boolean(csrf));

// 2. Sign in
const login = await req('/index.php', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ action: 'login', username: 'testop', password: 'local-test-pass', csrf }).toString(),
  redirect: 'manual',
});
check('sign-in redirects (session started)', login.status === 303, `code=${login.status}`);

// 3. Pending drivers list through the proxy
const list = await req('/api.php?path=%2Fdrivers&verified=false');
check('drivers list 200', list.status === 200, `code=${list.status}`);
const data = await list.json();
check('drivers list carries documents arrays', Array.isArray(data.drivers) && data.drivers.every((d) => Array.isArray(d.documents)));
const withDocs = data.drivers.find((d) => (d.documents || []).length > 0);
check('at least one pending driver has documents', Boolean(withDocs));

// 4. Document file streams with its content type
if (withDocs) {
  const doc = withDocs.documents[0];
  const file = await req(`/api.php?path=%2Fdocuments%2F${doc.id}%2Ffile`);
  const ct = file.headers.get('content-type') || '';
  const bytes = new Uint8Array(await file.arrayBuffer());
  check('document file 200', file.status === 200, `code=${file.status}`);
  check('content type matches an image or PDF', /^(image\/(png|jpeg|webp|heic|heif)|application\/pdf)/.test(ct), ct);
  check('bytes arrive intact', bytes.length > 10, `n=${bytes.length}`);
  const isPng = bytes[0] === 0x89 && bytes[1] === 0x50;
  const isPdf = String.fromCharCode(...bytes.subarray(0, 4)) === '%PDF';
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
  check('magic bytes match the content type', isPng || isPdf || isJpeg || ct.startsWith('image/webp') || ct.startsWith('image/heic'),
    `magic=${bytes.subarray(0, 4).join(',')}`);

  // 5. CSRF refuses a decision without a token (defence in depth)
  const noToken = await req(`/api.php?path=%2Fdocuments%2F${doc.id}%2Freview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'rejected', reason: 'csrf test' }),
  });
  check('review without CSRF is refused', noToken.status === 403, `code=${noToken.status}`);

  // 6. A review with the token goes through (invalid status on purpose: the
  //    API's own validation answer shows the request reached the API).
  const page2 = await req('/index.php');
  const html2 = await page2.text();
  const csrf2 = (html2.match(/name="csrf" value="([^"]+)"/) || [])[1];
  const withToken = await req(`/api.php?path=%2Fdocuments%2F${doc.id}%2Freview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf2 },
    body: JSON.stringify({ status: 'bogus-status' }),
  });
  check('review with CSRF reaches the API', withToken.status === 400, `code=${withToken.status}`);
  const reply = await withToken.json();
  check('the API validation message is relayed', /approved|rejected/.test(JSON.stringify(reply)), JSON.stringify(reply).slice(0, 80));
}

// 7. Unauthenticated api.php reveals nothing
const savedCookie = cookie;
cookie = '';
const noSession = await req('/api.php?path=%2Fdrivers');
cookie = savedCookie;
check('api.php demands the dashboard session', noSession.status === 401, `code=${noSession.status}`);

console.log(`\nOPERATOR-PHP-CHECK: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
