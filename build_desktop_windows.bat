@echo off
setlocal EnableDelayedExpansion
title SyncFrame Studio - Windows Desktop Build

cd /d "%~dp0"

echo.
echo ============================================================
echo   SyncFrame Studio - Windows Desktop Build
echo ============================================================
echo.

where npm >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] npm is not installed or not in PATH.
    pause
    exit /b 1
)

if not exist "frontend" (echo [ERROR] frontend folder missing. & pause & exit /b 1)
if not exist "backend" (echo [ERROR] backend folder missing. & pause & exit /b 1)
if not exist "desktop" (echo [ERROR] desktop folder missing. & pause & exit /b 1)

if not exist "backend\build_backend_windows.bat" (
    echo [ERROR] backend\build_backend_windows.bat missing.
    pause
    exit /b 1
)

:: 1. Build Backend
echo [INFO] Step 1: Building Backend...
call backend\build_backend_windows.bat
if %errorlevel% neq 0 (
    echo [ERROR] Backend build script failed.
    pause
    exit /b 1
)

:: 2. Build Frontend and Desktop App
echo [INFO] Step 2: Building Desktop App (and Frontend)...
cd /d "%~dp0"
cd /d "%~dp0desktop"
call npm run build:win
if %errorlevel% neq 0 (
    echo [ERROR] Desktop build failed.
    pause
    exit /b 1
)

echo.
echo ============================================================
echo [OK] Build Complete!
echo Output is located at: %~dp0desktop\dist
echo ============================================================
pause
