const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// Makes MapLibre's bundle run in older Android WebViews and keeps Babel's
// helpers out of its web worker; see the file for why.
config.transformer.babelTransformerPath = require.resolve('@kimu/shared/metro/mapLibreForWebView');

// Git worktrees under .claude/ (parallel agent work) hold a second copy of
// every package; Metro must neither crawl nor resolve them.
config.resolver.blockList = [config.resolver.blockList, /[\\/]\.claude[\\/]/].flat().filter(Boolean);

module.exports = withNativeWind(config, { input: './global.css' });
