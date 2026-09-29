const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);
// Keep MapLibre's bundle out of re-minification (see scripts/metro-minify.js).
config.transformer.minifierPath = require.resolve('./scripts/metro-minify.js');

module.exports = withNativeWind(config, { input: './global.css' });
