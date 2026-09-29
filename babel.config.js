module.exports = function (api) {
  api.cache(true);
  return {
    overrides: [
      {
        // Everything except MapLibre GL. MapLibre ships a prebuilt bundle and
        // builds its tile worker at runtime from the source text of its own
        // functions; transpiling it injects module-level helpers (e.g.
        // _wrapNativeSuper) the worker can't see, so production maps never
        // loaded. See also scripts/metro-minify.js.
        // A function, not a RegExp: Metro also loads this config without a
        // filename, and Babel rejects pattern matchers in that case.
        exclude: (filename) => Boolean(filename) && /[\\/]node_modules[\\/]maplibre-gl[\\/]/.test(filename),
        presets: [
          ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
          'nativewind/babel',
        ],
      },
    ],
  };
};
