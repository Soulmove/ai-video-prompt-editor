@echo off
chcp 65001 >nul
cd /d "%~dp0"
set PORT=4174
echo ======================================================
echo   Jingxu 2.0 - Multi-Track AI Video Prompt Editor
echo   Local Server: http://127.0.0.1:%PORT%
echo ======================================================
where node >nul 2>nul
if %errorlevel% neq 0 (
  echo [Error] Node.js 20+ not found in PATH.
  pause
  exit /b 1
)
start "" http://127.0.0.1:%PORT%/
node server.mjs
pause
