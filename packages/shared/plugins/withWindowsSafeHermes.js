const { withAppBuildGradle } = require('expo/config-plugins');

// On Windows the Hermes compiler is run through `cmd /c`, and cmd drops the
// quotes around a first argument that contains spaces, so an absolute path such
// as "D:\FEM c@bs\node_modules\hermes-compiler\..." fails with
// "'D:\FEM' is not recognized". The compiler runs with the app folder as its
// working directory, so a path relative to that folder has no spaces.
const ABSOLUTE = /hermesCommand = new File\((\[.*?\]\.execute\(null, rootDir\)\.text\.trim\(\))\)\.getParentFile\(\)\.getAbsolutePath\(\) \+ "\/hermesc\/%OS-BIN%\/hermesc"/;

module.exports = function withWindowsSafeHermes(config) {
  return withAppBuildGradle(config, (mod) => {
    const src = mod.modResults.contents;
    if (ABSOLUTE.test(src)) {
      mod.modResults.contents = src.replace(
        ABSOLUTE,
        'hermesCommand = rootDir.getAbsoluteFile().getParentFile().toPath().relativize(new File($1).getParentFile().toPath()).toString() + "/hermesc/%OS-BIN%/hermesc"'
      );
    } else if (!src.includes('relativize(new File(')) {
      console.warn('withWindowsSafeHermes: hermesCommand line not found in app/build.gradle; leaving it unchanged');
    }
    return mod;
  });
};
