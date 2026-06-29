# SyncFrame Studio - Desktop Build Notes (Batch 21C)

## What Works Now
- **Desktop Dev Mode**: You can run `./start_desktop.command` to load the frontend from Vite and automatically launch the local backend Python source.
- **Backend Bundling**: The FastAPI backend can now be bundled into a standalone executable using PyInstaller.
- **Mac Build Automation**: You can build a Mac `.app` and `.dmg` using `./build_desktop_mac.command`.
- **Packaged Frontend & Backend**: The Mac build embeds both the production-built React frontend and the compiled Python backend runtime. The app starts the backend automatically and connects.
- **FFmpeg Safety Check**: The app verifies `ffmpeg` is available on the system before starting. (Note: The backend avoids `libfdk_aac` and uses a safe AAC fallback).

## How to Build Mac Package
First, build the backend executable:
\`\`\`bash
./backend/build_backend_mac.command
\`\`\`
Then, build the Mac app package:
\`\`\`bash
./build_desktop_mac.command
\`\`\`
This will build the frontend, package the Mac app (including the backend runtime), and output the installer to `desktop/dist/`.

## What is Not Production-Ready Yet (Future Work)
- **Bundled FFmpeg**: Users currently must install `ffmpeg` (e.g., via Homebrew) manually.
- **Code Signing and Notarization**: The Mac `.app` and `.dmg` are unsigned and will trigger security warnings on other machines.
- **Windows Build on Windows**: The `.exe` configuration is prepared but must be built on a Windows machine.
- **Auto Updater**: Not configured.
- **Login / Licensing**: Not implemented.
