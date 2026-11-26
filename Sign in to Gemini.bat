@echo off
rem Signs Antigravity CLI (agy) in on this PC (automatic Gemini backup when Claude Code's usage limit is reached).
title Sign in to Gemini (Antigravity CLI)
set "CLI="
where agy >nul 2>nul && set "CLI=agy"
if not defined CLI if exist "%LOCALAPPDATA%\agy\bin\agy.exe" (
  set "PATH=%LOCALAPPDATA%\agy\bin;%PATH%"
  set "CLI=agy"
)
if not defined CLI (
  echo.
  echo   Antigravity CLI ^(agy^) is not installed on this PC yet.
  echo   Install it once in PowerShell with:
  echo     irm https://antigravity.google/cli/install.ps1 ^| iex
  echo   Then run this again and sign in with your Google account.
  echo.
  pause
  exit /b 1
)
echo.
echo   Antigravity CLI ^(agy^) will open: sign in with your Google account if asked,
echo   then type /quit to close.
echo   The Wellness PC link uses Gemini automatically when Claude's usage is used up,
echo   until Claude resets on Wednesday ^(Gemini resets on Monday^).
echo.
call %CLI%
echo.
echo   Done. Gemini ^(Antigravity CLI^) is ready as a backup for the Wellness app.
pause
