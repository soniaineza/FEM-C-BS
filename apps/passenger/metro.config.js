const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// Keeps Babel's class helpers out of MapLibre's worker; see the file for why.
config.transformer.babelTransformerPath = require.resolve('@kimu/shared/metro/keepMapLibreIntact');

module.exports = withNativeWind(config, { input: './global.css' });
