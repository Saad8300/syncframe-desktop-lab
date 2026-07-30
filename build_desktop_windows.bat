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

:: 1. Verify generated caption presets are in sync
:: The Python renderer and the TypeScript Studio preview are both generated
:: from shared\caption_presets.json. If either generated file is stale, the
:: preview silently disagrees with the actual render — so fail the build here
:: rather than ship a mismatch. Runs first: it is instant, and there is no
:: point spending minutes on PyInstaller if the presets are wrong.
echo [INFO] Step 1: Verifying generated caption presets...
if not exist "backend\.venv\Scripts\python.exe" (
    echo [ERROR] Virtual environment not found at backend\.venv.
    echo Please run setup_windows.bat from the project root first.
    pause
    exit /b 1
)
backend\.venv\Scripts\python.exe scripts\generate_caption_presets.py --check
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Generated caption presets are out of sync with
    echo         shared\caption_presets.json.
    echo         Run: python scripts\generate_caption_presets.py
    echo         then commit the regenerated files and build again.
    pause
    exit /b 1
)

:: 2. Build Backend
echo [INFO] Step 2: Building Backend...
call backend\build_backend_windows.bat
if %errorlevel% neq 0 (
    echo [ERROR] Backend build script failed.
    pause
    exit /b 1
)

:: 3. Build Frontend and Desktop App
echo [INFO] Step 3: Building Desktop App (and Frontend)...
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
