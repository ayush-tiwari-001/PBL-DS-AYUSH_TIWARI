@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 18 or newer is required. Download it from https://nodejs.org
  pause
  exit /b 1
)

if not exist engine\bin\history_engine.exe (
  call build.bat
  if errorlevel 1 (
    pause
    exit /b 1
  )
)

if "%PORT%"=="" set PORT=3000
start "" cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:%PORT%"
node server\server.js
pause
