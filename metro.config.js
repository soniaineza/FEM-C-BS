const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);
// Keep MapLibre's bundle out of re-minification (see scripts/metro-minify.js).
config.transformer.minifierPath = require.resolve('./scripts/metro-minify.js');

// QA in Expo Go only (QA_STUB_NOTIFICATIONS=<stub path>): Expo Go on Android throws on import.
if (process.env.QA_STUB_NOTIFICATIONS) {
  const upstream = config.resolver.resolveRequest;
  config.resolver.resolveRequest = (ctx, name, platform) =>
    name === 'expo-notifications'
      ? { type: 'sourceFile', filePath: process.env.QA_STUB_NOTIFICATIONS }
      : name === './MapEngine' && process.env.QA_STUB_MAP
        ? { type: 'sourceFile', filePath: process.env.QA_STUB_MAP }
        : (upstream ?? ctx.resolveRequest)(ctx, name, platform);
}

module.exports = withNativeWind(config, { input: './global.css' });
