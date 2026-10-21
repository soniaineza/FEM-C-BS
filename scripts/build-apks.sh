#!/bin/bash
# Builds installable release APKs for both apps locally with Gradle (no EAS).
#
#   bash scripts/build-apks.sh            # both apps
#   bash scripts/build-apks.sh driver     # one app
#
# Needs the Android SDK (ANDROID_HOME, or the default Android Studio location)
# and JDK 17. Output: build/apk/kimu-<app>-<abi>-release.apk, one per CPU
# architecture plus a universal APK that installs on any phone.
#
# The APKs are signed with the debug keystore that prebuild generates, which is
# fine for installing on phones directly; a Play Store release needs a real
# keystore in apps/<app>/android/app/build.gradle.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export ANDROID_HOME="${ANDROID_HOME:-$LOCALAPPDATA/Android/Sdk}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export EXPO_PUBLIC_API_BASE_URL="${EXPO_PUBLIC_API_BASE_URL:-https://api.kimutransport.com/api}"
export CI=1
APPS="${1:-passenger driver}"
mkdir -p "$ROOT/build/apk"
for app in $APPS; do
  echo "=== [$app] prebuild $(date +%T)"
  cd "$ROOT/apps/$app"
  rm -rf android
  npx expo prebuild --platform android --no-install
  echo "=== [$app] gradle assembleRelease $(date +%T)"
  cd android
  ./gradlew assembleRelease --no-daemon -q --console=plain
  # The map page is a separate JS bundle inside the APK; refuse to ship one
  # that older Android WebViews cannot parse (see scripts/check-dom-bundle.mjs).
  node "$ROOT/scripts/check-dom-bundle.mjs" "$app"
  for f in app/build/outputs/apk/release/*.apk; do
    cp "$f" "$ROOT/build/apk/kimu-$app-$(basename "$f" | sed 's/^app-//')"
  done
done
echo "=== done $(date +%T)"
ls -la "$ROOT/build/apk/"
