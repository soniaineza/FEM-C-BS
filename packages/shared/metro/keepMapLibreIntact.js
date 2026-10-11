// Metro babel transformer for the two apps: Expo's own, except that MapLibre's
// prebuilt bundle is passed through untouched.
//
// MapLibre builds its web worker at run time by calling Function.toString() on
// two functions inside maplibre-gl.js and putting the text in a Blob. That
// only works if each function is self-contained. Babel's class transform (on
// for the Android/iOS DOM-component bundle) hoists its helpers to the top of
// the module, outside those functions, so the worker died with
// "ReferenceError: m is not defined" and the map never reported ready.
// The file is already shipped as plain, minified JS for browsers (and the
// DOM component runs in a WebView), so it needs no transform at all.
const path = require('path');

const expoRoot = path.dirname(require.resolve('expo/package.json'));
const upstream = require(require.resolve('@expo/metro-config/babel-transformer', { paths: [expoRoot] }));
const { parseSync } = require(require.resolve('@babel/core', { paths: [expoRoot] }));

const MAPLIBRE_BUNDLE = /[\\/]node_modules[\\/]maplibre-gl[\\/]dist[\\/]maplibre-gl(-csp)?\.js$/;

module.exports = {
  ...upstream,
  transform(props) {
    if (MAPLIBRE_BUNDLE.test(props.filename)) {
      return { ast: parseSync(props.src, { sourceType: 'script', babelrc: false, configFile: false, filename: props.filename }) };
    }
    return upstream.transform(props);
  },
};
