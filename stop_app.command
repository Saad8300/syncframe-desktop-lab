#!/bin/bash
# =============================================================================
# stop_app.command — Audio Image Sync Studio
# Double-click this file on Mac to cleanly stop the app.
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ---- Colour helpers ---------------------------------------------------------
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

info()    { echo -e "${CYAN}  ℹ  $*${RESET}"; }
success() { echo -e "${GREEN}  ✅  $*${RESET}"; }
warn()    { echo -e "${YELLOW}  ⚠️   $*${RESET}"; }

echo ""
echo -e "${BOLD}🛑  Audio Image Sync Studio — Stopping App${RESET}"
echo -e "$(printf '═%.0s' {1..60})"
echo ""

PIDS_DIR="$SCRIPT_DIR/.pids"
BACKEND_PID_FILE="$PIDS_DIR/backend.pid"
FRONTEND_PID_FILE="$PIDS_DIR/frontend.pid"
STOPPED_ANY=0

# ---- Stop via PID files -----------------------------------------------------

stop_by_pid() {
    local label=$1
    local pid_file=$2
    if [ -f "$pid_file" ]; then
        local pid
        pid=$(cat "$pid_file" 2>/dev/null)
        if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
            kill "$pid" 2>/dev/null
            sleep 0.5
            # Force kill if still alive
            if kill -0 "$pid" 2>/dev/null; then
                kill -9 "$pid" 2>/dev/null
            fi
            success "$label (PID $pid) stopped"
            STOPPED_ANY=1
        else
            info "$label PID file exists but process is not running"
        fi
        rm -f "$pid_file"
    fi
}

stop_by_pid "Backend" "$BACKEND_PID_FILE"
stop_by_pid "Frontend" "$FRONTEND_PID_FILE"

# ---- Also clean up by port in case PID files are missing --------------------

stop_by_port() {
    local label=$1
    local port=$2
    local pids
    pids=$(lsof -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null)
    if [ -n "$pids" ]; then
        echo "$pids" | xargs kill 2>/dev/null
        sleep 0.5
        # Force kill if still alive
        pids=$(lsof -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null)
        if [ -n "$pids" ]; then
            echo "$pids" | xargs kill -9 2>/dev/null
        fi
        success "$label on port $port cleared"
        STOPPED_ANY=1
    else
        info "Port $port ($label) is already free"
    fi
}

stop_by_port "Backend"  8000
stop_by_port "Frontend" 5173

# ---- Also kill any lingering uvicorn / vite processes from this project -----

# Kill uvicorn processes
UVICORN_PIDS=$(pgrep -f "uvicorn main:app" 2>/dev/null)
if [ -n "$UVICORN_PIDS" ]; then
    echo "$UVICORN_PIDS" | xargs kill 2>/dev/null
    sleep 0.3
    echo "$UVICORN_PIDS" | xargs kill -9 2>/dev/null
    success "Uvicorn process(es) stopped"
    STOPPED_ANY=1
fi

# Kill vite dev processes
VITE_PIDS=$(pgrep -f "vite" 2>/dev/null)
if [ -n "$VITE_PIDS" ]; then
    echo "$VITE_PIDS" | xargs kill 2>/dev/null
    sleep 0.3
    echo "$VITE_PIDS" | xargs kill -9 2>/dev/null
    success "Vite process(es) stopped"
    STOPPED_ANY=1
fi

# ---- Result -----------------------------------------------------------------

echo ""
echo -e "$(printf '═%.0s' {1..60})"
if [ "$STOPPED_ANY" -eq 1 ]; then
    echo -e "${GREEN}${BOLD}  ✅  App stopped successfully.${RESET}"
else
    echo -e "${YELLOW}  ℹ   No running app processes were found.${RESET}"
fi
echo -e "$(printf '═%.0s' {1..60})"
echo ""
echo -e "  Ports 8000 and 5173 are now free."
echo -e "  To start the app again, double-click ${BOLD}start_app.command${RESET}"
echo ""

# Note: we do NOT delete uploads/, outputs/, source files, or user data.

echo -e "\nPress any key to close this window..."
read -n 1
