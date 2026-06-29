@echo off
setlocal EnableDelayedExpansion
title SyncFrame Studio - Starting...

:: ─────────────────────────────────────────────────────────────────────────────
:: Paths
:: ─────────────────────────────────────────────────────────────────────────────
set "PROJECT_DIR=%~dp0"
set "PROJECT_DIR=%PROJECT_DIR:~0,-1%"
set "LOGS_DIR=%PROJECT_DIR%\logs"
set "BACKEND_DIR=%PROJECT_DIR%\backend"
set "FRONTEND_DIR=%PROJECT_DIR%\frontend"
set "VENV_PY=%BACKEND_DIR%\.venv\Scripts\python.exe"
set "LOG_START=%LOGS_DIR%\windows_start.log"
set "LOG_BACKEND=%LOGS_DIR%\backend.log"
set "LOG_FRONTEND=%LOGS_DIR%\frontend.log"

:: ─────────────────────────────────────────────────────────────────────────────
:: Create logs folder
:: ─────────────────────────────────────────────────────────────────────────────
if not exist "%LOGS_DIR%" mkdir "%LOGS_DIR%"

echo [%DATE% %TIME%] start_windows.bat launched > "%LOG_START%"

echo.
echo ============================================================
echo   SyncFrame Studio - Starting
echo ============================================================
echo.


:: ─────────────────────────────────────────────────────────────────────────────
:: Pre-flight checks
:: ─────────────────────────────────────────────────────────────────────────────
if not exist "%BACKEND_DIR%\.venv" (
    echo   [ERROR] Backend virtual environment not found.
    echo   Please run setup_windows.bat first.
    echo   [ERROR] .venv missing >> "%LOG_START%"
    pause
    exit /b 1
)

if not exist "%FRONTEND_DIR%\node_modules" (
    echo   [ERROR] Frontend node_modules not found.
    echo   Please run setup_windows.bat first.
    echo   [ERROR] node_modules missing >> "%LOG_START%"
    pause
    exit /b 1
)


:: ─────────────────────────────────────────────────────────────────────────────
:: Stop any stale processes on ports 8000 / 5173
:: ─────────────────────────────────────────────────────────────────────────────
echo   Clearing stale processes on ports 8000 and 5173...

for /f "tokens=5" %%p in ('netstat -ano 2^>nul ^| findstr ":8000 "') do (
    if not "%%p" == "0" taskkill /PID %%p /F >nul 2>&1
)
for /f "tokens=5" %%p in ('netstat -ano 2^>nul ^| findstr ":5173 "') do (
    if not "%%p" == "0" taskkill /PID %%p /F >nul 2>&1
)

:: Short wait after killing processes
timeout /t 2 /nobreak >nul


:: ─────────────────────────────────────────────────────────────────────────────
:: Start backend
:: ─────────────────────────────────────────────────────────────────────────────
echo   Starting backend (port 8000)...
echo [%DATE% %TIME%] Starting backend >> "%LOG_START%"

start "" /min cmd /c "cd /d "%BACKEND_DIR%" && "%VENV_PY%" -m uvicorn main:app --host 127.0.0.1 --port 8000 > "%LOG_BACKEND%" 2>&1"


:: ─────────────────────────────────────────────────────────────────────────────
:: Start frontend
:: ─────────────────────────────────────────────────────────────────────────────
echo   Starting frontend (port 5173)...
echo [%DATE% %TIME%] Starting frontend >> "%LOG_START%"

start "" /min cmd /c "cd /d "%FRONTEND_DIR%" && npm run dev -- --host 127.0.0.1 --port 5173 > "%LOG_FRONTEND%" 2>&1"


:: ─────────────────────────────────────────────────────────────────────────────
:: Wait for backend health check (up to 60 seconds)
:: ─────────────────────────────────────────────────────────────────────────────
echo.
echo   Waiting for backend to come online...

set "BACKEND_OK=0"
set "ATTEMPT=0"

