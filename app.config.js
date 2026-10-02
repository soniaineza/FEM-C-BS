const appJson = require('./app.json');

module.exports = () => {
  // Standalone build (see services/offline/): no server, no OTA update checks,
  // and its own application id so it installs next to the server-backed app.
  const offline = process.env.EXPO_PUBLIC_OFFLINE_DEMO === '1';
  const androidMapsKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY || '';
  const iosMapsKey = process.env.GOOGLE_MAPS_IOS_API_KEY || '';

  return {
    expo: {
      ...appJson.expo,
      name: offline ? `${appJson.expo.name} Offline` : appJson.expo.name,
      ...(offline ? { updates: { enabled: false, checkAutomatically: 'NEVER' } } : {}),
      ios: {
        ...appJson.expo.ios,
        bundleIdentifier:
          (appJson.expo.ios?.bundleIdentifier || 'com.femcabs.passenger') + (offline ? '.offline' : ''),
        config: {
          ...(appJson.expo.ios?.config || {}),
          googleMapsApiKey: iosMapsKey,
        },
        infoPlist: {
          ...(appJson.expo.ios?.infoPlist || {}),
          NSLocationWhenInUseUsageDescription:
            'Kimu Transport uses your location to find your pickup point and help your driver find you.',
        },
      },
      android: {
        ...appJson.expo.android,
        package: appJson.expo.android.package + (offline ? '.offline' : ''),
        config: {
          ...(appJson.expo.android?.config || {}),
          googleMaps: {
            apiKey: androidMapsKey,
          },
        },
      },
      extra: {
        ...(appJson.expo.extra || {}),
        googleMapsConfigured: Boolean(androidMapsKey || iosMapsKey),
        offlineDemo: offline,
      },
    },
  };
};
