@echo off
setlocal EnableDelayedExpansion
title SyncFrame Studio - Windows Setup

:: ─────────────────────────────────────────────────────────────────────────────
:: Setup paths
:: ─────────────────────────────────────────────────────────────────────────────
set "PROJECT_DIR=%~dp0"
set "PROJECT_DIR=%PROJECT_DIR:~0,-1%"
set "LOGS_DIR=%PROJECT_DIR%\logs"
set "LOG_FILE=%LOGS_DIR%\windows_setup.log"
set "BACKEND_DIR=%PROJECT_DIR%\backend"
set "FRONTEND_DIR=%PROJECT_DIR%\frontend"
set "VENV_DIR=%BACKEND_DIR%\.venv"
set "VENV_PY=%VENV_DIR%\Scripts\python.exe"

:: ─────────────────────────────────────────────────────────────────────────────
:: Create logs folder
:: ─────────────────────────────────────────────────────────────────────────────
if not exist "%LOGS_DIR%" mkdir "%LOGS_DIR%"

echo. > "%LOG_FILE%"
echo [%DATE% %TIME%] SyncFrame Studio Windows Setup Started >> "%LOG_FILE%"

echo.
echo ============================================================
echo   SyncFrame Studio - Windows Setup
echo ============================================================
echo   Project folder: %PROJECT_DIR%
echo   Log file: %LOG_FILE%
echo ============================================================
echo.


:: ─────────────────────────────────────────────────────────────────────────────
:: Helper: check if winget is available
:: ─────────────────────────────────────────────────────────────────────────────
set "HAS_WINGET=0"
set "HAS_CHOCO=0"
winget --version >nul 2>&1 && set "HAS_WINGET=1"
choco --version >nul 2>&1 && set "HAS_CHOCO=1"


:: ─────────────────────────────────────────────────────────────────────────────
:: STEP 1 — Check required tools
:: ─────────────────────────────────────────────────────────────────────────────
echo [Step 1/4] Checking required tools...
echo. >> "%LOG_FILE%"
echo === STEP 1: Checking tools === >> "%LOG_FILE%"

:: ── Git ──────────────────────────────────────────────────────────────────────
echo.
echo   Checking Git...
git --version >nul 2>&1
if %errorlevel% == 0 (
    for /f "tokens=*" %%v in ('git --version 2^>nul') do (
        echo   [OK] %%v
        echo   [OK] %%v >> "%LOG_FILE%"
    )
) else (
    echo   [MISSING] Git is not installed.
    echo   [MISSING] Git is not installed. >> "%LOG_FILE%"
    if !HAS_WINGET! == 1 (
        echo   Trying to install Git via winget...
        winget install --id Git.Git -e --source winget --accept-package-agreements --accept-source-agreements
    ) else if !HAS_CHOCO! == 1 (
        echo   Trying to install Git via choco...
        choco install git -y
    ) else (
        echo.
        echo   *** ACTION REQUIRED ***
        echo   Please install Git manually:
        echo     https://git-scm.com/download/win
        echo   Make sure to add Git to PATH during install.
        echo.
        echo   *** ACTION REQUIRED: Install Git manually *** >> "%LOG_FILE%"
        echo   Press any key when Git is installed, or Ctrl+C to abort...
        pause
    )
)

:: ── Python ───────────────────────────────────────────────────────────────────
echo.
echo   Checking Python...
python --version >nul 2>&1
if %errorlevel% == 0 (
    for /f "tokens=*" %%v in ('python --version 2^>nul') do (
        echo   [OK] %%v
        echo   [OK] %%v >> "%LOG_FILE%"
        :: Warn if not 3.11 or 3.12
        echo %%v | findstr "3.11 3.12" >nul 2>&1
        if !errorlevel! NEQ 0 (
            echo   [WARN] Python 3.11 or 3.12 is recommended for best compatibility.
            echo   [WARN] Python 3.11 or 3.12 is recommended >> "%LOG_FILE%"
        )
    )
) else (
    echo   [MISSING] Python is not installed or not in PATH.
    echo   [MISSING] Python not found >> "%LOG_FILE%"
    if !HAS_WINGET! == 1 (
        echo   Trying to install Python 3.12 via winget...
        winget install --id Python.Python.3.12 -e --source winget --accept-package-agreements --accept-source-agreements
    ) else if !HAS_CHOCO! == 1 (
        echo   Trying to install Python via choco...
        choco install python312 -y
    ) else (
        echo.
        echo   *** ACTION REQUIRED ***
        echo   Please install Python manually:
        echo     https://www.python.org/downloads/windows/
        echo   IMPORTANT: Check "Add Python to PATH" during install!
        echo.
        echo   *** ACTION REQUIRED: Install Python manually *** >> "%LOG_FILE%"
        echo   Press any key when Python is installed, or Ctrl+C to abort...
        pause
    )
)

