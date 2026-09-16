@echo off
setlocal
cd /d "%~dp0"
echo === BUILD START %DATE% %TIME% === > build_apk.log
where flutter >> build_apk.log 2>&1
flutter build apk --release --dart-define=FEM_BASE_URL=https://gsm-means-declared-jun.trycloudflare.com/api >> build_apk.log 2>&1
echo BUILD DONE errorlevel=%ERRORLEVEL% >> build_apk.log
endlocal
