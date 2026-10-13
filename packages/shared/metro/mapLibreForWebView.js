// Metro Babel transformer for the two apps: Expo's own, except for MapLibre's
// prebuilt bundle, which gets its own small treatment so that the map page
// runs in the Android System WebViews people actually have.
//
// Two things are going on.
//
// 1. MapLibre builds its web worker at run time by calling Function.toString()
//    on two functions inside maplibre-gl.js and putting the text in a Blob.
//    That only works if each function is self-contained. Expo's DOM-component
//    Babel preset (babel-preset-expo/build/configs/webview.js) transforms
//    classes, destructuring and so on, and hoists its helpers to the top of
//    the module, outside those functions, so the worker died with
//    "ReferenceError: m is not defined" and the map never reported ready.
//    Passing the file through untouched fixed the worker but shipped the
//    bundle's ES2020 syntax (optional chaining, nullish coalescing, BigInt
//    literals) as-is, which older WebViews cannot parse at all: the whole map
//    script then fails with a SyntaxError before a single line runs.
//
//    So the file is parsed and only the syntax newer than Chromium 66 (Android
//    9's factory WebView, the floor Expo's preset targets) is rewritten, with
//    plugins that emit plain inline code and never add helpers. Classes,
//    async functions and the rest are native there and stay as they are.
//    BigInt literals (only reachable through MapLibre's MLT tile decoder,
//    which OpenFreeMap's MVT tiles never use) become BigInt("...") calls so
//    they parse everywhere. The output is checked to still be a single
//    top-level statement, i.e. nothing was hoisted.
//
// 2. The worker has no access to the page's polyfills, so the text of
//    components/map/webview-polyfills.js is prepended to the worker's source
//    string (Array.prototype.at, Object.hasOwn and friends are used in the
//    chunk shared between page and worker).
//
// tests/map/webview-bundle.test.mjs checks the result parses as ES2018 and
// scripts/check-dom-bundle.mjs checks the same for the bundle a release build
// actually ships.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const expoRoot = path.dirname(require.resolve('expo/package.json'));
const upstream = require(require.resolve('@expo/metro-config/babel-transformer', { paths: [expoRoot] }));
const babel = require(require.resolve('@babel/core', { paths: [expoRoot] }));

const MAPLIBRE_BUNDLE = /[\\/]node_modules[\\/]maplibre-gl[\\/]dist[\\/]maplibre-gl(-csp|-dev)?\.js$/;
const POLYFILLS_PATH = path.join(__dirname, '..', 'components', 'map', 'webview-polyfills.js');
// The exact text MapLibre's UMD header uses to assemble the worker source.
const WORKER_SOURCE_PREFIX = "var workerBundleString = '";

function plugin(name) {
  return require(require.resolve(name, { paths: [expoRoot] }));
}

/** `0n` -> `BigInt("0")`: same value where BigInt exists, a parse-safe call elsewhere. */
const bigintLiteralsToCalls = ({ types: t }) => ({
  name: 'kimu-bigint-literals-to-calls',
  visitor: {
    BigIntLiteral(nodePath) {
      nodePath.replaceWith(t.callExpression(t.identifier('BigInt'), [t.stringLiteral(String(nodePath.node.value))]));
    },
  },
});

function readPolyfills() {
  const text = fs.readFileSync(POLYFILLS_PATH, 'utf8');
  if (text.includes('"')) {
    throw new Error('mapLibreForWebView: webview-polyfills.js must not contain double quotes (it is embedded as a JSON string).');
  }
  return text;
}

function transformMapLibre(src, filename) {
  if (!src.includes(WORKER_SOURCE_PREFIX)) {
    throw new Error(
      'mapLibreForWebView: maplibre-gl.js no longer builds its worker from "' +
        WORKER_SOURCE_PREFIX +
        '"; update the transformer for this MapLibre version.'
    );
  }
  const withPolyfills = src.replace(
    WORKER_SOURCE_PREFIX,
    () => 'var workerBundleString = ' + JSON.stringify(readPolyfills() + '\n') + " + '"
  );
  const result = babel.transformSync(withPolyfills, {
    filename,
    ast: true,
    code: false,
    babelrc: false,
    configFile: false,
    sourceType: 'script',
    compact: false,
    plugins: [
      bigintLiteralsToCalls,
      [plugin('@babel/plugin-transform-optional-chaining'), { loose: true }],
      [plugin('@babel/plugin-transform-nullish-coalescing-operator'), { loose: true }],
      [plugin('@babel/plugin-transform-logical-assignment-operators')],
      [plugin('@babel/plugin-transform-optional-catch-binding')],
      // useBuiltIns: Object.assign() inline instead of an _objectSpread helper.
      [plugin('@babel/plugin-transform-object-rest-spread'), { loose: true, useBuiltIns: true }],
    ],
  });
  const body = result.ast.program.body;
  // The file is one UMD expression statement. Anything more means Babel
  // injected a helper at module scope, which the worker could not see.
  if (body.length !== 1) {
    throw new Error(
      'mapLibreForWebView: Babel added ' + (body.length - 1) + ' top-level statement(s) to maplibre-gl.js; ' +
        'a helper outside the worker functions would break the map worker.'
    );
  }
  return { ast: result.ast };
}

module.exports = {
  ...upstream,
  transform(props) {
    if (MAPLIBRE_BUNDLE.test(props.filename)) {
      return transformMapLibre(props.src, props.filename);
    }
    return upstream.transform(props);
  },
  // This file is already part of Metro's cache key; the polyfills it embeds
  // are not, so hash them in or an edit there would ship stale workers.
  getCacheKey(options) {
    const base = typeof upstream.getCacheKey === 'function' ? upstream.getCacheKey(options) : '';
    return base + ':kimu-polyfills-' + crypto.createHash('md5').update(fs.readFileSync(POLYFILLS_PATH)).digest('hex');
  },
};
