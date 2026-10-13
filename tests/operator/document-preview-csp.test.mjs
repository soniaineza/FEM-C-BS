import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function assertBlobPreviewsAllowed(policy, deployment) {
  const directives = policy.split(';').map((part) => part.trim());
  for (const directive of ['img-src blob:', 'frame-src blob:', 'object-src blob:']) {
    assert.ok(directives.includes(directive), `${deployment} CSP must allow ${directive}`);
  }
  assert.ok(directives.includes("default-src 'none'"), `${deployment} CSP must keep its restrictive default`);
}

test('operator file previews are allowed by the server and Vercel CSPs', () => {
  const vercel = JSON.parse(fs.readFileSync(path.join(root, 'operator/vercel.json'), 'utf8'));
  const vercelCsp = vercel.headers
    .find((entry) => entry.source === '/')
    .headers.find((header) => header.key === 'Content-Security-Policy').value;
  assertBlobPreviewsAllowed(vercelCsp, 'Vercel');

  const server = fs.readFileSync(path.join(root, 'server/src/index.js'), 'utf8');
  const serverCsp = server.match(/'Content-Security-Policy': "([^"]+)"/)?.[1];
  assert.ok(serverCsp, 'server /operator CSP must be configured');
  assertBlobPreviewsAllowed(serverCsp, 'server');
});

test('operator distinguishes an empty admin document response from an unsubmitted upload', () => {
  const operator = fs.readFileSync(path.join(root, 'operator/index.html'), 'utf8');
  assert.match(operator, /The admin API returned no document records for this driver/);
  assert.match(operator, /Required documents missing from the admin list/);
});

test('operator confirms before deleting a driver application and uses the admin delete route', () => {
  const operator = fs.readFileSync(path.join(root, 'operator/index.html'), 'utf8');
  assert.match(operator, /button\('Delete application', 'danger'/);
  assert.match(operator, /window\.confirm\(/);
  assert.match(operator, /call\('DELETE', '\/drivers\/' \+ encodeURIComponent\(d\.id\) \+ '\/application'\)/);
  assert.match(operator, /phone number will be freed for a new application/);
});