:WAIT_BACKEND
set /a ATTEMPT+=1
if !ATTEMPT! GTR 60 goto :BACKEND_TIMEOUT

timeout /t 1 /nobreak >nul

:: Use PowerShell for health check since curl may not be available on all Windows versions
powershell -Command "try { $r = Invoke-WebRequest -Uri 'http://127.0.0.1:8000/api/health' -UseBasicParsing -TimeoutSec 2; if ($r.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>&1
if %errorlevel% == 0 (
    set "BACKEND_OK=1"
    goto :BACKEND_DONE
)

if !ATTEMPT! == 1 (echo   Attempt: !ATTEMPT!/60)
if !ATTEMPT! == 10 (echo   Attempt: !ATTEMPT!/60)
if !ATTEMPT! == 20 (echo   Attempt: !ATTEMPT!/60)
if !ATTEMPT! == 30 (echo   Attempt: !ATTEMPT!/60)
if !ATTEMPT! == 45 (echo   Attempt: !ATTEMPT!/60)

goto :WAIT_BACKEND

:BACKEND_TIMEOUT
echo.
echo   [ERROR] Backend did not start within 60 seconds.
echo   Last 50 lines of backend log:
echo   ────────────────────────────────────
powershell -Command "Get-Content '%LOG_BACKEND%' -Tail 50" 2>nul
echo   ────────────────────────────────────
echo   Full log: %LOG_BACKEND%
echo   [ERROR] Backend health check timed out >> "%LOG_START%"
echo.
echo   Backend failed to start. Check the log above.
pause
exit /b 1

:BACKEND_DONE
echo   [OK] Backend live!
echo [%DATE% %TIME%] Backend live >> "%LOG_START%"


:: ─────────────────────────────────────────────────────────────────────────────
:: Wait for frontend (up to 30 seconds)
:: ─────────────────────────────────────────────────────────────────────────────
echo   Waiting for frontend to come online...

set "FRONTEND_OK=0"
set "ATTEMPT=0"

:WAIT_FRONTEND
set /a ATTEMPT+=1
if !ATTEMPT! GTR 30 goto :FRONTEND_TIMEOUT

timeout /t 1 /nobreak >nul

powershell -Command "try { $r = Invoke-WebRequest -Uri 'http://localhost:5173' -UseBasicParsing -TimeoutSec 2; if ($r.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>&1
if %errorlevel% == 0 (
    set "FRONTEND_OK=1"
    goto :FRONTEND_DONE
)
goto :WAIT_FRONTEND

:FRONTEND_TIMEOUT
echo.
echo   [WARN] Frontend health check timed out (it may still be loading).
echo   Last 50 lines of frontend log:
echo   ────────────────────────────────────
powershell -Command "Get-Content '%LOG_FRONTEND%' -Tail 50" 2>nul
echo   ────────────────────────────────────
echo   Full log: %LOG_FRONTEND%
echo   [WARN] Frontend health check timed out >> "%LOG_START%"
echo.
echo   Trying to open browser anyway...
goto :OPEN_BROWSER

:FRONTEND_DONE
echo   [OK] Frontend live!
echo [%DATE% %TIME%] Frontend live >> "%LOG_START%"


:: ─────────────────────────────────────────────────────────────────────────────
:: Open browser
:: ─────────────────────────────────────────────────────────────────────────────
:OPEN_BROWSER
echo.
echo ============================================================
echo   Backend live  : http://127.0.0.1:8000
echo   Frontend live : http://localhost:5173
echo   Opening browser...
echo ============================================================
echo.

echo [%DATE% %TIME%] Opening browser >> "%LOG_START%"
start http://localhost:5173

echo   App is running. Logs:
echo     Backend  : %LOG_BACKEND%
echo     Frontend : %LOG_FRONTEND%
echo.
echo   To stop the app, run stop_windows.bat
echo.
echo   This window will stay open. Press any key to close it.
echo   (The app will keep running in the background.)
echo.
pause
endlocal
