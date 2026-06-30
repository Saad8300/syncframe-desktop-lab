@echo off
setlocal EnableDelayedExpansion
title SyncFrame Studio - Desktop Dev Mode

:: 1. Run from project root
cd /d "%~dp0"
set "PROJECT_ROOT=%cd%"

echo.
echo ============================================================
echo   SyncFrame Studio - Desktop Dev Launcher (Windows)
echo ============================================================
echo.

:: 3. Check node/npm
where npm >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] npm is not installed or not in PATH.
    pause
    exit /b 1
)

:: 2 & 4. Check frontend dependencies
if not exist "frontend" (
    echo [ERROR] 'frontend' folder missing.
    pause
    exit /b 1
)
if not exist "frontend\node_modules" (
    echo [ERROR] Frontend dependencies missing. 
    echo Please run setup_windows.bat first, or run 'npm install' in the frontend folder.
    pause
    exit /b 1
)

:: 2 & 5. Check desktop dependencies
if not exist "desktop" (
    echo [ERROR] 'desktop' folder missing.
    pause
    exit /b 1
)
if not exist "desktop\node_modules" (
    echo [ERROR] Desktop dependencies missing.
    echo Please run 'npm install' inside the desktop folder.
    pause
    exit /b 1
)

:: 6 & 11. Start Vite dev server in background (no browser)
echo [INFO] Starting Vite dev server in background on port 5173...
:: Kill any existing process on 5173 just in case
for /f "tokens=5" %%p in ('netstat -ano 2^>nul ^| findstr ":5173 "') do (
    if not "%%p"=="0" taskkill /PID %%p /F >nul 2>&1
)

if not exist "logs" mkdir "logs"
start /B cmd /c "pushd "%PROJECT_ROOT%\frontend" && npm run dev -- --host 127.0.0.1 --port 5173 > "%PROJECT_ROOT%\logs\desktop_frontend.log" 2>&1"

:: 7. Wait briefly
echo [INFO] Waiting for Vite to initialize...
timeout /t 3 /nobreak >nul

:: 8 & 12. Start Electron desktop app
echo [INFO] Starting Electron Desktop App...
echo (Electron will start the local Python backend automatically.)
cd /d "%PROJECT_ROOT%\desktop"
call npm start

:: 9. Cleanup after Electron closes
echo.
echo [INFO] Electron app closed. Cleaning up background processes...
for /f "tokens=5" %%p in ('netstat -ano 2^>nul ^| findstr ":5173 "') do (
    if not "%%p"=="0" taskkill /PID %%p /F >nul 2>&1
)

echo [OK] Cleanup complete.
pause
