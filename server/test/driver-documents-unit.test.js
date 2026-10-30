// Unit tests for the driver application pieces that need no database: what
// the server accepts as a document file, and which routes an unverified
// driver's session may use.   Run: node --test test/driver-documents-unit.test.js
process.env.MYSQL_HOST = process.env.MYSQL_HOST || 'db.example.com';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'unit-test-secret';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const docs = require('../src/services/driverDocuments');
const { isApplicationRoute } = require('../src/middleware/auth');

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jXioAAAAASUVORK5CYII=', 'base64');
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]), Buffer.from('JFIF\0'), Buffer.alloc(32, 0x11), Buffer.from([0xff, 0xd9])]);
const PDF = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n%%EOF\n');
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0x20, 0, 0, 0]), Buffer.from('WEBPVP8 '), Buffer.alloc(24, 0)]);
const HEIC = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypheic'), Buffer.alloc(24, 0)]);
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypisom'), Buffer.alloc(24, 0)]);
const TEXT = Buffer.from('this is not an image, whatever the picker says\n');

test('the bytes decide what a file is', () => {
  assert.equal(docs.detectContentType(PNG), 'image/png');
  assert.equal(docs.detectContentType(JPEG), 'image/jpeg');
  assert.equal(docs.detectContentType(PDF), 'application/pdf');
  assert.equal(docs.detectContentType(WEBP), 'image/webp');
  assert.equal(docs.detectContentType(HEIC), 'image/heic');
  assert.equal(docs.detectContentType(MP4), null, 'an MP4 video is not a document');
  assert.equal(docs.detectContentType(TEXT), null);
  assert.equal(docs.detectContentType(Buffer.alloc(3)), null, 'too short to be anything');
});

test('a declared type that matches the bytes is accepted, including jpg aliases and parameters', () => {
  assert.deepEqual(docs.classifyDocument(JPEG, 'image/jpeg'), { contentType: 'image/jpeg' });
  assert.deepEqual(docs.classifyDocument(JPEG, 'image/jpg'), { contentType: 'image/jpeg' });
  assert.deepEqual(docs.classifyDocument(JPEG, 'IMAGE/JPEG; charset=binary'), { contentType: 'image/jpeg' });
  assert.deepEqual(docs.classifyDocument(PDF, 'application/pdf'), { contentType: 'application/pdf' });
  assert.deepEqual(docs.classifyDocument(HEIC, 'image/heif'), { contentType: 'image/heic' }, 'heif and heic are one family');
});

test('an Android picker that reports octet-stream or nothing is overridden by the bytes', () => {
  assert.deepEqual(docs.classifyDocument(PNG, 'application/octet-stream'), { contentType: 'image/png' });
  assert.deepEqual(docs.classifyDocument(PDF, ''), { contentType: 'application/pdf' });
  assert.deepEqual(docs.classifyDocument(WEBP, undefined), { contentType: 'image/webp' });
  assert.equal(docs.isAcceptableDeclaredType('application/octet-stream'), true);
  assert.equal(docs.isAcceptableDeclaredType(undefined), true);
  assert.equal(docs.isAcceptableDeclaredType('image/jpg'), true);
  assert.equal(docs.isAcceptableDeclaredType('text/plain'), false);
  assert.equal(docs.isAcceptableDeclaredType('video/mp4'), false);
});

test('a file whose bytes contradict a supported declared type, or are not a document at all, is refused', () => {
  assert.equal(docs.classifyDocument(JPEG, 'image/png').error.status, 415);
  assert.equal(docs.classifyDocument(TEXT, 'image/png').error.status, 415);
  assert.equal(docs.classifyDocument(TEXT, 'application/octet-stream').error.status, 415);
  assert.equal(docs.classifyDocument(MP4, 'image/heic').error.status, 415);
  assert.equal(docs.classifyDocument(Buffer.alloc(0), 'image/jpeg').error.status, 415);
});

test('the size limit leaves room for a phone camera photo', () => {
  assert.ok(docs.DOCUMENT_MAX_BYTES >= 10 * 1024 * 1024, `${docs.DOCUMENT_MAX_MB} MB is too small for a raw camera photo`);
  assert.equal(docs.DOCUMENT_MAX_BYTES, docs.DOCUMENT_MAX_MB * 1024 * 1024);
});

test('download names cannot carry path or header characters', () => {
  assert.equal(docs.safeDownloadName('../../etc/passwd'), '.._.._etc_passwd');
  assert.equal(docs.safeDownloadName('id "front"\r\nX: y.png'), 'id _front___X: y.png');
  assert.equal(docs.safeDownloadName(''), 'driver-document');
  assert.equal(docs.safeDownloadName('a'.repeat(300)).length, 160);
});

test('an unverified driver may finish the application and read decisions, nothing more', () => {
  const allowed = [
    ['GET', '/me'], ['PUT', '/me'], ['GET', '/vehicle'], ['PUT', '/vehicle'],
    ['GET', '/documents'], ['POST', '/documents'],
    ['GET', '/documents/2f1c5a0e-6d1b-4f4a-9b1d-3c2e1f0a9b8c/file'],
    ['GET', '/notifications'], ['GET', '/notifications/unread-count'],
    ['POST', '/notifications/2f1c5a0e-6d1b-4f4a-9b1d-3c2e1f0a9b8c/read'], ['POST', '/notifications/read-all'],
    ['POST', '/device-token'], ['POST', '/notifications/device-token'],
    ['GET', '/support'], ['POST', '/support'], ['GET', '/support/2f1c5a0e-6d1b-4f4a-9b1d-3c2e1f0a9b8c'],
    ['POST', '/support/2f1c5a0e-6d1b-4f4a-9b1d-3c2e1f0a9b8c/messages'],
    ['DELETE', '/account'],
  ];
  for (const [method, path] of allowed) assert.equal(isApplicationRoute(method, path), true, `${method} ${path}`);
  const closed = [
    ['PUT', '/status'], ['GET', '/earnings'], ['GET', '/earnings/history'], ['GET', '/payouts'], ['POST', '/payouts'],
    ['GET', '/balance'], ['POST', '/balance/settle'], ['GET', '/ratings'], ['GET', '/rides'],
    ['POST', '/share'], ['POST', '/incidents'], ['POST', '/emergency'],
    ['DELETE', '/documents'], ['PUT', '/documents'], ['GET', '/documents/../../earnings'],
    ['GET', '/me/anything'], ['POST', '/me'],
  ];
  for (const [method, path] of closed) assert.equal(isApplicationRoute(method, path), false, `${method} ${path}`);
});
