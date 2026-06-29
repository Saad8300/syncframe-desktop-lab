# SyncFrame Studio — Windows / RDP Guide

> **macOS users:** See `start_app.command` and `stop_app.command` instead.

---

## Required Tools

Before you begin, make sure these are installed:

| Tool | Required | Notes |
|---|---|---|
| **Git** | Yes | [git-scm.com/download/win](https://git-scm.com/download/win) |
| **Python 3.11 or 3.12** | Yes | [python.org/downloads/windows](https://www.python.org/downloads/windows/) — check **"Add Python to PATH"** during install |
| **Node.js LTS** | Yes | [nodejs.org/en/download](https://nodejs.org/en/download) |
| **FFmpeg** | Yes | [gyan.dev/ffmpeg/builds](https://www.gyan.dev/ffmpeg/builds/) — extract and add `C:\ffmpeg\bin` to PATH |

---

## First-Time Setup

Run this **once** when you first set up the project.

1. Open the project folder:
   ```
   C:\Projects\Audio-to-Video-Synchronizer
   ```

2. Right-click `setup_windows.bat` → **Run as administrator**

   Or in PowerShell/Command Prompt:
   ```bat
   .\setup_windows.bat
   ```

3. Wait for setup to finish. It will:
   - Check all required tools (Git, Python, Node, FFmpeg)
   - Try to install missing tools automatically if `winget` or `choco` is available
   - Create the Python virtual environment
   - Install backend packages
   - Install frontend packages

4. When complete, you will see:
   ```
   Now run start_windows.bat
   ```

5. Setup log is saved to:
   ```
   logs\windows_setup.log
   ```

---

## Daily Start

Every time you want to use the app:

**Double-click** `start_windows.bat`

Or in PowerShell:
```bat
.\start_windows.bat
```

The script will:
- Check that setup was completed
- Clear any stale processes on ports 8000 and 5173
- Start the backend (FastAPI on port 8000)
- Start the frontend (Vite on port 5173)
- Wait for both to come online
- Open your browser at:

```
http://localhost:5173
```

---

## Daily Stop

When you are done using the app:

**Double-click** `stop_windows.bat`

Or in PowerShell:
```bat
.\stop_windows.bat
```

The script will:
- Stop any process on port 8000 (backend)
- Stop any process on port 5173 (frontend)
- Confirm ports are free

---

## Log Files

All logs are written to the `logs\` folder:

| File | Contents |
|---|---|
| `logs\windows_setup.log` | Setup output |
| `logs\windows_start.log` | Start script output |
| `logs\backend.log` | Backend server output |
| `logs\frontend.log` | Frontend server output |

---

## Troubleshooting

### Backend shows Offline in the app

1. Run `stop_windows.bat`
2. Run `start_windows.bat`
3. If still offline, check:
   ```
   logs\backend.log
   ```

---

### Frontend opens but Backend is Offline

The backend probably failed to start. Check:
```
logs\backend.log
```

Common causes:
- Missing Python packages (re-run `setup_windows.bat`)
- FFmpeg not found in PATH
- Port 8000 already in use by another app

---

### Setup says Python is missing

1. Download Python 3.11 or 3.12 from:  
   [https://www.python.org/downloads/windows/](https://www.python.org/downloads/windows/)
2. During install, **check "Add Python to PATH"**
3. Restart your terminal/PowerShell
4. Re-run `setup_windows.bat`

---

### Setup says FFmpeg is missing

The setup script will try to install FFmpeg automatically using `choco` or `winget` if available.

If that fails, install manually:

1. Download FFmpeg from:  
   [https://www.gyan.dev/ffmpeg/builds/](https://www.gyan.dev/ffmpeg/builds/)  
   (download `ffmpeg-release-essentials.zip`)

2. Extract to `C:\ffmpeg`

3. Add `C:\ffmpeg\bin` to your Windows PATH:
   - Open **System Properties** → **Environment Variables**
   - Under **System variables**, edit **Path**
   - Add `C:\ffmpeg\bin`

4. Restart your terminal and re-run `setup_windows.bat`

---

### Port already in use error

Run `stop_windows.bat` to free the ports, then try again.

If ports are still stuck, restart Windows.

---

### App not loading after git pull

After pulling updates:
```bat
.\stop_windows.bat
.\start_windows.bat
```

If new Python packages were added:
```bat
.\stop_windows.bat
.\setup_windows.bat
.\start_windows.bat
```

---

## Getting Updates

```bat
git pull
.\stop_windows.bat
.\start_windows.bat
```

If `requirements.txt` changed, also run:
```bat
.\setup_windows.bat
```

---

## URLs

| Service | URL |
|---|---|
| Frontend | http://localhost:5173 |
| Backend API | http://127.0.0.1:8000 |
| Backend Health | http://127.0.0.1:8000/api/health |
