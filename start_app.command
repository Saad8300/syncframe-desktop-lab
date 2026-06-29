#!/bin/bash
# =============================================================================
# start_app.command — Audio Image Sync Studio
# Double-click this file on Mac to start the app automatically.
# =============================================================================

# ---- Move to the project root (works when double-clicked from Finder) -------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"
PROJECT_ROOT="$SCRIPT_DIR"

# ---- Colour helpers ---------------------------------------------------------
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

info()    { echo -e "${CYAN}  ℹ  $*${RESET}"; }
success() { echo -e "${GREEN}  ✅  $*${RESET}"; }
warn()    { echo -e "${YELLOW}  ⚠️   $*${RESET}"; }
error()   { echo -e "${RED}  ❌  $*${RESET}"; }
header()  { echo -e "\n${BOLD}${CYAN}$*${RESET}"; echo -e "${CYAN}$(printf '─%.0s' {1..60})${RESET}"; }

# ---- Folders ----------------------------------------------------------------
LOGS_DIR="$PROJECT_ROOT/logs"
PIDS_DIR="$PROJECT_ROOT/.pids"
BACKEND_DIR="$PROJECT_ROOT/backend"
FRONTEND_DIR="$PROJECT_ROOT/frontend"
VENV_DIR="$BACKEND_DIR/.venv"

mkdir -p "$LOGS_DIR" "$PIDS_DIR"

BACKEND_LOG="$LOGS_DIR/backend.log"
FRONTEND_LOG="$LOGS_DIR/frontend.log"
BACKEND_PID_FILE="$PIDS_DIR/backend.pid"
FRONTEND_PID_FILE="$PIDS_DIR/frontend.pid"

BACKEND_URL="http://127.0.0.1:8000"
FRONTEND_URL="http://localhost:5173"

# =============================================================================
echo ""
echo -e "${BOLD}🎬  Audio Image Sync Studio — Startup${RESET}"
echo -e "$(printf '═%.0s' {1..60})"

# =============================================================================
# 1. Check required tools
# =============================================================================
header "Step 1 — Checking required tools"

MISSING_TOOLS=0

if command -v python3 &>/dev/null; then
    PYTHON_VER=$(python3 --version 2>&1)
    success "Python 3 found: $PYTHON_VER"
else
    error "Python 3 not found."
    echo "    → Install it from https://www.python.org/downloads/"
    MISSING_TOOLS=1
fi

if command -v node &>/dev/null && command -v npm &>/dev/null; then
    NODE_VER=$(node --version)
    NPM_VER=$(npm --version)
    success "Node.js found: $NODE_VER  (npm $NPM_VER)"
else
    error "Node.js / npm not found."
    echo "    → Install it from https://nodejs.org/"
    MISSING_TOOLS=1
fi

if command -v ffmpeg &>/dev/null; then
    FFMPEG_VER=$(ffmpeg -version 2>&1 | head -1)
    success "FFmpeg found: $FFMPEG_VER"
else
    error "FFmpeg not found."
    echo "    → Install with: brew install ffmpeg"
    echo "    → (If you don't have Homebrew: https://brew.sh/)"
    MISSING_TOOLS=1
fi

if [ "$MISSING_TOOLS" -eq 1 ]; then
    echo ""
    error "One or more required tools are missing. Please install them and try again."
    echo -e "\nPress any key to close this window..."
    read -n 1
    exit 1
fi

# =============================================================================
# 2. Stop any stale processes from a previous session
# =============================================================================
header "Step 2 — Clearing any stale processes"

stop_by_pid_file() {
    local label=$1
    local pid_file=$2
    if [ -f "$pid_file" ]; then
        local pid
        pid=$(cat "$pid_file" 2>/dev/null)
        if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
            kill "$pid" 2>/dev/null
            sleep 0.5
            kill -0 "$pid" 2>/dev/null && kill -9 "$pid" 2>/dev/null
            info "Stopped stale $label (PID $pid)"
        fi
        rm -f "$pid_file"
    fi
}

stop_by_pid_file "backend" "$BACKEND_PID_FILE"
stop_by_pid_file "frontend" "$FRONTEND_PID_FILE"

