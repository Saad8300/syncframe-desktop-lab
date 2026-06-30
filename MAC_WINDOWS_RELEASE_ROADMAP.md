# SyncFrame Studio - Release Roadmap

## Batch 22B — Premium UI/UX Polish
**Goal**: Polish the user interface to ensure it meets premium SaaS standards before release. Add platform-aware help text so Windows users don't see macOS shell commands.
**Affected Files**:
- `frontend/src/components/StudioHelpPage.tsx`
- `frontend/src/App.tsx`
**Validation Commands**:
- `cd frontend && npm run build`
**Manual Test Checklist**:
- [ ] Verify help text dynamically displays Windows commands when on Windows.
- [ ] Verify help text displays macOS commands when on macOS.

## Batch 22C — Rendering and Progress Reliability
**Goal**: Guarantee that the FFmpeg/MoviePy rendering engine operates flawlessly on both Windows and Mac without missing DLLs or codecs. Ensure progress bars map accurately to rendering states.
**Affected Files**:
- `backend/main.py`
- `frontend/src/components/ExportPresetPanel.tsx`
**Validation Commands**:
- `cd backend && python3 -c "import main"`
**Manual Test Checklist**:
- [ ] Run a render job on macOS.
- [ ] Run a render job on Windows 10/11.
- [ ] Verify UI gracefully handles render crashes with meaningful error text.

## Batch 22D — Windows Dev/Start/Stop/Build System
**Goal**: Create a native Windows developer experience and build pipeline. This involves creating `.bat` scripts that precisely mirror the macOS `.command` scripts, and upgrading `desktop/main.js` to correctly route paths on Windows.
**Affected Files**:
- `start_desktop_windows.bat` (New)
- `stop_desktop_windows.bat` (New)
- `backend/build_backend_windows.bat` (New)
- `clean_desktop_build_windows.bat` (New)
- `desktop/package.json` (add `win` NSIS target)
- `desktop/main.js` (refactor paths)
**Validation Commands**:
- `cmd.exe /c start_desktop_windows.bat` (on a Windows machine)
**Manual Test Checklist**:
- [ ] App launches in Electron on Windows.
- [ ] Backend is automatically spawned by Electron on Windows.
- [ ] App successfully handles auth deep-linking (`syncframe://`) via `second-instance` event.
- [ ] Build script successfully outputs an NSIS installer (`.exe`).

## Batch 22E — Mac Packaging and DMG Polish
**Goal**: Ensure the macOS `.dmg` file is beautifully branded and the application is properly signed/notarized to prevent Gatekeeper warnings.
**Affected Files**:
- `desktop/package.json` (mac/dmg config)
- Apple Developer Certificates (Environment variables)
**Validation Commands**:
- `./build_desktop_mac.command`
**Manual Test Checklist**:
- [ ] DMG background is visually appealing.
- [ ] App opens on a fresh macOS machine without the "Unidentified Developer" warning.
- [ ] App icon is high-resolution.

## Batch 22F — Website Download Integration
**Goal**: Link the marketing website to the generated distribution files so users can actually download the desktop app.
**Affected Files**:
- `website/src/app/download/page.tsx`
**Validation Commands**:
- `cd website && npm run build`
**Manual Test Checklist**:
- [ ] Clicking "macOS" downloads the `.dmg` file.
- [ ] Clicking "Windows" downloads the `.exe` file.

## Batch 22G — Versioning and Update System
**Goal**: Implement a robust auto-update system using `electron-updater` so users automatically receive patches.
**Affected Files**:
- `desktop/main.js`
- `desktop/package.json`
**Validation Commands**:
- `npm run pack`
**Manual Test Checklist**:
- [ ] App checks for updates on startup.
- [ ] App displays an "Update Available" notification.
- [ ] App successfully installs an update and restarts.

## Batch 22H — Final QA and Release Checklist
**Goal**: Perform end-to-end regression testing across all platforms before launching `v1.0.0` to the public.
**Affected Files**:
- N/A
**Validation Commands**:
- Full build pipelines.
**Manual Test Checklist**:
- [ ] Complete cross-platform test.
- [ ] Production database linked.
- [ ] All API keys verified.
