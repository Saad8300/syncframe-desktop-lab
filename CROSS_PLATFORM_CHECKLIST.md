# SyncFrame Studio - Cross-Platform QA Checklist

## 1. Mac Specific Checks
- [ ] **Dev Start**: `start_desktop.command` cleanly launches Vite and Electron.
- [ ] **Packaged App Open**: The `.app` file inside `desktop/dist/mac-arm64` opens smoothly without crashing.
- [ ] **Backend Live**: The Python backend starts automatically within Electron (health check succeeds).
- [ ] **Render Test**: Successfully render a video clip via FFmpeg on macOS.
- [ ] **Login Test**: Clicking login opens the default macOS browser and redirects back to the app (`syncframe://` deep link works).
- [ ] **Output Test**: The "Open Output Folder" button correctly opens Finder.
- [ ] **Close App Cleanup**: Quitting the app gracefully kills the Python backend (no zombie processes left on port 8000).
- [ ] **DMG Install Test**: The `.dmg` file mounts correctly, shows the "drag to Applications" UI, and the installed app functions.

## 2. Windows Specific Checks
- [ ] **Dev Start**: `start_desktop_windows.bat` cleanly launches Vite and Electron natively on Windows.
- [ ] **Packaged EXE Open**: The installed `.exe` application launches smoothly without crashing.
- [ ] **Backend Live**: The Python backend starts automatically within Electron on Windows (health check succeeds).
- [ ] **Render Test**: Successfully render a video clip via FFmpeg on Windows.
- [ ] **Login Test**: Clicking login opens Edge/Chrome and redirects back to the app via the Windows `second-instance` deep link handler.
- [ ] **Output Test**: The "Open Output Folder" button correctly opens File Explorer.
- [ ] **Close App Cleanup**: Quitting the app gracefully kills the Python backend (no zombie processes left on port 8000).
- [ ] **Installer Test**: The NSIS `.exe` installer runs without errors and places shortcuts on the Desktop/Start Menu.

## 3. Shared Pre-Commit Checks
- [ ] **No Secrets Committed**: `.env` and `.env.local` are explicitly ignored.
- [ ] **No Dist Committed**: `desktop/dist`, `desktop/release`, `*.dmg`, `*.exe`, `*.zip`, `*.blockmap` are not in git.
- [ ] **No Logs Committed**: The `logs` directory and `*.log` files are ignored.
- [ ] **No Temp/Output Committed**: `temp`, `uploads`, and `output` folders are ignored or empty.
- [ ] **No Hardcoded Paths**: No `/Users/home/...` or `C:\Users\...` exist in the source code.
- [ ] **Build Passes**: `npm run build` succeeds for both the frontend and the website.
- [ ] **TypeScript Passes**: `npx tsc --noEmit` returns zero errors.
- [ ] **Python Imports Pass**: `python3 -c "import main"` executes without throwing ModuleNotFoundError.
