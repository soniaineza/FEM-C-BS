#!/bin/bash
# CI/local rebuild wrapper: sets the Android SDK + JDK 17 env, then builds
# the release APKs with the production API URL (api.kimutransport.com).
set -e
export ANDROID_HOME="${ANDROID_HOME:-/mnt/c/Users/ineza/AppData/Local/Android/Sdk}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export JAVA_HOME="${JAVA_HOME:-/mnt/c/Program Files/Eclipse Adoptium/jdk-17.0.20.101-hotspot}"
export PATH="$JAVA_HOME/bin:$PATH"
export NODE_ENV=production
export EXPO_PUBLIC_API_BASE_URL="${EXPO_PUBLIC_API_BASE_URL:-https://api.kimutransport.com/api}"
cd /mnt/d/"FEM c@bs"
exec bash scripts/build-apks.sh "$@"
