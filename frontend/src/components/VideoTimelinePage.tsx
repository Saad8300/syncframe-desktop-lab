// VideoTimelinePage.tsx
// components/VideoTimelinePage.tsx — Video Timeline workflow (Batch 10B + 10C)

import React, { useState, useCallback, useEffect, useRef } from 'react'
import { useAuth } from '../auth/AuthProvider'
import StudioPageHeader from './StudioPageHeader'
import {
  IconMusic,
  IconVideo,
  IconFileText,
  IconFilm,
  IconZap,
  IconLoader,
  IconDownload,
  IconCheck,
  IconAlertTriangle,
  IconX,
} from './icons'
import ProgressOverlay from './ProgressOverlay'
import PreflightCheck, { buildPreflightChecks } from './PreflightCheck'
import ExportPresetPanel from './ExportPresetPanel'
import { TextOverlayPanel } from './TextOverlayPanel'
import type {
  VideoTimelineSettings,
  AspectRatio,
  ExportResolution,
  FitMode,
  ClipFillMode,
  RenderProfile,
  Transition,
  TransitionDuration,
  VisualEffect,
  EffectStrength,
  MotionEffect,
  MotionIntensity,
  GenerateStatus,
  JobStatus,
  GenerateResponse,
} from '../types'
import { startVideoTimelineJob, createVideoTimelineBatchJob, resolveBackendUrl } from '../utils/api'
import { loadSettings } from '../utils/appSettings'
import { consumePendingTemplate, saveTemplate } from '../utils/templateStore'
import { usePlan } from '../hooks/usePlan'
import { useCredits } from '../hooks/useCredits'
import { AccessLimitModal } from './billing/AccessLimitModal'
import { estimateCredits, reserveCredits, finalizeJob } from '../lib/credits'
import { canUseTool, Plan } from '../lib/plans'
import { parseTimelineCsv } from '../utils/timelineTimeParser'

// ── Constants ─────────────────────────────────────────────────────────────────

const CSV_TEMPLATE = `start,end,video\n0,5,1.mp4\n5,10,2.mp4\n00:10,00:15,1.mp4\n15s,+5,3.mp4\n,+4,4.mp4\n`

const DEFAULT_SETTINGS: VideoTimelineSettings = {
  // Core
  aspectRatio:      '9:16',
  exportResolution: '1080p',
  fitMode:          'cover',
  fillMode:         'loop',
  renderProfile:    'balanced',
  outputName:       'video_timeline',
  // Styling
  transition:          'none',
  transitionDuration:  '0.5',
  visualEffect:        'none',
  effectStrength:      'medium',
  // Batch 12A — Motion
  motionStyle:         'none',
  motionIntensity:     'medium',
  // Background Music
  backgroundMusicFile: null as File | null,
  backgroundMusicVolume: 15,
  backgroundMusicLoop: true,
  backgroundMusicFade: true,
  // Intro / Outro
  enableIntro: false,
  enableOutro: false,
  // Text Overlay
  textOverlayEnabled: false,
  textOverlayMode: 'whole_video',
  textOverlayItems: [],
  textOverlayText: '',
  textOverlayFontFamily: 'Inter',
  textOverlayFontSizePercent: 5,
  textOverlayFontWeight: 'Bold',
  textOverlayColor: '#FFFFFF',
  textOverlayOpacity: 100,
  textOverlayXPercent: 50,
  textOverlayYPercent: 90,
  textOverlayAlign: 'center',
  textOverlayMaxWidthPercent: 80,
  textOverlayShadowEnabled: true,
  textOverlayStrokeEnabled: true,
  textOverlayStrokeColor: '#000000',
  textOverlayBackgroundEnabled: false,
  textOverlayBackgroundColor: '#000000',
  textOverlayBackgroundOpacity: 50,
}

// ── Reusable Select ───────────────────────────────────────────────────────────

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

// ── File Drop Zone ─────────────────────────────────────────────────────────────

