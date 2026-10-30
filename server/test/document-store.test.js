// Unit tests for the document store client (src/services/documentStore.js)
// against an in-process stand-in for doc-store/index.php.
//   Run: node --test test/document-store.test.js
process.env.MYSQL_HOST = process.env.MYSQL_HOST || 'db.example.com';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'unit-test-secret';

const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const crypto = require('node:crypto');

const { config } = require('../src/config');
const store = require('../src/services/documentStore');

const TOKEN = 'a'.repeat(40);
const files = new Map();
let server;
let behaviour;

before(async () => {
  server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const id = url.searchParams.get('id');
    if (req.headers['x-store-token'] !== TOKEN) {
      res.writeHead(401).end(JSON.stringify({ error: 'Not authorised.' }));
      return;
    }
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      if (behaviour.fail) { res.writeHead(500).end(); return; }
      if (req.method === 'PUT') {
        const body = Buffer.concat(chunks);
        files.set(id, body);
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ size: behaviour.shortWrite ? body.length - 1 : body.length }));
      } else if (req.method === 'GET') {
        if (!files.has(id)) { res.writeHead(404).end(); return; }
        res.writeHead(200).end(files.get(id));
      } else if (req.method === 'DELETE') {
        files.delete(id);
        res.writeHead(204).end();
      } else {
        res.writeHead(405).end();
      }
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  config.documentStoreUrl = `http://127.0.0.1:${server.address().port}/doc-store/`;
  config.documentStoreToken = TOKEN;
});

after(() => server.close());

beforeEach(() => {
  files.clear();
  behaviour = {};
  config.documentStoreToken = TOKEN;
});

test('isRemote follows the two settings', () => {
  assert.equal(store.isRemote(), true);
  config.documentStoreToken = '';
  assert.equal(store.isRemote(), false);
});

test('a saved file reads back byte for byte, and is gone after remove', async () => {
  const id = crypto.randomUUID();
  const bytes = crypto.randomBytes(5000);
  await store.save(id, bytes);
  assert.ok(files.get(id).equals(bytes));
  assert.ok((await store.read({ id, file_remote: true })).equals(bytes));
  await store.remove([id]);
  await assert.rejects(store.read({ id, file_remote: true }), { status: 404 });
});

test('a short write is refused as unavailable', async () => {
  behaviour.shortWrite = true;
  await assert.rejects(store.save(crypto.randomUUID(), Buffer.from('hello world')), { status: 503, code: 'DOCUMENT_STORAGE_UNAVAILABLE' });
});

test('a wrong secret or a failing store is reported as unavailable', async () => {
  config.documentStoreToken = 'b'.repeat(40);
  await assert.rejects(store.save(crypto.randomUUID(), Buffer.from('x')), { status: 503 });
  config.documentStoreToken = TOKEN;
  behaviour.fail = true;
  await assert.rejects(store.read({ id: crypto.randomUUID(), file_remote: true }), { status: 503 });
});

test('an unreachable store is reported as unavailable, never thrown raw', async () => {
  config.documentStoreUrl = 'http://127.0.0.1:1/doc-store/';
  await assert.rejects(store.save(crypto.randomUUID(), Buffer.from('x')), { status: 503 });
});

test('rows kept in the database are served from file_data', async () => {
  const bytes = Buffer.from('legacy');
  assert.equal(await store.read({ id: crypto.randomUUID(), file_remote: false, file_data: bytes }), bytes);
  await assert.rejects(store.read({ id: crypto.randomUUID(), file_remote: false, file_data: null }), { status: 404 });
});

test('remove never throws when the store is down', async () => {
  behaviour.fail = true;
  await store.remove([crypto.randomUUID()]);
});
