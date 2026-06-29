#!/bin/bash
# =============================================================================
# start_desktop.command — SyncFrame Studio Desktop Launcher
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
echo -e "${BOLD}🎬  SyncFrame Studio — Desktop Startup${RESET}"
echo -e "$(printf '═%.0s' {1..60})"

# 1. Directory check
if [[ "$(basename "$PROJECT_ROOT")" != "syncframe-desktop-lab" ]]; then
    error "Must run inside syncframe-desktop-lab."
    exit 1
fi

# 2. Check Python / Node
if ! command -v python3 &>/dev/null; then error "Python 3 not found."; exit 1; fi
if ! command -v npm &>/dev/null; then error "npm not found."; exit 1; fi

# 3. Check venv
if [ ! -d "backend/.venv" ]; then
    error "Backend virtual environment not found. Run standard setup first."
    exit 1
fi

# 4. Frontend npm install if needed
header "Checking frontend dependencies"
if [ ! -d "frontend/node_modules" ]; then
    info "Installing frontend npm packages..."
    cd frontend && npm install --silent && cd ..
    success "Frontend packages installed"
else
    success "Frontend node_modules exists"
fi

# 5. Desktop npm install if needed
header "Checking desktop dependencies"
if [ ! -d "desktop/node_modules" ]; then
    info "Installing desktop npm packages..."
    cd desktop && npm install --silent && cd ..
    success "Desktop packages installed"
else
    success "Desktop node_modules exists"
fi

# 6. Start Vite in background (if not already running on 5173)
header "Starting Frontend Server"
FRONTEND_PORT=5173
if ! lsof -iTCP:$FRONTEND_PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
    info "Starting Vite dev server in background..."
    mkdir -p logs .pids
    cd frontend
    npm run dev > ../logs/desktop_frontend.log 2>&1 &
    VITE_PID=$!
    echo "$VITE_PID" > ../.pids/desktop_frontend.pid
    cd ..
    success "Vite server started"
else
    success "Vite server is already running"
fi

# 7. Start Electron Desktop App
header "Starting Desktop App"
cd desktop
npm start

# After Electron closes, we can cleanly exit.
info "Electron closed."
