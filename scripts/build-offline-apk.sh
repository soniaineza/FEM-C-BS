#!/usr/bin/env bash
# Builds the standalone Android APK: no server, no update checks, everything
# (accounts, rides, wallet, driver app) runs on the phone. See services/offline/.
#
#   scripts/build-offline-apk.sh            # -> ./fem-cabs-offline.apk
#
# Optional SMS through Pindo (OTP codes, ride updates, SOS): put
# EXPO_PUBLIC_PINDO_TOKEN in an untracked .env before building. That value is
# compiled into the APK, so use a dedicated low-balance token. Without it the
# app shows codes on screen instead.
#
# Overrides: JAVA_HOME, ANDROID_HOME, ARCHS (default arm64-v8a,x86_64 — the
# x86_64 slice is for the Android emulator), OUT (output path).
set -euo pipefail
cd "$(dirname "$0")/.."

export JAVA_HOME="${JAVA_HOME:-$HOME/jdk/jdk17}"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/Sdk}"
export PATH="$JAVA_HOME/bin:$PATH"
export EXPO_PUBLIC_OFFLINE_DEMO=1
ARCHS="${ARCHS:-arm64-v8a,x86_64}"
OUT="${OUT:-fem-cabs-offline.apk}"

[ -x "$JAVA_HOME/bin/java" ] || { echo "No JDK 17 at JAVA_HOME=$JAVA_HOME" >&2; exit 1; }
[ -d "$ANDROID_HOME" ] || { echo "No Android SDK at ANDROID_HOME=$ANDROID_HOME" >&2; exit 1; }

# android/ is generated and untracked. Reuse it when it is already the offline
# project (a JS/config-only change needs no native rebuild, which saves most of
# the ~45 minutes); FRESH=1 regenerates it, e.g. after adding a native module.
if [ "${FRESH:-0}" = 1 ] || ! grep -q "com.femcabs.passenger.offline" android/app/build.gradle 2>/dev/null; then
  npx expo prebuild --platform android --clean --no-install
fi
echo "sdk.dir=$ANDROID_HOME" > android/local.properties

# Always re-bundle the JS: EXPO_PUBLIC_* values are read while bundling, and
# Gradle does not treat them as inputs, so a settings-only change would be missed.
(cd android && ./gradlew :app:createBundleReleaseJsAndAssets --rerun assembleRelease -PreactNativeArchitectures="$ARCHS" --console=plain)

cp android/app/build/outputs/apk/release/app-release.apk "$OUT"
echo "Built $OUT ($(du -h "$OUT" | cut -f1)) — install with: adb install -r $OUT"
