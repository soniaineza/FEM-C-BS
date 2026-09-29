// Metro minifier: terser for everything except MapLibre GL.
//
// MapLibre builds its tile worker at runtime from the source text of its own
// bundled functions. Re-minifying that (already minified) bundle moves
// helpers out of those functions, so the worker fails with
// "ReferenceError: m is not defined" and the map never loads — only in
// production bundles (dev bundles aren't minified). MapLibre ships minified,
// so passing it through untouched costs nothing.
const terser = require('metro-minify-terser');
const minify = terser.default ?? terser;

// Metro may pass a project-relative filename (no leading slash).
const SKIP = /(^|[\\/])node_modules[\\/]maplibre-gl[\\/]/;

module.exports = function metroMinify(options) {
  if (SKIP.test(options.filename)) return { code: options.code, map: options.map };
  return minify(options);
};
