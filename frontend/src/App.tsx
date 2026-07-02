// App.tsx – SyncFrame Studio — Professional creator dashboard

import React, { useState, useEffect, useCallback } from 'react'
import { useAuth } from './auth/AuthProvider'
import { AuthModal } from './components/auth/AuthModal'
import AuthCallback from './auth/AuthCallback'
import FileDropZone from './components/FileDropZone'
import CsvGuide from './components/CsvGuide'
import StudioPageHeader from './components/StudioPageHeader'
import ResultsPanel from './components/ResultsPanel'
import ProgressOverlay from './components/ProgressOverlay'
import { type AppMode } from './components/AppModeSwitcher'
import VideoTimelinePage from './components/VideoTimelinePage'
import MediaTimelinePage from './components/MediaTimelinePage'
import LandingPage from './components/LandingPage'
import StudioLayout from './components/StudioLayout'
import StudioToolsPage from './components/StudioToolsPage'
import StudioDashboardPage from './components/StudioDashboardPage'
import StudioHistoryPage from './components/StudioHistoryPage'
import StudioSettingsPage from './components/StudioSettingsPage'
import StudioTemplatesPage from './components/StudioTemplatesPage'
import AudioMergerPage from './components/AudioMergerPage'
import ScriptTimestampPage from './components/ScriptTimestampPage'
import BatchVideoGeneratorPage from './components/BatchVideoGeneratorPage'
import PreflightCheck, { buildPreflightChecks } from './components/PreflightCheck'
import ExportPresetPanel from './components/ExportPresetPanel'
import { TextOverlayPanel } from './components/TextOverlayPanel'
import { AccessLimitModal } from './components/billing/AccessLimitModal'
import NotificationToastProvider from './components/NotificationToastProvider'
import { notifyBackendDisconnected, notifyBackendReconnected, notifyRenderCompleted, notifyRenderFailed } from './utils/notifications'
import {
  IconMusic,
  IconImage,
  IconFileText,
  IconLoader,
  IconSun,
  IconMoon,
  IconZap,
  IconSparkles,
  IconVideo,
  IconLayers,
  IconPlus,
} from './components/icons'
import type { GenerateSettings, GenerateResponse, GenerateStatus, JobStatus } from './types'
import { checkHealth, startJob, createImageTimelineBatchJob } from './utils/api'
import { loadSettings, applyThemeMode, applyAccentColor, saveSettings, AppSettings } from './utils/appSettings'
import { consumePendingTemplate, saveTemplate } from './utils/templateStore'
import { parseTimelineCsv } from './utils/timelineTimeParser'
import { usePlan } from './hooks/usePlan'
import { useCredits } from './hooks/useCredits'
import { canUseTool, Plan } from './lib/plans'
import { estimateCredits, reserveCredits, finalizeJob } from './lib/credits'
import type { ToolAccessResult } from './lib/plans'

// ── Default settings ────────────────────────────────────────────────────────

const DEFAULT_SETTINGS: GenerateSettings = {
  aspectRatio:      '9:16',
  exportResolution: '1080p',
  fitMode:          'cover',
  transition:       'none',
  zoomEffect:       'none',
  renderProfile:    'balanced',
  outputName:       'my_video',
  // Batch 9A — motion & style
  stylePreset:         'clean_default',
  motionEffect:        'none',
  motionIntensity:     'medium',
  transitionDuration:  '0.5',
  visualEffect:        'none',
  effectStrength:      'medium',
  // Batch 2 — background music
  enableBgMusic:    false,
  musicVolume:      12,
  musicFade:        true,
  // Batch 16A — Text Overlay
  textOverlayEnabled: false,
  textOverlayMode: 'whole_video',
  textOverlayItems: [],
  textOverlayText: '',
  textOverlayFontFamily: 'Inter',
  textOverlayFontSizePercent: 5,
  textOverlayFontWeight: 'Medium',
  textOverlayColor: '#FFFFFF',
  textOverlayOpacity: 100,
  textOverlayXPercent: 50,
  textOverlayYPercent: 88,
  textOverlayAlign: 'center',
  textOverlayMaxWidthPercent: 90,
  textOverlayShadowEnabled: true,
  textOverlayStrokeEnabled: false,
  textOverlayStrokeColor: '#000000',
  textOverlayBackgroundEnabled: false,
  textOverlayBackgroundColor: '#000000',
  textOverlayBackgroundOpacity: 50,
}

// ── Theme helpers ───────────────────────────────────────────────────────────

// Replaced by appSettings.ts

// ── Reusable select ─────────────────────────────────────────────────────────

function Sel<T extends string>({
  id, label, value, options, onChange, disabled,
}: {
  id: string; label: string; value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void; disabled?: boolean;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="form-label">{label}</label>
      <select
        id={id} value={value} disabled={disabled} className="form-select"
        onChange={e => onChange(e.target.value as T)}
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  )
}

// ── Workflow step indicator ─────────────────────────────────────────────────

type WorkflowStep = 1 | 2 | 3 | 4 | 5

const STEPS = [
  { n: 1, label: 'Upload'    },
  { n: 2, label: 'Configure' },
  { n: 3, label: 'Enhance'   },
  { n: 4, label: 'Generate'  },
  { n: 5, label: 'Export'    },
]

function WorkflowBar({ step }: { step: WorkflowStep }) {
  return (
    <div className="flex items-center gap-1">
      {STEPS.map((s, i) => {
        const done    = s.n < step
        const current = s.n === step
        return (
          <React.Fragment key={s.n}>
            <div className="flex items-center gap-1">
              <div
                className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-black transition-all"
                style={{
                  background: done    ? 'var(--color-success)'
                             : current ? 'var(--accent-primary)'
                             : 'var(--border-default)',
                  color: (done || current) ? '#fff' : 'var(--text-muted)',
                }}
              >
                {done ? '✓' : s.n}
              </div>
              <span
                className="text-[10px] font-semibold hidden sm:inline"
                style={{ color: current ? 'var(--text-primary)' : 'var(--text-muted)' }}
              >
                {s.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className="hidden sm:block h-px flex-1 min-w-[12px]"
                style={{ background: done ? 'var(--color-success)' : 'var(--border-subtle)' }}
              />
            )}
          </React.Fragment>
        )
      })}
    </div>
  )
}

