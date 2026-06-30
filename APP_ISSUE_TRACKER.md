# SyncFrame Studio - App Issue Tracker

## 1. Critical Blockers
### Mac vs Windows Pathing in Electron
- **Current Behavior**: `desktop/main.js` hardcodes Mac-specific paths for the backend executable (`.venv/bin/python`) and uses macOS specific kill commands (`lsof -tiTCP:8000 -sTCP:LISTEN | xargs kill -9 2>/dev/null`).
- **Expected Behavior**: Electron main process dynamically handles paths (`.venv/Scripts/python.exe` on Windows) and uses `taskkill` on Windows or `kill` on macOS to stop zombie processes.
- **Priority**: P0
- **Affected Platform**: Windows
- **Suggested Fix Batch**: Batch 22D

### Missing Windows Build Config
- **Current Behavior**: `desktop/package.json` only specifies `mac` build targets. There is no `win` object for `electron-builder`.
- **Expected Behavior**: `desktop/package.json` contains `win` config using `nsis` target, `artifactName`, and Windows-compatible icons.
- **Priority**: P0
- **Affected Platform**: Windows
- **Suggested Fix Batch**: Batch 22D

## 2. Mac App Issues
### Code Signing / Notarization
- **Current Behavior**: The DMG build succeeds but triggers macOS Gatekeeper warnings ("Unidentified developer") on first launch because it lacks Apple Developer signatures.
- **Expected Behavior**: App is signed and notarized (or clearly documented as requiring a security bypass during beta).
- **Priority**: P1
- **Affected Platform**: Mac
- **Suggested Fix Batch**: Batch 22E

## 3. Windows App Issues
### Bypassing Electron in Windows Dev Mode
- **Current Behavior**: `start_windows.bat` starts the FastAPI backend and Vite frontend and opens a generic browser tab, completely bypassing the Electron container.
- **Expected Behavior**: Windows has a `start_desktop_windows.bat` script that correctly builds/starts the frontend and launches `npm start` in the `desktop` directory, perfectly matching the macOS `start_desktop.command` flow.
- **Priority**: P0
- **Affected Platform**: Windows
- **Suggested Fix Batch**: Batch 22D

### Windows PyInstaller Build Missing
- **Current Behavior**: Only `backend/build_backend_mac.command` exists to package the Python backend.
- **Expected Behavior**: A `backend/build_backend_windows.bat` script uses PyInstaller to generate `syncframe-backend.exe`.
- **Priority**: P0
- **Affected Platform**: Windows
- **Suggested Fix Batch**: Batch 22D

## 4. UI/UX Issues
### Platform-Specific Help Text
- **Current Behavior**: `StudioHelpPage.tsx` tells users to run `stop_app.command` or `lsof -i :8000` when the backend gets stuck. This is extremely confusing for Windows users.
- **Expected Behavior**: Help text detects the OS via user-agent or Electron preload context and displays `stop_windows.bat` and `taskkill` for Windows users.
- **Priority**: P2
- **Affected Platform**: Both
- **Suggested Fix Batch**: Batch 22B

## 5. Rendering Issues
### Missing Codecs / FFmpeg Reliability
- **Current Behavior**: FFmpeg is provided via PyInstaller bundling (imageio-ffmpeg), but specific codecs required on Windows vs Mac might differ or require specific `.dll` files in Windows.
- **Expected Behavior**: Render testing thoroughly confirms imageio-ffmpeg works flawlessly on Windows 10/11 when packaged into a one-file `.exe`.
- **Priority**: P1
- **Affected Platform**: Windows
- **Suggested Fix Batch**: Batch 22C

## 6. Auth/Plans/Credits Issues
### Auth Deep-link on Windows
- **Current Behavior**: Electron uses `app.setAsDefaultProtocolClient('syncframe')`. On macOS, this triggers `app.on('open-url')`. On Windows, this triggers `app.on('second-instance')`.
- **Expected Behavior**: Ensure the `second-instance` handler accurately parses the command-line arguments to find the `syncframe://` URL and route it to the frontend via `ipcRenderer`.
- **Priority**: P1
- **Affected Platform**: Windows
- **Suggested Fix Batch**: Batch 22D

## 7. Packaging/Installer Issues
### File Cleanup
- **Current Behavior**: Current bash scripts for cleaning only run `rm -rf`. Windows needs a `.bat` script that safely deletes `.venv`, `node_modules`, `dist`, and `__pycache__` using `rmdir /s /q` and `del /s /q`.
- **Expected Behavior**: Cross-platform clean command or dedicated Windows clean script.
- **Priority**: P2
- **Affected Platform**: Windows
- **Suggested Fix Batch**: Batch 22D

## 8. Website/Download Integration Issues
### Hardcoded Download Buttons
- **Current Behavior**: The marketing website download buttons are currently disabled or link to placeholders.
- **Expected Behavior**: Website links directly to the hosted `.dmg` and `.exe` installer files.
- **Priority**: P1
- **Affected Platform**: Both
- **Suggested Fix Batch**: Batch 22F

## 9. Future Improvements
### Auto-updater Integration
- **Current Behavior**: No update system.
- **Expected Behavior**: Implement `electron-updater` to pull updates from a GitHub Releases repository.
- **Priority**: P3
- **Affected Platform**: Both
- **Suggested Fix Batch**: Batch 22G
