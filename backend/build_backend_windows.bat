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

pyinstaller --onefile ^
  --distpath "%DEST_DIR%" ^
  --name syncframe-backend ^
  --copy-metadata imageio ^
  --copy-metadata imageio-ffmpeg ^
  --copy-metadata moviepy ^
  --copy-metadata decorator ^
  --copy-metadata proglog ^
  --collect-all imageio ^
  --collect-all imageio_ffmpeg ^
  --hidden-import imageio ^
  --hidden-import imageio_ffmpeg ^
  --hidden-import moviepy ^
  --hidden-import moviepy.editor ^
  --hidden-import moviepy.video.io.ffmpeg_reader ^
  --hidden-import moviepy.video.io.ffmpeg_writer ^
  --hidden-import moviepy.audio.io.ffmpeg_audiowriter ^
  --hidden-import moviepy.audio.io.AudioFileClip ^
  --hidden-import moviepy.video.VideoClip ^
  --hidden-import moviepy.audio.AudioClip ^
  --hidden-import PIL ^
  --hidden-import numpy ^
  --hidden-import uvicorn.lifespan.off ^
  --hidden-import uvicorn.lifespan.on ^
  --hidden-import uvicorn.lifespan ^
  --hidden-import uvicorn.protocols.websockets.auto ^
  --hidden-import uvicorn.protocols.websockets.wsproto_impl ^
  --hidden-import uvicorn.protocols.websockets_impl ^
  --hidden-import uvicorn.protocols.http.auto ^
  --hidden-import uvicorn.protocols.http.h11_impl ^
  --hidden-import uvicorn.protocols.http.httptools_impl ^
  --hidden-import uvicorn.protocols.websockets ^
  --hidden-import uvicorn.protocols.http ^
  --hidden-import uvicorn.protocols ^
  --hidden-import uvicorn.loops.auto ^
  --hidden-import uvicorn.loops.asyncio ^
  --hidden-import uvicorn.loops.uvloop ^
  --hidden-import uvicorn.loops ^
  --hidden-import uvicorn.logging ^
  desktop_backend_launcher.py

if %errorlevel% neq 0 (
    echo.
    echo [ERROR] PyInstaller build failed.
    exit /b 1
)

echo.
echo [OK] Backend binary successfully built to %DEST_DIR%\syncframe-backend.exe
