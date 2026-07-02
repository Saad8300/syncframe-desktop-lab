import { loadNotificationSettings } from './notificationSettings'

export type ToastType = 'success' | 'error' | 'warning' | 'info'

export interface ToastEventPayload {
  type: ToastType
  title: string
  message?: string
}

// Emits a custom event that the NotificationToastProvider will listen to
export function dispatchToast(type: ToastType, title: string, message?: string) {
  const payload: ToastEventPayload = { type, title, message }
  const event = new CustomEvent('syncframe-toast', { detail: payload })
  window.dispatchEvent(event)
}

// Simple Web Audio API beep (no external heavy sound files)
function playBeep() {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
    if (!AudioContextClass) return
    
    const ctx = new AudioContextClass()
    const osc = ctx.createOscillator()
    const gainNode = ctx.createGain()
    
    osc.type = 'sine'
    osc.frequency.setValueAtTime(880, ctx.currentTime) // A5
    osc.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.1) // slide to A6
    
    gainNode.gain.setValueAtTime(0, ctx.currentTime)
    gainNode.gain.linearRampToValueAtTime(0.15, ctx.currentTime + 0.05)
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3)
    
    osc.connect(gainNode)
    gainNode.connect(ctx.destination)
    
    osc.start()
    osc.stop(ctx.currentTime + 0.3)
  } catch (e) {
    // Fail silently if audio is blocked or fails
    console.debug('Failed to play notification sound', e)
  }
}

// Request desktop permission
export async function requestDesktopNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) {
    console.warn("Desktop notifications not supported in this browser.")
    return false
  }

  if (Notification.permission === 'granted') return true

  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission()
    return permission === 'granted'
  }
  
  return false
}

// Show desktop notification
function showDesktopNotification(title: string, body?: string) {
  if (!('Notification' in window)) return
  if (Notification.permission === 'granted') {
    new Notification(title, { body, icon: '/favicon.ico' }) // Assuming a favicon exists
  }
}

// The core trigger function
export function triggerNotification(
  type: ToastType,
  title: string,
  message?: string,
  forceOptions?: { sound?: boolean, desktop?: boolean } // Used by Test Notification
) {
  const settings = loadNotificationSettings()

  // 1. In-App Toast
  if (settings.inAppNotifications) {
    dispatchToast(type, title, message)
  }

  // 2. Sound Alert
  const playSound = forceOptions?.sound ?? settings.soundAlerts
  if (playSound) {
    playBeep()
  }

  // 3. Desktop Notification
  const showDesktop = forceOptions?.desktop ?? settings.desktopNotifications
  if (showDesktop) {
    showDesktopNotification(title, message)
  }
}

// ── Common Event Helpers ──────────────────────────────────────────────────

export function notifyRenderCompleted(outputName?: string) {
  const settings = loadNotificationSettings()
  if (!settings.renderCompleted) return
  
  const msg = outputName ? `File: ${outputName}` : undefined
  triggerNotification('success', 'Video render completed', msg)
}

export function notifyRenderFailed(error?: string) {
  const settings = loadNotificationSettings()
  if (!settings.renderFailed) return
  
  triggerNotification('error', 'Video render failed', error)
}

export function notifyBatchQueueCompleted(completedCount: number, failedCount: number) {
  const settings = loadNotificationSettings()
  if (!settings.batchQueueCompleted) return
  
  const total = completedCount + failedCount
  const msg = `${completedCount} completed, ${failedCount} failed out of ${total}.`
  triggerNotification(failedCount > 0 ? 'warning' : 'success', 'Batch queue completed', msg)
}

export function notifyBatchJobFailed(error?: string) {
  const settings = loadNotificationSettings()
  if (!settings.batchJobFailed) return
  
  triggerNotification('error', 'Batch job failed', error)
}

export function notifyBackendDisconnected() {
  const settings = loadNotificationSettings()
  if (!settings.backendStatusAlerts) return
  
  // For backend status, we don't usually need sound/desktop, but we respect the config if it's broad.
  // Actually, usually you don't want desktop alerts for temporary disconnections. 
  // We'll restrict backend alerts to in-app and sound only.
  if (settings.inAppNotifications) {
    dispatchToast('error', 'Backend connection lost')
  }
  if (settings.soundAlerts) {
    playBeep()
  }
}

export function notifyBackendReconnected() {
  const settings = loadNotificationSettings()
  if (!settings.backendStatusAlerts) return
  
  if (settings.inAppNotifications) {
    dispatchToast('success', 'Backend reconnected')
  }
  if (settings.soundAlerts) {
    playBeep()
  }
}

export function testNotification() {
  triggerNotification('success', 'SyncFrame Studio', 'Notifications are working.', {
    sound: true, 
    desktop: true
  })
}
