#!/bin/bash
# =============================================================================
# build_desktop_mac.command — SyncFrame Studio Desktop Mac Build
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"
PROJECT_ROOT="$SCRIPT_DIR"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

info()    { echo -e "${CYAN}  ℹ  $*${RESET}"; }
success() { echo -e "${GREEN}  ✅  $*${RESET}"; }
error()   { echo -e "${RED}  ❌  $*${RESET}"; }
header()  { echo -e "\n${BOLD}${CYAN}$*${RESET}"; echo -e "${CYAN}$(printf '─%.0s' {1..60})${RESET}"; }

echo ""
echo -e "${BOLD}📦  SyncFrame Studio — Desktop Mac Build${RESET}"
echo -e "$(printf '═%.0s' {1..60})"

# 1. Directory check
if [[ "$(basename "$PROJECT_ROOT")" != "syncframe-desktop-lab" ]]; then
    error "Must run inside syncframe-desktop-lab."
    exit 1
fi

# 2. Check Node
if ! command -v npm &>/dev/null; then error "npm not found."; exit 1; fi

# 3. Frontend Build
header "Building Frontend"
cd frontend
info "Installing frontend dependencies if missing..."
npm install --silent
info "Running Vite build..."
npm run build
if [ $? -ne 0 ]; then
    error "Frontend build failed."
    exit 1
fi
success "Frontend built to frontend/dist"
cd ..

# 4. Desktop Build
header "Building Mac Desktop App"
cd desktop
info "Installing desktop dependencies if missing..."
npm install --silent
info "Running Electron Builder (mac)..."
npm run build:mac
if [ $? -ne 0 ]; then
    error "Mac build failed."
    exit 1
fi
success "Mac desktop app built."
cd ..

echo ""
echo -e "$(printf '═%.0s' {1..60})"
success "Build Complete!"
info "Output is located at: ${BOLD}desktop/dist${RESET}"
echo ""
