@echo off
cd /d "%~dp0"
echo === DIAG %DATE% %TIME% === > diag.log
node -v >> diag.log 2>&1
npm -v >> diag.log 2>&1
where cloudflared >> diag.log 2>&1
where ngrok >> diag.log 2>&1
tasklist /FI "IMAGENAME eq node.exe" >> diag.log 2>&1
tasklist /FI "IMAGENAME eq cmd.exe" >> diag.log 2>&1
echo DIAG DONE >> diag.log
