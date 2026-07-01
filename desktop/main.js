const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');

const isWin = process.platform === 'win32';

// ── Custom protocol for auth deep-link ────────────────────────────────────────
// Must be called before app is ready.
if (process.defaultApp) {
  // Electron dev: register with the Electron binary
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('syncframe', process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient('syncframe');
}

// ── Single-instance lock (required for second-instance deep-link on Windows) ──
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

let mainWindow;
let backendProcess = null;
let isBackendStartedByUs = false;


// ──────────────────────────────────────────────────────────────────────────────
// Logging
// ──────────────────────────────────────────────────────────────────────────────

let logFilePath = null;

function getLogFilePath() {
  if (logFilePath) return logFilePath;
  if (app.isPackaged) {
    const ud = app.getPath('userData');
    if (!fs.existsSync(ud)) fs.mkdirSync(ud, { recursive: true });
    logFilePath = path.join(ud, 'desktop-backend.log');
  } else {
    const logsDir = path.join(__dirname, '..', 'logs');
    if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
    logFilePath = path.join(logsDir, 'desktop-backend.log');
  }
  return logFilePath;
}

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try {
    fs.appendFileSync(getLogFilePath(), line + '\n');
  } catch (_) {}
}

function initLog() {
  try {
    fs.writeFileSync(getLogFilePath(), `--- SyncFrame Studio Desktop Log ---\nStarted: ${new Date().toISOString()}\n\n`);
  } catch (_) {}
}

