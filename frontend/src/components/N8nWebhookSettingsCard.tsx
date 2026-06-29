import React, { useState, useEffect, useCallback } from 'react'
import {
  getN8nIntegrationSettings,
  saveN8nIntegrationSettings,
  testN8nWebhook,
  N8nIntegrationSettings,
} from '../utils/api'

// ── Tiny helpers ─────────────────────────────────────────────────────────────

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="relative flex-shrink-0 w-10 h-5 rounded-full transition-colors duration-200 focus:outline-none"
      style={{
        background: checked
          ? 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)'
          : 'var(--bg-input)',
        border: '1px solid var(--border-default)',
      }}
    >
      <span
        className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200"
        style={{ transform: checked ? 'translateX(20px)' : 'translateX(0)' }}
      />
    </button>
  )
}

function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 mt-1 mb-3">
      <span
        className="text-[10px] font-bold uppercase tracking-widest whitespace-nowrap"
        style={{ color: 'var(--text-muted)' }}
      >
        {label}
      </span>
      <div className="flex-1 h-px" style={{ background: 'var(--border-subtle)' }} />
    </div>
  )
}

function EventRow({
  label,
  description,
  checked,
  onChange,
  disabled = false,
}: {
  label: string
  description: string
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <label
      className={`flex items-center justify-between gap-4 py-2.5 px-3 rounded-xl transition-colors cursor-pointer group ${disabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-black/5 dark:hover:bg-white/5'}`}
    >
      <div className="min-w-0">
        <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          {label}
        </p>
        <p className="text-[11px] mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>
          {description}
        </p>
      </div>
      <Toggle checked={checked} onChange={disabled ? () => {} : onChange} />
    </label>
  )
}

// ── Default settings ──────────────────────────────────────────────────────────

const DEFAULT_EVENTS: N8nIntegrationSettings['n8n_events'] = {
  render_started: false,
  render_completed: true,
  render_failed: true,
  batch_queue_started: false,
  batch_queue_completed: true,
  batch_job_completed: false,
  batch_job_failed: true,
  backend_disconnected: true,
  backend_reconnected: true,
}

