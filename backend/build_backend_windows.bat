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
echo [OK] Backend binary successfully built to %DEST_DIR%\syncframe-backend.exe
