const { contextBridge, ipcRenderer, shell } = require('electron');

contextBridge.exposeInMainWorld('syncframeDesktop', {
  // ── Auth bridge ──────────────────────────────────────────────────────────────
  // Called by AuthProvider when the custom protocol callback URL arrives from main.
  onAuthCallback: (callback) => {
    ipcRenderer.on('auth-callback', (_event, url) => callback(url));
  },

  // Called by AuthProvider to open the Google OAuth URL in the system browser.
  openExternalUrl: (url) => {
    shell.openExternal(url);
  },

  // Tells AuthProvider whether we are running in a packaged build.
  isPackaged: ipcRenderer.sendSync('is-packaged'),
});