const DEFAULT_SETTINGS: N8nIntegrationSettings = {
  n8n_enabled: false,
  n8n_webhook_url: '',
  n8n_events: { ...DEFAULT_EVENTS },
  n8n_timeout_seconds: 10,
  n8n_retry_once: true,
  n8n_include_output_path: false,
  n8n_include_local_paths: false,
  last_delivery_status: null,
  last_delivery_at: null,
  last_delivery_error: null,
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function N8nWebhookSettingsCard() {
  const [settings, setSettings] = useState<N8nIntegrationSettings>(DEFAULT_SETTINGS)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [backendOffline, setBackendOffline] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle')
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [isEditingUrl, setIsEditingUrl] = useState(false)
  const [urlInput, setUrlInput] = useState('')
  const [urlError, setUrlError] = useState('')
  const [isN8nOpen, setIsN8nOpen] = useState(false)

  const load = useCallback(async () => {
    try {
      const data = await getN8nIntegrationSettings()
      setSettings(data)
      setUrlInput(data.n8n_webhook_url || '')
      setBackendOffline(false)
    } catch {
      setBackendOffline(true)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const save = async (updates: Partial<N8nIntegrationSettings>) => {
    setIsSaving(true)
    setSaveStatus('idle')
    try {
      const next = { ...settings, ...updates }
      const result = await saveN8nIntegrationSettings(next)
      setSettings(result.settings)
      setUrlInput(result.settings.n8n_webhook_url || '')
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 2500)
    } catch {
      setSaveStatus('error')
      setTimeout(() => setSaveStatus('idle'), 3000)
    } finally {
      setIsSaving(false)
    }
  }

  const handleToggleEnabled = (v: boolean) => save({ n8n_enabled: v })
  const handleEventChange = (key: keyof N8nIntegrationSettings['n8n_events'], v: boolean) => {
    const updated = { ...settings.n8n_events, [key]: v }
    save({ n8n_events: updated })
  }

  const handleSaveUrl = () => {
    const url = urlInput.trim()
    if (url && !url.startsWith('http://') && !url.startsWith('https://')) {
      setUrlError('URL must start with http:// or https://')
      return
    }
    setUrlError('')
    setIsEditingUrl(false)
    save({ n8n_webhook_url: url })
  }

  const handleTest = async () => {
    if (!settings.n8n_webhook_url) {
      setTestResult({ success: false, message: 'Please enter and save a webhook URL first.' })
      return
    }
    setIsTesting(true)
    setTestResult(null)
    try {
      const res = await testN8nWebhook()
      setTestResult({
        success: res.success,
        message: res.success ? (res.message || 'Delivered successfully!') : (res.error || 'Delivery failed.'),
      })
      // Refresh settings to get updated last_delivery_status
      const refreshed = await getN8nIntegrationSettings()
      setSettings(refreshed)
    } catch (e: any) {
      setTestResult({ success: false, message: e.message || 'Test failed.' })
    } finally {
      setIsTesting(false)
    }
  }

  const maskedUrl = settings.n8n_webhook_url_masked || (settings.n8n_webhook_url ? `${settings.n8n_webhook_url.slice(0, 20)}***` : '')

  const formatDate = (iso: string | null) => {
    if (!iso) return null
    try { return new Date(iso).toLocaleString() } catch { return iso }
  }

  return (
    <div className="rounded-2xl transition-all relative" style={{ border: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)' }}>
      {/* Header */}
      <div 
        className="flex items-center justify-between gap-4 p-4 cursor-pointer group select-none"
        onClick={() => setIsN8nOpen(p => !p)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-bold uppercase tracking-widest" style={{ color: 'var(--text-primary)' }}>
              n8n Webhook Integration
            </h3>
            <span
              className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full"
              style={{
                background: 'linear-gradient(135deg, rgba(99,102,241,0.15) 0%, rgba(139,92,246,0.15) 100%)',
                color: '#8b5cf6',
                border: '1px solid rgba(139,92,246,0.3)',
              }}
            >
              Advanced
            </span>
          </div>
          <p className="text-[11px] mt-1 max-w-lg" style={{ color: 'var(--text-muted)' }}>
            Send render, batch, and system events to n8n so you can trigger Telegram, email, Discord, or custom workflows.
          </p>
        </div>
        
        <div className="flex items-center gap-3 shrink-0">
          {/* Save status indicator */}
          <div className="text-[11px] font-bold h-7 flex items-center justify-end min-w-[60px]">
            {isSaving && <span style={{ color: 'var(--text-muted)' }}>Saving…</span>}
            {!isSaving && saveStatus === 'saved' && <span style={{ color: '#10b981' }}>✓ Saved</span>}
            {!isSaving && saveStatus === 'error' && <span style={{ color: '#ef4444' }}>✗ Error</span>}
          </div>
          <button className="p-1 rounded-lg transition-colors group-hover:bg-black/5 dark:group-hover:bg-white/5" style={{ color: 'var(--text-muted)' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: isN8nOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}><polyline points="6 9 12 15 18 9"></polyline></svg>
          </button>
        </div>
      </div>

      {/* Expanded Content */}
      {isN8nOpen && (
        <div className="p-5 pt-0 space-y-5 border-t animate-fade-in relative overflow-hidden" style={{ borderColor: 'var(--border-subtle)' }}>
          <div className="pt-5 space-y-5">

      {/* Backend offline warning */}
      {backendOffline && (
        <div
          className="p-3 rounded-xl text-xs font-semibold border"
          style={{ background: 'var(--color-error-bg)', borderColor: 'var(--color-error-border)', color: 'var(--color-error)' }}
        >
          ⚠ Backend is required to send n8n webhook notifications. Start the backend to configure.
        </div>
      )}

      {!backendOffline && (
        <>
          {/* Enable/Disable */}
          <label className="flex items-center justify-between gap-4 cursor-pointer">
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                Enable n8n Webhook
              </p>
              <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                Route app events to your n8n automation workflow
              </p>
            </div>
            <Toggle checked={settings.n8n_enabled} onChange={handleToggleEnabled} />
          </label>

          {/* Webhook URL */}
          <div>
            <SectionDivider label="Webhook URL" />
            <div
              className="rounded-xl p-1 border"
              style={{ background: 'var(--bg-input)', borderColor: 'var(--border-default)' }}
            >
              {isEditingUrl ? (
                <div className="flex items-center gap-2 p-2">
                  <input
                    type="text"
                    className="flex-1 bg-transparent text-sm outline-none font-mono"
                    style={{ color: 'var(--text-primary)' }}
                    placeholder="https://your-n8n-domain.com/webhook/syncframe-notifications"
                    value={urlInput}
                    onChange={e => { setUrlInput(e.target.value); setUrlError('') }}
                    onKeyDown={e => e.key === 'Enter' && handleSaveUrl()}
                    autoFocus
                  />
                  <button
                    onClick={handleSaveUrl}
                    className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold text-white"
                    style={{ background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)' }}
                  >
                    Save
                  </button>
                  <button
                    onClick={() => { setIsEditingUrl(false); setUrlInput(settings.n8n_webhook_url || ''); setUrlError('') }}
                    className="shrink-0 px-2 py-1.5 rounded-lg text-xs font-bold hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 p-2">
                  <span
                    className="flex-1 text-sm font-mono truncate"
                    style={{ color: maskedUrl ? 'var(--text-primary)' : 'var(--text-muted)' }}
                  >
                    {maskedUrl || 'No URL configured'}
                  </span>
                  <button
                    onClick={() => setIsEditingUrl(true)}
                    className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors hover:bg-black/10 dark:hover:bg-white/10"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {settings.n8n_webhook_url ? 'Edit' : 'Set URL'}
                  </button>
                </div>
              )}
            </div>
            {urlError && (
              <p className="text-[11px] mt-1.5 font-semibold" style={{ color: 'var(--color-error)' }}>{urlError}</p>
            )}
            <p className="text-[10px] mt-1.5 flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
              <span>🔒</span> URL is stored locally in the backend and never logged.
            </p>
          </div>

          {/* Test Webhook */}
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={handleTest}
              disabled={isTesting || !settings.n8n_webhook_url}
              className="px-4 py-2 rounded-lg text-xs font-bold transition-all border"
              style={{
                background: 'var(--bg-input)',
                color: 'var(--text-primary)',
                borderColor: 'var(--border-default)',
                opacity: !settings.n8n_webhook_url ? 0.5 : 1,
              }}
            >
              {isTesting ? '⏳ Testing…' : '⚡ Test Webhook'}
            </button>
            {testResult && (
              <span
                className="text-xs font-semibold px-3 py-1.5 rounded-lg border"
                style={{
                  color: testResult.success ? '#10b981' : '#ef4444',
                  background: testResult.success ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
                  borderColor: testResult.success ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)',
                }}
              >
                {testResult.success ? '✓' : '✗'} {testResult.message}
              </span>
            )}
          </div>

          {/* Last Delivery Status */}
          {settings.last_delivery_at && (
            <div
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-[11px] font-semibold border"
              style={{
                background: settings.last_delivery_status === 'success' ? 'rgba(16,185,129,0.06)' : 'rgba(239,68,68,0.06)',
                borderColor: settings.last_delivery_status === 'success' ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)',
                color: settings.last_delivery_status === 'success' ? '#10b981' : '#ef4444',
              }}
            >
              <span className="text-base leading-none">
                {settings.last_delivery_status === 'success' ? '✓' : '✗'}
              </span>
              <span>
                Last delivery: {settings.last_delivery_status === 'success' ? 'Success' : 'Failed'}
                {settings.last_delivery_error && ` — ${settings.last_delivery_error}`}
              </span>
              <span className="ml-auto" style={{ color: 'var(--text-muted)' }}>
                {formatDate(settings.last_delivery_at)}
              </span>
            </div>
          )}

          {/* Events */}
          <div>
            <SectionDivider label="Send Events" />
            <div className="space-y-0.5">
              <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>Render Events</p>
              <EventRow label="Render Started" description="When a video render begins" checked={settings.n8n_events.render_started} onChange={v => handleEventChange('render_started', v)} />
              <EventRow label="Render Completed" description="When a render finishes successfully" checked={settings.n8n_events.render_completed} onChange={v => handleEventChange('render_completed', v)} />
              <EventRow label="Render Failed" description="When a render encounters an error" checked={settings.n8n_events.render_failed} onChange={v => handleEventChange('render_failed', v)} />

              <p className="text-[10px] font-bold uppercase tracking-widest mt-4 mb-1" style={{ color: 'var(--text-muted)' }}>Batch Events</p>
              <EventRow label="Batch Queue Started" description="When the batch queue begins processing" checked={settings.n8n_events.batch_queue_started} onChange={v => handleEventChange('batch_queue_started', v)} />
              <EventRow label="Batch Queue Completed" description="Summary when the full queue finishes" checked={settings.n8n_events.batch_queue_completed} onChange={v => handleEventChange('batch_queue_completed', v)} />
              <EventRow label="Batch Job Completed" description="Per-job event (can be frequent)" checked={settings.n8n_events.batch_job_completed} onChange={v => handleEventChange('batch_job_completed', v)} />
              <EventRow label="Batch Job Failed" description="When an individual batch job fails" checked={settings.n8n_events.batch_job_failed} onChange={v => handleEventChange('batch_job_failed', v)} />

              <p className="text-[10px] font-bold uppercase tracking-widest mt-4 mb-1" style={{ color: 'var(--text-muted)' }}>System Events</p>
              <EventRow label="Backend Disconnected" description="When the backend goes offline" checked={settings.n8n_events.backend_disconnected} onChange={v => handleEventChange('backend_disconnected', v)} />
              <EventRow label="Backend Reconnected" description="When the backend comes back online" checked={settings.n8n_events.backend_reconnected} onChange={v => handleEventChange('backend_reconnected', v)} />
            </div>
          </div>

          {/* Advanced Options (collapsible) */}
          <div>
            <button
              onClick={() => setShowAdvanced(p => !p)}
              className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest transition-colors hover:opacity-70"
              style={{ color: 'var(--text-muted)' }}
            >
              <svg
                width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                strokeLinecap="round" strokeLinejoin="round"
                style={{ transform: showAdvanced ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
              Advanced Options
            </button>

            {showAdvanced && (
              <div className="mt-3 space-y-3 p-4 rounded-xl" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
                <label className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Retry Once on Failure</p>
                    <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>Retry the webhook once if the first attempt fails</p>
                  </div>
                  <Toggle checked={settings.n8n_retry_once} onChange={v => save({ n8n_retry_once: v })} />
                </label>

                <label className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Include Output File Path</p>
                    <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>Include local output file path in webhook payload</p>
                  </div>
                  <Toggle checked={settings.n8n_include_output_path} onChange={v => save({ n8n_include_output_path: v })} />
                </label>

                <label className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Include Local File Paths</p>
                    <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>Include local file paths in webhook payload (privacy risk)</p>
                  </div>
                  <Toggle checked={settings.n8n_include_local_paths} onChange={v => save({ n8n_include_local_paths: v })} />
                </label>

                <div className="flex items-center gap-3">
                  <label className="text-sm font-semibold shrink-0" style={{ color: 'var(--text-primary)' }}>
                    Timeout (seconds)
                  </label>
                  <input
                    type="number"
                    min={3}
                    max={60}
                    className="form-input w-20 text-sm"
                    value={settings.n8n_timeout_seconds}
                    onChange={e => save({ n8n_timeout_seconds: Math.max(3, Math.min(60, parseInt(e.target.value) || 10)) })}
                  />
                  <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>3–60 seconds</span>
                </div>
              </div>
            )}
          </div>
        </>
      )}

          </div>

          {/* Loading overlay */}
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center rounded-b-2xl" style={{ background: 'var(--bg-elevated)', opacity: 0.85 }}>
              <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--text-muted)' }}>
                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.3" />
                  <path d="M12 2a10 10 0 0110 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                </svg>
                Loading…
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
