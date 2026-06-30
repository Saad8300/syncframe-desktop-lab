import React, { useEffect, useState } from 'react'
import { IconSettings } from './icons'
import {
  AppSettings, loadSettings, saveSettings, resetSettings, applyThemeMode,
  ThemeMode, AccentColor, StartupPage, ExportPreset,
  loadSidebarItems, saveSidebarItems, resetSidebarItems, SidebarItemId, ALL_SIDEBAR_ITEMS
} from '../utils/appSettings'
import {
  NotificationSettings, loadNotificationSettings, saveNotificationSettings, resetNotificationSettings
} from '../utils/notificationSettings'
import { testNotification, requestDesktopNotificationPermission } from '../utils/notifications'
import StudioPageHeader from './StudioPageHeader'

export default function StudioSettingsPage() {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [sidebarItems, setSidebarItems] = useState<SidebarItemId[]>(() => loadSidebarItems())
  const [notifSettings, setNotifSettings] = useState<NotificationSettings | null>(null)
  const [showNotifications, setShowNotifications] = useState(false)

  useEffect(() => {
    setSettings(loadSettings())
    setNotifSettings(loadNotificationSettings())
  }, [])

  if (!settings || !notifSettings) return null

  const updateSetting = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    const updated = saveSettings({ [key]: value })
    setSettings(updated)
    if (key === 'themeMode') {
      applyThemeMode(value as ThemeMode)
    }
  }

  const updateNotifSetting = async <K extends keyof NotificationSettings>(key: K, value: NotificationSettings[K]) => {
    // If enabling desktop notifications, request permission first
    if (key === 'desktopNotifications' && value === true) {
      const granted = await requestDesktopNotificationPermission()
      if (!granted) {
        alert("Desktop notifications are blocked or not supported by your browser.")
        return
      }
    }
    const updated = saveNotificationSettings({ [key]: value })
    setNotifSettings(updated)
  }

  const handleReset = () => {
    if (confirm("Are you sure you want to reset all settings to their defaults? Your history and generated files will not be deleted.")) {
      const reset = resetSettings()
      setSettings(reset)
      applyThemeMode(reset.themeMode)
      
      const resetNotif = resetNotificationSettings()
      setNotifSettings(resetNotif)
    }
  }

  // ── Sidebar helpers ──────────────────────────────────────────────────────────
  const saveSidebar = (items: SidebarItemId[]) => {
    setSidebarItems(items)
    saveSidebarItems(items)
    window.dispatchEvent(new Event('syncframe-sidebar-changed'))
  }

  const moveItem = (idx: number, dir: -1 | 1) => {
    const next = [...sidebarItems]
    const swap = idx + dir
    if (swap < 0 || swap >= next.length) return
    ;[next[idx], next[swap]] = [next[swap], next[idx]]
    saveSidebar(next)
  }

  const removeItem = (id: SidebarItemId) => {
    saveSidebar(sidebarItems.filter(i => i !== id))
  }

  const addItem = (id: SidebarItemId) => {
    if (!sidebarItems.includes(id)) saveSidebar([...sidebarItems, id])
  }

  const handleResetSidebar = () => {
    const reset = resetSidebarItems()
    setSidebarItems(reset)
    window.dispatchEvent(new Event('syncframe-sidebar-changed'))
  }

  const hiddenItems = ALL_SIDEBAR_ITEMS.filter(i => !sidebarItems.includes(i.id))

  return (
    <div className="w-full px-5 sm:px-8 py-8 space-y-8 pb-20 animate-fade-in" style={{ maxWidth: 900 }}>
      
      <StudioPageHeader
        icon={<IconSettings size={17} />}
        title="Settings"
        subtitle="Customize SyncFrame Studio preferences for your local workflow."
      />

      <div className="space-y-6">
        
        {/* Appearance */}
        <section className="card p-6 space-y-6">
          <h2 className="text-sm font-bold uppercase tracking-widest border-b pb-2 mb-2" style={{ color: 'var(--text-muted)', borderColor: 'var(--border-subtle)' }}>Appearance</h2>
          
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Theme Mode</p>
              <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>Toggle between light, dark, or system preference</p>
            </div>
            <select 
              className="form-select w-full sm:w-40 bg-[var(--bg-input)]"
              value={settings.themeMode}
              onChange={(e) => updateSetting('themeMode', e.target.value as ThemeMode)}
            >
              <option value="light">Light</option>
              <option value="dark">Dark</option>
              <option value="system">System Default</option>
            </select>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Accent Color</p>
              <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>Customize the primary app color</p>
            </div>
            <select 
              className="form-select w-full sm:w-40 bg-[var(--bg-input)]"
              value={settings.accentColor}
              onChange={(e) => updateSetting('accentColor', e.target.value as AccentColor)}
            >
              <option value="purple">Purple</option>
              <option value="blue">Blue</option>
              <option value="cyan">Cyan</option>
              <option value="green">Green</option>
              <option value="orange">Orange</option>
            </select>
          </div>
        </section>

        {/* Default Export Settings */}
        <section className="card p-6 space-y-6">
          <h2 className="text-sm font-bold uppercase tracking-widest border-b pb-2 mb-2" style={{ color: 'var(--text-muted)', borderColor: 'var(--border-subtle)' }}>Default Export Settings</h2>
          
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Default Export Preset</p>
              <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>Auto-apply specific aspect ratio and quality on fresh timelines</p>
            </div>
            <select 
              className="form-select w-full sm:w-48 bg-[var(--bg-input)]"
              value={settings.defaultExportPreset}
              onChange={(e) => updateSetting('defaultExportPreset', e.target.value as ExportPreset)}
            >
              <option value="default_1080p">Studio Default (1080p)</option>
              <option value="tiktok_4k">TikTok / Shorts 4K</option>
              <option value="tiktok_1080">TikTok / Shorts 1080p</option>
              <option value="youtube_4k">YouTube Landscape 4K</option>
              <option value="youtube_1080">YouTube Landscape 1080p</option>
              <option value="instagram_reel">Instagram Reel</option>
              <option value="square_post">Square Post</option>
              <option value="fast_test">Fast Test Render</option>
            </select>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Default Video Filename</p>
              <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>Base name for all timeline video exports</p>
            </div>
            <input 
              type="text" 
              className="form-input w-full sm:w-48 bg-[var(--bg-input)]" 
              value={settings.defaultVideoFilename}
              onChange={(e) => updateSetting('defaultVideoFilename', e.target.value)}
            />
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Default Audio Filename</p>
              <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>Base name for Audio Merger exports</p>
            </div>
            <input 
              type="text" 
              className="form-input w-full sm:w-48 bg-[var(--bg-input)]" 
              value={settings.defaultAudioFilename}
              onChange={(e) => updateSetting('defaultAudioFilename', e.target.value)}
            />
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Default Script Filename</p>
              <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>Base name for Script Timestamp exports</p>
            </div>
            <input 
              type="text" 
              className="form-input w-full sm:w-48 bg-[var(--bg-input)]" 
              value={settings.defaultScriptFilename}
              onChange={(e) => updateSetting('defaultScriptFilename', e.target.value)}
            />
          </div>
        </section>

        {/* Startup Behavior */}
        <section className="card p-6 space-y-6">
          <h2 className="text-sm font-bold uppercase tracking-widest border-b pb-2 mb-2" style={{ color: 'var(--text-muted)', borderColor: 'var(--border-subtle)' }}>Startup Behavior</h2>
          
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Open app to</p>
              <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>Choose the initial screen shown when starting the app</p>
            </div>
            <select 
              className="form-select w-full sm:w-40 bg-[var(--bg-input)]"
              value={settings.startupPage}
              onChange={(e) => updateSetting('startupPage', e.target.value as StartupPage)}
            >
              <option value="landing">Landing Page</option>
              <option value="studio-tools">Tools Page</option>
              <option value="last-used">Last Used Page</option>
            </select>
          </div>
        </section>

        {/* App Behavior */}
        <section className="card p-6 space-y-6">
          <h2 className="text-sm font-bold uppercase tracking-widest border-b pb-2 mb-2" style={{ color: 'var(--text-muted)', borderColor: 'var(--border-subtle)' }}>App Behavior</h2>
          
          <label className="flex items-center justify-between gap-4 cursor-pointer group">
            <div>
              <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Auto-open result after generation</p>
              <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>Automatically trigger preview when generation finishes</p>
            </div>
            <input 
              type="checkbox" 
              className="w-5 h-5 rounded border-[var(--border-default)] checked:bg-violet-500 cursor-pointer" 
              checked={settings.autoOpenResult}
              onChange={(e) => updateSetting('autoOpenResult', e.target.checked)}
            />
          </label>

          <label className="flex items-center justify-between gap-4 cursor-pointer group">
            <div>
              <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Confirm before clearing history</p>
              <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>Ask for confirmation before wiping the History log</p>
            </div>
            <input 
              type="checkbox" 
              className="w-5 h-5 rounded border-[var(--border-default)] checked:bg-violet-500 cursor-pointer"
              checked={settings.confirmBeforeClearHistory}
              onChange={(e) => updateSetting('confirmBeforeClearHistory', e.target.checked)}
            />
          </label>
        </section>

        {/* ── Notifications ── */}
        <section className="card p-6">
          <div 
            className="flex items-center justify-between gap-4 cursor-pointer group select-none"
            onClick={() => setShowNotifications(p => !p)}
          >
            <div>
              <div className="flex items-center gap-2 mb-1">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-muted)' }}><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>
                <h2 className="text-sm font-bold uppercase tracking-widest" style={{ color: 'var(--text-primary)' }}>Notifications</h2>
              </div>
              <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Control render alerts, batch updates, and sound alerts.</p>
            </div>
            <button className="p-1 rounded-lg transition-colors group-hover:bg-black/5 dark:group-hover:bg-white/5" style={{ color: 'var(--text-muted)' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: showNotifications ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}><polyline points="6 9 12 15 18 9"></polyline></svg>
            </button>
          </div>
          
          {showNotifications && (
            <div className="mt-6 pt-6 space-y-6 border-t animate-fade-in" style={{ borderColor: 'var(--border-subtle)' }}>
              <div className="space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>Delivery</h3>
                
                <label className="flex items-center justify-between gap-4 cursor-pointer group">
                  <div>
                    <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>In-App Notifications</p>
                    <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>Show toast alerts inside the app</p>
                  </div>
                  <input type="checkbox" className="w-5 h-5 rounded border-[var(--border-default)] checked:bg-violet-500 cursor-pointer"
                    checked={notifSettings.inAppNotifications} onChange={(e) => updateNotifSetting('inAppNotifications', e.target.checked)} />
                </label>

                <label className="flex items-center justify-between gap-4 cursor-pointer group">
                  <div>
                    <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Sound Alerts</p>
                    <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>Play a small chime for important events</p>
                  </div>
                  <input type="checkbox" className="w-5 h-5 rounded border-[var(--border-default)] checked:bg-violet-500 cursor-pointer"
                    checked={notifSettings.soundAlerts} onChange={(e) => updateNotifSetting('soundAlerts', e.target.checked)} />
                </label>

                <label className="flex items-center justify-between gap-4 cursor-pointer group">
                  <div>
                    <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Desktop Browser Notifications</p>
                    <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>Show native OS notifications when backgrounded</p>
                  </div>
                  <input type="checkbox" className="w-5 h-5 rounded border-[var(--border-default)] checked:bg-violet-500 cursor-pointer"
                    checked={notifSettings.desktopNotifications} onChange={(e) => updateNotifSetting('desktopNotifications', e.target.checked)} />
                </label>
              </div>

              <div className="w-full h-px" style={{ background: 'var(--border-subtle)' }} />

              <div className="space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>Render Events</h3>
                
                <label className="flex items-center justify-between gap-4 cursor-pointer group">
                  <div>
                    <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Render Completed</p>
                    <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>Notify when a single video finishes rendering</p>
                  </div>
                  <input type="checkbox" className="w-5 h-5 rounded border-[var(--border-default)] checked:bg-violet-500 cursor-pointer"
                    checked={notifSettings.renderCompleted} onChange={(e) => updateNotifSetting('renderCompleted', e.target.checked)} />
                </label>

                <label className="flex items-center justify-between gap-4 cursor-pointer group">
                  <div>
                    <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Render Failed</p>
                    <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>Notify if a video fails to generate</p>
                  </div>
                  <input type="checkbox" className="w-5 h-5 rounded border-[var(--border-default)] checked:bg-violet-500 cursor-pointer"
                    checked={notifSettings.renderFailed} onChange={(e) => updateNotifSetting('renderFailed', e.target.checked)} />
                </label>

                <label className="flex items-center justify-between gap-4 cursor-pointer group">
                  <div>
                    <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Batch Queue Completed</p>
                    <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>Notify when all jobs in the queue are done</p>
                  </div>
                  <input type="checkbox" className="w-5 h-5 rounded border-[var(--border-default)] checked:bg-violet-500 cursor-pointer"
                    checked={notifSettings.batchQueueCompleted} onChange={(e) => updateNotifSetting('batchQueueCompleted', e.target.checked)} />
                </label>

                <label className="flex items-center justify-between gap-4 cursor-pointer group">
                  <div>
                    <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Batch Job Failed</p>
                    <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>Notify if an individual job fails in the queue</p>
                  </div>
                  <input type="checkbox" className="w-5 h-5 rounded border-[var(--border-default)] checked:bg-violet-500 cursor-pointer"
                    checked={notifSettings.batchJobFailed} onChange={(e) => updateNotifSetting('batchJobFailed', e.target.checked)} />
                </label>
              </div>
              
              <div className="w-full h-px" style={{ background: 'var(--border-subtle)' }} />

              <div className="space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>System Events</h3>
                
                <label className="flex items-center justify-between gap-4 cursor-pointer group">
                  <div>
                    <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Backend Status Alerts</p>
                    <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>Notify when backend disconnects or reconnects</p>
                  </div>
                  <input type="checkbox" className="w-5 h-5 rounded border-[var(--border-default)] checked:bg-violet-500 cursor-pointer"
                    checked={notifSettings.backendStatusAlerts} onChange={(e) => updateNotifSetting('backendStatusAlerts', e.target.checked)} />
                </label>
              </div>

              <div className="pt-2">
                <button 
                  onClick={testNotification}
                  className="px-4 py-2 rounded-lg font-bold text-xs transition-colors border"
                  style={{ background: 'var(--bg-input)', color: 'var(--text-primary)', borderColor: 'var(--border-subtle)' }}
                >
                  Test Notification
                </button>
              </div>
            </div>
          )}
        </section>

        {/* ── Sidebar Menu Customization ── */}
        <section className="card p-6 space-y-5">
          <div className="flex items-center justify-between gap-4 border-b pb-3" style={{ borderColor: 'var(--border-subtle)' }}>
            <div>
              <h2 className="text-sm font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Sidebar Menu</h2>
              <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
                Choose which items appear in the sidebar and in what order. Changes apply immediately.
              </p>
            </div>
            <button
              onClick={handleResetSidebar}
              className="text-xs font-bold px-3 py-1.5 rounded-lg transition-colors hover:bg-black/5 dark:hover:bg-white/5 shrink-0"
              style={{ color: 'var(--text-secondary)', border: '1px solid var(--border-default)' }}
            >
              Reset Default
            </button>
          </div>

          {/* Visible items */}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest mb-2.5" style={{ color: 'var(--text-muted)' }}>
              Visible in Sidebar ({sidebarItems.length})
            </p>
            <div className="space-y-1.5">
              {sidebarItems.map((id, idx) => {
                const meta = ALL_SIDEBAR_ITEMS.find(i => i.id === id)
                return (
                  <div
                    key={id}
                    className="flex items-center gap-3 rounded-xl px-3 py-2.5 group transition-colors"
                    style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}
                  >
                    <div className="flex flex-col gap-0.5 shrink-0 opacity-40 group-hover:opacity-70">
                      {[0,1,2].map(i => <div key={i} style={{ width: 12, height: 1.5, background: 'var(--text-muted)', borderRadius: 1 }} />)}
                    </div>
                    <span className="text-[10px] font-black w-5 text-center tabular-nums" style={{ color: 'var(--text-muted)' }}>{idx + 1}</span>
                    <span className="flex-1 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{meta?.label ?? id}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => moveItem(idx, -1)}
                        disabled={idx === 0}
                        title="Move up"
                        className="p-1 rounded-lg transition-colors hover:bg-black/10 dark:hover:bg-white/10 disabled:opacity-25"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15"/></svg>
                      </button>
                      <button
                        onClick={() => moveItem(idx, 1)}
                        disabled={idx === sidebarItems.length - 1}
                        title="Move down"
                        className="p-1 rounded-lg transition-colors hover:bg-black/10 dark:hover:bg-white/10 disabled:opacity-25"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                      </button>
                      <button
                        onClick={() => removeItem(id)}
                        title="Remove from sidebar"
                        className="p-1 rounded-lg transition-colors hover:bg-red-500/10 ml-0.5"
                        style={{ color: 'var(--color-error)' }}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </button>
                    </div>
                  </div>
                )
              })}
              {sidebarItems.length === 0 && (
                <p className="text-xs text-center py-4" style={{ color: 'var(--text-muted)' }}>No items visible. Add items from the list below.</p>
              )}
            </div>
          </div>

          {/* Available to add */}
          {hiddenItems.length > 0 && (
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest mb-2.5" style={{ color: 'var(--text-muted)' }}>
                Available to Add
              </p>
              <div className="flex flex-wrap gap-2">
                {hiddenItems.map(item => (
                  <button
                    key={item.id}
                    onClick={() => addItem(item.id)}
                    className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg transition-all hover:scale-105 active:scale-95"
                    style={{ background: 'var(--accent-subtle)', color: 'var(--accent-primary)', border: '1px solid var(--accent-border)' }}
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Reset */}
        <section className="card p-6 border-red-500/20 bg-red-500/5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <p className="font-bold text-red-500 text-sm">Reset All Settings</p>
              <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>Restores default preferences. Does not delete history or files.</p>
            </div>
            <button 
              onClick={handleReset}
              className="px-4 py-2 rounded-lg font-bold text-sm bg-red-500 hover:bg-red-600 text-white transition-colors"
            >
              Reset Settings
            </button>
          </div>
        </section>

      </div>
    </div>
  )
}