function VideoDropZone({
  id, label, description, accept, icon, file, files = [], onChange, onFilesChange, multiple, disabled, required,
}: {
  id: string; label: string; description: string; accept: string;
  icon: React.ReactNode; file?: File | null; files?: File[];
  onChange?: (f: File | null) => void; onFilesChange?: (f: File[]) => void;
  multiple?: boolean; disabled?: boolean; required?: boolean;
}) {
  const [drag, setDrag] = useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)
  
  const handleFiles = (droppedFiles: FileList | File[]) => {
    const list = Array.from(droppedFiles)
    if (list.length === 0) {
      if (onChange) onChange(null)
      if (onFilesChange) onFilesChange([])
      return
    }

    // Natural sort by filename
    list.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))
    if (multiple && onFilesChange) {
      onFilesChange(list)
    } else if (onChange) {
      onChange(list[0])
    }
  }

  const hasFile = (file !== undefined && file !== null) || files.length > 0

  return (
    <div
      id={id}
      role="button"
      tabIndex={0}
      aria-label={`Upload ${label}`}
      onClick={() => !disabled && inputRef.current?.click()}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputRef.current?.click() } }}
      onDragOver={e => { e.preventDefault(); setDrag(true) }}
      onDragLeave={() => setDrag(false)}
      onDrop={e => { e.preventDefault(); setDrag(false); handleFiles(e.dataTransfer.files) }}
      className="relative flex flex-col items-center justify-center gap-2 p-4 rounded-xl text-center cursor-pointer transition-all"
      style={{
        border: `1.5px dashed ${hasFile ? 'var(--color-success-border)' : drag ? 'var(--accent-primary)' : 'var(--border-default)'}`,
        background: hasFile ? 'var(--color-success-bg)' : drag ? 'var(--accent-subtle)' : 'var(--bg-input)',
        minHeight: 88,
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      <input
        ref={inputRef} type="file" accept={accept} multiple={multiple} className="sr-only" disabled={disabled}
        onChange={e => handleFiles(e.target.files ?? [])}
      />
      <span style={{ color: hasFile ? 'var(--color-success)' : 'var(--accent-primary)' }}>
        {hasFile ? <IconCheck size={16} /> : icon}
      </span>
      <div>
        <p className="text-[11px] font-semibold" style={{ color: hasFile ? 'var(--color-success)' : 'var(--text-primary)' }}>
          {files.length > 1 ? `${files.length} audio parts selected` : (file ? file.name : (files[0]?.name ?? label))}
          {required && !hasFile && <span style={{ color: 'var(--color-error)' }}> *</span>}
        </p>
        {!hasFile && (
          <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{description}</p>
        )}
        {hasFile && files.length > 1 && (
          <p className="text-[10px] mt-0.5 truncate" style={{ color: 'var(--text-muted)', maxWidth: 180 }}>
            {files.slice(0, 2).map(f => f.name).join(' → ')}
            {files.length > 2 && ` (+ ${files.length - 2} more)`}
          </p>
        )}
        {hasFile && (
          <button
            type="button"
            onClick={e => {
              e.stopPropagation();
              if (onChange) onChange(null);
              if (onFilesChange) onFilesChange([]);
            }}
            className="text-[10px] mt-0.5"
            style={{ color: 'var(--text-muted)', textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            Remove
          </button>
        )}
      </div>
    </div>
  )
}

// ── Results strip ──────────────────────────────────────────────────────────────

function VideoTimelineResult({
  result, rowCount, settings,
}: { result: GenerateResponse; rowCount: number; settings: VideoTimelineSettings }) {
  const videoUrl = resolveBackendUrl(result.output_video_url || "")
  const hasVideo = result.success && videoUrl
  const filename = result.output_filename ?? 'video_timeline.mp4'

  let chips = result.success ? [
    `Mode: Video Timeline`,
    `Rows: ${rowCount}`,
    `Res: ${settings.exportResolution}`,
    `Profile: ${settings.renderProfile.replace('_', ' ')}`,
    `Fill: ${settings.fillMode}`,
    ...(settings.transition !== 'none' ? [`Trans: ${settings.transition.replace('_', ' ')}`] : []),
    ...(settings.visualEffect !== 'none' ? [`Style: ${settings.visualEffect.replace('_', ' ')}`] : []),
    ...(settings.enableIntro ? ['Intro: on'] : []),
    ...(settings.enableOutro ? ['Outro: on'] : []),
    ...(settings.motionStyle !== 'none' ? [`Motion: ${settings.motionStyle.replace(/_/g, ' ')}`] : []),
    ...(settings.backgroundMusicFile ? [`Bg Music: On`, `Vol: ${settings.backgroundMusicVolume}%`, `Loop: ${settings.backgroundMusicLoop ? 'On' : 'Off'}`, `Fade: ${settings.backgroundMusicFade ? 'On' : 'Off'}`] : []),
    ...(result.visual_duration ? [`Visual: ${result.visual_duration.toFixed(2)}s`] : []),
    ...(result.audio_duration ? [`Audio: ${result.audio_duration.toFixed(2)}s`] : []),
  ] : []

  // Compact display: if too many chips, prioritize key information
  if (chips.length > 9) {
    chips = [
      `Mode: Video Timeline`,
      `Rows: ${rowCount}`,
      `Res: ${settings.exportResolution}`,
      `Profile: ${settings.renderProfile.replace('_', ' ')}`,
      ...(result.visual_duration ? [`Duration: ${result.visual_duration.toFixed(2)}s`] : []),
      ...(settings.transition !== 'none' ? [`Trans: ${settings.transition.replace('_', ' ')}`] : []),
      ...(settings.visualEffect !== 'none' ? [`Style: ${settings.visualEffect.replace('_', ' ')}`] : []),
    ]
  }

  return (
    <div className="space-y-4 animate-slide-up">
      {/* Banner */}
      <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)' }}>
        <div style={{ height: 3, background: result.success ? 'var(--color-success)' : 'var(--color-error)' }} />
        <div style={{ padding: '18px 22px', display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          <div style={{
            width: 42, height: 42, borderRadius: 12, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: result.success ? 'var(--color-success-bg)' : 'var(--color-error-bg)',
            border: `1px solid ${result.success ? 'var(--color-success-border)' : 'var(--color-error-border)'}`,
          }}>
            {result.success
              ? <IconCheck size={18} style={{ color: 'var(--color-success)' }} />
              : <IconX size={18} style={{ color: 'var(--color-error)' }} />
            }
          </div>
          <div style={{ flex: 1 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              {result.success ? 'Video Timeline Complete' : 'Generation Failed'}
            </h3>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
              {result.success
                ? 'Your video is ready to preview and download.'
                : 'See error details below.'}
            </p>
            {chips.length > 0 && (
              <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                {chips.map(chip => (
                  <span key={chip} style={{
                    fontSize: 10, fontFamily: 'monospace', fontWeight: 600,
                    padding: '2px 8px', borderRadius: 6,
                    background: 'var(--accent-subtle)', border: '1px solid var(--accent-border)',
                    color: 'var(--accent-primary)',
                  }}>{chip}</span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Errors / warnings */}
      {result.errors.length > 0 && (
        <div className="rounded-xl p-4 space-y-2" style={{ background: 'var(--color-error-bg)', border: '1px solid var(--color-error-border)' }}>
          <p className="text-sm font-bold flex items-center gap-1.5" style={{ color: 'var(--color-error)' }}>
            <IconX size={14} /> Video Timeline Failed
          </p>
          <p className="text-xs font-semibold" style={{ color: 'var(--color-error)', opacity: 0.9 }}>
            {result.errors[0]}
          </p>
          {result.errors.length > 1 && (
            <details className="mt-2 pt-2" style={{ borderTop: '1px solid var(--color-error-border)' }}>
              <summary className="text-[10px] uppercase tracking-wider font-bold opacity-70 cursor-pointer outline-none select-none" style={{ color: 'var(--color-error)' }}>
                Details ({result.errors.length - 1} more)
              </summary>
              <div className="mt-2 space-y-1">
                {result.errors.slice(1).map((e, i) => <p key={i} className="text-xs" style={{ color: 'var(--color-error)', opacity: 0.85 }}>· {e}</p>)}
              </div>
            </details>
          )}
        </div>
      )}
      {result.warnings.length > 0 && (
        <div className="rounded-xl p-3.5 space-y-1.5" style={{ background: 'var(--color-warning-bg)', border: '1px solid var(--color-warning-border)' }}>
          <p className="text-xs font-semibold flex items-center gap-1.5" style={{ color: 'var(--color-warning)' }}>
            <IconAlertTriangle size={12} /> {result.warnings.length} Warning{result.warnings.length > 1 ? 's' : ''}
          </p>
          {result.warnings.map((w, i) => <p key={i} className="text-xs" style={{ color: 'var(--color-warning)', opacity: 0.85 }}>· {w}</p>)}
        </div>
      )}

      {/* Video preview + download */}
      {hasVideo && (
        <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)' }}>
          <div style={{ background: '#000', aspectRatio: '16/9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <video src={videoUrl!} controls style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} aria-label="Generated video timeline preview" />
          </div>
          <div style={{ padding: '14px 18px' }}>
            <a
              href={videoUrl!}
              download={filename}
              id="vt-download-btn"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                padding: '11px 20px', borderRadius: 10, fontWeight: 700, fontSize: 14, color: '#fff',
                background: 'var(--accent-primary)', textDecoration: 'none',
                transition: 'transform 0.18s ease, box-shadow 0.18s ease',
                boxShadow: '0 4px 16px rgba(79,70,229,0.30)',
              }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.background = 'var(--accent-hover)' }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.background = 'var(--accent-primary)' }}
            >
              <IconDownload size={16} /> Download MP4
            </a>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function VideoTimelinePage() {
  const { requireAuth, user } = useAuth()
  const { plan } = usePlan()
  const { remaining } = useCredits()
  const [limitModalOpen, setLimitModalOpen] = useState(false)
  const [limitModalReason, setLimitModalReason] = useState('')
  const [limitModalRequiredPlan, setLimitModalRequiredPlan] = useState<string | undefined>(undefined)
  // Files
  const [audioInputMode, setAudioInputMode] = useState<'single' | 'zip'>('single')
  const [audioFile, setAudioFile] = useState<File | null>(null)
  const [audioZip,  setAudioZip]  = useState<File | null>(null)
  const [videosZip, setVideosZip] = useState<File | null>(null)
  const [csvFile,   setCsvFile]   = useState<File | null>(null)
  
  const handleCsvUpload = async (file: File | null) => {
    if (!file) {
      setCsvFile(null);
      return;
    }
    try {
      const text = await file.text();
      const result = parseTimelineCsv(text, 'video');
      if (!result.success) {
        alert("Invalid CSV:\n" + result.errors.join("\n"));
        setCsvFile(null);
        return;
      }
      
      if (result.warnings && result.warnings.length > 0) {
        alert("Warnings:\n" + result.warnings.join("\n"));
      }
      
      const blob = new Blob([result.normalizedCsv], { type: 'text/csv' });
      const newFile = new File([blob], file.name, { type: 'text/csv' });
      setCsvFile(newFile);
    } catch (err) {
      alert("Failed to read CSV file.");
      setCsvFile(null);
    }
  };

  const [introFile, setIntroFile] = useState<File | null>(null)
  const [outroFile, setOutroFile] = useState<File | null>(null)

  // Settings
  const [settings, setSettings] = useState<VideoTimelineSettings>(() => {
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
  const set = <K extends keyof VideoTimelineSettings>(key: K, val: VideoTimelineSettings[K]) =>
    setSettings(s => ({ ...s, [key]: val }))

  React.useEffect(() => {
    const pending = consumePendingTemplate('video')
    if (pending) {
      setSettings(s => ({ ...s, ...pending }))
    }
  }, [])

  // Auto-enable intro/outro when files uploaded
  const handleIntroChange = (f: File | null) => {
    setIntroFile(f)
    set('enableIntro', !!f)
  }
  const handleOutroChange = (f: File | null) => {
    setOutroFile(f)
    set('enableOutro', !!f)
  }

  // Duration warnings
  const [audioDur, setAudioDur] = useState<number | null>(null)
  const [visualDur, setVisualDur] = useState<number | null>(null)
  const [durationWarning, setDurationWarning] = useState<string | null>(null)

  // Calculate audio duration
  useEffect(() => {
    if (audioInputMode !== 'single' || !audioFile) {
      setAudioDur(null)
      return
    }
    const url = URL.createObjectURL(audioFile)
    const audio = new Audio(url)
    audio.addEventListener('loadedmetadata', () => {
      setAudioDur(audio.duration)
      URL.revokeObjectURL(url)
    })
    audio.addEventListener('error', () => {
      setAudioDur(null)
      URL.revokeObjectURL(url)
    })
  }, [audioFile, audioInputMode])

  // Calculate visual duration from CSV
  useEffect(() => {
    if (!csvFile) {
      setVisualDur(null)
      return
    }
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string
        if (!text) return
        const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
        if (lines.length < 2) return
        
        const header = lines[0].toLowerCase().split(',')
        const startIdx = header.indexOf('start')
        const endIdx = header.indexOf('end')
        
        if (startIdx === -1 || endIdx === -1) return
        
        let minStart = Infinity
        let maxEnd = -Infinity
        
        for (let i = 1; i < lines.length; i++) {
          const parts = lines[i].split(',')
          const s = parseFloat(parts[startIdx])
          const e = parseFloat(parts[endIdx])
          if (!isNaN(s) && !isNaN(e)) {
            if (s < minStart) minStart = s
            if (e > maxEnd) maxEnd = e
          }
        }
        if (minStart !== Infinity && maxEnd !== -Infinity && maxEnd > minStart) {
          setVisualDur(maxEnd - minStart)
        } else {
          setVisualDur(null)
        }
      } catch (err) {
        setVisualDur(null)
      }
    }
    reader.readAsText(csvFile)
  }, [csvFile])

  // Update duration warning
  useEffect(() => {
    if (audioDur !== null && visualDur !== null) {
      if (visualDur < audioDur - 0.5) {
        setDurationWarning(`Visual timeline is shorter than audio. Black padding will be added until the audio ends.`)
      } else if (visualDur > audioDur + 0.5) {
        setDurationWarning(`Visual timeline is longer than audio. Final video will be trimmed to match the main audio.`)
      } else {
        setDurationWarning(null)
      }
    } else {
      setDurationWarning(null)
    }
  }, [audioDur, visualDur])

  // Generation state
  const [status,       setStatus]       = useState<GenerateStatus>('idle')
  const [currentJobId, setCurrentJobId] = useState<string | null>(null)
  const [result,       setResult]       = useState<GenerateResponse | null>(null)
  const [cancelledMsg, setCancelledMsg] = useState<string | null>(null)
  const [activeClientJobId, setActiveClientJobId] = useState<string | null>(null)
  const [isAddingToQueue, setIsAddingToQueue] = useState(false)
  const [successQueueMsg, setSuccessQueueMsg] = useState<string | null>(null)

  const canGenerate = (audioInputMode === 'single' ? !!audioFile : !!audioZip) && !!videosZip && !!csvFile
    && status !== 'uploading' && status !== 'generating' && status !== 'cancelling'
  const isLoading   = status === 'uploading' || status === 'generating' || status === 'cancelling'

  // Download CSV template
  const downloadTemplate = () => {
    const blob = new Blob([CSV_TEMPLATE], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = 'video_timeline_template.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  // Generate
  const computeActiveSettings = (s: VideoTimelineSettings) => {
    const isActive = s.textOverlayMode === 'whole_video' ? (s.textOverlayText || '').trim().length > 0
                   : s.textOverlayMode === 'timed_text' ? (s.textOverlayItems || []).length > 0
                   : s.textOverlayMode === 'csv_text';
    return { ...s, textOverlayEnabled: isActive };
  };

  const handleGenerate = async () => {
    if (!requireAuth()) return
    if ((audioInputMode === 'single' ? !audioFile : !audioZip) || !videosZip || !csvFile) return
    
    const durationSeconds = Math.max(1, Math.ceil(Number(visualDur || audioDur) || 60))
    
    const estimatedCredits = await estimateCredits('video_timeline', { duration_seconds: durationSeconds, resolution: settings.exportResolution || "1080p" })
    const access = canUseTool(plan, remaining, 'video_timeline', { duration_seconds: durationSeconds, resolution: settings.exportResolution }, estimatedCredits)
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
        await reserveCredits('video_timeline', durationSeconds, estimatedCredits, cjid, { resolution: settings.exportResolution, duration_seconds: durationSeconds })
      } catch (err: any) {
        setActiveClientJobId(null)
        setLimitModalReason(err.message || 'Internet connection is required to verify credits before starting this export.')
        setLimitModalOpen(true)
        return
      }
    }
    setResult(null); setCancelledMsg(null); setStatus('uploading')
    try {
      const activeSettings = computeActiveSettings(settings);
      const { job_id } = await startVideoTimelineJob(
        audioInputMode, audioFile, audioZip, videosZip, csvFile, activeSettings,
        introFile, outroFile, estimatedCredits
      )
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

  const handleAddJob = async () => {
    if (!requireAuth()) return
    if ((audioInputMode === 'single' ? !audioFile : !audioZip) || !videosZip || !csvFile) return

    setIsAddingToQueue(true)
    setSuccessQueueMsg(null)

    let cjid: string | null = null
    let reserved = false

    try {
      const activeSettings: any = computeActiveSettings(settings);
      
      const durationSeconds = Math.max(1, Math.ceil(Number(visualDur || audioDur) || 60))
      cjid = crypto.randomUUID()
      const estimatedCredits = await estimateCredits('video_timeline', { duration_seconds: durationSeconds, resolution: settings.exportResolution || "1080p" })
      
      if (user) {
        try {
          await reserveCredits('video_timeline', durationSeconds, estimatedCredits, cjid, {
             is_batch: true, resolution: settings.exportResolution, duration_seconds: durationSeconds 
          })
          reserved = true
        } catch (err: any) {
          setLimitModalReason(err.message || 'Internet connection is required to verify credits before starting this export.')
          setLimitModalOpen(true)
          setIsAddingToQueue(false)
          return
        }
      }

      activeSettings.cjid = cjid
      activeSettings.credit_cost = estimatedCredits
      activeSettings.credit_reserved = true
      activeSettings.credit_tool_name = 'video_timeline'
      activeSettings.duration_seconds = durationSeconds
      await createVideoTimelineBatchJob(
        audioInputMode, audioFile, audioZip, videosZip, csvFile, activeSettings,
        introFile, outroFile,
      )
      
      // Do NOT call finalizeJob(cjid, 'success') immediately. 
      // It is now attached to activeSettings.cjid and will be finalized by BatchVideoGeneratorPage
      
      setSuccessQueueMsg("Added to Batch Queue")
      setTimeout(() => setSuccessQueueMsg(null), 4000)
    } catch (err: any) {
      if (user && cjid && reserved) {
        await finalizeJob(cjid, 'failed').catch(console.error)
      }
      alert("Failed to add to queue: " + (err.message || err))
    } finally {
      setIsAddingToQueue(false)
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
    } else {
      if (user && activeClientJobId) {
        await finalizeJob(activeClientJobId, 'failed')
        setActiveClientJobId(null)
      }
      setResult({
        success: false,
        errors:  jobStatus.errors.length ? jobStatus.errors : ['Video timeline generation failed.'],
        warnings: jobStatus.warnings,
        timeline_report: jobStatus.timeline_report,
      })
      setStatus('error')
    }
  }, [user, activeClientJobId])

  const handleCancelled = useCallback(async () => {
    if (user && activeClientJobId) {
      await finalizeJob(activeClientJobId, 'cancelled')
      setActiveClientJobId(null)
    }
    setCurrentJobId(null); setStatus('idle')
    setCancelledMsg('Generation cancelled.')
    setTimeout(() => setCancelledMsg(null), 4000)
  }, [user, activeClientJobId])

  const rowCount = result?.timeline_report?.length ?? 0

  return (
    <>
      {currentJobId && (
        <ProgressOverlay
          jobId={currentJobId}
          onJobComplete={handleJobComplete}
          onCancelled={handleCancelled}
          onClose={() => setCurrentJobId(null)}
          renderSpec={{ resolution: settings.exportResolution, renderProfile: settings.renderProfile }}
        />
      )}

      {status === 'uploading' && !currentJobId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center animate-fade-in" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}>
          <div className="w-64 text-center space-y-4 p-8 rounded-2xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)' }}>
            <div className="w-12 h-12 mx-auto rounded-2xl flex items-center justify-center" style={{ background: 'var(--accent-subtle)', border: '1px solid var(--accent-border)' }}>
              <IconLoader size={20} className="animate-spin" style={{ color: 'var(--accent-primary)' }} />
            </div>
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Uploading files…</h3>
          </div>
        </div>
      )}

      <main className="max-w-7xl mx-auto w-full px-4 sm:px-6 py-6 animate-fade-in">
        <StudioPageHeader
          icon={<IconFilm size={17} />}
          title="Video Timeline"
          subtitle="Build videos from reusable video clips, main audio, and timeline CSV files."
        />
        <div className="flex flex-col xl:flex-row gap-6 items-start mt-6">

          {/* ── LEFT COLUMN ── */}
          <div className="flex-1 min-w-0 space-y-6">

            {/* Uploads */}
            <div className="card p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Video Source Files</h2>
                  <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>Combine main audio, video clips, and a timeline CSV.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {audioInputMode === 'single' ? (
                  <VideoDropZone id="vt-audio-upload-single" label="Main Audio" description="Upload one main audio file" accept="audio/*,.mp3,.wav,.m4a,.aac"
                    icon={<IconMusic size={18} />} file={audioFile} onChange={setAudioFile} disabled={isLoading} required />
                ) : (
                  <VideoDropZone id="vt-audio-upload-zip" label="Audio Parts ZIP" description="ZIP of 1.mp3, 2.mp3..." accept=".zip,application/zip"
                    icon={<IconFileText size={18} />} file={audioZip} onChange={setAudioZip} disabled={isLoading} required />
                )}
                <VideoDropZone id="vt-videos-upload" label="Videos ZIP" description="ZIP of .mp4, .mov, .webm clips" accept=".zip,application/zip"
                  icon={<IconVideo size={18} />} file={videosZip} onChange={setVideosZip} disabled={isLoading} required />
                <VideoDropZone id="vt-csv-upload" label="Timeline CSV" description="start, end, video columns" accept=".csv,text/csv"
                  icon={<IconFileText size={18} />} file={csvFile} onChange={handleCsvUpload} disabled={isLoading} required />
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

              <div>
                <div className="flex items-center gap-2 mt-1 mb-3">
                  <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Optional Appends</span>
                  <div className="flex-1 h-px" style={{ background: 'var(--border-subtle)' }} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <VideoDropZone id="vt-intro-upload" label="Intro Video" description="Appended before timeline" accept="video/*,.mp4,.mov,.webm"
                    icon={<IconFilm size={14} />} file={introFile} onChange={handleIntroChange} disabled={isLoading} />
                  <VideoDropZone id="vt-outro-upload" label="Outro Video" description="Appended after timeline" accept="video/*,.mp4,.mov,.webm"
                    icon={<IconFilm size={14} />} file={outroFile} onChange={handleOutroChange} disabled={isLoading} />
                </div>
              </div>
            </div>

            {/* Export Preset card */}
            <div className="card p-5">
              <ExportPresetPanel
                idPrefix="vt"
                disabled={isLoading}
                current={{
                  aspectRatio:   settings.aspectRatio,
                  resolution:    settings.exportResolution,
                  renderProfile: settings.renderProfile,
                  motionEffect:  settings.motionStyle,
                  transition:    settings.transition,
                  visualEffect:  settings.visualEffect,
                }}
                onApply={vals => {
                  set('aspectRatio',      vals.aspectRatio)
                  set('exportResolution', vals.resolution)
                  set('renderProfile',    vals.renderProfile)
                  set('motionStyle',      vals.motionEffect)
                  set('transition',       vals.transition)
                  set('visualEffect',     vals.visualEffect)
                }}
              />
            </div>

            {/* Basic Settings */}
            <div className="card p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Video Settings</h2>
                  <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>Configure core dimensions and playback behaviors.</p>
                </div>
                <button 
                  onClick={() => {
                    if (!requireAuth()) return
                    const name = window.prompt('Enter template name:', 'My Video Template')
                    if (name) {
                      saveTemplate({ name, tool: 'video', description: 'Saved from Video Timeline', settings })
                      alert('Template saved to your templates library!')
                    }
                  }} 
                  className="text-[10px] font-bold px-2 py-1 bg-[var(--bg-input)] hover:bg-[var(--accent-primary)] hover:text-white rounded border border-[var(--border-subtle)] transition-colors"
                >
                  Save as Template
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <Sel id="vt-aspect" label="Aspect Ratio" value={settings.aspectRatio} onChange={v => set('aspectRatio', v as AspectRatio)} disabled={isLoading}
                  options={[{ value: '9:16', label: '9:16 — Shorts' }, { value: '16:9', label: '16:9 — YouTube' }, { value: '1:1', label: '1:1 — Square' }]} />
                <Sel id="vt-resolution" label="Resolution" value={settings.exportResolution} onChange={v => set('exportResolution', v as ExportResolution)} disabled={isLoading}
                  options={[{ value: '720p', label: '720p' }, { value: '1080p', label: '1080p' }, { value: '2K', label: '2K' }, { value: '4K', label: '4K' }]} />
                <Sel id="vt-fitmode" label="Fit Mode" value={settings.fitMode} onChange={v => set('fitMode', v as FitMode)} disabled={isLoading}
                  options={[{ value: 'cover', label: 'Cover (crop to fill)' }, { value: 'contain', label: 'Contain (letterbox)' }]} />
                <Sel id="vt-fillmode" label="Clip Fill Mode" value={settings.fillMode} onChange={v => set('fillMode', v as ClipFillMode)} disabled={isLoading}
                  options={[ { value: 'loop', label: 'Loop to Fill' }, { value: 'trim_only', label: 'Trim Only' }, { value: 'freeze', label: 'Freeze Last Frame' } ]} />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <Sel id="vt-render-profile" label="Render Profile" value={settings.renderProfile} disabled={isLoading} onChange={v => set('renderProfile', v as RenderProfile)}
                  options={[ { value: 'fast_preview', label: 'Fast Preview' }, { value: 'balanced', label: 'Balanced' }, { value: 'high_quality', label: 'High Quality' } ]} />

                <div className="space-y-1">
                  <label htmlFor="vt-output-name" className="form-label">Output Filename</label>
                  <div className="flex items-center gap-2">
                    <input
                      id="vt-output-name" type="text" value={settings.outputName} disabled={isLoading} maxLength={80}
                      onChange={e => set('outputName', e.target.value.replace(/[^a-zA-Z0-9_ -]/g, ''))}
                      placeholder="video_timeline"
                      className="form-input flex-1"
                    />
                    <span className="text-[10px] font-mono shrink-0 px-2 py-1.5 rounded-md"
                      style={{ background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
                      .mp4
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Motion Style ── */}
            <div className="card p-5 space-y-4">
              <div>
                <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Motion Style</h2>
                <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>Apply motion to your media.</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Sel id="vt-motion-style" label="Motion Style" value={settings.motionStyle} disabled={isLoading} onChange={v => set('motionStyle', v as MotionEffect)}
                  options={[
                    { value: 'none',             label: 'None' },
                    { value: 'slow_zoom_in',     label: 'Subtle Zoom In' },
                    { value: 'slow_zoom_out',    label: 'Subtle Zoom Out' },
                    { value: 'pan_left',         label: 'Slow Pan Left' },
                    { value: 'pan_right',        label: 'Slow Pan Right' },
                    { value: 'pan_up',           label: 'Slow Pan Up' },
                    { value: 'pan_down',         label: 'Slow Pan Down' },
                    { value: 'ken_burns',        label: 'Ken Burns' },
                    { value: 'dynamic_shorts',   label: 'Dynamic Shorts Motion' },
                    { value: 'subtle_random',    label: 'Gentle Handheld' },
                  ]}
                />

                {settings.motionStyle !== 'none' && (
                  <Sel id="vt-motion-intensity" label="Intensity" value={settings.motionIntensity} disabled={isLoading} onChange={v => set('motionIntensity', v as MotionIntensity)}
                    options={[
                      { value: 'low',    label: 'Low' },
                      { value: 'medium', label: 'Medium' },
                      { value: 'high',   label: 'High' },
                    ]}
                  />
                )}
              </div>
            </div>

            {/* ── Background Music ── */}
            <div className="card p-5 space-y-4">
              <div>
                <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Background Music</h2>
                <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>Optional music track mixed under the main voice audio.</p>
              </div>
              
              <VideoDropZone
                id="vt-bg-music-upload"
                label="Upload Music"
                description="mp3, wav, m4a, aac"
                accept="audio/mpeg,audio/wav,audio/aac,audio/x-m4a,audio/mp4,.m4a"
                icon={<IconMusic size={14} />}
                file={settings.backgroundMusicFile}
                onChange={(f) => set('backgroundMusicFile', f as any)}
                disabled={isLoading}
              />

              {settings.backgroundMusicFile && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 mt-1 mb-3">
                    <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Music Controls</span>
                    <div className="flex-1 h-px" style={{ background: 'var(--border-subtle)' }} />
                  </div>
                  <div className="space-y-1 mt-2">
                    <div className="flex justify-between items-center">
                      <label className="form-label mb-0">Music Volume</label>
                      <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{settings.backgroundMusicVolume}%</span>
                    </div>
                    <input type="range" min={0} max={100} value={settings.backgroundMusicVolume}
                      onChange={e => set('backgroundMusicVolume', Number(e.target.value) as any)}
                      className="w-full" disabled={isLoading} />
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="flex items-center gap-2 text-[12px]" style={{ color: 'var(--text-primary)', cursor: isLoading ? 'not-allowed' : 'pointer' }}>
                      <input type="checkbox" checked={settings.backgroundMusicLoop} onChange={e => set('backgroundMusicLoop', e.target.checked as any)} disabled={isLoading} />
                      Loop music to full video length
                    </label>
                    <label className="flex items-center gap-2 text-[12px]" style={{ color: 'var(--text-primary)', cursor: isLoading ? 'not-allowed' : 'pointer' }}>
                      <input type="checkbox" checked={settings.backgroundMusicFade} onChange={e => set('backgroundMusicFade', e.target.checked as any)} disabled={isLoading} />
                      Fade music in/out
                    </label>
                  </div>
                </div>
              )}
            </div>

            {/* Advanced Enhancements */}
            <div className="card p-5 space-y-4">
              <div>
                <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Enhancements</h2>
                <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>Transitions and visual styles.</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Sel id="vt-transition" label="Transition" value={settings.transition} disabled={isLoading} onChange={v => set('transition', v as Transition)}
                  options={[
                    { value: 'none',          label: 'None' },
                    { value: 'fade',          label: 'Fade' },
                    { value: 'crossfade',     label: 'Crossfade' },
                    { value: 'fade_black',    label: 'Fade to Black' },
                    { value: 'fade_white',    label: 'Fade to White' },
                    { value: 'slide_left',    label: 'Slide Left' },
                    { value: 'slide_right',   label: 'Slide Right' },
                    { value: 'slide_up',      label: 'Slide Up' },
                    { value: 'slide_down',    label: 'Slide Down' },
                    { value: 'push_left',     label: 'Push Left' },
                    { value: 'push_right',    label: 'Push Right' },
                    { value: 'zoom_in',       label: 'Zoom In' },
                    { value: 'zoom_out',      label: 'Zoom Out' },
                    { value: 'blur_crossfade',label: 'Blur Crossfade' },
                    { value: 'flash',         label: 'Flash' },
                  ]} />
                <Sel id="vt-transition-dur" label="Transition Duration" value={settings.transitionDuration} disabled={isLoading} onChange={v => set('transitionDuration', v as TransitionDuration)}
                  options={[ { value: '0.2', label: '0.2s — Quick' }, { value: '0.5', label: '0.5s — Default' }, { value: '0.8', label: '0.8s — Smooth' }, { value: '1.0', label: '1.0s — Slow' } ]} />
                <Sel id="vt-visual-effect" label="Visual Style" value={settings.visualEffect} disabled={isLoading} onChange={v => set('visualEffect', v as VisualEffect)}
                  options={[
                    { value: 'none',          label: 'None' },
                    { value: 'cinematic',     label: 'Cinematic' },
                    { value: 'warm',          label: 'Warm' },
                    { value: 'high_contrast', label: 'High Contrast' },
                    { value: 'black_and_white', label: 'Black & White' },
                    { value: 'clean_bright',  label: 'Clean Bright' },
                  ]} />
                <Sel id="vt-effect-strength" label="Style Strength" value={settings.effectStrength} disabled={isLoading} onChange={v => set('effectStrength', v as EffectStrength)}
                  options={[ { value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' }, { value: 'high', label: 'High' } ]} />
              </div>
            </div>

            {/* Text Overlay */}
            <TextOverlayPanel 
              settings={settings}
              onChange={(updates) => setSettings(s => ({ ...s, ...updates }))}
            />

            {/* Cancelled notice */}
            {cancelledMsg && (
              <div className="alert-warning animate-fade-in">
                <IconAlertTriangle size={14} className="shrink-0 mt-0.5" />
                <p className="text-xs">{cancelledMsg}</p>
              </div>
            )}

            {/* Results display */}
            {status === 'done' && result && (
              <VideoTimelineResult result={result} rowCount={rowCount} settings={settings} />
            )}

          </div>

          {/* ── RIGHT COLUMN ── */}
          <div className="xl:w-[320px] shrink-0 space-y-6">

            {/* Action / Generate Card */}
            <div className="card p-5 space-y-4">
              <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Action</h2>

              <PreflightCheck
                checks={buildPreflightChecks({
                  audioLabel: audioInputMode === 'single' ? 'Main Audio' : 'Audio Parts ZIP',
                  audioReady: audioInputMode === 'single' ? !!audioFile : !!audioZip,
                  zipLabel: 'Videos ZIP',
                  zipReady: !!videosZip,
                  csvReady: !!csvFile,
                })}
              />

              {durationWarning && !isLoading && (
                <div className="rounded-xl p-3.5 space-y-1" style={{ background: 'var(--color-warning-bg)', border: '1px solid var(--color-warning-border)' }}>
                  <p className="text-xs font-semibold flex items-center gap-1.5" style={{ color: 'var(--color-warning)' }}>
                    <IconAlertTriangle size={12} /> Timeline Duration Mismatch
                  </p>
                  <p className="text-[11px]" style={{ color: 'var(--color-warning)', opacity: 0.85 }}>
                    {durationWarning}
                  </p>
                </div>
              )}

              <button
                id="vt-generate-btn"
                onClick={handleGenerate}
                disabled={!canGenerate || isAddingToQueue}
                aria-label="Generate video timeline"
                className={`w-full relative overflow-hidden transition-all duration-300 flex items-center justify-center gap-2 rounded-xl text-sm font-bold active:scale-[0.98] ${
                  canGenerate && !isAddingToQueue
                    ? 'active:brightness-95'
                    : 'opacity-50 cursor-not-allowed'
                }`}
                style={{
                  height: 52,
                  background: canGenerate && !isAddingToQueue ? 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)' : 'var(--bg-elevated)',
                  boxShadow: canGenerate && !isAddingToQueue ? '0 4px 16px rgba(99,102,241,0.35)' : 'none',
                  color: canGenerate && !isAddingToQueue ? '#fff' : 'var(--text-muted)',
                  border: canGenerate && !isAddingToQueue ? 'none' : '1px solid var(--border-default)'
                }}
                onMouseEnter={e => { if (canGenerate && !isAddingToQueue) (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 10px 28px rgba(99,102,241,0.55)' }}
                onMouseLeave={e => { if (canGenerate && !isAddingToQueue) (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 4px 16px rgba(99,102,241,0.35)' }}
              >
                {isLoading ? <><IconLoader size={18} className="animate-spin" />Generating…</> : canGenerate ? <><IconZap size={18} />Generate Video</> : <>Select Required Files</>}
              </button>

              <button
                onClick={handleAddJob}
                disabled={!canGenerate || isLoading || isAddingToQueue}
                className={`w-full flex items-center justify-center gap-2 rounded-xl text-sm font-bold h-12 transition-colors border ${
                  canGenerate && !isLoading && !isAddingToQueue
                    ? 'hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer border-[var(--border-default)]'
                    : 'opacity-50 cursor-not-allowed border-transparent bg-[var(--bg-elevated)]'
                }`}
                style={{ color: 'var(--text-primary)' }}
              >
                {isAddingToQueue ? <><IconLoader size={16} className="animate-spin" /> Adding...</> : <><IconFilm size={16} /> Add to Batch Queue</>}
              </button>

              {successQueueMsg && (
                <div className="flex flex-col items-center gap-2 mt-2 p-3 rounded-lg border bg-green-500/10 border-green-500/20 animate-fade-in">
                  <div className="flex items-center gap-2 text-green-500 font-bold text-sm">
                    <IconCheck size={16} /> {successQueueMsg}
                  </div>
                  <a href="/batch" className="text-xs font-semibold hover:underline" style={{ color: 'var(--text-primary)' }}>
                    Open Batch Queue →
                  </a>
                </div>
              )}

            </div>

            {/* CSV Guide */}
            <div className="card p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>CSV Format Guide</h2>
                  <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>Timestamp file reference</p>
                </div>
              </div>

              <div className="space-y-2">
              {[
                { col: 'start', desc: 'Row start time', req: true, help: 'Supports seconds, decimals, mm:ss, hh:mm:ss, 90s, 1m30s.\nBlank start can continue from previous row when end uses +duration.' },
                { col: 'end',   desc: 'Row end time', req: true, help: 'Supports absolute time or relative +duration.\nExamples: 5, 00:05, 1:20, 90s, +5, +1m30s.' },
                { col: 'video', desc: 'Filename inside ZIP', req: true },
              ].map(({ col, desc, req, help }) => (
                <div key={col} className="flex flex-col gap-1 border-b border-[var(--border-subtle)] pb-2 last:border-0 last:pb-0">
                  <div className="flex items-center gap-2">
                    <code className="text-[11px] px-2 py-0.5 rounded font-mono font-semibold" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', color: 'var(--accent-primary)' }}>{col}</code>
                    <span className="text-[11px]" style={{ color: 'var(--text-primary)' }}>{desc}</span>
                    {req ? (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded ml-auto" style={{ background: 'var(--color-error-bg)', color: 'var(--color-error)' }}>REQ</span>
                    ) : (
                      <span className="text-[9px] font-medium italic ml-auto" style={{ color: 'var(--text-muted)' }}>optional</span>
                    )}
                  </div>
                  {help && <p className="text-[10px] text-[var(--text-muted)] whitespace-pre-line ml-1">{help}</p>}
                </div>
              ))}
            </div>

            <div className="pt-2">
              <div className="p-2 rounded bg-[var(--bg-card)] border border-[var(--border-subtle)]">
                <p className="text-[10px] font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Supported time formats:</p>
                <ul className="list-disc pl-4 space-y-0.5 text-[9px] text-[var(--text-muted)]">
                  <li>5, 5.5, 00:05, 1:20, 00:01:20, 90s, 1m30s</li>
                  <li>+5, +1m30s (Use + in the end column to add from start. Example: start 00:10, end +5 means 10s to 15s)</li>
                </ul>
              </div>
            </div>
              
              <div className="pt-2">
                <pre className="text-[10px] leading-relaxed font-mono rounded-lg p-3" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}>
{`start,end,video
0,5,1.mp4
5,10,2.mp4
00:10,00:15,3.mp4
15s,+5,4.mp4
,+4,5.mp4
1m20s,1m25s,6.mp4`}
                </pre>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  id="vt-download-template-btn"
                  onClick={downloadTemplate}
                  className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg transition-colors"
                  style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
                >
                  <IconDownload size={14} /> Template
                </button>
              </div>

              <div className="p-3 rounded-xl space-y-2 mt-2" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}>
                <p className="text-[10px] font-semibold" style={{ color: 'var(--text-muted)' }}>Audio Behavior</p>
                <p className="text-[10px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                  Clip audio is muted. Main audio is used as the final track. Video is trimmed or padded to match audio length.
                </p>
              </div>
            </div>

          </div>

        </div>
      
      {/* Access Limit Modal */}
      <AccessLimitModal
        isOpen={limitModalOpen}
        onClose={() => setLimitModalOpen(false)}
        reason={limitModalReason}
        requiredPlan={limitModalRequiredPlan}
        currentPlan={plan?.display_name || 'Free Trial'}
        currentCredits={remaining}
      />

      </main>
    </>
  )
}
