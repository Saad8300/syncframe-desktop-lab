# SyncFrame Studio Desktop QA Checklist

Before releasing a new desktop version, perform the following manual tests to ensure the packaged app works correctly.

## 1. Build and Launch
- [ ] Build the Mac app: `./build_desktop_mac.command`
- [ ] Open `.app` directly from `desktop/dist/mac-arm64`
- [ ] Confirm the loading screen appears with "Starting SyncFrame Studio..."
- [ ] Confirm the sidebar shows **Backend live** when loaded.

## 2. Core Functionality
- [ ] Open all main pages (Dashboard, Tools, Settings, etc.)
- [ ] Run a small Image Timeline render and ensure it completes.
- [ ] Run a basic Batch Video Generator check.

## 3. App Lifecycle
- [ ] Close the app window/quit the app.
- [ ] Open terminal and verify port 8000 is free: `lsof -iTCP:8000 -sTCP:LISTEN` (Should return nothing).

## 4. DMG Packaging
- [ ] Open the `.dmg` file from `desktop/dist`.
- [ ] Drag the `SyncFrame Studio.app` to the Applications folder shortcut.
- [ ] Open the app from Applications.
- [ ] If blocked by Gatekeeper (unsigned build), right-click the app -> **Open** and confirm it launches.

## 5. Environment & Security
- [ ] Confirm logs are correctly written to the user data folder: `~/Library/Application Support/SyncFrame Studio/desktop-backend.log`.
- [ ] Review `git status` and confirm no `.dmg`, `.zip`, `.log`, secrets, or `dist/` folders are staged for commit.
