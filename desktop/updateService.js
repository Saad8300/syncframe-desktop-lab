const { app } = require('electron');
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

  async downloadUpdate() {
    log(`[UpdateService] downloadUpdate() placeholder called.`);
    // Phase 3 implementation
    return { success: false, error: 'Not implemented yet.' };
  }

  async installUpdate() {
    log(`[UpdateService] installUpdate() placeholder called.`);
    // Phase 3 implementation
    return { success: false, error: 'Not implemented yet.' };
  }
}

module.exports = new UpdateService();