# Clear any process holding port 8000 or 5173
clear_port() {
    local port=$1
    local label=$2
    local pids
    pids=$(lsof -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null)
    if [ -n "$pids" ]; then
        echo "$pids" | xargs kill 2>/dev/null
        sleep 0.5
        pids=$(lsof -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null)
        if [ -n "$pids" ]; then
            echo "$pids" | xargs kill -9 2>/dev/null
        fi
        info "Cleared port $port ($label)"
    fi
}

clear_port 8000 "backend"
clear_port 5173 "frontend"

success "Ports 8000 and 5173 are now free"

# =============================================================================
# 3. Backend — virtual environment
# =============================================================================
header "Step 3 — Setting up Python virtual environment"

# Health-check: if venv exists but uvicorn isn't importable, recreate it
VENV_BROKEN=0
if [ -d "$VENV_DIR" ]; then
    if ! "$VENV_DIR/bin/python" -c "import uvicorn" 2>/dev/null; then
        warn "Virtual environment exists but appears broken — recreating it..."
        rm -rf "$VENV_DIR"
        VENV_BROKEN=1
    fi
fi

if [ ! -d "$VENV_DIR" ]; then
    info "Creating virtual environment at backend/.venv ..."
    python3 -m venv "$VENV_DIR"
    if [ $? -ne 0 ]; then
        error "Failed to create virtual environment."
        echo -e "\nPress any key to close this window..."
        read -n 1
        exit 1
    fi
    success "Virtual environment created"
else
    success "Virtual environment is healthy"
fi

# Activate venv
source "$VENV_DIR/bin/activate"

# =============================================================================
# 4. Backend — install Python dependencies if needed
# =============================================================================
header "Step 4 — Checking Python dependencies"

REQUIREMENTS_FILE="$BACKEND_DIR/requirements.txt"
REQUIREMENTS_HASH_FILE="$VENV_DIR/.requirements_hash"
CURRENT_HASH=$(md5 -q "$REQUIREMENTS_FILE" 2>/dev/null || md5sum "$REQUIREMENTS_FILE" 2>/dev/null | awk '{print $1}')

if [ ! -f "$REQUIREMENTS_HASH_FILE" ] || [ "$(cat "$REQUIREMENTS_HASH_FILE")" != "$CURRENT_HASH" ]; then
    info "Installing/updating Python packages (this may take a minute the first time)..."
    pip install -q -r "$REQUIREMENTS_FILE"
    if [ $? -ne 0 ]; then
        error "pip install failed. Check your internet connection and try again."
        echo -e "\nPress any key to close this window..."
        read -n 1
        exit 1
    fi
    echo "$CURRENT_HASH" > "$REQUIREMENTS_HASH_FILE"
    success "Python packages installed"
else
    success "Python packages up to date (skipping install)"
fi

# =============================================================================
# 5. Frontend — install npm packages if needed
# =============================================================================
header "Step 5 — Checking frontend npm packages"

if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
    info "Installing npm packages (this may take a minute the first time)..."
    cd "$FRONTEND_DIR"
    npm install --silent
    if [ $? -ne 0 ]; then
        error "npm install failed. Check your internet connection and try again."
        echo -e "\nPress any key to close this window..."
        read -n 1
        exit 1
    fi
    cd "$PROJECT_ROOT"
    success "npm packages installed"
else
    success "node_modules already exists (skipping npm install)"
fi

# =============================================================================
# 6. Start backend
# =============================================================================
header "Step 6 — Starting backend (FastAPI)"

cd "$BACKEND_DIR"
# Clear old log
> "$BACKEND_LOG"

python3 -m uvicorn main:app --host 127.0.0.1 --port 8000 \
    > "$BACKEND_LOG" 2>&1 &
BACKEND_PID=$!
echo "$BACKEND_PID" > "$BACKEND_PID_FILE"

success "Backend started (PID: $BACKEND_PID) — log: logs/backend.log"
cd "$PROJECT_ROOT"

# =============================================================================
# 7. Start frontend
# =============================================================================
header "Step 7 — Starting frontend (Vite)"

cd "$FRONTEND_DIR"
> "$FRONTEND_LOG"

npm run dev -- --host 0.0.0.0 \
    > "$FRONTEND_LOG" 2>&1 &
FRONTEND_PID=$!
echo "$FRONTEND_PID" > "$FRONTEND_PID_FILE"

success "Frontend started (PID: $FRONTEND_PID) — log: logs/frontend.log"
cd "$PROJECT_ROOT"

# =============================================================================
# 8. Wait for both services to be ready
# =============================================================================
header "Step 8 — Waiting for services to start"

