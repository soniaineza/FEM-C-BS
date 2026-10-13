// The map page runs inside Android System WebViews that can be years old.
// These tests pin down what packages/shared/metro/mapLibreForWebView.js and
// components/map/webview-polyfills.js promise: MapLibre's bundle parses as
// ES2018 (Chromium 66), nothing was hoisted out of the functions MapLibre
// turns into its web worker, and the worker carries the polyfills.
//
//   node --experimental-strip-types --test tests/map/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const expoRoot = path.dirname(require.resolve('expo/package.json', { paths: [root] }));
const acorn = require('acorn');
const generate = require(require.resolve('@babel/generator', { paths: [expoRoot] })).default;

const transformer = require(path.join(root, 'packages/shared/metro/mapLibreForWebView.js'));
const POLYFILLS = path.join(root, 'packages/shared/components/map/webview-polyfills.js');
const MAPLIBRE = require.resolve('maplibre-gl/dist/maplibre-gl.js', { paths: [root] });

let cached = null;
function transformedMapLibre() {
  if (cached) return cached;
  const src = fs.readFileSync(MAPLIBRE, 'utf8');
  const { ast } = transformer.transform({ filename: MAPLIBRE, src, options: { dev: false, platform: 'web' }, plugins: [] });
  cached = { ast, code: generate(ast, { compact: true, comments: false }).code };
  return cached;
}

test('polyfills are plain ES5, ASCII, and free of double quotes', () => {
  const src = fs.readFileSync(POLYFILLS, 'utf8');
  assert.doesNotThrow(() => acorn.parse(src, { ecmaVersion: 5, sourceType: 'script' }));
  assert.ok(!/[^\x00-\x7f]/.test(src), 'must be ASCII (it is embedded as a string in the worker)');
  assert.ok(!src.includes('"'), 'must not contain double quotes');
});

test('polyfills fill in what Chromium 66 lacks, in a page and in a worker', () => {
  const src = fs.readFileSync(POLYFILLS, 'utf8');
  for (const globalName of ['self', 'window']) {
    const ctx = vm.createContext({});
    vm.runInContext(
      `
      delete Array.prototype.at; delete String.prototype.at; delete Array.prototype.flat; delete Array.prototype.flatMap;
      delete Array.prototype.findLast; delete Array.prototype.findLastIndex; delete Object.hasOwn; delete Object.fromEntries;
      delete String.prototype.replaceAll; delete Promise.allSettled; delete globalThis.queueMicrotask;
      delete globalThis.AbortController; delete globalThis.AbortSignal; delete globalThis.globalThis;
      ${globalName} = this;
    `,
      ctx
    );
    vm.runInContext(src, ctx);
    const out = vm.runInContext(
      `
      var c = new AbortController(); var fired = 0; c.signal.addEventListener('abort', function () { fired++; }); c.abort();
      JSON.stringify({
        at: [1, 2, 3].at(-1), strAt: 'abc'.at(-1), flat: [[1], [2, [3]]].flat(2), flatMap: [1, 2].flatMap(function (x) { return [x, x]; }),
        findLast: [1, 2, 3].findLast(function (x) { return x < 3; }), hasOwn: Object.hasOwn({ a: 1 }, 'a'), fromEntries: Object.fromEntries([['a', 1]]),
        replaceAll: 'a.b.c'.replaceAll('.', '-'), aborted: c.signal.aborted, fired: fired, hasGlobalThis: typeof globalThis === 'object',
        throwIfAborted: (function () { try { c.signal.throwIfAborted(); return false; } catch (e) { return e.name; } })()
      })
    `,
      ctx
    );
    assert.deepEqual(JSON.parse(out), {
      at: 3,
      strAt: 'c',
      flat: [1, 2, 3],
      flatMap: [1, 1, 2, 2],
      findLast: 2,
      hasOwn: true,
      fromEntries: { a: 1 },
      replaceAll: 'a-b-c',
      aborted: true,
      fired: 1,
      hasGlobalThis: true,
      throwIfAborted: 'AbortError',
    });
  }
});

test('the transformed MapLibre bundle parses as ES2018 and stays one top-level statement', () => {
  const { ast, code } = transformedMapLibre();
  assert.equal(ast.program.body.length, 1, 'Babel must not hoist helpers to module scope (the worker would not see them)');
  assert.doesNotThrow(() => acorn.parse(code, { ecmaVersion: 2018, sourceType: 'script' }));
  // Belt and braces: the tokens that break old WebViews are gone.
  assert.ok(!/\?\.(?![0-9])/.test(code), 'optional chaining left in the bundle');
  assert.ok(!/\?\?/.test(code), 'nullish coalescing left in the bundle');
  assert.ok(!/[^\w$]\d+n(?![\w$])/.test(code), 'BigInt literal left in the bundle');
  assert.ok(code.includes('BigInt("'), 'BigInt literals should have become BigInt("...") calls');
});

test('the worker source starts with the polyfills', () => {
  const { code } = transformedMapLibre();
  const i = code.indexOf('workerBundleString=');
  assert.ok(i > 0, 'workerBundleString assignment not found');
  const head = code.slice(i, i + 6000);
  assert.ok(/define\(Object,\s*'hasOwn'/.test(head), 'polyfills missing from the worker source');
  assert.ok(head.includes('var sharedModule = {}; ('), 'MapLibre worker assembly text changed');
});

test('the worker polyfill is embedded verbatim, including replacement tokens', () => {
  const { ast } = transformedMapLibre();
  const polyfills = fs.readFileSync(POLYFILLS, 'utf8') + '\n';
  let workerInit;
  function findWorkerInit(node) {
    if (!node || typeof node !== 'object' || workerInit) return;
    if (
      node.type === 'VariableDeclarator' &&
      node.id.type === 'Identifier' &&
      node.id.name === 'workerBundleString'
    ) {
      workerInit = node.init;
      return;
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(findWorkerInit);
      else findWorkerInit(value);
    }
  }
  findWorkerInit(ast);
  assert.ok(workerInit, 'workerBundleString initializer not found');
  while (workerInit.type === 'BinaryExpression' && workerInit.operator === '+') workerInit = workerInit.left;
  assert.equal(workerInit.type, 'StringLiteral');
  assert.equal(workerInit.value, polyfills);
});

test('a transformer that would hoist a helper is refused, not silently shipped', () => {
  // Object rest patterns need the _objectWithoutProperties helper, which
  // Babel places at module scope: exactly the thing the transformer guards.
  const fake = "var workerBundleString = 'x'; (function(){ var {a, ...rest} = {a: 1, b: 2}; return rest; })();";
  assert.throws(
    () =>
      transformer.transform({
        filename: '/node_modules/maplibre-gl/dist/maplibre-gl.js',
        src: fake,
        options: { dev: false, platform: 'web' },
        plugins: [],
      }),
    /top-level statement/
  );
});
