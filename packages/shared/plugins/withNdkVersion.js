const { withProjectBuildGradle } = require('expo/config-plugins');

// Pins the Android NDK. Expo's root Gradle plugin uses rootProject.ext.ndkVersion
// when it is already set and otherwise React Native's default, and
// expo-build-properties (SDK 57) has no option for it.
//   ["@kimu/shared/plugins/withNdkVersion", { "version": "28.2.13676358" }]
module.exports = function withNdkVersion(config, { version }) {
  if (!version) throw new Error('withNdkVersion needs { version }');
  return withProjectBuildGradle(config, (mod) => {
    const marker = 'apply plugin: "expo-root-project"';
    if (!mod.modResults.contents.includes('ext.ndkVersion')) {
      mod.modResults.contents = mod.modResults.contents.replace(marker, `ext.ndkVersion = "${version}"\n\n${marker}`);
    }
    // Every native module too: otherwise modules that set no NDK version make
    // the Android Gradle plugin download its own default NDK (~700 MB).
    if (!mod.modResults.contents.includes('sub.android.ndkVersion')) {
      mod.modResults.contents += `
subprojects { sub ->
  ['com.android.library', 'com.android.application'].each { id ->
    sub.plugins.withId(id) { sub.android.ndkVersion = rootProject.ext.ndkVersion }
  }
}
`;
    }
    return mod;
  });
};
