const { withAppBuildGradle } = require('expo/config-plugins');

// Builds one APK per CPU architecture (arm64-v8a for phones from about 2016
// on, armeabi-v7a for older ones) instead of one APK carrying both sets of
// native libraries, plus a universal APK that works everywhere. Each split
// APK is roughly half the size of the universal one.
const SPLITS = `
    splits {
        abi {
            enable true
            reset()
            include "arm64-v8a", "armeabi-v7a"
            universalApk true
        }
    }
`;

module.exports = function withAbiSplits(config) {
  return withAppBuildGradle(config, (mod) => {
    if (!mod.modResults.contents.includes('splits {')) {
      mod.modResults.contents = mod.modResults.contents.replace(/\nandroid \{\n/, `\nandroid {\n${SPLITS}`);
    }
    return mod;
  });
};
