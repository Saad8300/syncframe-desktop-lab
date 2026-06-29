const { app, BrowserWindow } = require('electron');
const path = require('path');
const { spawn, execSync } = require('child_process');
const http = require('http');
const fs = require('fs');

let mainWindow;
let backendProcess = null;
let isBackendStartedByUs = false;

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
      <body style="background: #111; color: #eee; font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0;">
        <h1>Starting SyncFrame Studio...</h1>
        <p id="status">Preparing local video engine...</p>
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

function showError(summary, recommendedCommand = '') {
  if (mainWindow && !mainWindow.isDestroyed()) {
    const errorHTML = `
      <html>
        <body style="background: #111; color: #ff6b6b; font-family: sans-serif; padding: 2rem; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; text-align: center;">
          <h2>SyncFrame Studio could not start.</h2>
          <p>${summary}</p>
          ${recommendedCommand ? `<br/><p style="color: #ccc;">Recommended troubleshooting command:</p><code style="background: #222; padding: 1rem; border-radius: 4px; color: #fff; user-select: all;">${recommendedCommand}</code>` : ''}
        </body>
      </html>
    `;
    mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(errorHTML)}`);
  }
}

function checkBackendHealth() {
  return new Promise((resolve) => {
    const req = http.get('http://127.0.0.1:8000/api/health', (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => {
      resolve(false);
    });
    req.end();
  });
}

function checkFFmpeg() {
  try {
    execSync('ffmpeg -version', { stdio: 'ignore' });
    return true;
  } catch (err) {
    // Future: check if bundled ffmpeg binary exists
    return false;
  }
}

async function startBackend() {
  if (!checkFFmpeg()) {
    showError(
      'FFmpeg is required for video rendering. Install FFmpeg or use a bundled build in a future package.',
      process.platform === 'darwin' ? 'brew install ffmpeg' : 'Install FFmpeg and add to PATH'
    );
    return false;
  }

  const isHealthy = await checkBackendHealth();
  if (isHealthy) {
    console.log('Backend is already running and healthy.');
    return true;
  }

  console.log('Starting backend process...');
  updateLoadingStatus('Starting backend engine...');

  if (app.isPackaged) {
    const bundledBackendExe = path.join(process.resourcesPath, 'backend', 'syncframe-backend');
    if (!fs.existsSync(bundledBackendExe)) {
        showError('Backend runtime not bundled yet. Run developer setup or use Desktop Dev Mode.');
        return false;
    }
    
    backendProcess = spawn(bundledBackendExe, [], {
      cwd: path.join(process.resourcesPath, 'backend'),
      stdio: ['ignore', 'pipe', 'pipe']
    });
  } else {
    const projectRoot = path.join(__dirname, '..');
    const backendDir = path.join(projectRoot, 'backend');
    const venvPython = path.join(backendDir, '.venv', 'bin', 'python');

    if (!fs.existsSync(venvPython)) {
      showError(
        'Backend virtual environment not found. Run backend setup first.',
        'cd backend && python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt'
      );
      return false;
    }
    
    backendProcess = spawn(venvPython, ['-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', '8000'], {
      cwd: backendDir,
      stdio: ['ignore', 'pipe', 'pipe']
    });
  }
  
  isBackendStartedByUs = true;

  backendProcess.stdout.on('data', (data) => {
    // console.log(`Backend: ${data}`);
  });

  backendProcess.stderr.on('data', (data) => {
    // console.error(`Backend Error: ${data}`);
  });

  backendProcess.on('close', (code) => {
    console.log(`Backend process exited with code ${code}`);
    if (code !== 0 && code !== null) {
        showError(
          'Backend failed to start or exited unexpectedly. Please check Python environment and backend dependencies.',
          app.isPackaged ? '' : 'cd backend && source .venv/bin/activate && python3 -c "import main"'
        );
    }
  });

  let attempts = 0;
  const maxAttempts = 30; // 30 seconds

  while (attempts < maxAttempts) {
    await new Promise(r => setTimeout(r, 1000));
    attempts++;
    console.log(`Checking backend health (Attempt ${attempts}/${maxAttempts})...`);
    
    if (await checkBackendHealth()) {
      return true;
    }
    updateLoadingStatus(`Waiting for backend engine... (${attempts}s)`);
  }

  showError(
    'Backend failed to start within 30 seconds. Please check Python environment and backend dependencies.',
    app.isPackaged ? '' : 'cd backend && source .venv/bin/activate && python3 -c "import main"'
  );
  return false;
}

app.whenReady().then(async () => {
  createWindow();

  const success = await startBackend();
  if (success) {
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
    console.log('Stopping backend process cleanly...');
    backendProcess.kill();
  }
});
