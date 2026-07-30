#!/bin/bash
# =============================================================================
# build_backend_mac.command — SyncFrame Studio Backend Build
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
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

info "Ensuring backend dependencies are up to date..."
pip install -q -r requirements.txt

if [ $? -ne 0 ]; then
    error "Failed to install backend requirements."
    exit 1
fi

# The Python renderer and the TypeScript Studio preview are both generated
# from shared/caption_presets.json. If either generated file is stale, the
# preview silently disagrees with the actual render — so fail the build here
# rather than ship a mismatch.
info "Verifying generated caption presets are in sync..."
python "$PROJECT_ROOT/scripts/generate_caption_presets.py" --check

if [ $? -ne 0 ]; then
    error "Generated caption presets are out of sync with shared/caption_presets.json."
    error "Run: python scripts/generate_caption_presets.py"
    error "then commit the regenerated files and build again."
    exit 1
fi

# Guards a defect that was silent rather than loud: a plain number in a
# time-formatted Excel cell read 0.5 seconds as 43,200 (86,400x wrong) and
# reported success. Skips with a notice if node/frontend node_modules are
# absent, so a backend-only build on a machine without the frontend installed
# is not blocked for a toolchain reason.
info "Verifying Excel/CSV timeline parity..."
python "$PROJECT_ROOT/scripts/check_timeline_excel_parity.py"

if [ $? -ne 0 ]; then
    error "Excel timeline uploads no longer parse identically to CSV."
    error "See the case table above for which inputs diverged."
    exit 1
fi

info "Generating Supabase config from frontend/.env.local..."
python generate_supabase_config.py

if [ $? -ne 0 ]; then
    error "Failed to generate Supabase config."
    exit 1
fi

info "Ensuring PyInstaller is installed..."
pip install -q pyinstaller

info "Building backend binary with PyInstaller..."

# Generate directly to desktop resources folder
DEST_DIR="../desktop/resources/backend"
mkdir -p "$DEST_DIR"

pyinstaller syncframe-backend.spec --clean --noconfirm --distpath "$DEST_DIR"

if [ $? -ne 0 ]; then
    error "PyInstaller build failed."
    exit 1
fi

success "Backend binary successfully built to $DEST_DIR/syncframe-backend/syncframe-backend"
echo ""
