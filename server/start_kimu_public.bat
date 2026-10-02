@echo off
setlocal
cd /d "%~dp0"
echo === START %DATE% %TIME% === > public_run.log
if not exist node_modules (
  echo Installing dependencies >> public_run.log
  call npm install >> public_run.log 2>&1
)
echo Starting backend >> public_run.log
start "KIMU_BACKEND" cmd /c "npm start > backend_out.log 2>&1"
timeout /t 8 /nobreak > nul
echo Starting ngrok >> public_run.log
start "KIMU_NGROK" cmd /c "ngrok http 3000 --log=stdout > ngrok_out.log 2>&1"
timeout /t 10 /nobreak > nul
echo Fetching tunnel info >> public_run.log
curl -s http://127.0.0.1:4040/api/tunnels > tunnel_info.json
type tunnel_info.json >> public_run.log
echo DONE >> public_run.log
endlocal
