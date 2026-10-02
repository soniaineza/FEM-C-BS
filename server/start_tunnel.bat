@echo off
setlocal
cd /d "%~dp0"
echo === TUNNEL START %DATE% %TIME% === > tunnel_run.log
echo Launching cloudflared quick tunnel via npx >> tunnel_run.log
start "KIMU_TUNNEL" cmd /c "npx --yes cloudflared tunnel --url http://localhost:3000 > tunnel_out.log 2>&1"
timeout /t 30 /nobreak > nul
echo Checking tunnel_out.log >> tunnel_run.log
type tunnel_out.log >> tunnel_run.log
echo DONE >> tunnel_run.log
endlocal
