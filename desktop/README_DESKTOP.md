# SyncFrame Studio - Desktop Packaging (Batch 21B)

This folder contains the Electron desktop wrapper and `electron-builder` configuration for the SyncFrame Studio application. 
It supports both a seamless Dev Mode and a Packaged Build Mode.

## 1. Desktop Dev Mode
In Dev Mode, the Electron shell loads the frontend directly from the Vite dev server (`http://localhost:5173`) and spawns the local Python backend from source. 
To run Dev Mode:
\`\`\`bash
./start_desktop.command
\`\`\`

## 2. Packaged Build Mode
In Packaged Mode, the Electron shell bundles the production-built React frontend (`dist/`) and loads it from the local file system. 
The backend runtime is expected to be pre-compiled and bundled inside the app resources.

## 3. Build Mac App
To build the Mac `.app` and `.dmg` package:
\`\`\`bash
./build_desktop_mac.command
\`\`\`
*(You can clean the build outputs anytime using `./clean_desktop_build.command`)*

## 4. Output Location
After building, the installer files will be located in:
\`\`\`
desktop/dist/
\`\`\`

## 5. FFmpeg Requirement
**SyncFrame Studio requires FFmpeg to render videos.**
- **Mac Developers**: Run `brew install ffmpeg` before running the app.
- **Packaged App**: Future batches will bundle a static FFmpeg binary. If FFmpeg is missing, the app will show an actionable error on launch rather than failing silently.

## 6. Backend Runtime Status
Currently, the backend is not fully bundled into the Mac app automatically. The `build_desktop_mac.command` prepares the frontend, but the Python backend requires a manual PyInstaller build (`backend/build_backend_mac.command`) and must be moved to `desktop/resources/backend` for a fully self-contained app. If the backend runtime is missing in the packaged app, an error screen will guide the user.

## 7. Current Limitations
- **Fully Bundled Python Backend**: Experimental.
- **Code Signing/Notarization**: The Mac `.app` and `.dmg` are unsigned.
- **Windows Build on Windows**: The `.exe` configuration is prepared but must be built natively on Windows.

## 8. Future Batches (Do Not Implement Yet)
- **Batch 21C**: Finalize fully bundled backend integration.
- **Batch 21D**: Windows native build support.
- **Batch 21E**: Google login + license check.
- **Batch 21F**: Tool permission lock.
- **Batch 21G**: Auto update and installer publishing.

## How to replace app icon later
Placeholders exist in `desktop/assets/`. To customize the app branding:
1. Replace `desktop/assets/icon.icns` for Mac.
2. Replace `desktop/assets/icon.ico` for Windows.
3. Re-run the build command.