# ---- Backend health check (60 s) -------------------------------------------
info "Waiting for backend at $BACKEND_URL/api/health ..."
MAX_WAIT=60
WAITED=0
BACKEND_OK=0
while [ "$WAITED" -lt "$MAX_WAIT" ]; do
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BACKEND_URL/api/health" 2>/dev/null)
    if [ "$HTTP_CODE" = "200" ]; then
        success "Backend is online! ✓"
        BACKEND_OK=1
        break
    fi
    # Check the process is still alive
    if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
        break
    fi
    sleep 1
    WAITED=$((WAITED + 1))
    echo -n "."
done
echo ""

if [ "$BACKEND_OK" -eq 0 ]; then
    error "Backend did not start within ${MAX_WAIT}s."
    echo ""
    echo -e "${YELLOW}  Last 50 lines of logs/backend.log:${RESET}"
    echo -e "${CYAN}$(printf '─%.0s' {1..60})${RESET}"
    tail -n 50 "$BACKEND_LOG" 2>/dev/null || echo "  (log is empty)"
    echo -e "${CYAN}$(printf '─%.0s' {1..60})${RESET}"
    echo ""
    warn "You can still open the frontend, but video generation will not work."
    warn "Fix the backend error shown above, then re-run start_app.command."
fi

# ---- Frontend health check (60 s) ------------------------------------------
info "Waiting for frontend at $FRONTEND_URL ..."
WAITED=0
FRONTEND_OK=0
while [ "$WAITED" -lt "$MAX_WAIT" ]; do
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$FRONTEND_URL" 2>/dev/null)
    if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "304" ]; then
        success "Frontend is online! ✓"
        FRONTEND_OK=1
        break
    fi
    if ! kill -0 "$FRONTEND_PID" 2>/dev/null; then
        break
    fi
    sleep 1
    WAITED=$((WAITED + 1))
    echo -n "."
done
echo ""

if [ "$FRONTEND_OK" -eq 0 ]; then
    error "Frontend did not start within ${MAX_WAIT}s."
    echo ""
    echo -e "${YELLOW}  Last 50 lines of logs/frontend.log:${RESET}"
    echo -e "${CYAN}$(printf '─%.0s' {1..60})${RESET}"
    tail -n 50 "$FRONTEND_LOG" 2>/dev/null || echo "  (log is empty)"
    echo -e "${CYAN}$(printf '─%.0s' {1..60})${RESET}"
    echo ""
    warn "Check the frontend log shown above."
fi

# =============================================================================
# 9. Open browser (only if frontend started)
# =============================================================================
echo ""
echo -e "$(printf '═%.0s' {1..60})"
if [ "$BACKEND_OK" -eq 1 ] && [ "$FRONTEND_OK" -eq 1 ]; then
    echo -e "${GREEN}${BOLD}  🎉  Audio Image Sync Studio is running successfully!${RESET}"
else
    echo -e "${RED}${BOLD}  ⚠️  Audio Image Sync Studio started with errors!${RESET}"
    if [ "$BACKEND_OK" -eq 0 ]; then
        echo -e "${YELLOW}  Backend is offline. Video generation will not work!${RESET}"
    fi
fi
echo -e "$(printf '═%.0s' {1..60})"
echo ""
echo -e "  🌐  App URL    :  ${CYAN}${FRONTEND_URL}${RESET}"
echo -e "  🔧  API URL    :  ${CYAN}${BACKEND_URL}${RESET}"
echo -e "  📄  Backend log: logs/backend.log"
echo -e "  📄  Frontend log: logs/frontend.log"
echo ""
echo -e "  To stop the app, run:  ${BOLD}stop_app.command${RESET}"
echo ""

if [ "$FRONTEND_OK" -eq 1 ]; then
    sleep 1
    open "$FRONTEND_URL"
fi

echo -e "${YELLOW}  This window must stay open while the app is running.${RESET}"
echo -e "${YELLOW}  Press Ctrl+C here or run stop_app.command to stop.${RESET}"
echo ""

# Keep the terminal open and wait for Ctrl+C
trap "echo ''; warn 'Stopping app...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; rm -f \"$BACKEND_PID_FILE\" \"$FRONTEND_PID_FILE\"; success 'Stopped. Goodbye!'; exit 0" INT TERM

wait $BACKEND_PID $FRONTEND_PID
