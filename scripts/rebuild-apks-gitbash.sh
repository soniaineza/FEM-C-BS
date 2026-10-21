#!/bin/bash
# Local rebuild wrapper for Git Bash on Windows: sets JDK 17 + production env,
# then builds release APKs against https://api.kimutransport.com/api.
set -e
export JAVA_HOME="${JAVA_HOME:-/c/Program Files/Eclipse Adoptium/jdk-17.0.20.101-hotspot}"
export ANDROID_HOME="${LOCALAPPDATA}/Android/Sdk"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export NODE_ENV=production
export EXPO_PUBLIC_API_BASE_URL="${EXPO_PUBLIC_API_BASE_URL:-https://api.kimutransport.com/api}"
export PATH="$JAVA_HOME/bin:$PATH"
cd "$(dirname "$0")/.."
echo "java: $(java -version 2>&1 | head -1)"
echo "api:  $EXPO_PUBLIC_API_BASE_URL"
exec bash scripts/build-apks.sh "$@"
