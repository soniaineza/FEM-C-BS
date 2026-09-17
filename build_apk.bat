@echo off
setlocal
cd /d "%~dp0"
echo === BUILD START %DATE% %TIME% === > build_apk.log
where flutter >> build_apk.log 2>&1
REM Always points at the real production backend on Render, never a local
REM tunnel/IP — a stale tunnel URL here previously meant anyone testing the
REM APK from a different network than the developer would see every backend
REM call hang until it timed out. --split-per-abi keeps the per-phone APK
REM small; app-arm64-v8a-release.apk is the one to hand to real testers.
flutter clean >> build_apk.log 2>&1
flutter build apk --release --split-per-abi --dart-define=FEM_BASE_URL=https://fem-cabs-api.onrender.com/api >> build_apk.log 2>&1
echo BUILD DONE errorlevel=%ERRORLEVEL% >> build_apk.log
endlocal
