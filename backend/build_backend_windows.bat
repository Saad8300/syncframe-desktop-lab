@echo off
setlocal EnableDelayedExpansion
title SyncFrame Studio - Backend Windows Build

cd /d "%~dp0"

echo.
echo ============================================================
echo   SyncFrame Studio - Backend Windows Build
echo ============================================================
echo.

if not exist ".venv\Scripts\activate.bat" (
    echo [ERROR] Virtual environment not found.
    echo Please run setup_windows.bat from the project root first.
    exit /b 1
)

echo [INFO] Activating virtual environment...
call .venv\Scripts\activate.bat

echo [INFO] Ensuring backend dependencies are up to date...
python -m pip install -q -r requirements.txt
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Failed to install backend requirements.
    exit /b 1
)

:: The Python renderer and the TypeScript Studio preview are both generated
:: from shared\caption_presets.json. If either generated file is stale, the
:: preview silently disagrees with the actual render — so fail the build here
:: rather than ship a mismatch.
echo [INFO] Verifying generated caption presets are in sync...
python "%~dp0..\scripts\generate_caption_presets.py" --check
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Generated caption presets are out of sync with
    echo         shared\caption_presets.json.
    echo         Run: python scripts\generate_caption_presets.py
    echo         then commit the regenerated files and build again.
    exit /b 1
)

echo [INFO] Generating Supabase config from frontend\.env.local...
python generate_supabase_config.py
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Failed to generate Supabase config.
    exit /b 1
)

echo [INFO] Ensuring PyInstaller is installed...
python -m pip install -q pyinstaller

echo [INFO] Building backend binary with PyInstaller...

set "DEST_DIR=..\desktop\resources\backend"
if not exist "%DEST_DIR%" mkdir "%DEST_DIR%"

pyinstaller syncframe-backend.spec --clean --noconfirm --distpath "%DEST_DIR%"

if %errorlevel% neq 0 (
    echo.
    echo [ERROR] PyInstaller build failed.
    exit /b 1
)

echo.
echo [OK] Backend binary successfully built to %DEST_DIR%\syncframe-backend\syncframe-backend.exe
