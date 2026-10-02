@echo off
rem Runs Kimu Transport on the Android emulator.
rem Start the emulator in Android Studio (Device Manager) first, then run this.
cd /d "%~dp0"
if not exist "node_modules\react-native-svg" (
  echo Installing the missing react-native-svg package...
  call npm install
)
echo.
echo Starting Metro and launching on the emulator...
call npx expo start --android --clear
pause
