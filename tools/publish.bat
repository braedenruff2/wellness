@echo off
rem Keeps this folder and GitHub in step (run every 15 minutes by the "Wellness publish" scheduled task that
rem "Turn on lesson updates.bat" sets up). Since 21 Nov 2026 the cloud autopilot works on main directly, so this
rem first takes what the cloud pushed (on a clash GitHub's version wins), then sends any changes made here.
cd /d "%~dp0.."
if not exist ".git\" exit /b 0
git add -A >nul 2>&1
git diff --cached --quiet
if errorlevel 1 git commit -q -m "Update %date% %time%" >nul 2>&1
git fetch -q origin > "%~dp0last-publish.txt" 2>&1
git merge -q --no-edit -X theirs origin/main >> "%~dp0last-publish.txt" 2>&1 || git merge --abort >nul 2>&1
git push -q origin main >> "%~dp0last-publish.txt" 2>&1
