#!/bin/bash
# =============================================================================
# clean_desktop_build.command — SyncFrame Studio Desktop Build Cleaner
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

info()    { echo -e "${CYAN}  ℹ  $*${RESET}"; }
success() { echo -e "${GREEN}  ✅  $*${RESET}"; }

echo ""
echo -e "${BOLD}🧹  Cleaning Desktop Build Outputs${RESET}"
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


rm -rf desktop/dist
info "Removed desktop/dist"

rm -rf desktop/out
info "Removed desktop/out"

rm -rf desktop/release
info "Removed desktop/release"

rm -rf desktop/.vite
info "Removed desktop/.vite"

success "Clean complete! (Source files untouched)"
echo ""
