export type ThemeMode = 'light' | 'dark' | 'system'
export type AccentColor = 'purple' | 'blue' | 'cyan' | 'green' | 'orange'
export type StartupPage = 'landing' | 'studio-tools' | 'last-used'
export type ExportPreset = 'tiktok_1080' | 'tiktok_4k' | 'youtube_1080' | 'youtube_4k' | 'instagram_reel' | 'square_post' | 'fast_test' | 'default_1080p'

export type SidebarItemId =
  | 'dashboard'
  | 'tools'
  | 'history'
  | 'templates'
  | 'settings'
  | 'batch_video'
  | 'tool:image'
  | 'tool:video'
  | 'tool:media'
  | 'tool:audio_merger'
  | 'tool:script_timestamp'

export interface SidebarItem {
  id: SidebarItemId
  label: string
}

export const ALL_SIDEBAR_ITEMS: SidebarItem[] = [
  { id: 'dashboard',            label: 'Dashboard' },
  { id: 'tools',                label: 'Tools' },
  { id: 'history',              label: 'History' },
  { id: 'templates',            label: 'Templates' },
  { id: 'settings',             label: 'Settings' },
  { id: 'batch_video',          label: 'Batch Video Generator' },
  { id: 'tool:image',           label: 'Image Timeline' },
  { id: 'tool:video',           label: 'Video Timeline' },
  { id: 'tool:media',           label: 'Media Timeline' },
  { id: 'tool:audio_merger',    label: 'Audio Merger' },
  { id: 'tool:script_timestamp', label: 'Script Timestamp' },
]

export const DEFAULT_SIDEBAR_ITEMS: SidebarItemId[] = [
  'dashboard', 'tools', 'history', 'templates', 'settings',
]

export interface AppSettings {
  themeMode: ThemeMode
  accentColor: AccentColor
  startupPage: StartupPage
  defaultExportPreset: ExportPreset
  defaultVideoFilename: string
  defaultAudioFilename: string
  defaultScriptFilename: string
  autoOpenResult: boolean
  confirmBeforeClearHistory: boolean
  lastUsedPage: string
  sidebarMenu: SidebarItemId[]
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  themeMode: 'system',
  accentColor: 'purple',
  startupPage: 'landing',
  defaultExportPreset: 'default_1080p',
  defaultVideoFilename: 'my_video',
  defaultAudioFilename: 'merged_audio',
  defaultScriptFilename: 'script_timestamp',
  autoOpenResult: false,
  confirmBeforeClearHistory: true,
  lastUsedPage: 'landing',
  sidebarMenu: [...DEFAULT_SIDEBAR_ITEMS]
}

const STORAGE_KEY = 'syncframe_settings_v1'
const SIDEBAR_KEY = 'syncframe_sidebar_v1'

export function loadSettings(): AppSettings {
  try {
    const data = localStorage.getItem(STORAGE_KEY)
    if (data) {
      const parsed = JSON.parse(data)
      return { ...DEFAULT_APP_SETTINGS, ...parsed, sidebarMenu: loadSidebarItems() }
    }
  } catch (err) {
    console.error("Failed to load settings from localStorage", err)
  }
  
  // Migration from older keys
  try {
    const oldTheme = localStorage.getItem('theme')
    if (oldTheme === 'light' || oldTheme === 'dark') {
      const settings = { ...DEFAULT_APP_SETTINGS, themeMode: oldTheme as ThemeMode }
      saveSettings(settings)
      return settings
    }
  } catch (err) {
    // ignore
  }

  return { ...DEFAULT_APP_SETTINGS, sidebarMenu: loadSidebarItems() }
}

export function saveSettings(settings: Partial<AppSettings>): AppSettings {
  const current = loadSettings()
  const updated = { ...current, ...settings }
  try {
    // Don't persist sidebarMenu in the main key — it's managed by SIDEBAR_KEY
    const { sidebarMenu: _ignored, ...toStore } = updated
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore))
  } catch (err) {
    console.error("Failed to save settings to localStorage", err)
  }
  return updated
}

