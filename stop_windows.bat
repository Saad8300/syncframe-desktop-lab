@echo off
setlocal EnableDelayedExpansion
title SyncFrame Studio - Stopping

set "PROJECT_DIR=%~dp0"
set "PROJECT_DIR=%PROJECT_DIR:~0,-1%"
set "LOGS_DIR=%PROJECT_DIR%\logs"

echo.
echo ============================================================
echo   SyncFrame Studio - Stopping
echo ============================================================
echo.

set "STOPPED_BACKEND=0"
set "STOPPED_FRONTEND=0"


:: ─────────────────────────────────────────────────────────────────────────────
:: Stop backend (port 8000)
:: ─────────────────────────────────────────────────────────────────────────────
echo   Stopping backend (port 8000)...

for /f "tokens=5" %%p in ('netstat -ano 2^>nul ^| findstr ":8000 "') do (
    if not "%%p" == "0" (
        taskkill /PID %%p /F >nul 2>&1
        if !errorlevel! == 0 (
            echo   [OK] Stopped PID %%p on port 8000.
            set "STOPPED_BACKEND=1"
        )
    )
)

if !STOPPED_BACKEND! == 0 (
    echo   Backend was not running on port 8000.
)


:: ─────────────────────────────────────────────────────────────────────────────
:: Stop frontend (port 5173)
:: ─────────────────────────────────────────────────────────────────────────────
echo   Stopping frontend (port 5173)...

for /f "tokens=5" %%p in ('netstat -ano 2^>nul ^| findstr ":5173 "') do (
    if not "%%p" == "0" (
        taskkill /PID %%p /F >nul 2>&1
        if !errorlevel! == 0 (
            echo   [OK] Stopped PID %%p on port 5173.
            set "STOPPED_FRONTEND=1"
        )
    )
)

if !STOPPED_FRONTEND! == 0 (
    echo   Frontend was not running on port 5173.
)


:: ─────────────────────────────────────────────────────────────────────────────
:: Verify ports are free
:: ─────────────────────────────────────────────────────────────────────────────
timeout /t 1 /nobreak >nul

echo.
echo   Verifying ports are free...

netstat -ano | findstr ":8000 " >nul 2>&1
if %errorlevel% == 0 (
    echo   [WARN] Port 8000 still has a process. You may need to restart manually.
) else (
    echo   [OK] Port 8000 is free.
)

netstat -ano | findstr ":5173 " >nul 2>&1
if %errorlevel% == 0 (
    echo   [WARN] Port 5173 still has a process. You may need to restart manually.
) else (
    echo   [OK] Port 5173 is free.
)


:: ─────────────────────────────────────────────────────────────────────────────
:: Summary
:: ─────────────────────────────────────────────────────────────────────────────
echo.
echo ============================================================

if !STOPPED_BACKEND! == 0 if !STOPPED_FRONTEND! == 0 (
    echo   App was already stopped.
) else (
    echo   App stopped successfully.
)

echo ============================================================
echo.
pause
endlocal
