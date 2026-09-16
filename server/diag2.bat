@echo off
cd /d "%~dp0"
echo LINE1 > diag2.log
where cloudflared 1>>diag2.log 2>>diag2.log
echo LINE2 >> diag2.log
where ngrok 1>>diag2.log 2>>diag2.log
echo LINE3 >> diag2.log
