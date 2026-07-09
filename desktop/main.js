const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const updateService = require('./updateService');
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
updateService.setLogger(log);

function initLog() {
  try {
    fs.writeFileSync(getLogFilePath(), `--- SyncFrame Studio Desktop Log ---\nStarted: ${new Date().toISOString()}\n\n`);
  } catch (_) {}
}

// ──────────────────────────────────────────────────────────────────────────────
// Window
// ──────────────────────────────────────────────────────────────────────────────

let startupStages = [];
function recordStartupStage(name) {
  const timeMs = Date.now() - startupStartTime;
  const msg = `[Startup] ${name}: ${timeMs}ms`;
  log(msg);
  startupStages.push(msg);
}

function createWindow() {
  recordStartupStage('Electron window created');
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
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Starting SyncFrame Studio</title>
  <style>
    body {
      background: radial-gradient(circle at 50% 0%, #1e293b 0%, #0f172a 60%, #020617 100%);
      color: #f8fafc;
      font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100vh;
      margin: 0;
      overflow: hidden;
      user-select: none;
    }
    .glow {
      position: absolute;
      top: 50%;
      left: 50%;
      width: 600px;
      height: 600px;
      transform: translate(-50%, -50%);
      background: radial-gradient(circle, rgba(99, 102, 241, 0.15) 0%, rgba(0, 0, 0, 0) 70%);
      pointer-events: none;
      z-index: 0;
    }
    .panel {
      position: relative;
      z-index: 1;
      background: rgba(30, 41, 59, 0.4);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 24px;
      padding: 48px 56px;
      display: flex;
      flex-direction: column;
      align-items: center;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.02) inset;
      animation: slideUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards;
      opacity: 0;
      transform: translateY(20px);
    }
    .logo-container {
      width: 72px;
      height: 72px;
      border-radius: 20px;
      background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 24px;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.6), inset 0 2px 4px rgba(255,255,255,0.05);
      position: relative;
      border: 1px solid rgba(255,255,255,0.08);
    }
    .logo-container::after {
      content: '';
      position: absolute;
      inset: -4px;
      border-radius: 24px;
      background: rgba(0, 229, 255, 0.2);
      filter: blur(12px);
      opacity: 0.5;
      z-index: -1;
      animation: pulseGlow 3s ease-in-out infinite alternate;
    }
    h1 {
      margin: 0 0 8px 0;
      font-size: 28px;
      font-weight: 700;
      letter-spacing: -0.02em;
      background: linear-gradient(to right, #ffffff, #cbd5e1);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .subtitle {
      color: #94a3b8;
      font-size: 14px;
      font-weight: 500;
      margin: 0 0 32px 0;
      letter-spacing: 0.01em;
    }
    .loader-container {
      width: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .progress-bar-container {
      width: 200px;
      height: 4px;
      background: rgba(255, 255, 255, 0.08);
      border-radius: 4px;
      margin-bottom: 16px;
      overflow: hidden;
      position: relative;
    }
    .progress-bar {
      position: absolute;
      top: 0; left: 0; height: 100%;
      width: 50%;
      background: linear-gradient(90deg, #6366f1, #06b6d4, #8b5cf6, #6366f1);
      background-size: 200% 100%;
      border-radius: 4px;
      animation: indeterminate 1.5s infinite linear;
    }
    @keyframes indeterminate {
      0% { left: -50%; background-position: 100% 0; }
      100% { left: 100%; background-position: -100% 0; }
    }
    #status {
      color: #cbd5e1;
      font-size: 13px;
      font-weight: 500;
      margin: 0;
      text-align: center;
      transition: opacity 0.3s ease;
    }
    @keyframes slideUp { to { opacity: 1; transform: translateY(0); } }
    @keyframes pulseGlow { from { opacity: 0.3; transform: scale(0.95); } to { opacity: 0.6; transform: scale(1.05); } }
  </style>
</head>
<body>
  <div class="glow"></div>
  <div class="panel">
    <div class="logo-container">
      <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="#00e5ff" style="filter: drop-shadow(0 0 10px rgba(0,229,255,0.6));">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
      </svg>
    </div>
    <h1>SyncFrame Studio</h1>
    <p class="subtitle">Preparing your studio workspace</p>
    <div class="loader-container">
      <div class="progress-bar-container"><div class="progress-bar"></div></div>
      <p id="status">Loading local rendering tools...</p>
    </div>
  </div>
</body>
</html>
  `;
  mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(loadingHTML)}`);
  recordStartupStage('loadingHTML shown');
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
    const backendDir = path.join(process.resourcesPath, 'backend', 'syncframe-backend');
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

const startupStartTime = Date.now();

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
    recordStartupStage('backend process spawn started');
    backendProcess = spawn(spawnCmd, spawnArgs, spawnOpts);
    recordStartupStage('backend process spawned');
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
  //  Initial startup can take longer while the packaged runtime is prepared.
  //  We wait generously.
  const maxAttempts = 120;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const delay = attempt <= 30 ? 300 : 1000;
    await new Promise(r => setTimeout(r, delay));

    log(`Health check attempt ${attempt}/${maxAttempts}...`);
    if (attempt === 1) recordStartupStage('first health check started');

    // Give the user a helpful message if it's taking long
    if (attempt <= 30) {
      updateLoadingStatus(`Loading local rendering tools...`);
    } else {
      updateLoadingStatus(`Finalizing startup... (${attempt}s — please wait)`);
    }

    const healthy = await checkBackendHealth();
    if (healthy) {
      log(`Backend healthy after attempt ${attempt}.`);
      recordStartupStage('health check succeeded');
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

ipcMain.on('open-external', (event, url) => {
  if (typeof url === 'string' && (url.startsWith('http://') || url.startsWith('https://'))) {
    shell.openExternal(url);
  } else {
    log('Blocked openExternal with invalid or missing URL scheme: ' + url);
  }
});

// ── Updater handlers ──────────────────────────────────────────────────────────
ipcMain.handle('get-version', () => {
  return app.getVersion();
});

ipcMain.handle('check-for-updates', async () => await updateService.checkForUpdates());
ipcMain.handle('download-update', async (event, release) => {
  const publisher = (progress) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-progress', progress);
    }
  };
  return await updateService.downloadUpdate(release, publisher);
});
ipcMain.handle('install-update', async (event, filePath) => await updateService.installUpdate(filePath));

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

async function initializeWorkspace() {
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
    
    mainWindow.webContents.once('did-finish-load', () => {
      recordStartupStage('frontend loaded');
      log('--- Startup Telemetry ---');
      startupStages.forEach(s => log(s));
    });
  }
}

app.whenReady().then(() => {
  initializeWorkspace();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      initializeWorkspace();
    }
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
