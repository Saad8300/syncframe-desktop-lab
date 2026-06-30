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

# Node Version Check
if command -v node &>/dev/null; then
    NODE_VERSION=$(node -v | cut -d 'v' -f 2 | cut -d '.' -f 1)
    if [ "$NODE_VERSION" -ge 26 ]; then
        echo -e "\033[1;33m  ⚠️  Warning: You are using Node $NODE_VERSION. Desktop dev/build prefers Node 22 LTS. If you experience Electron issues, please downgrade to Node 22.\033[0m"
    fi
fi

# 2. Check Node
if ! command -v npm &>/dev/null; then error "npm not found."; exit 1; fi

# 3. Backend Build
header "Building Backend"
if [ ! -f "backend/build_backend_mac.command" ]; then
    error "backend/build_backend_mac.command not found."
    exit 1
fi
bash backend/build_backend_mac.command
if [ $? -ne 0 ]; then
    error "Backend build failed."
    exit 1
fi
success "Backend built successfully."

# 4. Frontend Build
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

# 5. Desktop Build
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
