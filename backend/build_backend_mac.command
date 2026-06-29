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

pyinstaller --onefile --distpath "$DEST_DIR" --name syncframe-backend desktop_backend_launcher.py

if [ $? -ne 0 ]; then
    error "PyInstaller build failed."
    exit 1
fi

success "Backend binary successfully built to $DEST_DIR/syncframe-backend"
echo ""
