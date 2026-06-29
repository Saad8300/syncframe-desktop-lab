#!/bin/bash
# =============================================================================
# stop_desktop.command — SyncFrame Studio Desktop Stopper
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

success() { echo -e "${GREEN}  ✅  $*${RESET}"; }
info()    { echo -e "${CYAN}  ℹ  $*${RESET}"; }

echo ""
echo -e "${BOLD}🛑  Stopping Desktop App Processes${RESET}"

STOPPED_ANY=0

# Stop frontend if started by desktop script
if [ -f ".pids/desktop_frontend.pid" ]; then
    PID=$(cat .pids/desktop_frontend.pid 2>/dev/null)
    if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
        kill "$PID" 2>/dev/null
        success "Stopped desktop frontend (PID $PID)"
        STOPPED_ANY=1
    fi
    rm -f .pids/desktop_frontend.pid
fi

# Electron usually cleans up its backend child process.
# We also stop any leftover uvicorn or electron.
ELECTRON_PIDS=$(pgrep -f "electron" 2>/dev/null)
if [ -n "$ELECTRON_PIDS" ]; then
    echo "$ELECTRON_PIDS" | xargs kill 2>/dev/null
    success "Stopped Electron processes"
    STOPPED_ANY=1
fi

# Soft check for port 8000
pids=$(lsof -iTCP:8000 -sTCP:LISTEN -t 2>/dev/null)
if [ -n "$pids" ]; then
    echo "$pids" | xargs kill 2>/dev/null
    success "Cleared port 8000 (Backend)"
    STOPPED_ANY=1
fi

if [ "$STOPPED_ANY" -eq 1 ]; then
    success "Desktop processes stopped."
else
    info "No running desktop app processes found."
fi
echo ""
