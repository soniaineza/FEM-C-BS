const appJson = require('./app.json');

module.exports = () => {
  const androidMapsKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY || '';
  const iosMapsKey = process.env.GOOGLE_MAPS_IOS_API_KEY || '';

  return {
    expo: {
      ...appJson.expo,
      ios: {
        ...appJson.expo.ios,
        bundleIdentifier: appJson.expo.ios?.bundleIdentifier || 'com.femcabs.passenger',
        config: {
          ...(appJson.expo.ios?.config || {}),
          googleMapsApiKey: iosMapsKey,
        },
        infoPlist: {
          ...(appJson.expo.ios?.infoPlist || {}),
          NSLocationWhenInUseUsageDescription:
            'FEM c@bs uses your location to find your pickup point and help your driver find you.',
        },
      },
      android: {
        ...appJson.expo.android,
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
      },
    },
  };
};
