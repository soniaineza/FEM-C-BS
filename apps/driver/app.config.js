const appJson = require('./app.json');

// The maps in the app are drawn by MapLibre inside a DOM component (see
// packages/shared/components/map/MapEngine.tsx) with the style the API
// serves, so no Google Maps key is needed or configured here.
module.exports = () => ({
  expo: {
    ...appJson.expo,
    ios: {
      ...appJson.expo.ios,
      bundleIdentifier: appJson.expo.ios?.bundleIdentifier || 'com.femcabs.driver',
      infoPlist: {
        ...(appJson.expo.ios?.infoPlist || {}),
        NSLocationWhenInUseUsageDescription:
          'Kimu Drive uses your location to send you nearby ride requests and show riders where you are.',
      },
    },
  },
});