// ── Status dot ──────────────────────────────────────────────────────────────

function StatusDot({ ok }: { ok: boolean | null }) {
  if (ok === null) return (
    <span className="flex items-center gap-1.5 text-[11px] font-medium" style={{ color: 'var(--text-muted)' }}>
      <IconLoader size={11} className="animate-spin" />
      Connecting
    </span>
  )
  if (ok) return (
    <span className="flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: 'var(--color-success)' }}>
      <span className="relative flex h-1.5 w-1.5">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: 'var(--color-success)' }} />
        <span className="relative inline-flex rounded-full h-1.5 w-1.5" style={{ background: 'var(--color-success)' }} />
      </span>
      Backend live
    </span>
  )
  return (
    <span className="flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: 'var(--color-error)' }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--color-error)' }} />
      Offline
    </span>
  )
}

// ── Summary chip row ────────────────────────────────────────────────────────

function SummaryChip({ label, value, active }: { label: string; value: string; active: boolean }) {
  return (
    <div
      className="flex items-center gap-1 px-2 py-1 rounded text-[10px]"
      style={{
        background: active ? 'var(--accent-subtle)' : 'var(--bg-input)',
        border: `1px solid ${active ? 'var(--accent-border)' : 'var(--border-subtle)'}`,
        color: active ? 'var(--accent-primary)' : 'var(--text-muted)',
        opacity: active ? 1 : 0.7,
      }}
    >
      <span className="font-semibold">{label}</span>
      <span className="opacity-70">·</span>
      <span>{value}</span>
    </div>
  )
}


// ── App ─────────────────────────────────────────────────────────────────────

export type ViewMode = 'landing' | 'tools' | 'dashboard' | 'history' | 'templates' | 'settings' | 'tool:image' | 'tool:video' | 'tool:media' | 'tool:audio_merger' | 'tool:script_timestamp' | 'tool:batch_video' | 'batch_video'

