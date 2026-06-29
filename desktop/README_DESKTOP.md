# SyncFrame Studio - Desktop Packaging (Batch 21D)

This folder contains the Electron desktop wrapper and `electron-builder` configuration for the SyncFrame Studio application. 
It supports both a seamless Dev Mode and a fully Packaged Build Mode.

## 1. Desktop Dev Mode
In Dev Mode, the Electron shell loads the frontend directly from the Vite dev server (`http://localhost:5173`) and spawns the local Python backend from source. 
To run Dev Mode:
\`\`\`bash
./start_desktop.command
\`\`\`

## 2. Packaged Build Mode
In Packaged Mode, the Electron shell bundles the production-built React frontend (`dist/`) and the compiled Python backend executable (`resources/backend/syncframe-backend`). 
The Electron app starts the backend executable automatically on launch and tears it down on exit.

## 3. Build Mac App
First, build the Python backend:
\`\`\`bash
./backend/build_backend_mac.command
\`\`\`
Then, build the Mac `.app` and `.dmg` package:
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
- **Packaged App**: Future batches will bundle a static FFmpeg binary. If FFmpeg is missing, the app will show an actionable error on launch rather than failing silently. The backend uses a safe AAC fallback (avoiding `libfdk_aac`).

## 6. Current Limitations
- **Code Signing/Notarization**: The Mac `.app` and `.dmg` are unsigned.
- **Windows Build on Windows**: The `.exe` configuration is prepared but must be built natively on Windows.

## 7. Future Batches (Do Not Implement Yet)
- **Batch 21E**: Google Login Foundation
- **Batch 21F**: Free/Pro Membership Check
- **Batch 21G**: Tool Lock System
- **Batch 21H**: Admin Users & Access Panel
- **Batch 21I**: Windows Build Support
- **Batch 21J**: Code Signing / Notarization / Auto Update

## How to replace app icon later
Placeholders exist in `desktop/assets/`. To customize the app branding:
1. Replace `desktop/assets/icon.icns` for Mac.
2. Replace `desktop/assets/icon.ico` for Windows.
3. Re-run the build command.
