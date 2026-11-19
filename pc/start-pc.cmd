@echo off
rem Keeps the Wellness PC link running: brings it back after a crash. Started with no window by run-pc.vbs.
rem Delete %LOCALAPPDATA%\Wellness\run.on to stop it.
setlocal
set "WL=%LOCALAPPDATA%\Wellness"
set "UV_PROJECT_ENVIRONMENT=%WL%\venv"
set "PYTHONUTF8=1"
set "UV=%WL%\bin\uv.exe"
:again
if not exist "%WL%\run.on" exit /b 0
"%UV%" sync --quiet --python 3.12 --project "%~dp0." >> "%WL%\pc.log" 2>&1
"%UV%" run --no-sync --project "%~dp0." python -u "%~dp0wellness_pc.py" serve >> "%WL%\pc.log" 2>&1
timeout /t 20 /nobreak >nul
goto again
