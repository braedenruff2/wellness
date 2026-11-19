@echo off
rem Shows a one-time code to pair your phone with the Wellness PC link.
setlocal
title Wellness - pair a phone
set "UV_PROJECT_ENVIRONMENT=%LOCALAPPDATA%\Wellness\venv"
set "PYTHONUTF8=1"
if not exist "%LOCALAPPDATA%\Wellness\bin\uv.exe" (
  echo   Run "Set up PC link.bat" first.
  pause
  exit /b 1
)
"%LOCALAPPDATA%\Wellness\bin\uv.exe" run --no-sync --project "%~dp0pc" python "%~dp0pc\wellness_pc.py" pair
pause