export function resetSettings(): AppSettings {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch (err) {
    console.error("Failed to reset settings", err)
  }
  return { ...DEFAULT_APP_SETTINGS }
}

export function applyThemeMode(mode: ThemeMode) {
  const root = document.documentElement
  let isDark = false

  if (mode === 'dark') {
    isDark = true
  } else if (mode === 'light') {
    isDark = false
  } else {
    // system
    isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
  }

  if (isDark) {
    root.classList.add('dark')
    root.classList.remove('light')
  } else {
    root.classList.remove('dark')
    root.classList.add('light')
  }
}

export function applyAccentColor(color: AccentColor) {
  const root = document.documentElement
  let primary, hover, subtle, glow, border, gradient
  switch (color) {
    case 'blue':
      primary = '#3b82f6'
      hover = '#2563eb'
      subtle = 'rgba(59, 130, 246, 0.10)'
      glow = 'rgba(59, 130, 246, 0.25)'
      border = 'rgba(59, 130, 246, 0.35)'
      gradient = 'linear-gradient(135deg, #3b82f6 0%, #06b6d4 100%)'
      break
    case 'cyan':
      primary = '#06b6d4'
      hover = '#0891b2'
      subtle = 'rgba(6, 182, 212, 0.10)'
      glow = 'rgba(6, 182, 212, 0.25)'
      border = 'rgba(6, 182, 212, 0.35)'
      gradient = 'linear-gradient(135deg, #06b6d4 0%, #10b981 100%)'
      break
    case 'green':
      primary = '#10b981'
      hover = '#059669'
      subtle = 'rgba(16, 185, 129, 0.10)'
      glow = 'rgba(16, 185, 129, 0.25)'
      border = 'rgba(16, 185, 129, 0.35)'
      gradient = 'linear-gradient(135deg, #10b981 0%, #84cc16 100%)'
      break
    case 'orange':
      primary = '#f97316'
      hover = '#ea580c'
      subtle = 'rgba(249, 115, 22, 0.10)'
      glow = 'rgba(249, 115, 22, 0.25)'
      border = 'rgba(249, 115, 22, 0.35)'
      gradient = 'linear-gradient(135deg, #f97316 0%, #f59e0b 100%)'
      break
    case 'purple':
    default:
      primary = '#6366f1'
      hover = '#4f46e5'
      subtle = 'rgba(99, 102, 241, 0.10)'
      glow = 'rgba(99, 102, 241, 0.25)'
      border = 'rgba(99, 102, 241, 0.35)'
      gradient = 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)'
      break
  }
  root.style.setProperty('--accent-primary', primary)
  root.style.setProperty('--accent-hover', hover)
  root.style.setProperty('--accent-subtle', subtle)
  root.style.setProperty('--accent-glow', glow)
  root.style.setProperty('--accent-border', border)
  root.style.setProperty('--accent-gradient', gradient)
}

// ── Sidebar customization helpers ─────────────────────────────────────────────

export function loadSidebarItems(): SidebarItemId[] {
  try {
    const raw = localStorage.getItem(SIDEBAR_KEY)
    if (raw) {
      const parsed: unknown = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.every(id => typeof id === 'string')) {
        const validIds = new Set(ALL_SIDEBAR_ITEMS.map(i => i.id))
        const filtered = (parsed as string[]).filter(id => validIds.has(id as SidebarItemId))
        if (filtered.length > 0) return filtered as SidebarItemId[]
      }
    }
  } catch { /* noop */ }
  return [...DEFAULT_SIDEBAR_ITEMS]
}

export function saveSidebarItems(items: SidebarItemId[]): void {
  try {
    localStorage.setItem(SIDEBAR_KEY, JSON.stringify(items))
  } catch (err) {
    console.error("Failed to save sidebar items", err)
  }
}

export function resetSidebarItems(): SidebarItemId[] {
  try { localStorage.removeItem(SIDEBAR_KEY) } catch { /* noop */ }
  return [...DEFAULT_SIDEBAR_ITEMS]
}