export default function App() {
  const { user, isAuthenticated, loading: authLoading, requireAuth } = useAuth()
  const { plan, loading: planLoading } = usePlan()
  const { remaining } = useCredits()

  // ── Auth: login gate ─────────────────────────────────────────────────────────
  // We no longer hard-block the entire app on login.
  // Instead, the AuthModal will appear when requireAuth() is called.


  const [appSettingsState, setAppSettingsState] = useState<AppSettings>(() => loadSettings())
  
  // Apply theme and accent on load and change
  useEffect(() => {
    applyThemeMode(appSettingsState.themeMode)
    applyAccentColor(appSettingsState.accentColor)
  }, [appSettingsState.themeMode, appSettingsState.accentColor])

  const toggleTheme = () => {
    // If it's system, we check current. If it's dark/light, we flip.
    const isCurrentlyDark = document.documentElement.classList.contains('dark')
    const newMode = isCurrentlyDark ? 'light' : 'dark'
    const newSettings = saveSettings({ themeMode: newMode })
    setAppSettingsState(newSettings)
    applyThemeMode(newMode)
  }

  const isWindows = typeof navigator !== 'undefined' && navigator.userAgent.includes('Windows')

  // Derive isDark for legacy prop passing to StudioLayout
  const isDark = appSettingsState.themeMode === 'dark' || (appSettingsState.themeMode === 'system' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches)

  // Initialize view mode based on startupPage setting
  const [activeView, setActiveView] = useState<ViewMode>(() => {
    const s = loadSettings()
    if (s.startupPage === 'landing') return 'landing'
    if (s.startupPage === 'studio-tools') return 'tools'
    if (s.startupPage === 'last-used') {
      const validTools = ['tools', 'dashboard', 'history', 'settings', 'tool:image', 'tool:video', 'tool:media', 'tool:audio_merger', 'tool:script_timestamp', 'tool:batch_video']
      if (validTools.includes(s.lastUsedPage)) {
        return s.lastUsedPage as ViewMode
      }
      return 'tools'
    }
    return 'landing'
  })

  const isTool = typeof activeView === 'string' && (activeView.startsWith('tool:') || activeView === 'batch_video')

  // Access Limit Modal state
  const [limitModalOpen, setLimitModalOpen] = useState(false)
  const [limitModalReason, setLimitModalReason] = useState('')
  const [limitModalRequiredPlan, setLimitModalRequiredPlan] = useState<string | undefined>(undefined)

  // Reset scroll position when navigating
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
    if (activeView === 'tool:image' || (isTool && activeView === 'tools')) {
      const pending = consumePendingTemplate('image')
      if (pending) {
        setSettings(s => ({ ...s, ...pending }))
      }
    }
  }, [activeView, isTool])

  const handleModeChange = (mode: ViewMode) => {
    setActiveView(mode)
    if (mode !== 'landing') {
      try { localStorage.setItem('appMode', mode) } catch { /* noop */ }
      
      // Update lastUsedPage
      saveSettings({ lastUsedPage: mode })
    }
  }

  const handleSaveAsTemplate = () => {
    const name = window.prompt('Enter template name:', 'My Image Template')
    if (name) {
      saveTemplate({
        name,
        tool: 'image',
        description: 'Saved from Image Timeline',
        settings
      })
      alert('Template saved to your templates library!')
    }
  }

  // ── File handling ──
  const [audioInputMode, setAudioInputMode] = useState<'single' | 'zip'>('single')
  const [audioFile, setAudioFile] = useState<File | null>(null)
  const [audioZip,  setAudioZip]  = useState<File | null>(null)
  const [imagesZip, setImagesZip]   = useState<File | null>(null)
  const [csvFile,   setCsvFile]     = useState<File | null>(null)
  const [audioDuration, setAudioDuration] = useState<number | null>(null)

  // Optional files
  const [introFile,    setIntroFile]    = useState<File | null>(null)
  const [outroFile,    setOutroFile]    = useState<File | null>(null)

  const handleCsvUpload = async (file: File | null) => {
    if (!file) {
      setCsvFile(null);
      return;
    }
    try {
      const text = await file.text();
      const result = parseTimelineCsv(text, 'image');
      if (!result.success) {
        alert("Invalid CSV:\n" + result.errors.join("\n"));
        setCsvFile(null);
        return;
      }
      
      if (result.warnings && result.warnings.length > 0) {
        const warningLines = result.warnings;
        let warningMsg = warningLines.slice(0, 10).join("\n");
        if (warningLines.length > 10) {
          warningMsg += `\n... and ${warningLines.length - 10} more warnings.`;
        }
        alert("Warnings:\n" + warningMsg);
      }
      
      const blob = new Blob([result.normalizedCsv], { type: 'text/csv' });
      const newFile = new File([blob], file.name, { type: 'text/csv' });
      setCsvFile(newFile);
    } catch (err) {
      alert("Failed to read CSV file.");
      setCsvFile(null);
    }
  };
  const [bgMusicFile,  setBgMusicFile]  = useState<File | null>(null)

  // Settings
  const [settings, setSettings] = useState<GenerateSettings>(() => {
    const s = loadSettings()
    return {
      ...DEFAULT_SETTINGS,
      outputName: s.defaultVideoFilename,
      exportResolution: s.defaultExportPreset.includes('4k') ? '4K' : '1080p',
      aspectRatio: s.defaultExportPreset.includes('tiktok') ? '9:16' : 
                   s.defaultExportPreset.includes('youtube') ? '16:9' : 
                   s.defaultExportPreset === 'instagram_reel' ? '9:16' :
                   s.defaultExportPreset === 'square_post' ? '1:1' : '9:16',
    }
  })

  // Generation state
  const [status,          setStatus]          = useState<GenerateStatus>('idle')
  const [currentJobId,    setCurrentJobId]    = useState<string | null>(null)
  const [activeClientJobId, setActiveClientJobId] = useState<string | null>(null)
  const [result,          setResult]          = useState<GenerateResponse | null>(null)
  const [healthOk,        setHealthOk]        = useState<boolean | null>(null)
  const [cancelledMsg,    setCancelledMsg]    = useState<string | null>(null)

  // Batch queue state
  const [isQueuing,       setIsQueuing]       = useState(false)
  const [queueSuccess,    setQueueSuccess]    = useState(false)
  const [refreshKey,      setRefreshKey]      = useState(0)

  // Health check
  useEffect(() => { checkHealth().then(setHealthOk) }, [])

  // Health check watch for notifications
  const [prevHealth, setPrevHealth] = useState<boolean | null>(null)
  
  useEffect(() => {
    if (healthOk !== prevHealth) {
      if (prevHealth === true && healthOk === false) {
        notifyBackendDisconnected()
      } else if (prevHealth === false && healthOk === true) {
        notifyBackendReconnected()
      }
      setPrevHealth(healthOk)
    }
  }, [healthOk, prevHealth])

  // Audio duration detection (single file only)
  useEffect(() => {
    if (audioInputMode !== 'single' || !audioFile) { setAudioDuration(null); return }
    const url = URL.createObjectURL(audioFile);
    const audio = new Audio(url);
    audio.onloadedmetadata = () => {
      setAudioDuration(audio.duration);
      URL.revokeObjectURL(url);
    };
    audio.onerror = () => {
      setAudioDuration(null);
      URL.revokeObjectURL(url);
    };
  }, [audioFile, audioInputMode])

  const canGenerate = (audioInputMode === 'single' ? audioFile !== null : audioZip !== null) && imagesZip !== null && csvFile !== null
    && status !== 'uploading' && status !== 'generating' && status !== 'cancelling'
  const isLoading   = status === 'uploading' || status === 'generating' || status === 'cancelling'

  // Determine current workflow step
  const workflowStep: WorkflowStep =
    result     ? 5 :
    isLoading  ? 4 :
    canGenerate? 4 :
    (audioInputMode === 'single' ? !!audioFile : !!audioZip) || imagesZip || csvFile ? 2 : 1

  // Generate
  const computeActiveSettings = (s: GenerateSettings) => {
    const isActive = s.textOverlayMode === 'whole_video' ? (s.textOverlayText || '').trim().length > 0
                   : s.textOverlayMode === 'timed_text' ? (s.textOverlayItems || []).length > 0
                   : s.textOverlayMode === 'csv_text';
    return { ...s, textOverlayEnabled: isActive };
  };

  const handleGenerate = async () => {
    if (!requireAuth()) return;
    if ((audioInputMode === 'single' ? !audioFile : !audioZip) || !imagesZip || !csvFile) return

    const durationSeconds = Math.max(1, Math.ceil(Number(audioDuration) || 60))

    const estimatedCredits = await estimateCredits('video_export', {
      resolution: settings.exportResolution,
      is_premium_template: false,
      duration_seconds: durationSeconds
    })

    const access = canUseTool(plan, remaining, 'video_export', {
      resolution: settings.exportResolution,
      is_premium_template: false,
      duration_seconds: durationSeconds
    }, estimatedCredits, planLoading)

    if (!access.allowed) {
      setLimitModalReason(access.reason)
      setLimitModalRequiredPlan(access.requiredPlan)
      setLimitModalOpen(true)
      return
    }

    const cjid = crypto.randomUUID()
    setActiveClientJobId(cjid)

    if (user) {
      try {
        await reserveCredits('video_export', durationSeconds, estimatedCredits, cjid, {
          resolution: settings.exportResolution,
          is_premium_template: false,
          duration_seconds: durationSeconds
        })
      } catch (err: any) {
        setActiveClientJobId(null)
        setLimitModalReason(err.message || "Internet connection is required to verify credits before starting this export.")
        setLimitModalRequiredPlan(undefined)
        setLimitModalOpen(true)
        return
      }
    }

    setStatus('uploading')
    try {
      const activeSettings = computeActiveSettings(settings);
      const { job_id } = await startJob(audioInputMode, audioFile, audioZip, imagesZip, csvFile, activeSettings, introFile, outroFile, bgMusicFile, estimatedCredits)
      setCurrentJobId(job_id); setStatus('generating')
    } catch (err) {
      if (user) {
        await finalizeJob(cjid, 'failed')
        setActiveClientJobId(null)
      }
      setResult({ success: false, errors: [String(err)], warnings: [], timeline_report: [] })
      setStatus('error')
    }
  }

  const handleAddToQueue = async () => {
    if (!requireAuth()) return;
    if ((audioInputMode === 'single' ? !audioFile : !audioZip) || !imagesZip || !csvFile) return

    const durationSeconds = Math.max(1, Math.ceil(Number(audioDuration) || 60))

    const estimatedCredits = await estimateCredits('video_export', {
      resolution: settings.exportResolution,
      is_premium_template: false,
      duration_seconds: durationSeconds
    })

    const access = canUseTool(plan, remaining, 'batch_video', {
      resolution: settings.exportResolution,
      is_batch: true
    }, 0, planLoading)
    if (!access.allowed) {
      setLimitModalReason(access.reason)
      setLimitModalRequiredPlan(access.requiredPlan)
      setLimitModalOpen(true)
      return
    }

    let cjid: string | null = null
    let reserved = false
    if (user) {
      cjid = crypto.randomUUID()
      try {
        await reserveCredits('video_export', durationSeconds, estimatedCredits, cjid, {
          resolution: settings.exportResolution,
          is_premium_template: false,
          duration_seconds: durationSeconds
        })
        reserved = true
      } catch (err: any) {
        setLimitModalReason(err.message || "Internet connection is required to verify credits before batching.")
        setLimitModalRequiredPlan(undefined)
        setLimitModalOpen(true)
        return
      }
    }

    setIsQueuing(true)
    setQueueSuccess(false)
    try {
      const activeSettings = computeActiveSettings(settings) as any;
      activeSettings.cjid = cjid
      activeSettings.estimated_credits = estimatedCredits
      await createImageTimelineBatchJob(audioInputMode, audioFile, audioZip, imagesZip, csvFile, activeSettings, introFile, outroFile, bgMusicFile, estimatedCredits)
      setQueueSuccess(true)
    } catch (err) {
      if (user && cjid && reserved) {
        await finalizeJob(cjid, 'failed').catch(console.error)
      }
      alert("Failed to add to queue: " + err)
    } finally {
      setIsQueuing(false)
    }
  }

  const handleJobComplete = useCallback(async (jobStatus: JobStatus) => {
    if (jobStatus.status === 'completed') {
      if (user && activeClientJobId) {
        await finalizeJob(activeClientJobId, 'success')
        setActiveClientJobId(null)
      }
      setResult({
        success: true,
        job_id: jobStatus.job_id,
        elapsed_seconds: jobStatus.elapsed_seconds,
        output_video_url: jobStatus.output_video_url ?? undefined,
        output_filename: jobStatus.output_filename ?? undefined,
        timeline_report: jobStatus.timeline_report,
        warnings: jobStatus.warnings,
        errors:   jobStatus.errors,
      })
      setStatus('done')
      notifyRenderCompleted(jobStatus.output_filename ?? undefined)
    } else {
      if (user && activeClientJobId) {
        await finalizeJob(activeClientJobId, 'failed')
        setActiveClientJobId(null)
      }
      setResult({
        success: false,
        errors:  jobStatus.errors.length ? jobStatus.errors : ['Video generation failed.'],
        warnings: jobStatus.warnings,
        timeline_report: jobStatus.timeline_report,
      })
      setStatus('error')
      notifyRenderFailed(jobStatus.errors[0] || 'Unknown error')
    }
  }, [user, activeClientJobId])

  const handleCancelled = useCallback(async () => {
    setCurrentJobId(null);
    setStatus('idle')
    setCancelledMsg("Render cancelled successfully.")
    setTimeout(() => setCancelledMsg(null), 4000)
    setResult(null)
    
    if (user && activeClientJobId) {
      await finalizeJob(activeClientJobId, 'cancelled')
      setActiveClientJobId(null)
    }
  }, [user, activeClientJobId])

  // Derived
  const isAuthCallback =
    typeof window !== 'undefined' &&
    (window.location.pathname === '/auth/callback' ||
      window.location.hash.includes('access_token') ||
      window.location.search.includes('code='))

  if (isAuthCallback) {
    return <AuthCallback />
  }

  if (authLoading) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        background: '#080c14', color: '#f1f5f9',
        fontFamily: "'Inter', system-ui, sans-serif", gap: '1.5rem',
      }}>
        <svg width="44" height="44" viewBox="0 0 24 24" fill="none">
          <polygon points="13,2 4.5,13.5 11,13.5 11,22 19.5,10.5 13,10.5" fill="url(#loadGrad)" />
          <defs>
            <linearGradient id="loadGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#06b6d4" />
              <stop offset="100%" stopColor="#6366f1" />
            </linearGradient>
          </defs>
        </svg>
        <div style={{ width: 36, height: 36, border: '3px solid rgba(99,102,241,0.25)', borderTop: '3px solid #6366f1', borderRadius: '50%', animation: 'appSpin 0.7s linear infinite' }} />
        <style>{`@keyframes appSpin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  if (activeView === 'landing') {
    return <LandingPage onEnterStudio={() => setActiveView('dashboard')} onViewTools={() => setActiveView('tools')} />
  }

  return (
    <>
      <NotificationToastProvider />
      <AuthModal />
      <StudioLayout
        activeTab={activeView}
        onNavigate={(v) => setActiveView(v as ViewMode)}
        isDark={isDark}
        toggleTheme={toggleTheme}
        backendStatus={<StatusDot ok={healthOk} />}
      >
        {/* ── Progress overlay ── */}
      {currentJobId && (
        <ProgressOverlay
          jobId={currentJobId}
          onJobComplete={handleJobComplete}
          onCancelled={handleCancelled}
          onClose={() => setCurrentJobId(null)}
          renderSpec={{
            resolution:    settings.exportResolution,
            renderProfile: settings.renderProfile,
          }}
        />
      )}

      {/* ── Upload-only overlay ── */}
      {status === 'uploading' && !currentJobId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center animate-fade-in" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}>
          <div
            className="w-72 text-center space-y-4 p-8 rounded-2xl"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)' }}
          >
            <div
              className="w-14 h-14 mx-auto rounded-2xl flex items-center justify-center"
              style={{ background: 'var(--accent-subtle)', border: '1px solid var(--accent-border)' }}
            >
              <IconLoader size={22} className="animate-spin" style={{ color: 'var(--accent-primary)' }} />
            </div>
            <div>
              <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Uploading files…</h3>
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Sending to server</p>
            </div>
            <div className="w-full h-1 rounded-full overflow-hidden" style={{ background: 'var(--bg-input)' }}>
              <div className="h-full rounded-full" style={{ background: 'var(--accent-primary)', animation: 'progressIndeterminate 1.8s ease-in-out infinite' }} />
            </div>
          </div>
          <style>{`
            @keyframes progressIndeterminate {
              0%   { width: 0%;   margin-left: 0%; }
              50%  { width: 60%;  margin-left: 20%; }
              100% { width: 0%;   margin-left: 100%; }
            }
          `}</style>
        </div>
      )}

      {/* ── Alerts ── */}
      {healthOk === false && (
        <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 pt-4">
          <div className="alert-error">
            <span className="text-sm">⚠</span>
            <div className="text-xs">
              <p className="font-semibold">Backend server is not running</p>
              <p className="mt-0.5 opacity-80">
                Start the app with <strong>{isWindows ? 'start_windows.bat' : 'start_app.command'}</strong> or run the backend manually.
              </p>
            </div>
          </div>
        </div>
      )}

      {cancelledMsg && (
        <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 pt-4">
          <div className="alert-warning animate-fade-in">
            <span>ℹ</span>
            <p className="text-xs">{cancelledMsg}</p>
          </div>
        </div>
      )}

      {/* ── View Router ── */}
      <div key={`${activeView}-${refreshKey}`} className="animate-fade-in-up flex-1 flex flex-col min-w-0">
        {/* Safe fallback for unknown views */}
        {![
          'landing', 'tools', 'dashboard', 'history', 'templates', 'settings',
          'tool:audio_merger', 'tool:script_timestamp', 'tool:media', 
          'tool:batch_video', 'batch_video', 'tool:video', 'tool:image'
        ].includes(activeView as string) && <StudioToolsPage onSelectTool={v => setActiveView(`tool:${v}` as ViewMode)} />}
        {activeView === 'tools' && <StudioToolsPage onSelectTool={v => setActiveView(`tool:${v}` as ViewMode)} />}
        {activeView === 'dashboard' && <StudioDashboardPage />}
        {activeView === 'history' && <StudioHistoryPage />}
        {activeView === 'templates' && <StudioTemplatesPage onUseTemplate={(tool) => setActiveView(`tool:${tool}` as ViewMode)} />}
        {activeView === 'settings' && <StudioSettingsPage />}

      {/* ── Back Navigation for Tools ── */}
      {isTool && (
        <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 pt-5 pb-1">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveView('tools')}
              className="inline-flex items-center gap-1.5 text-xs font-medium transition-colors cursor-pointer rounded-lg px-2.5 py-1.5"
              style={{
                color: 'var(--text-secondary)',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-subtle)'
              }}
              onMouseEnter={e => {
                e.currentTarget.style.color = 'var(--accent-primary)'
                e.currentTarget.style.borderColor = 'var(--accent-border)'
                e.currentTarget.style.background = 'var(--accent-subtle)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.color = 'var(--text-secondary)'
                e.currentTarget.style.borderColor = 'var(--border-subtle)'
                e.currentTarget.style.background = 'var(--bg-elevated)'
              }}
            >
              <span aria-hidden="true">&larr;</span> Back
            </button>
            <button
              onClick={() => {
                if (activeView === 'tool:image') {
                  setAudioInputMode('single')
                  setAudioFile(null)
                  setAudioZip(null)
                  setImagesZip(null)
                  setCsvFile(null)
                  setIntroFile(null)
                  setOutroFile(null)
                  setBgMusicFile(null)
                  setResult(null)
                  setStatus('idle')
                  setCancelledMsg(null)
                  setQueueSuccess(false)
                  setIsQueuing(false)
                  setCurrentJobId(null)
                }
                setRefreshKey(k => k + 1)
              }}
              title="Refresh page"
              aria-label="Refresh page"
              className="inline-flex items-center justify-center w-7 h-7 rounded-lg transition-colors cursor-pointer"
              style={{
                color: 'var(--text-secondary)',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-subtle)'
              }}
              onMouseEnter={e => {
                e.currentTarget.style.color = 'var(--accent-primary)'
                e.currentTarget.style.borderColor = 'var(--accent-border)'
                e.currentTarget.style.background = 'var(--accent-subtle)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.color = 'var(--text-secondary)'
                e.currentTarget.style.borderColor = 'var(--border-subtle)'
                e.currentTarget.style.background = 'var(--bg-elevated)'
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="23 4 23 10 17 10" />
                <polyline points="1 20 1 14 7 14" />
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {activeView === 'tool:audio_merger' && <AudioMergerPage />}
      {activeView === 'tool:script_timestamp' && <ScriptTimestampPage />}
      {activeView === 'tool:media' && <MediaTimelinePage />}
      {(activeView === 'tool:batch_video' || activeView === 'batch_video') && <BatchVideoGeneratorPage />}
      {activeView === 'tool:video' && <VideoTimelinePage />}

      {activeView === 'tool:image' && (
        <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-6">
                <StudioPageHeader
                  icon={<IconLayers size={17} />}
                  title="Image Timeline"
                  subtitle="Create videos from images, audio, and timestamp CSV files."
                />
                <div className="flex flex-col xl:flex-row gap-6 items-start mt-6">
        
                  {/* ── LEFT COLUMN ── */}
                  <div className="flex-1 min-w-0 space-y-6">
        
                    {/* Audio duration warning */}
                    {audioDuration !== null && audioDuration > 600 && (
                      <div className="alert-warning animate-fade-in">
                        <span>⚠</span>
                        <p className="text-xs">
                          {audioDuration > 1200
                            ? 'This audio is very long (>20 min). Generation may take a long time depending on your settings and computer.'
                            : 'Long audio detected (>10 min). Use 720p Fast Preview to check timing before your final 1080p export.'}
                        </p>
                      </div>
                    )}
        
                    {/* Source Files card */}
                    <div className="card p-5 space-y-5">
                      <div className="flex items-center justify-between">
                        <div>
                          <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Source Files</h2>
                          <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>Three required files to generate your video</p>
                        </div>
                      </div>
        
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {audioInputMode === 'single' ? (
                          <FileDropZone
                            id="audio-upload-single"
                            label="Main Audio"
                            description="Upload one main audio file"
                            accept="audio/*,.mp3,.wav,.m4a,.aac"
                            icon={<IconMusic size={14} />}
                            file={audioFile}
                            onChange={setAudioFile}
                            disabled={isLoading}
                            required
                          />
                        ) : (
                          <FileDropZone
                            id="audio-upload-zip"
                            label="Audio Parts ZIP"
                            description="ZIP of 1.mp3, 2.mp3..."
                            accept=".zip,application/zip"
                            icon={<IconFileText size={14} />}
                            file={audioZip}
                            onChange={setAudioZip}
                            disabled={isLoading}
                            required
                          />
                        )}
                        <FileDropZone
                          id="images-upload"
                          label="Images ZIP"
                          description="1.jpg, 2.jpg…"
                          accept=".zip,application/zip"
                          icon={<IconImage size={14} />}
                          file={imagesZip}
                          onChange={setImagesZip}
                          disabled={isLoading}
                          required
                        />
                        <FileDropZone
                          id="csv-upload"
                          label="Timestamp CSV"
                          description="image, start, end columns"
                          accept=".csv,text/csv"
                          icon={<IconFileText size={14} />}
                          file={csvFile}
                          onChange={handleCsvUpload}
                          disabled={isLoading}
                          required
                        />
                      </div>
        
                      <div className="flex justify-start">
                        <div className="flex gap-2 p-1 bg-[var(--bg-input)] rounded-lg w-full sm:w-1/3">
                          <button
                            className={`flex-1 text-[11px] font-medium py-1.5 rounded-md transition-colors ${audioInputMode === 'single' ? 'bg-[var(--bg-elevated)] shadow-sm text-[var(--text-primary)]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}
                            onClick={() => setAudioInputMode('single')}
                          >
                            Single File
                          </button>
                          <button
                            className={`flex-1 text-[11px] font-medium py-1.5 rounded-md transition-colors ${audioInputMode === 'zip' ? 'bg-[var(--bg-elevated)] shadow-sm text-[var(--text-primary)]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}
                            onClick={() => setAudioInputMode('zip')}
                          >
                            Parts ZIP
                          </button>
                        </div>
                      </div>
                      <div className="pt-2">
                        <div className="flex items-center gap-2 mt-1 mb-3">
                          <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Optional Appends</span>
                          <div className="flex-1 h-px" style={{ background: 'var(--border-subtle)' }} />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <FileDropZone id="intro-upload" label="Intro Video" description="Appended before timeline" accept="video/mp4,video/quicktime,video/webm"
                            icon={<IconVideo size={14} />} file={introFile} onChange={setIntroFile} disabled={isLoading} />
                          <FileDropZone id="outro-upload" label="Outro Video" description="Appended after timeline" accept="video/mp4,video/quicktime,video/webm"
                            icon={<IconVideo size={14} />} file={outroFile} onChange={setOutroFile} disabled={isLoading} />
                        </div>
                      </div>
                    </div>
        
                    {/* Export Preset card */}
                    <div className="card p-5">
                      <ExportPresetPanel
                        idPrefix="img"
                        disabled={isLoading}
                        current={{
                          aspectRatio:   settings.aspectRatio,
                          resolution:    settings.exportResolution,
                          renderProfile: settings.renderProfile,
                          motionEffect:  settings.motionEffect,
                          transition:    settings.transition,
                          visualEffect:  settings.visualEffect,
                        }}
                        onApply={vals => setSettings(s => ({
                          ...s,
                          aspectRatio:      vals.aspectRatio,
                          exportResolution: vals.resolution,
                          renderProfile:    vals.renderProfile,
                          motionEffect:     vals.motionEffect,
                          transition:       vals.transition,
                          visualEffect:     vals.visualEffect,
                        }))}
                      />
                    </div>
        
                    {/* Video Settings card */}
                    <div className="card p-5 space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Video Settings</h2>
                          <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>Configure core dimensions and playback behaviors.</p>
                        </div>
                        <button onClick={handleSaveAsTemplate} className="text-[10px] font-bold px-2 py-1 bg-[var(--bg-input)] hover:bg-[var(--accent-primary)] hover:text-white rounded border border-[var(--border-subtle)] transition-colors">
                          Save as Template
                        </button>
                      </div>
        
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        <Sel id="aspect-ratio" label="Aspect Ratio" value={settings.aspectRatio} disabled={isLoading} onChange={v => setSettings({...settings, aspectRatio: v as any})}
                          options={[ { value: '9:16', label: '9:16 Vertical' }, { value: '16:9', label: '16:9 Landscape' }, { value: '1:1', label: '1:1 Square' } ]} />
                        
                        <Sel id="export-resolution" label="Resolution" value={settings.exportResolution} disabled={isLoading} onChange={v => setSettings({...settings, exportResolution: v as any})}
                          options={[ { value: '720p', label: '720p Fast' }, { value: '1080p', label: '1080p HD' }, { value: '2K', label: '2K Sharp' }, { value: '4K', label: '4K Ultra' } ]} />
        
                        <Sel id="fit-mode" label="Fit Mode" value={settings.fitMode} disabled={isLoading} onChange={v => setSettings({...settings, fitMode: v as any})}
                          options={[ { value: 'cover', label: 'Cover (Crop)' }, { value: 'contain', label: 'Contain (Pad)' } ]} />
        
                        <Sel id="render-profile" label="Render Profile" value={settings.renderProfile} disabled={isLoading} onChange={v => setSettings({...settings, renderProfile: v as any})}
                          options={[ { value: 'fast_preview', label: 'Fast Preview' }, { value: 'balanced', label: 'Balanced' }, { value: 'high_quality', label: 'High Quality' } ]} />
                      </div>
        
                      <div className="space-y-1">
                        <label htmlFor="output-name" className="form-label">Output Filename</label>
                        <div className="flex items-center gap-2">
                          <input
                            id="output-name" type="text" value={settings.outputName} disabled={isLoading}
                            onChange={e => setSettings({...settings, outputName: e.target.value})}
                            placeholder="my_video"
                            className="form-input flex-1"
                          />
                          <span className="text-[10px] font-mono shrink-0 px-2 py-1.5 rounded-md" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
                            .mp4
                          </span>
                        </div>
                      </div>
                    </div>
        
                    {/* Timeline Styling / Motion card */}
                    <div className="card p-5 space-y-4">
                      <div>
                        <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Timeline Styling / Motion</h2>
                        <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>Apply transitions and motion to your media.</p>
                      </div>
        
                      <div className="grid grid-cols-2 gap-4">
                        <Sel id="style-preset" label="Style Preset" value={settings.stylePreset} disabled={isLoading} onChange={v => {
                            const preset = v as any;
                            const map: Record<string, any> = {
                              clean_default: { motionEffect: 'slow_zoom_in', motionIntensity: 'medium', transition: 'fade', transitionDuration: '0.5', visualEffect: 'none', effectStrength: 'medium' },
                              youtube_documentary: { motionEffect: 'ken_burns', motionIntensity: 'medium', transition: 'crossfade', transitionDuration: '0.8', visualEffect: 'cinematic', effectStrength: 'medium' },
                              tiktok_reels: { motionEffect: 'dynamic_shorts', motionIntensity: 'high', transition: 'flash', transitionDuration: '0.2', visualEffect: 'high_contrast', effectStrength: 'medium' },
                              cinematic_story: { motionEffect: 'ken_burns', motionIntensity: 'medium', transition: 'fade_black', transitionDuration: '0.8', visualEffect: 'cinematic', effectStrength: 'medium' },
                              news_report: { motionEffect: 'pan_left', motionIntensity: 'low', transition: 'fade', transitionDuration: '0.5', visualEffect: 'clean_bright', effectStrength: 'low' },
                              calm_educational: { motionEffect: 'slow_zoom_in', motionIntensity: 'low', transition: 'crossfade', transitionDuration: '0.8', visualEffect: 'clean_bright', effectStrength: 'low' },
                              dramatic_shorts: { motionEffect: 'dynamic_shorts', motionIntensity: 'high', transition: 'zoom_in', transitionDuration: '0.2', visualEffect: 'high_contrast', effectStrength: 'high' }
                            };
                            const cfg = map[preset];
                            setSettings({
                              ...settings,
                              stylePreset: preset,
                              ...cfg,
                              zoomEffect: cfg.motionEffect === 'slow_zoom_in' ? 'slow_zoom_in' : 'none'
                            });
                          }}
                          options={[
                            { value: 'clean_default', label: 'Clean Default' },
                            { value: 'youtube_documentary', label: 'YouTube Documentary' },
                            { value: 'tiktok_reels', label: 'TikTok / Reels Dynamic' },
                            { value: 'cinematic_story', label: 'Cinematic Story' },
                            { value: 'news_report', label: 'News / Report Style' },
                            { value: 'calm_educational', label: 'Calm Educational' },
                            { value: 'dramatic_shorts', label: 'Dramatic Shorts' }
                          ]} />
                      </div>
        
                      <div className="grid grid-cols-2 gap-4">
                        <Sel id="motion-effect" label="Motion Effect" value={settings.motionEffect} disabled={isLoading} onChange={v => setSettings({...settings, motionEffect: v as any, zoomEffect: v === 'slow_zoom_in' ? 'slow_zoom_in' : 'none'})}
                          options={[
                            { value: 'none', label: 'None' }, { value: 'slow_zoom_in', label: 'Slow Zoom In' }, { value: 'slow_zoom_out', label: 'Slow Zoom Out' },
                            { value: 'ken_burns', label: 'Ken Burns' }, { value: 'pan_left', label: 'Pan Left' }, { value: 'pan_right', label: 'Pan Right' },
                            { value: 'pan_up', label: 'Pan Up' }, { value: 'pan_down', label: 'Pan Down' }, { value: 'subtle_random', label: 'Subtle Random' },
                            { value: 'dynamic_shorts', label: 'Dynamic Shorts' }
                          ]} />
        
                        <Sel id="motion-intensity" label="Motion Intensity" value={settings.motionIntensity} disabled={isLoading} onChange={v => setSettings({...settings, motionIntensity: v as any})}
                          options={[ { value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' }, { value: 'high', label: 'High' } ]} />
        
                        <Sel id="transition" label="Transition" value={settings.transition} disabled={isLoading} onChange={v => setSettings({...settings, transition: v as any})}
                          options={[
                            { value: 'none', label: 'None' }, { value: 'fade', label: 'Fade' }, { value: 'crossfade', label: 'Crossfade' },
                            { value: 'fade_black', label: 'Fade to Black' }, { value: 'fade_white', label: 'Fade to White' }, { value: 'slide_left', label: 'Slide Left' },
                            { value: 'slide_right', label: 'Slide Right' }, { value: 'slide_up', label: 'Slide Up' }, { value: 'slide_down', label: 'Slide Down' },
                            { value: 'push_left', label: 'Push Left' }, { value: 'push_right', label: 'Push Right' }, { value: 'zoom_in', label: 'Zoom In' },
                            { value: 'zoom_out', label: 'Zoom Out' }, { value: 'blur_crossfade', label: 'Blur Crossfade' }, { value: 'flash', label: 'Flash' }
                          ]} />
        
                        <Sel id="transition-duration" label="Transition Duration" value={settings.transitionDuration} disabled={isLoading} onChange={v => setSettings({...settings, transitionDuration: v as any})}
                          options={[ { value: '0.2', label: '0.2s' }, { value: '0.5', label: '0.5s' }, { value: '0.8', label: '0.8s' }, { value: '1.0', label: '1.0s' } ]} />
        
                        <Sel id="visual-effect" label="Visual Style" value={settings.visualEffect} disabled={isLoading} onChange={v => setSettings({...settings, visualEffect: v as any})}
                          options={[
                            { value: 'none', label: 'None' }, { value: 'cinematic', label: 'Cinematic' }, { value: 'warm', label: 'Warm' },
                            { value: 'high_contrast', label: 'High Contrast' }, { value: 'black_and_white', label: 'Black & White' }, { value: 'clean_bright', label: 'Clean Bright' }
                          ]} />
        
                        <Sel id="effect-strength" label="Style Strength" value={settings.effectStrength} disabled={isLoading} onChange={v => setSettings({...settings, effectStrength: v as any})}
                          options={[ { value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' }, { value: 'high', label: 'High' } ]} />
                      </div>
                    </div>
                    {/* Background Music card */}
                    <div className="card p-5 space-y-4">
                      <div>
                        <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Background Music</h2>
                        <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>Optional music track mixed under the main voice audio.</p>
                      </div>
                      
                      <FileDropZone
                        id="bg-music-upload"
                        label="Upload Music"
                        description="mp3, wav, m4a, aac"
                        accept="audio/mpeg,audio/wav,audio/aac,audio/x-m4a,audio/mp4,.m4a"
                        icon={<IconMusic size={14} />}
                        file={bgMusicFile}
                        onChange={setBgMusicFile}
                        disabled={isLoading}
                      />
        
                      {bgMusicFile && (
                        <div className="space-y-3 mt-4">
                          <div className="flex items-center gap-2 mt-1 mb-3">
                            <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Music Controls</span>
                            <div className="flex-1 h-px" style={{ background: 'var(--border-subtle)' }} />
                          </div>
                          <div className="space-y-1 mt-2">
                            <div className="flex justify-between items-center">
                              <label className="form-label mb-0">Music Volume</label>
                              <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{settings.musicVolume}%</span>
                            </div>
                            <input type="range" min={0} max={100} value={settings.musicVolume}
                              onChange={e => setSettings({...settings, musicVolume: Number(e.target.value)})}
                              className="w-full" disabled={isLoading} />
                          </div>
        
                          <div className="flex flex-col gap-2">
                            <label className="flex items-center gap-2 text-[12px]" style={{ color: 'var(--text-primary)', cursor: isLoading ? 'not-allowed' : 'pointer' }}>
                              <input type="checkbox" checked={settings.musicFade} onChange={e => setSettings({...settings, musicFade: e.target.checked})} disabled={isLoading} />
                              Fade music in/out
                            </label>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Text Overlay card */}
                    <TextOverlayPanel 
                      settings={settings} 
                      onChange={updates => setSettings(s => ({ ...s, ...updates }))} 
                    />
        
        
        
                    {/* Results */}
                    {result && <ResultsPanel result={result} settings={settings} />}
                  </div>
        
                  {/* ── RIGHT COLUMN ── */}
                  <div className="xl:w-[320px] shrink-0 space-y-6">
        
                    {/* Generate Button */}
                    <div className="card p-5 space-y-4">
                      {/* Action card title */}
                      <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Action</h2>
                      
                      {/* Preflight Check */}
                      <PreflightCheck
                        checks={buildPreflightChecks({
                          audioLabel: audioInputMode === 'single' ? 'Main Audio' : 'Audio Parts ZIP',
                          audioReady: audioInputMode === 'single' ? !!audioFile : !!audioZip,
                          zipLabel: 'Images ZIP',
                          zipReady: !!imagesZip,
                          csvReady: !!csvFile,
                        })}
                      />
        
                      <button
                        onClick={handleGenerate}
                        disabled={!canGenerate}
                        className={`w-full relative overflow-hidden transition-all duration-300 flex items-center justify-center gap-2 rounded-xl text-sm font-bold active:scale-[0.98] ${
                          canGenerate
                            ? 'active:brightness-95'
                            : 'opacity-50 cursor-not-allowed'
                        }`}
                        style={{
                          height: 52,
                          background: canGenerate ? 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)' : 'var(--bg-elevated)',
                          boxShadow: canGenerate ? '0 4px 16px rgba(99,102,241,0.35)' : 'none',
                          color: canGenerate ? '#fff' : 'var(--text-muted)',
                          border: canGenerate ? 'none' : '1px solid var(--border-default)'
                        }}
                        onMouseEnter={e => { if (canGenerate) (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 10px 28px rgba(99,102,241,0.55)' }}
                        onMouseLeave={e => { if (canGenerate) (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 4px 16px rgba(99,102,241,0.35)' }}
                      >
                        {isLoading ? (
                          <><IconLoader size={18} className="animate-spin" />Generating…</>
                        ) : canGenerate ? (
                          <><IconZap size={18} />Generate Video</>
                        ) : (
                          <>Select Required Files</>
                        )}
                      </button>

                      {/* Add to Batch Queue */}
                      <button
                        onClick={handleAddToQueue}
                        disabled={!canGenerate || isQueuing}
                        className={`w-full flex items-center justify-center gap-2 rounded-xl text-sm font-bold transition-all ${
                          canGenerate && !isQueuing
                            ? 'hover:bg-black/5 dark:hover:bg-white/5 active:scale-[0.98]'
                            : 'opacity-50 cursor-not-allowed'
                        }`}
                        style={{
                          height: 44,
                          background: 'transparent',
                          color: canGenerate ? 'var(--text-primary)' : 'var(--text-muted)',
                          border: '1px solid var(--border-default)'
                        }}
                      >
                        {isQueuing ? (
                          <><IconLoader size={16} className="animate-spin" />Saving…</>
                        ) : (
                          <><IconLayers size={16} />Add to Batch Queue</>
                        )}
                      </button>

                      <p className="text-[11px] text-center" style={{ color: 'var(--text-muted)' }}>
                        Generate immediately or save this configuration to the batch queue for later.
                      </p>

                      {queueSuccess && (
                        <div className="mt-3 p-3 rounded-xl border animate-fade-in" style={{ background: 'var(--color-success-bg)', borderColor: 'var(--color-success-border)' }}>
                          <p className="text-xs font-bold flex items-center gap-1.5" style={{ color: 'var(--color-success)' }}>
                            <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--color-success)' }} />
                            Added to Batch Queue
                          </p>
                          <div className="mt-2 flex gap-2">
                            <button onClick={() => setActiveView('tool:batch_video')} className="text-[11px] font-bold px-2 py-1 rounded" style={{ background: 'var(--color-success)', color: '#fff' }}>
                              Open Queue
                            </button>
                            <button onClick={() => setQueueSuccess(false)} className="text-[11px] font-bold px-2 py-1 rounded transition-colors hover:bg-black/5 dark:hover:bg-white/5" style={{ color: 'var(--text-primary)' }}>
                              Add Another
                            </button>
                          </div>
                        </div>
                      )}

        
        
                    </div>
        
                    {/* CSV Format Guide */}
                    <div className="card p-5 space-y-4">
                      <CsvGuide />
                    </div>
        
                  </div>
        
        </div>
        </main>
      )}
      </div>
      </StudioLayout>

      {/* ── Access Limit Modal ── */}
      <AccessLimitModal
        isOpen={limitModalOpen}
        onClose={() => setLimitModalOpen(false)}
        reason={limitModalReason}
        requiredPlan={limitModalRequiredPlan}
        currentPlan={plan?.display_name || 'Free Trial'}
        currentCredits={remaining}
      />
    </>
  )
}