:: ── Node.js / npm ────────────────────────────────────────────────────────────
echo.
echo   Checking Node.js...
node --version >nul 2>&1
if %errorlevel% == 0 (
    for /f "tokens=*" %%v in ('node --version 2^>nul') do (
        echo   [OK] Node.js %%v
        echo   [OK] Node.js %%v >> "%LOG_FILE%"
    )
    for /f "tokens=*" %%v in ('npm --version 2^>nul') do (
        echo   [OK] npm %%v
        echo   [OK] npm %%v >> "%LOG_FILE%"
    )
) else (
    echo   [MISSING] Node.js is not installed.
    echo   [MISSING] Node.js not found >> "%LOG_FILE%"
    if !HAS_WINGET! == 1 (
        echo   Trying to install Node.js LTS via winget...
        winget install --id OpenJS.NodeJS.LTS -e --source winget --accept-package-agreements --accept-source-agreements
    ) else if !HAS_CHOCO! == 1 (
        echo   Trying to install Node.js via choco...
        choco install nodejs-lts -y
    ) else (
        echo.
        echo   *** ACTION REQUIRED ***
        echo   Please install Node.js LTS manually:
        echo     https://nodejs.org/en/download
        echo.
        echo   *** ACTION REQUIRED: Install Node.js manually *** >> "%LOG_FILE%"
        echo   Press any key when Node.js is installed, or Ctrl+C to abort...
        pause
    )
)

:: ── FFmpeg ───────────────────────────────────────────────────────────────────
echo.
echo   Checking FFmpeg...
ffmpeg -version >nul 2>&1
if %errorlevel% == 0 (
    for /f "tokens=1-3" %%a in ('ffmpeg -version 2^>nul ^| findstr "ffmpeg version"') do (
        echo   [OK] %%a %%b %%c
        echo   [OK] ffmpeg %%b %%c >> "%LOG_FILE%"
    )
) else (
    echo   [MISSING] FFmpeg is not installed.
    echo   [MISSING] FFmpeg not found >> "%LOG_FILE%"
    if !HAS_CHOCO! == 1 (
        echo   Trying to install FFmpeg via choco...
        choco install ffmpeg -y
    ) else if !HAS_WINGET! == 1 (
        echo   Trying to install FFmpeg via winget...
        winget install --id Gyan.FFmpeg -e --source winget --accept-package-agreements --accept-source-agreements
    ) else (
        echo.
        echo   [WARN] FFmpeg auto-install not available.
        echo   Please install FFmpeg manually:
        echo     1. Download from: https://www.gyan.dev/ffmpeg/builds/
        echo     2. Extract to C:\ffmpeg
        echo     3. Add C:\ffmpeg\bin to your PATH environment variable.
        echo.
        echo   [WARN] FFmpeg requires manual install >> "%LOG_FILE%"
    )
)

echo.
echo   Tool check complete.
echo.


:: ─────────────────────────────────────────────────────────────────────────────
:: STEP 2 — Set up backend
:: ─────────────────────────────────────────────────────────────────────────────
echo [Step 2/4] Setting up backend...
echo. >> "%LOG_FILE%"
echo === STEP 2: Backend setup === >> "%LOG_FILE%"

if not exist "%VENV_DIR%" (
    echo   Creating Python virtual environment...
    python -m venv "%VENV_DIR%"
    if !errorlevel! NEQ 0 (
        echo   [ERROR] Failed to create virtual environment.
        echo   Make sure Python is installed and in PATH.
        echo   [ERROR] venv creation failed >> "%LOG_FILE%"
        pause
        exit /b 1
    )
    echo   [OK] Virtual environment created.
    echo   [OK] venv created >> "%LOG_FILE%"
) else (
    echo   [OK] Virtual environment already exists.
)

echo   Upgrading pip...
"%VENV_PY%" -m pip install --upgrade pip --quiet >> "%LOG_FILE%" 2>&1
if %errorlevel% == 0 (
    echo   [OK] pip upgraded.
) else (
    echo   [WARN] pip upgrade had issues. Check log.
)

echo   Installing backend requirements (this may take a few minutes)...
"%VENV_PY%" -m pip install -r "%BACKEND_DIR%\requirements.txt" >> "%LOG_FILE%" 2>&1
if %errorlevel% == 0 (
    echo   [OK] Backend packages installed.
    echo   [OK] Backend requirements installed >> "%LOG_FILE%"
) else (
    echo   [ERROR] Backend package install failed. Check: %LOG_FILE%
    echo   [ERROR] Backend pip install failed >> "%LOG_FILE%"
    pause
    exit /b 1
)


:: ─────────────────────────────────────────────────────────────────────────────
:: STEP 3 — Install frontend packages
:: ─────────────────────────────────────────────────────────────────────────────
echo.
echo [Step 3/4] Installing frontend packages...
echo. >> "%LOG_FILE%"
echo === STEP 3: Frontend setup === >> "%LOG_FILE%"

cd /d "%FRONTEND_DIR%"
call npm install --legacy-peer-deps >> "%LOG_FILE%" 2>&1
if %errorlevel% == 0 (
    echo   [OK] Frontend packages installed.
    echo   [OK] npm install succeeded >> "%LOG_FILE%"
) else (
    echo   [ERROR] Frontend npm install failed. Check: %LOG_FILE%
    echo   [ERROR] npm install failed >> "%LOG_FILE%"
    cd /d "%PROJECT_DIR%"
    pause
    exit /b 1
)

cd /d "%PROJECT_DIR%"


:: ─────────────────────────────────────────────────────────────────────────────
:: STEP 4 — Done
:: ─────────────────────────────────────────────────────────────────────────────
echo.
echo [Step 4/4] Setup complete!
echo. >> "%LOG_FILE%"
echo === STEP 4: Setup complete === >> "%LOG_FILE%"
echo [%DATE% %TIME%] Setup finished successfully >> "%LOG_FILE%"

echo.
echo ============================================================
echo   Setup complete!
echo.
echo   Next step: Run start_windows.bat to launch the app.
echo ============================================================
echo.
pause
endlocal
