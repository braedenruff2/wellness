@echo off
rem Signs Gemini CLI in on this PC (automatic backup when Claude Code's usage limit is reached).
title Sign in to Gemini CLI
where gemini >nul 2>nul
if errorlevel 1 (
  if exist "%APPDATA%\npm\gemini.cmd" (
    set "PATH=%APPDATA%\npm;%PATH%"
  ) else if exist "%USERPROFILE%\Desktop\Loudbook\tools\node\gemini.cmd" (
    set "PATH=%USERPROFILE%\Desktop\Loudbook\tools\node;%PATH%"
  ) else (
    echo.
    echo   Gemini CLI is not installed on this PC yet.
    echo   Install it once with:  npm install -g @google/gemini-cli
    echo   Then run this again and sign in with your Google account.
    echo.
    pause
    exit /b 1
  )
)
echo.
echo   Gemini CLI will open: sign in with your Google account (then type /quit to close).
echo   The Wellness PC link uses Gemini automatically when Claude's usage is used up,
echo   until Claude resets on Wednesday (Gemini resets on Monday).
echo.
call gemini
echo.
echo   Done. Gemini is ready as a backup for the Wellness app.
pause
