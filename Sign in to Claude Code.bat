@echo off
rem Signs Claude Code in again on this PC (the Wellness app's coach, Tagalog checks and advice use it).
title Sign in to Claude Code
where claude >nul 2>nul || (if exist "%USERPROFILE%\.local\bin\claude.exe" (set "PATH=%USERPROFILE%\.local\bin;%PATH%") else (echo   Claude Code is not installed on this PC. & pause & exit /b 1))
echo.
echo   A browser window opens: sign in with your Claude account (the one with your Pro plan).
echo.
claude auth login --claudeai
echo.
claude auth status --text
echo.
echo   Done. The Wellness app can use Claude again (try Parenting practice).
pause
