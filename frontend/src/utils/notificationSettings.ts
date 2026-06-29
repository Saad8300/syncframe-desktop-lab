export interface NotificationSettings {
  inAppNotifications: boolean
  soundAlerts: boolean
  desktopNotifications: boolean
  renderCompleted: boolean
  renderFailed: boolean
  batchQueueCompleted: boolean
  batchJobFailed: boolean
  backendStatusAlerts: boolean
}

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  inAppNotifications: true,
  soundAlerts: false,
  desktopNotifications: false,
  renderCompleted: true,
  renderFailed: true,
  batchQueueCompleted: true,
  batchJobFailed: true,
  backendStatusAlerts: true
}

const SETTINGS_KEY = 'syncframe_notification_settings'

export function loadNotificationSettings(): NotificationSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return { ...DEFAULT_NOTIFICATION_SETTINGS }
    const parsed = JSON.parse(raw)
    
    // Merge with defaults in case of missing keys
    return {
      ...DEFAULT_NOTIFICATION_SETTINGS,
      ...parsed,
    }
  } catch (e) {
    console.error("Failed to load notification settings, returning defaults", e)
    return { ...DEFAULT_NOTIFICATION_SETTINGS }
  }
}

export function saveNotificationSettings(updates: Partial<NotificationSettings>): NotificationSettings {
  const current = loadNotificationSettings()
  const next = { ...current, ...updates }
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next))
  } catch (e) {
    console.error("Failed to save notification settings", e)
  }
  return next
}

export function resetNotificationSettings(): NotificationSettings {
  const defaults = { ...DEFAULT_NOTIFICATION_SETTINGS }
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(defaults))
  } catch (e) {
    console.error("Failed to reset notification settings", e)
  }
  return defaults
}
