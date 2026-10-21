@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 22 or newer is required. Install the LTS release from https://nodejs.org/
  pause
  exit /b 1
)
if not exist "node_modules\web-ext\bin\web-ext.js" (
  call npm ci --no-audit --no-fund
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
node scripts\install-browsers.mjs %*
if errorlevel 1 pause
