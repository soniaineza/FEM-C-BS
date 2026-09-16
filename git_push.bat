@echo off
setlocal
cd /d "%~dp0"
echo === GIT PUSH START %DATE% %TIME% === > git_push.log
git config --global credential.helper >> git_push.log 2>&1
echo --- status --- >> git_push.log
git status --short >> git_push.log 2>&1
echo --- add --- >> git_push.log
git add -A >> git_push.log 2>&1
echo --- commit --- >> git_push.log
git commit -m "Sync current FEM C@BS server and app code for deployment" >> git_push.log 2>&1
echo --- push --- >> git_push.log
git push origin main >> git_push.log 2>&1
echo PUSH_EXIT=%ERRORLEVEL% >> git_push.log
echo DONE >> git_push.log
endlocal
