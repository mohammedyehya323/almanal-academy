@echo off
setlocal
cd /d "%~dp0"

echo ==============================================
echo   Build a new offline HTML for Hisab Dhihni
echo ==============================================
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo ERROR: Node.js is not installed.
  echo Install the Node.js LTS version, then run this file again.
  pause
  exit /b 1
)

where pnpm >nul 2>&1
if errorlevel 1 (
  echo ERROR: pnpm is not installed.
  echo Open Command Prompt and run: npm install --global pnpm
  pause
  exit /b 1
)

if not exist "node_modules\vite\package.json" (
  echo Dependencies are missing; installing them now.
  echo This first install needs an internet connection.
  call pnpm install
  if errorlevel 1 goto failed
)

echo.
echo [1/3] Checking the source files...
call pnpm check
if errorlevel 1 goto failed

echo.
echo [2/3] Building the website...
call pnpm build
if errorlevel 1 goto failed

echo.
echo [3/3] Packing CSS and JavaScript into one HTML...
call node build-offline.mjs
if errorlevel 1 goto failed

echo.
echo Done. Open hisab-dhihni-local.html in Chrome or Edge.
pause
exit /b 0

:failed
echo.
echo Build failed. Read the error above, fix it, and run this file again.
pause
exit /b 1
