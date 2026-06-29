# SyncFrame Studio - Desktop Build Notes (Batch 21B)

## What Works Now
- **Desktop Dev Mode**: You can run `./start_desktop.command` to load the frontend from Vite and automatically launch the local backend Python source.
- **Mac Build Automation**: You can build a Mac `.app` and `.dmg` using `./build_desktop_mac.command`.
- **Packaged Frontend**: The Mac build successfully embeds the production-built React frontend and loads it directly from the file system.
- **FFmpeg Safety Check**: The app verifies `ffmpeg` is available on the system before starting.

## How to Build Mac Package
Simply run from the project root:
\`\`\`bash
./build_desktop_mac.command
\`\`\`
This will build the frontend, package the Mac app, and output the installer to `desktop/dist/`.

## What is Not Production-Ready Yet (Future Work)
- **Fully Bundled Python Backend**: The packaged app expects the backend to be bundled inside `resources/backend`, but the PyInstaller automation to place it there is experimental and not fully integrated into the standard build command.
- **Bundled FFmpeg**: Users currently must install `ffmpeg` (e.g., via Homebrew) manually.
- **Code Signing and Notarization**: The Mac `.app` and `.dmg` are unsigned and will trigger security warnings on other machines.
- **Windows Build on Windows**: The `.exe` configuration is prepared but must be built on a Windows machine.
- **Auto Updater**: Not configured.
- **Login / Licensing**: Not implemented.
