import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import pkg from './package.json'

export default defineConfig({
  base: './',
  plugins: [react()],
  // Surfaced in Settings when running in a browser, where Electron's
  // app.getVersion() is unavailable. Read from package.json so the displayed
  // version cannot drift from the real one, which is what happened before:
  // the fallback sat at a hardcoded 1.0.0 across several releases.
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/outputs': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
})
