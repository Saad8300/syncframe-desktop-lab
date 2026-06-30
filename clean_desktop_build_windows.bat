@echo off
setlocal EnableDelayedExpansion
title SyncFrame Studio - Clean Desktop Build

cd /d "%~dp0"

echo.
echo ============================================================
echo   SyncFrame Studio - Cleaning Desktop/Backend Builds
echo ============================================================
echo.

:: 1. Desktop
if exist "desktop\dist" (
    rmdir /S /Q "desktop\dist"
    echo [INFO] Removed desktop\dist
)
if exist "desktop\out" (
    rmdir /S /Q "desktop\out"
    echo [INFO] Removed desktop\out
)
if exist "desktop\release" (
    rmdir /S /Q "desktop\release"
    echo [INFO] Removed desktop\release
)
if exist "desktop\.vite" (
    rmdir /S /Q "desktop\.vite"
    echo [INFO] Removed desktop\.vite
)

:: 2. Backend
if exist "backend\build" (
    rmdir /S /Q "backend\build"
    echo [INFO] Removed backend\build
)
if exist "backend\dist" (
    rmdir /S /Q "backend\dist"
    echo [INFO] Removed backend\dist
)
if exist "backend\__pycache__" (
    rmdir /S /Q "backend\__pycache__"
    echo [INFO] Removed backend\__pycache__
)
if exist "backend\desktop_backend_launcher.spec" (
    del /Q "backend\desktop_backend_launcher.spec"
    echo [INFO] Removed backend\desktop_backend_launcher.spec
)
if exist "backend\syncframe-backend.spec" (
    del /Q "backend\syncframe-backend.spec"
    echo [INFO] Removed backend\syncframe-backend.spec
)

echo.
echo [OK] Clean complete! (Source files and user data untouched)
pause
