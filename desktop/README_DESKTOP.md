# SyncFrame Studio - Desktop Foundation (Batch 21A)

This folder contains the Electron desktop wrapper for the SyncFrame Studio application. 
It encapsulates the existing React frontend and FastAPI backend into a single unified desktop window experience.

## What Batch 21A Does
- **Desktop Window**: Launches a desktop window shell (minimum 1100x700).
- **Backend Orchestration**: Automatically starts the local FastAPI backend (bound exclusively to `127.0.0.1:8000` for security) if it isn't already running.
- **Frontend Loading**: Waits for the backend to become healthy, then loads the frontend (dev server for now).
- **Clean Teardown**: Stops the backend when the app is closed.
- **Loading UI**: Provides a clean loading screen and actionable error states if the Python environment is missing or fails.

## How to Install Desktop Dependencies
Ensure you have Node.js installed, then run:
\`\`\`bash
cd desktop
npm install
\`\`\`

## How to Run Desktop App

The easiest way is to use the provided root-level script which handles everything seamlessly:
\`\`\`bash
./start_desktop.command
\`\`\`

Alternatively, to run manually in two terminals:
1. Terminal 1 (Frontend): \`cd frontend && npm run dev\`
2. Terminal 2 (Desktop): \`cd desktop && npm run dev\`

## Security
- The backend runs only on \`127.0.0.1\` and does not expose ports to the local network.
- The Electron window uses \`nodeIntegration: false\` and \`contextIsolation: true\` for a secure foundation.

## Current Limitations
- **Dev Mode**: Currently the frontend is loaded from the Vite dev server (\`http://localhost:5173\`) instead of a bundled static build.
- **Manual Node/Python Required**: The user still needs Node and Python installed on their machine; this is not a fully packaged standalone application yet.

## Future Batches (Do Not Implement Yet)
- **Batch 21B**: Package backend for desktop (PyInstaller or similar).
- **Batch 21C**: Build Mac \`.app\`.
- **Batch 21D**: Build Windows \`.exe\`.
- **Batch 21E**: Google login + license check.
- **Batch 21F**: Tool permission lock.
- **Batch 21G**: Installer and auto update.