// ──────────────────────────────────────────────────────────────────────────────
// Window
// ──────────────────────────────────────────────────────────────────────────────

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    title: 'SyncFrame Studio',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  const loadingHTML = `
    <html>
      <body style="background:#111;color:#eee;font-family:sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0;">
        <h1>Starting SyncFrame Studio...</h1>
        <p id="status" style="color:#aaa;font-size:1.1em;margin-top:1rem;">Preparing local video engine...</p>
      </body>
    </html>
  `;
  mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(loadingHTML)}`);
}

function updateLoadingStatus(message) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    const code = `document.getElementById('status').innerText = ${JSON.stringify(message)};`;
    mainWindow.webContents.executeJavaScript(code).catch(() => {});
  }
}

function showError(summary, detail = '') {
  log(`ERROR: ${summary}${detail ? ' | ' + detail : ''}`);
  if (mainWindow && !mainWindow.isDestroyed()) {
    const logPath = getLogFilePath();
    const errorHTML = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>SyncFrame Studio Error</title>
  <style>
    body {
      background: radial-gradient(circle at 50% 0%, #2a1015 0%, #15080b 60%, #050203 100%);
      color: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100vh;
      margin: 0;
      overflow: hidden;
      padding: 2rem;
    }
    .panel {
      position: relative;
      z-index: 1;
      background: rgba(30, 20, 25, 0.4);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid rgba(255, 107, 107, 0.2);
      border-radius: 24px;
      padding: 40px 48px;
      max-width: 600px;
      width: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
      text-align: center;
      animation: slideUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }
    .icon {
      width: 64px;
      height: 64px;
      border-radius: 50%;
      background: rgba(255, 107, 107, 0.1);
      border: 2px solid rgba(255, 107, 107, 0.3);
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 24px;
      color: #ff6b6b;
      font-size: 32px;
      font-weight: bold;
    }
    h2 { margin: 0 0 12px 0; font-size: 24px; font-weight: 600; color: #ff6b6b; }
    p { margin: 0 0 16px 0; color: #cbd5e1; line-height: 1.5; }
    .detail {
      background: rgba(0, 0, 0, 0.3);
      border-radius: 12px;
      padding: 16px;
      color: #94a3b8;
      font-size: 0.9em;
      word-break: break-all;
      width: 100%;
      box-sizing: border-box;
      margin-bottom: 24px;
      border: 1px solid rgba(255, 255, 255, 0.05);
      text-align: left;
      max-height: 300px;
      overflow-y: auto;
    }
    .log-info { color: #64748b; font-size: 0.85em; margin: 0; }
    code {
      background: rgba(0,0,0,0.4);
      padding: 4px 8px;
      border-radius: 6px;
      color: #94a3b8;
      font-family: ui-monospace, monospace;
    }
    @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
  </style>
</head>
<body>
  <div class="panel">
    <div class="icon">!</div>
    <h2>Startup Failed</h2>
    <p>${summary}</p>
    ${detail ? `<div class="detail">${detail}</div>` : ''}
    <p class="log-info">Check log file for more details:<br/><br/><code>${logPath}</code></p>
  </div>
</body>
</html>
    `;
    mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(errorHTML)}`);
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Health Check
// ──────────────────────────────────────────────────────────────────────────────

const HEALTH_URL = 'http://127.0.0.1:8000/api/health';

function checkBackendHealth() {
  return new Promise((resolve) => {
    const req = http.get(HEALTH_URL, (res) => {
      resolve(res.statusCode === 200);
    });
    req.setTimeout(2000, () => {
      req.destroy();
      resolve(false);
    });
    req.on('error', () => resolve(false));
    req.end();
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// Resolve backend binary
// ──────────────────────────────────────────────────────────────────────────────

function resolveBackendPaths() {
  if (app.isPackaged) {
    const backendDir = path.join(process.resourcesPath, 'backend');
    const backendExe = path.join(backendDir, isWin ? 'syncframe-backend.exe' : 'syncframe-backend');
    return { backendExe, backendDir, isPackaged: true };
  } else {
    const projectRoot = path.join(__dirname, '..');
    const backendDir = path.join(projectRoot, 'backend');
    const venvPython = isWin 
      ? path.join(backendDir, '.venv', 'Scripts', 'python.exe')
      : path.join(backendDir, '.venv', 'bin', 'python');
    return { backendExe: venvPython, backendDir, isPackaged: false };
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Start Backend
// ──────────────────────────────────────────────────────────────────────────────

async function startBackend() {
  initLog();
  log(`app.isPackaged: ${app.isPackaged}`);
  log(`process.resourcesPath: ${process.resourcesPath || '(not set)'}`);
  log(`process.platform: ${process.platform}`);
  log(`process.arch: ${process.arch}`);
  log(`Health check URL: ${HEALTH_URL}`);
  log(`Log file: ${getLogFilePath()}`);

  const { backendExe, backendDir, isPackaged } = resolveBackendPaths();

  log(`Resolved backend exe: ${backendExe}`);
  log(`Resolved backend cwd: ${backendDir}`);

  // ── 1. Check if backend is already running ──────────────────────────────────
  log('Checking if backend is already running...');
  const alreadyHealthy = await checkBackendHealth();
  if (alreadyHealthy) {
    log('Backend is already running and healthy — reusing it.');
    return true;
  }

  // ── 2. Check binary existence ───────────────────────────────────────────────
  const exeExists = fs.existsSync(backendExe);
  log(`Backend file exists: ${exeExists}`);

  if (!exeExists) {
    if (isPackaged) {
      showError(
        `Bundled backend executable not found at: ${backendExe}`,
        'The app bundle may be incomplete. Please re-download or rebuild the app.'
      );
    } else {
      showError(
        'Backend virtual environment not found.',
        `Expected Python at: ${backendExe}<br/>Run: cd backend &amp;&amp; python3 -m venv .venv &amp;&amp; source .venv/bin/activate &amp;&amp; pip install -r requirements.txt`
      );
    }
    return false;
  }

  // ── 3. Log permissions ──────────────────────────────────────────────────────
  try {
    const stat = fs.statSync(backendExe);
    const mode = (stat.mode & parseInt('777', 8)).toString(8);
    log(`Backend file permissions: ${mode} (octal), size: ${stat.size} bytes`);
    if (!isWin && isPackaged && !(stat.mode & 0o111)) {
      log('WARNING: Backend file is not executable — attempting chmod...');
      fs.chmodSync(backendExe, 0o755);
      log('chmod 755 applied.');
    }
  } catch (e) {
    log(`Could not stat backend file: ${e.message}`);
  }

  // ── 4. Spawn ────────────────────────────────────────────────────────────────
  let spawnCmd, spawnArgs, spawnOpts;

  if (isPackaged) {
    spawnCmd = backendExe;
    spawnArgs = [];
    spawnOpts = {
      cwd: backendDir,
      detached: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env }
    };
  } else {
    spawnCmd = backendExe;
    spawnArgs = ['-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', '8000'];
    spawnOpts = {
      cwd: backendDir,
      detached: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env }
    };
  }

  log(`Spawning: ${spawnCmd} ${spawnArgs.join(' ')}`);
  log(`Spawn cwd: ${spawnOpts.cwd}`);

  try {
    backendProcess = spawn(spawnCmd, spawnArgs, spawnOpts);
  } catch (spawnErr) {
    showError(
      `Failed to spawn backend process: ${spawnErr.message}`,
      `Command: ${spawnCmd}`
    );
    return false;
  }

  isBackendStartedByUs = true;
  log(`Backend process spawned with PID: ${backendProcess.pid}`);

  let lastStdoutLine = '';
  let lastStderrLine = '';

  backendProcess.stdout.on('data', (data) => {
    const text = data.toString();
    log(`[backend stdout] ${text.trimEnd()}`);
    const lines = text.split('\n').map(l => l.trim()).filter(l => l);
    if (lines.length) lastStdoutLine = lines[lines.length - 1];
  });

  backendProcess.stderr.on('data', (data) => {
    const text = data.toString();
    log(`[backend stderr] ${text.trimEnd()}`);
    const lines = text.split('\n').map(l => l.trim()).filter(l => l);
    if (lines.length) lastStderrLine = lines[lines.length - 1];
  });

  backendProcess.on('error', (err) => {
    log(`Backend spawn error: ${err.message}`);
  });

  backendProcess.on('close', (code, signal) => {
    log(`Backend process exited — code: ${code}, signal: ${signal}`);
    if (code !== 0 && code !== null) {
      const lastOutput = lastStderrLine || lastStdoutLine || 'No output captured';
      showError(
        `Backend crashed or exited unexpectedly (code ${code}).`,
        `Last output: ${lastOutput}<br/>See log: ${getLogFilePath()}`
      );
    }
  });

  // ── 5. Health check polling — 120 second timeout ────────────────────────────
  //  On first launch, macOS Gatekeeper validates the PyInstaller binary which
  //  can take 60-90 seconds.  We wait generously.
  const maxAttempts = 120;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await new Promise(r => setTimeout(r, 1000));

    log(`Health check attempt ${attempt}/${maxAttempts}...`);

    // Give the user a helpful message if it's taking long
    if (attempt <= 30) {
      updateLoadingStatus(`Starting backend engine... (${attempt}s)`);
    } else {
      updateLoadingStatus(`First launch: macOS is verifying the backend engine... (${attempt}s — please wait)`);
    }

    const healthy = await checkBackendHealth();
    if (healthy) {
      log(`Backend healthy after ${attempt}s.`);
      return true;
    }
  }

  // ── 6. Timeout ──────────────────────────────────────────────────────────────
  const lastOutput = lastStderrLine || lastStdoutLine || 'No output captured';
  showError(
    'The local video engine could not start. Restart the app or check the desktop backend log.',
    `Last output: ${lastOutput}<br/>Log: ${getLogFilePath()}`
  );
  return false;
}

// ──────────────────────────────────────────────────────────────────────────────
// App lifecycle
// ──────────────────────────────────────────────────────────────────────────────

// ── ipcMain handlers ──────────────────────────────────────────────────────────
ipcMain.on('is-packaged', (event) => {
  event.returnValue = app.isPackaged;
});

// ── Auth deep-link handler ────────────────────────────────────────────────────
function handleAuthDeepLink(url) {
  if (!url || !url.startsWith('syncframe://')) return;
  log('Auth deep-link received: ' + url);
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
    mainWindow.webContents.send('auth-callback', url);
  }
}

// macOS: open-url fires when the OS routes a syncframe:// URL to the app
app.on('open-url', (event, url) => {
  event.preventDefault();
  handleAuthDeepLink(url);
});

// Windows / Linux: the deep-link URL is passed as a command-line arg on second-instance
app.on('second-instance', (_event, commandLine) => {
  const url = commandLine.find(arg => arg.startsWith('syncframe://'));
  if (url) handleAuthDeepLink(url);
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.whenReady().then(async () => {
  createWindow();

  const success = await startBackend();
  if (success) {
    log('Backend ready — loading frontend...');
    updateLoadingStatus('Backend ready. Loading UI...');
    if (app.isPackaged) {
      mainWindow.loadFile(path.join(process.resourcesPath, 'frontend', 'index.html'));
    } else {
      mainWindow.loadURL('http://localhost:5173');
    }
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  if (isBackendStartedByUs && backendProcess) {
    log('Stopping backend process on quit...');
    try {
      backendProcess.kill();
      // Add a fallback kill to avoid zombie processes (only killing on port 8000 since we own it)
      setTimeout(() => {
        const { exec } = require('child_process');
        if (isWin) {
          exec(`for /f "tokens=5" %p in ('netstat -ano ^| findstr :8000') do @if not "%p"=="0" taskkill /PID %p /F 2>nul`, () => {});
        } else {
          exec(`lsof -tiTCP:8000 -sTCP:LISTEN | xargs kill -9 2>/dev/null`, () => {});
        }
      }, 500);
    } catch (e) {
      log('Error stopping backend: ' + e.message);
    }
  }
});
