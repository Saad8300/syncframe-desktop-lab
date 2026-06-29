#!/bin/bash
# =============================================================================
# build_backend_mac.command — SyncFrame Studio Backend Build
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

info()    { echo -e "${CYAN}  ℹ  $*${RESET}"; }
success() { echo -e "${GREEN}  ✅  $*${RESET}"; }
error()   { echo -e "${RED}  ❌  $*${RESET}"; }

echo ""
echo -e "${BOLD}📦  SyncFrame Studio — Backend Mac Build${RESET}"
echo -e "$(printf '═%.0s' {1..60})"

# 1. Directory check
if [[ "$(basename "$PROJECT_ROOT")" != "syncframe-desktop-lab" ]]; then
    echo -e "\033[0;31m  ❌  Must run inside syncframe-desktop-lab.\033[0m"
    exit 1
fi

# Node Version Check
if command -v node &>/dev/null; then
    NODE_VERSION=$(node -v | cut -d 'v' -f 2 | cut -d '.' -f 1)
    if [ "$NODE_VERSION" -ge 26 ]; then
        echo -e "\033[1;33m  ⚠️  Warning: You are using Node $NODE_VERSION. Desktop dev/build prefers Node 22 LTS. If you experience Electron issues, please downgrade to Node 22.\033[0m"
    fi
fi


if [ ! -d ".venv" ]; then
    error "Virtual environment not found. Please setup the backend first."
    exit 1
fi

source .venv/bin/activate

info "Ensuring PyInstaller is installed..."
pip install -q pyinstaller

info "Building backend binary with PyInstaller..."

# Generate directly to desktop resources folder
DEST_DIR="../desktop/resources/backend"
mkdir -p "$DEST_DIR"

pyinstaller --onefile \
  --distpath "$DEST_DIR" \
  --name syncframe-backend \
  --copy-metadata imageio \
  --copy-metadata imageio-ffmpeg \
  --copy-metadata moviepy \
  --copy-metadata decorator \
  --copy-metadata proglog \
  --collect-all imageio \
  --collect-all imageio_ffmpeg \
  --hidden-import imageio \
  --hidden-import imageio_ffmpeg \
  --hidden-import moviepy \
  --hidden-import moviepy.editor \
  --hidden-import moviepy.video.io.ffmpeg_reader \
  --hidden-import moviepy.video.io.ffmpeg_writer \
  --hidden-import moviepy.audio.io.ffmpeg_audiowriter \
  --hidden-import moviepy.audio.io.AudioFileClip \
  --hidden-import moviepy.video.VideoClip \
  --hidden-import moviepy.audio.AudioClip \
  --hidden-import PIL \
  --hidden-import numpy \
  --hidden-import uvicorn.lifespan.off \
  --hidden-import uvicorn.lifespan.on \
  --hidden-import uvicorn.lifespan \
  --hidden-import uvicorn.protocols.websockets.auto \
  --hidden-import uvicorn.protocols.websockets.wsproto_impl \
  --hidden-import uvicorn.protocols.websockets_impl \
  --hidden-import uvicorn.protocols.http.auto \
  --hidden-import uvicorn.protocols.http.h11_impl \
  --hidden-import uvicorn.protocols.http.httptools_impl \
  --hidden-import uvicorn.protocols.websockets \
  --hidden-import uvicorn.protocols.http \
  --hidden-import uvicorn.protocols \
  --hidden-import uvicorn.loops.auto \
  --hidden-import uvicorn.loops.asyncio \
  --hidden-import uvicorn.loops.uvloop \
  --hidden-import uvicorn.loops \
  --hidden-import uvicorn.logging \
  desktop_backend_launcher.py

if [ $? -ne 0 ]; then
    error "PyInstaller build failed."
    exit 1
fi

success "Backend binary successfully built to $DEST_DIR/syncframe-backend"
echo ""
