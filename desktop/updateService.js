const { app, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const config = require('./config');

let log = console.log;

class UpdateService {
  constructor() {
    this.currentVersion = app.getVersion();
    // Map NodeJS platform to our DB enum
    this.platform = process.platform === 'darwin' ? 'mac' : process.platform === 'win32' ? 'windows' : process.platform;
    // Map NodeJS arch to our DB values ('x64', 'arm64')
    this.architecture = process.arch === 'arm64' ? 'arm64' : 'x64';
    this.channel = config.UPDATE_CHANNEL;
  }

  setLogger(loggerFn) {
    log = loggerFn;
  }

  /**
   * Compare two semantic version strings (e.g. 1.0.0 and 1.0.1)
   * Returns true if latest > current.
   */
  isNewerVersion(current, latest) {
    const parse = (v) => v.replace(/^v/, '').split('.').map(Number);
    const curr = parse(current);
    const lat = parse(latest);
    
    for (let i = 0; i < Math.max(curr.length, lat.length); i++) {
      const c = curr[i] || 0;
      const l = lat[i] || 0;
      if (l > c) return true;
      if (l < c) return false;
    }
    return false;
  }

  async checkForUpdates() {
    log(`[UpdateService] Checking for updates. Current version: ${this.currentVersion}, Platform: ${this.platform}, Arch: ${this.architecture}`);
    
    const url = new URL(`${config.SUPABASE_URL}/functions/v1/get-latest-release`);
    url.searchParams.append('platform', this.platform);
    url.searchParams.append('channel', this.channel);
    url.searchParams.append('architecture', this.architecture);

    try {
      // Use standard fetch (available in modern Node/Electron environments)
      const response = await fetch(url.toString(), {
        // Prevent caching from edge nodes
        headers: { 'Cache-Control': 'no-cache' },
        // Set a reasonable timeout so we don't hang startup
        signal: AbortSignal.timeout(10000)
      });
      
      const data = await response.json();

      if (!response.ok || !data.success) {
        const errorMsg = data.error || response.statusText;
        log(`[UpdateService] Error fetching latest release: ${errorMsg}`);
        return {
          updateAvailable: false,
          currentVersion: this.currentVersion,
          latestVersion: null,
          release: null,
          error: errorMsg
        };
      }

      const release = data.release;
      const updateAvailable = this.isNewerVersion(this.currentVersion, release.version);
      
      log(`[UpdateService] Latest version: ${release.version}. Update available: ${updateAvailable}`);

      return {
        updateAvailable,
        currentVersion: this.currentVersion,
        latestVersion: release.version,
        release
      };
    } catch (error) {
      log(`[UpdateService] Network error during update check: ${error.message}`);
      return {
        updateAvailable: false,
        currentVersion: this.currentVersion,
        latestVersion: null,
        release: null,
        error: error.message
      };
    }
  }

  async downloadUpdate(release, eventPublisher) {
    if (!release || !release.id) {
      return { success: false, error: 'Invalid release data provided.' };
    }

    try {
      log(`[UpdateService] Requesting download URL for release ${release.id}...`);
      const dlUrl = new URL(`${config.SUPABASE_URL}/functions/v1/get-release-download`);
      
      const reqRes = await fetch(dlUrl.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ release_id: release.id }),
        signal: AbortSignal.timeout(15000)
      });

      const data = await reqRes.json();
      if (!reqRes.ok || data.error) {
        throw new Error(data.error || reqRes.statusText || 'Failed to get download URL');
      }

      const signedUrl = data.url;
      const fileName = data.file_name || release.file_name || 'SyncFrameStudioSetup.dmg';
      const targetPath = path.join(app.getPath('downloads'), fileName);
      
      log(`[UpdateService] Starting download to ${targetPath}...`);
      
      const downloadRes = await fetch(signedUrl);
      if (!downloadRes.ok) {
        throw new Error(`Download failed: ${downloadRes.status} ${downloadRes.statusText}`);
      }

      const totalBytes = Number(downloadRes.headers.get('content-length')) || release.file_size_bytes || 0;
      let loadedBytes = 0;

      // Pipe to file
      const fileStream = fs.createWriteStream(targetPath);
      let reader;
      
      try {
        // Node 18+ fetch returns a web stream for the body
        if (downloadRes.body && typeof downloadRes.body.getReader === 'function') {
          reader = downloadRes.body.getReader();
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            if (!fileStream.write(value)) {
              await new Promise(resolve => fileStream.once('drain', resolve));
            }
            
            loadedBytes += value.length;

            if (eventPublisher) {
              const percent = totalBytes ? Math.round((loadedBytes / totalBytes) * 100) : 0;
              eventPublisher({ percent, loadedBytes, totalBytes });
            }
          }
        } else {
          // Fallback for older node-fetch environments if any
          throw new Error('Streaming download not supported in this environment.');
        }
      } catch (streamErr) {
        if (reader) await reader.cancel().catch(() => {});
        fileStream.destroy();
        throw streamErr;
      }

      return new Promise((resolve, reject) => {
        fileStream.on('error', reject);
        fileStream.end(() => {
          log(`[UpdateService] Download complete: ${targetPath}`);
          resolve({ success: true, filePath: targetPath });
        });
      });
      
    } catch (error) {
      log(`[UpdateService] Download error: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  async installUpdate(filePath) {
    log(`[UpdateService] Launching installer: ${filePath}`);
    try {
      if (!fs.existsSync(filePath)) {
        return { success: false, error: 'Installer file not found on disk.' };
      }
      
      const errMessage = await shell.openPath(filePath);
      if (errMessage) {
        return { success: false, error: errMessage };
      }
      return { success: true };
    } catch (error) {
      log(`[UpdateService] Install launch error: ${error.message}`);
      return { success: false, error: error.message };
    }
  }
}

module.exports = new UpdateService();
