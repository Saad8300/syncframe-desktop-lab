// MediaTimelinePage.tsx
import React, { useState, useCallback, useEffect, useRef } from 'react'
import { useAuth } from '../auth/AuthProvider'
import StudioPageHeader from './StudioPageHeader'
import {
  IconGrid,
  IconMusic,
  IconFileText,
  IconSparkles,
  IconLoader,
  IconDownload,
  IconCheck,
  IconAlertTriangle,
  IconX,
  IconFilm,
} from './icons'
import ProgressOverlay from './ProgressOverlay'
import PreflightCheck, { buildPreflightChecks } from './PreflightCheck'
import ExportPresetPanel from './ExportPresetPanel'
import { TextOverlayPanel } from './TextOverlayPanel'
import { CaptionSettingsSection } from './CaptionSettingsSection'
import { CaptionConfig, DEFAULT_CAPTION_CONFIG } from '../types/caption'
import type {
  MediaTimelineSettings,
  GenerateStatus,
  JobStatus,
  GenerateResponse,
} from '../types'
import { startMediaTimelineJob, createMediaTimelineBatchJob, resolveBackendUrl } from '../utils/api'
import { loadSettings } from '../utils/appSettings'
import { consumePendingTemplate, saveTemplate } from '../utils/templateStore'
import { usePlan } from '../hooks/usePlan'
import { useCredits } from '../hooks/useCredits'
import { AccessLimitModal } from './billing/AccessLimitModal'
import { estimateCredits, reserveCredits, finalizeJob, classifyReservationError } from '../lib/credits'
import { canUseTool, Plan } from '../lib/plans'
import { useRenderLock } from '../hooks/useRenderLock'
import { useCreditEstimate } from '../hooks/useCreditEstimate'
import { parseTimelineCsv } from '../utils/timelineTimeParser'

// ── Constants ─────────────────────────────────────────────────────────────────

const CSV_TEMPLATE = `start,end,asset,text\n0,5,1.png,"Opening image"\n5,10,1.mp4,"First video clip"\n00:10,00:15,2.jpg,"Timestamp image"\n15s,+5,2.mp4,"Relative end video"\n,+4,,"Text-only screen after previous row"\n`

const DEFAULT_SETTINGS: MediaTimelineSettings = {
  aspectRatio:      '9:16',
  exportResolution: '1080p',
  fitMode:          'cover',
  fillMode:         'loop',
  renderProfile:    'balanced',
  outputName:       'media_timeline',
  textPosition:     'bottom_center',
  textSize:         'medium',
  textColor:        'white',
  textBackground:   'soft_shadow',
  textWidth:        'wide',
  textAlignment:    'center',
  // Batch 11D
  transition:          'none',
  transitionDuration:  '0.5',
  visualEffect:        'none',
  effectStrength:      'medium',
  // Batch 12A
  motionStyle:         'none',
  motionIntensity:     'medium',
  // Background Music
  backgroundMusicFile: null as File | null,
  backgroundMusicVolume: 15,
  backgroundMusicLoop: true,
  backgroundMusicFade: true,
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

function MediaDropZone({
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

function MediaTimelineResult({
  result, rowCount, settings,
}: { result: GenerateResponse; rowCount: number; settings: MediaTimelineSettings }) {
  const videoUrl = React.useMemo(() => {
    return result.success && result.output_video_url ? `${resolveBackendUrl(result.output_video_url)}?t=${Date.now()}` : ""
  }, [result])
  const hasVideo = result.success && !!videoUrl
  const filename = result.output_filename ?? 'media_timeline.mp4'

  let imageRows = 0
  let videoRows = 0
  let textRows = 0

  // Just count basic extensions from timeline report if available
  result.timeline_report.forEach(r => {
    if (!r.image || r.image.trim() === '') textRows++
    else if (/\.(mp4|mov|webm)$/i.test(r.image)) videoRows++
    else imageRows++
  })

  let chips = result.success ? [
    `Mode: Media Timeline`,
    `Rows: ${rowCount}`,
    `Images: ${imageRows}`,
    `Videos: ${videoRows}`,
    `Text-only: ${textRows}`,
    `Res: ${settings.exportResolution}`,
    `Profile: ${settings.renderProfile.replace('_', ' ')}`,
    `Fit: ${settings.fitMode}`,
    `Fill: ${settings.fillMode}`,
    `Text: ${settings.textPosition.replace('_', ' ')} (${settings.textSize})`,
  ] : ['Generation Failed']

  if (settings.transition !== 'none') chips.push(`Trans: ${settings.transition.replace('_', ' ')}`)
  if (settings.visualEffect !== 'none') chips.push(`Style: ${settings.visualEffect.replace('_', ' ')}`)
  chips.push(
    ...(settings.enableIntro ? ['Intro: on'] : []),
    ...(settings.enableOutro ? ['Outro: on'] : []),
    ...(settings.motionStyle !== 'none' ? [`Motion: ${settings.motionStyle.replace(/_/g, ' ')}`] : []),
    ...(settings.backgroundMusicFile ? [`Bg Music: On`, `Vol: ${settings.backgroundMusicVolume}%`, `Loop: ${settings.backgroundMusicLoop ? 'On' : 'Off'}`, `Fade: ${settings.backgroundMusicFade ? 'On' : 'Off'}`] : []),
  )
  if (result.visual_duration) chips.push(`Visual: ${result.visual_duration.toFixed(2)}s`)
  if (result.audio_duration) chips.push(`Audio: ${result.audio_duration.toFixed(2)}s`)

  return (
    <div className="liquid-glass-card rounded-2xl p-5 space-y-4 animate-fade-in" style={{ border: `1px solid ${result.success ? 'var(--color-success-border)' : 'var(--color-error-border)'}`, background: result.success ? 'var(--color-success-bg)' : 'var(--bg-card)' }}>
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-sm font-bold flex items-center gap-2" style={{ color: result.success ? 'var(--color-success)' : 'var(--color-error)' }}>
            {result.success ? <IconCheck size={16} /> : <IconAlertTriangle size={16} />}
            {result.success ? 'Media Timeline Ready' : 'Generation Failed'}
          </h2>
          {result.success && result.elapsed_seconds && (
            <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
              Completed in {result.elapsed_seconds.toFixed(1)}s
            </p>
          )}
        </div>
        {hasVideo && (
          <a
            href={videoUrl}
            download={filename}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
            style={{ background: 'var(--accent-primary)', color: '#fff' }}
          >
            <IconDownload size={14} /> Download MP4
          </a>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {chips.map(c => (
          <span key={c} className="text-[9px] font-semibold px-2 py-0.5 rounded-full" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}>
            {c}
          </span>
        ))}
      </div>

      {hasVideo && (
        <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-black shadow-inner border border-[var(--border-subtle)]">
          <video src={videoUrl} controls className="absolute inset-0 w-full h-full object-contain" />
        </div>
      )}

      {result.warnings?.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-bold" style={{ color: 'var(--color-warning)' }}>Warnings</h3>
          <ul className="text-[11px] space-y-1" style={{ color: 'var(--color-warning)' }}>
            {result.warnings.map((w, i) => <li key={i} className="flex items-start gap-1.5"><IconAlertTriangle size={12} className="shrink-0 mt-0.5" /> <span>{w}</span></li>)}
          </ul>
        </div>
      )}

      {result.errors?.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-bold" style={{ color: 'var(--color-error)' }}>Errors</h3>
          <ul className="text-[11px] space-y-1" style={{ color: 'var(--color-error)' }}>
            {result.errors.map((e, i) => <li key={i} className="flex items-start gap-1.5"><IconX size={12} className="shrink-0 mt-0.5" /> <span>{e}</span></li>)}
          </ul>
        </div>
      )}
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function MediaTimelinePage({ onNavigate }: { onNavigate?: (view: string) => void }) {
  const { requireAuth, user } = useAuth()
  const { plan } = usePlan()
  const { remaining } = useCredits()
  const { lockState } = useRenderLock()
  const [limitModalOpen, setLimitModalOpen] = useState(false)
  const [limitModalReason, setLimitModalReason] = useState('')
  const [limitModalRequiredPlan, setLimitModalRequiredPlan] = useState<string | undefined>(undefined)
  const [audioInputMode, setAudioInputMode] = useState<'single' | 'zip'>('single')
  const [audioFile, setAudioFile] = useState<File | null>(null)
  const [audioZip,  setAudioZip]  = useState<File | null>(null)
  const [mediaZip, setMediaZip] = useState<File | null>(null)
  const [timelineCsv, setTimelineCsv] = useState<File | null>(null)

  const handleCsvUpload = async (file: File | null) => {
    if (!file) {
      setTimelineCsv(null);
      return;
    }
    try {
      const text = await file.text();
      const result = parseTimelineCsv(text, 'media');
      if (!result.success) {
        alert("Invalid CSV:\n" + result.errors.join("\n"));
        setTimelineCsv(null);
        return;
      }

      if (result.warnings && result.warnings.length > 0) {
        alert("Warnings:\n" + result.warnings.join("\n"));
      }

      const blob = new Blob([result.normalizedCsv], { type: 'text/csv' });
      const newFile = new File([blob], file.name, { type: 'text/csv' });
      setTimelineCsv(newFile);
    } catch (err) {
      alert("Failed to read CSV file.");
      setTimelineCsv(null);
    }
  };

  const [introFile, setIntroFile] = useState<File | null>(null)
  const [outroFile, setOutroFile] = useState<File | null>(null)
  // Settings
  const [settings, setSettings] = useState<MediaTimelineSettings>(() => {
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

  const [status, setStatus] = useState<GenerateStatus>('idle')
  const [jobId, setJobId] = useState<string | null>(null)
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null)
  const [activeClientJobId, setActiveClientJobId] = useState<string | null>(null)
  const [result, setResult] = useState<GenerateResponse | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [isAddingToQueue, setIsAddingToQueue] = useState(false)
  const [successQueueMsg, setSuccessQueueMsg] = useState<string | null>(null)
  const [captionConfig, setCaptionConfig] = useState<CaptionConfig>(DEFAULT_CAPTION_CONFIG)

  const set = useCallback(<K extends keyof MediaTimelineSettings>(k: K, v: MediaTimelineSettings[K]) => {
    setSettings(prev => ({ ...prev, [k]: v }))
  }, [])

  React.useEffect(() => {
    const pending = consumePendingTemplate('media')
    if (pending) {
      setSettings(s => ({ ...s, ...pending }))
      if (pending.captionConfig) {
        const cc = { ...pending.captionConfig };
        delete cc.srtFile;
        setCaptionConfig(cc);
      }
    }
  }, [])

  const handleIntroChange = (f: File | null) => {
    setIntroFile(f)
    set('enableIntro', !!f)
  }
  const handleOutroChange = (f: File | null) => {
    setOutroFile(f)
    set('enableOutro', !!f)
  }
  const handleWmTextChange = (text: string) => {
  }

  const [audioDur, setAudioDur] = useState<number | null>(null)

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

  const disabled = status === 'uploading' || status === 'generating' || status === 'cancelling'
  const isReady  = (audioInputMode === 'single' ? !!audioFile : !!audioZip) && !!mediaZip && !!timelineCsv && !disabled

  const handleJobComplete = useCallback(async (statusData: JobStatus) => {
    setJobStatus(statusData)
    if (statusData.status === 'completed') {
      if (user && activeClientJobId) {
        await finalizeJob(activeClientJobId, 'success')
        setActiveClientJobId(null)
      }
      setResult({
        success: true,
        job_id: statusData.job_id,
        output_video_url: statusData.output_video_url,
        output_filename: statusData.output_filename ?? undefined,
        timeline_report: statusData.timeline_report,
        warnings: [...(statusData.warnings || []), ...(statusData.errors || [])],
        errors:   [],
        visual_duration: statusData.visual_duration,
        audio_duration: statusData.audio_duration,
      })
      setStatus('done')
    } else {
      if (user && activeClientJobId) {
        await finalizeJob(activeClientJobId, 'failed')
        setActiveClientJobId(null)
      }
      setResult({
        success: false,
        errors:  statusData.errors.length ? statusData.errors : ['Media timeline generation failed.'],
        warnings: statusData.warnings,
        timeline_report: statusData.timeline_report,
      })
      setStatus('error')
    }
  }, [user, activeClientJobId])

  const handleCancelled = useCallback(async () => {
    if (user && activeClientJobId) {
      await finalizeJob(activeClientJobId, 'cancelled')
      setActiveClientJobId(null)
    }
    setJobId(null)
    setStatus('idle')
    setErrorMsg('Generation cancelled.')
    setTimeout(() => setErrorMsg(null), 4000)
  }, [user, activeClientJobId])

  const computeActiveSettings = (s: MediaTimelineSettings) => {
    const isActive = s.textOverlayMode === 'whole_video' ? (s.textOverlayText || '').trim().length > 0
                   : s.textOverlayMode === 'timed_text' ? (s.textOverlayItems || []).length > 0
                   : s.textOverlayMode === 'csv_text';
    return { ...s, textOverlayEnabled: isActive };
  };

  const durationSeconds = Math.max(1, Math.ceil(Number(audioDur) || 60))
  const { estimatedCredits: liveCreditEstimate, isEstimating: isEstimatingCredits } = useCreditEstimate('media_timeline', {
    duration_seconds: durationSeconds,
    resolution: settings.exportResolution,
    is_premium_template: false
  })

  // Start Generation
  const handleGenerate = async () => {
    if (!requireAuth()) return
    if (!isReady) return

    const durationSeconds = Math.max(1, Math.ceil(Number(audioDur) || 60))

    const estimatedCredits = await estimateCredits('media_timeline', { duration_seconds: durationSeconds, resolution: settings.exportResolution })
    const access = canUseTool(plan, remaining, 'media_timeline', { duration_seconds: durationSeconds, resolution: settings.exportResolution }, estimatedCredits)
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
        await reserveCredits('media_timeline', durationSeconds, estimatedCredits, cjid, { resolution: settings.exportResolution, duration_seconds: durationSeconds })
      } catch (err: any) {
        setActiveClientJobId(null)
        const classified = classifyReservationError(err)
        if (classified.type === 'pricing_mismatch' || classified.type === 'unknown') {
          alert(`Error: ${classified.message}`)
        } else {
          setLimitModalReason(classified.message)
          setLimitModalRequiredPlan(undefined)
          setLimitModalOpen(true)
        }
        return
      }
    }
    setStatus('uploading')
    setErrorMsg(null)
    setResult(null)
    setJobId(null)
    setJobStatus(null)

    try {
      const activeSettings: any = computeActiveSettings(settings);
      activeSettings.captionConfig = captionConfig;
      activeSettings.captionConfig = captionConfig;
      const res = await startMediaTimelineJob(
        audioInputMode,
        audioFile,
        audioZip,
        mediaZip,
        timelineCsv,
        activeSettings,
        introFile,
        outroFile,
        estimatedCredits
      )
      setJobId(res.job_id)
      setStatus('generating')
    } catch (err: any) {
      if (user) {
        await finalizeJob(cjid, 'failed')
        setActiveClientJobId(null)
      }
      console.error(err)
      setErrorMsg(err.message || 'Failed to start generation.')
      setStatus('error')
    }
  }

  const handleAddJob = async () => {
    if (!isReady) return

    setIsAddingToQueue(true)
    setSuccessQueueMsg(null)

    let cjid: string | null = null
    let reserved = false

    try {
      const activeSettings: any = computeActiveSettings(settings);
      activeSettings.captionConfig = captionConfig;

      const durationSeconds = Math.max(1, Math.ceil(Number(audioDur) || 60))

      let totalCost = 0;
      let numVideos = 1;
      try {
        if (timelineCsv) {
          const text = await timelineCsv.text();
          const parsed = parseTimelineCsv(text, 'media');
          if (parsed.success && parsed.rows.length > 0) {
            numVideos = parsed.rows.length;
            for (const row of parsed.rows) {
              const rowDur = Math.max(1, Math.ceil(row.end - row.start));
              totalCost += await estimateCredits('media_timeline', { duration_seconds: rowDur, resolution: settings.exportResolution });
            }
          } else {
            totalCost = await estimateCredits('media_timeline', { duration_seconds: durationSeconds, resolution: settings.exportResolution });
          }
        } else {
          totalCost = await estimateCredits('media_timeline', { duration_seconds: durationSeconds, resolution: settings.exportResolution });
        }
      } catch (err) {
        totalCost = await estimateCredits('media_timeline', { duration_seconds: durationSeconds, resolution: settings.exportResolution });
      }

      cjid = crypto.randomUUID()
      const estimatedCredits = totalCost

      if (user) {
        try {
          await reserveCredits('media_timeline', durationSeconds, estimatedCredits, cjid, {
             is_batch: true, resolution: settings.exportResolution, duration_seconds: durationSeconds
          })
          reserved = true
        } catch (err: any) {
          const classified = classifyReservationError(err)
          if (classified.type === 'pricing_mismatch' || classified.type === 'unknown') {
            alert(`Error: ${classified.message}`)
          } else {
            setLimitModalReason(classified.message)
            setLimitModalOpen(true)
          }
          setIsAddingToQueue(false)
          return
        }
      }

      activeSettings.cjid = cjid
      activeSettings.credit_cost = estimatedCredits
      activeSettings.credit_reserved = true
      activeSettings.credit_tool_name = 'media_timeline'
      activeSettings.duration_seconds = durationSeconds
      await createMediaTimelineBatchJob(
        audioInputMode,
        audioFile,
        audioZip,
        mediaZip,
        timelineCsv,
        activeSettings,
        introFile,
        outroFile
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

  const handleDownloadCsvTemplate = () => {
    const blob = new Blob([CSV_TEMPLATE], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'media_timeline_template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <main className="max-w-7xl mx-auto w-full px-4 sm:px-6 py-6 animate-fade-in">
      <StudioPageHeader
        icon={<IconGrid size={17} />}
        title="Media Timeline"
        subtitle="Mix images, videos, and text rows using one timeline CSV."
      />
      <div className="flex flex-col xl:flex-row gap-6 items-start mt-6">

        {/* ── LEFT COLUMN ── */}
        <div className="flex-1 min-w-0 space-y-6">

          {/* Uploads */}
          <div className="liquid-glass-card rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Media Source Files</h2>
                <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>Combine audio, images, videos, and text using a CSV timeline.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {audioInputMode === 'single' ? (
                  <MediaDropZone
                    id="mt-audio-single"
                    label="Main Audio"
                    description="Upload one main audio file."
                    accept="audio/mpeg,audio/wav,audio/aac,audio/x-m4a,audio/mp4,.m4a"
                    icon={<IconMusic size={18} />}
                    file={audioFile}
                    onChange={setAudioFile}
                    required
                    disabled={disabled}
                  />
                ) : (
                  <MediaDropZone
                    id="mt-audio-zip"
                    label="Audio Parts ZIP"
                    description="ZIP of 1.mp3, 2.mp3..."
                    accept="application/zip,application/x-zip-compressed,.zip"
                    icon={<IconFileText size={18} />}
                    file={audioZip}
                    onChange={setAudioZip}
                    required
                    disabled={disabled}
                  />
                )}
                <MediaDropZone
                  id="media-zip"
                  label="Media ZIP"
                  description="ZIP with images and videos."
                  accept="application/zip,application/x-zip-compressed,.zip"
                  icon={<IconGrid size={18} />}
                  file={mediaZip}
                  onChange={setMediaZip}
                  required
                  disabled={disabled}
                />
                <MediaDropZone
                  id="timeline-csv"
                  label="Timeline CSV"
                  description="CSV controlling the timeline."
                  accept="text/csv,.csv"
                  icon={<IconFileText size={18} />}
                  file={timelineCsv}
                  onChange={handleCsvUpload}
                  required
                  disabled={disabled}
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

            <div>
              <div className="flex items-center gap-2 mt-1 mb-3">
                <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Optional Appends</span>
                <div className="flex-1 h-px" style={{ background: 'var(--border-subtle)' }} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <MediaDropZone id="mt-intro-upload" label="Intro Video" description="Appended before timeline" accept="video/mp4,video/quicktime,video/webm"
                  icon={<IconFilm size={14} />} file={introFile} onChange={handleIntroChange} disabled={disabled} />
                <MediaDropZone id="mt-outro-upload" label="Outro Video" description="Appended after timeline" accept="video/mp4,video/quicktime,video/webm"
                  icon={<IconFilm size={14} />} file={outroFile} onChange={handleOutroChange} disabled={disabled} />
              </div>
            </div>
          </div>

          {/* Export Preset card */}
          <div className="liquid-glass-card rounded-2xl p-5 relative z-10">
            <ExportPresetPanel
              idPrefix="mt"
              disabled={disabled}
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
          <div className="liquid-glass-card rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Video Settings</h2>
                <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>Configure core dimensions and playback behaviors.</p>
              </div>
              <button
                onClick={() => {
                  if (!requireAuth()) return
                  const name = window.prompt('Enter template name:', 'My Media Template')
                  if (name) {
                    saveTemplate({ name, tool: 'media', description: 'Saved from Media Timeline', settings })
                    alert('Template saved to your templates library!')
                  }
                }}
                className="text-[10px] font-bold px-2 py-1 bg-[var(--bg-input)] hover:bg-[var(--accent-primary)] hover:text-white rounded border border-[var(--border-subtle)] transition-colors"
              >
                Save as Template
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <Sel id="aspect-ratio" label="Aspect Ratio" value={settings.aspectRatio} disabled={disabled} onChange={v => set('aspectRatio', v)}
                options={[ { value: '9:16', label: '9:16 Vertical' }, { value: '16:9', label: '16:9 Landscape' }, { value: '1:1', label: '1:1 Square' } ]} />

              <Sel id="export-resolution" label="Resolution" value={settings.exportResolution} disabled={disabled} onChange={v => set('exportResolution', v)}
                options={[ { value: '720p', label: '720p Fast' }, { value: '1080p', label: '1080p HD' }, { value: '2K', label: '2K Sharp' }, { value: '4K', label: '4K Max' } ]} />

              <Sel id="fit-mode" label="Fit Mode" value={settings.fitMode} disabled={disabled} onChange={v => set('fitMode', v)}
                options={[ { value: 'cover', label: 'Cover (Crop)' }, { value: 'contain', label: 'Contain (Pad)' } ]} />

              <Sel id="fill-mode" label="Clip Fill Mode" value={settings.fillMode} disabled={disabled} onChange={v => set('fillMode', v)}
                options={[ { value: 'loop', label: 'Loop to Fill' }, { value: 'trim_only', label: 'Trim Only' }, { value: 'freeze', label: 'Freeze Last Frame' } ]} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <Sel id="render-profile" label="Render Profile" value={settings.renderProfile} disabled={disabled} onChange={v => set('renderProfile', v)}
                options={[ { value: 'fast_preview', label: 'Fast Preview' }, { value: 'balanced', label: 'Balanced' }, { value: 'high_quality', label: 'High Quality' } ]} />

              <div className="space-y-1">
                <label htmlFor="output-name" className="form-label">Output Filename</label>
                <div className="flex items-center gap-2">
                  <input
                    id="output-name" type="text" value={settings.outputName} disabled={disabled}
                    onChange={e => set('outputName', e.target.value.replace(/[^a-zA-Z0-9_ -]/g, ''))}
                    placeholder="media_timeline"
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

          {/* Text Style Settings */}
          <div className="liquid-glass-card rounded-2xl p-5 space-y-4">
            <div>
              <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Text Style</h2>
              <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>Configure default appearance for text overlays and text-only rows.</p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <Sel id="text-position" label="Position" value={settings.textPosition} disabled={disabled} onChange={v => set('textPosition', v)}
                options={[
                  { value: 'bottom_center', label: 'Bottom Center' },
                  { value: 'lower_third',   label: 'Lower Third' },
                  { value: 'center',        label: 'Center' },
                  { value: 'top_center',    label: 'Top Center' },
                  { value: 'bottom_left',   label: 'Bottom Left' },
                  { value: 'bottom_right',  label: 'Bottom Right' }
                ]} />

              <Sel id="text-size" label="Size" value={settings.textSize} disabled={disabled} onChange={v => set('textSize', v)}
                options={[
                  { value: 'small',       label: 'Small' },
                  { value: 'medium',      label: 'Medium' },
                  { value: 'large',       label: 'Large' },
                  { value: 'extra_large', label: 'Extra Large' }
                ]} />

              <Sel id="text-color" label="Color" value={settings.textColor} disabled={disabled} onChange={v => set('textColor', v)}
                options={[
                  { value: 'white',  label: 'White' },
                  { value: 'yellow', label: 'Yellow' },
                  { value: 'black',  label: 'Black' },
                  { value: 'accent', label: 'Accent' }
                ]} />

              <Sel id="text-background" label="Background" value={settings.textBackground} disabled={disabled} onChange={v => set('textBackground', v)}
                options={[
                  { value: 'none',        label: 'None' },
                  { value: 'soft_shadow', label: 'Soft Shadow' },
                  { value: 'dark_box',    label: 'Dark Box' },
                  { value: 'light_box',   label: 'Light Box' },
                  { value: 'blur_box',    label: 'Blur Box' }
                ]} />

              <Sel id="text-width" label="Width" value={settings.textWidth} disabled={disabled} onChange={v => set('textWidth', v)}
                options={[
                  { value: 'narrow', label: 'Narrow (55%)' },
                  { value: 'medium', label: 'Medium (70%)' },
                  { value: 'wide',   label: 'Wide (85%)' }
                ]} />

              <Sel id="text-alignment" label="Alignment" value={settings.textAlignment} disabled={disabled} onChange={v => set('textAlignment', v)}
                options={[
                  { value: 'left',   label: 'Left' },
                  { value: 'center', label: 'Center' },
                  { value: 'right',  label: 'Right' }
                ]} />
            </div>
          </div>

          {/* ── Motion Style ── */}
          <div className="liquid-glass-card rounded-2xl p-5 space-y-4">
            <div>
              <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Motion Style</h2>
              <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>Apply motion to your media.</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Sel id="mt-motion-style" label="Motion Style" value={settings.motionStyle} disabled={disabled} onChange={v => set('motionStyle', v as any)}
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
                <Sel id="mt-motion-intensity" label="Intensity" value={settings.motionIntensity} disabled={disabled} onChange={v => set('motionIntensity', v as any)}
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
          <div className="liquid-glass-card rounded-2xl p-5 space-y-4">
            <div>
              <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Background Music</h2>
              <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>Optional music track mixed under the main voice audio.</p>
            </div>

            <MediaDropZone
              id="mt-bg-music-upload"
              label="Upload Music"
              description="mp3, wav, m4a, aac"
              accept="audio/mpeg,audio/wav,audio/aac,audio/x-m4a,audio/mp4,.m4a"
              icon={<IconMusic size={14} />}
              file={settings.backgroundMusicFile}
              onChange={(f) => set('backgroundMusicFile', f as any)}
              disabled={disabled}
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
                    className="w-full" disabled={disabled} />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="flex items-center gap-2 text-[12px]" style={{ color: 'var(--text-primary)', cursor: disabled ? 'not-allowed' : 'pointer' }}>
                    <input type="checkbox" checked={settings.backgroundMusicLoop} onChange={e => set('backgroundMusicLoop', e.target.checked as any)} disabled={disabled} />
                    Loop music to full video length
                  </label>
                  <label className="flex items-center gap-2 text-[12px]" style={{ color: 'var(--text-primary)', cursor: disabled ? 'not-allowed' : 'pointer' }}>
                    <input type="checkbox" checked={settings.backgroundMusicFade} onChange={e => set('backgroundMusicFade', e.target.checked as any)} disabled={disabled} />
                    Fade music in/out
                  </label>
                </div>
              </div>
            )}
          </div>

          {/* Advanced Enhancements (Batch 11D) */}
          <div className="liquid-glass-card rounded-2xl p-5 space-y-4">
            <div>
              <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Enhancements</h2>
              <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>Transitions and visual styles.</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Sel id="transition" label="Transition" value={settings.transition} disabled={disabled} onChange={v => set('transition', v)}
                options={[
                  { value: 'none', label: 'None (Hard Cut)' },
                  { value: 'crossfade', label: 'Crossfade' },
                  { value: 'fade_black', label: 'Fade to Black' },
                  { value: 'slide_left', label: 'Slide Left' },
                  { value: 'slide_right', label: 'Slide Right' },
                  { value: 'zoom_in', label: 'Zoom In' }
                ]} />
              <Sel id="transition-duration" label="Transition Duration" value={settings.transitionDuration} disabled={disabled} onChange={v => set('transitionDuration', v)}
                options={[ { value: '0.2', label: '0.2s (Fast)' }, { value: '0.5', label: '0.5s (Medium)' }, { value: '1.0', label: '1.0s (Slow)' } ]} />
              <Sel id="visual-effect" label="Visual Style" value={settings.visualEffect} disabled={disabled} onChange={v => set('visualEffect', v)}
                options={[
                  { value: 'none', label: 'None' },
                  { value: 'cinematic', label: 'Cinematic' },
                  { value: 'high_contrast', label: 'Vintage / Film' },
                  { value: 'black_and_white', label: 'Black & White' },
                  { value: 'clean_bright', label: 'Clean & Bright' },
                  { value: 'warm', label: 'Warm Glow' }
                ]} />
              <Sel id="effect-strength" label="Style Strength" value={settings.effectStrength} disabled={disabled} onChange={v => set('effectStrength', v)}
                options={[ { value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' }, { value: 'high', label: 'High' } ]} />
            </div>
          </div>

          {/* Text Overlay */}
          <CaptionSettingsSection
            config={captionConfig}
            onChange={setCaptionConfig}
            disabled={['uploading', 'generating'].includes(status)}
          />

          <TextOverlayPanel

            settings={settings}
            onChange={(updates) => setSettings(s => ({ ...s, ...updates }))}
          />

          {/* Error display */}
          {errorMsg && (
            <div className="alert-error animate-fade-in">
              <IconAlertTriangle size={14} className="shrink-0 mt-0.5" />
              <p className="text-xs">{errorMsg}</p>
            </div>
          )}

          {/* Results display */}
          {status === 'done' && result && (
            <MediaTimelineResult result={result} rowCount={jobStatus?.timeline_report?.length ?? 0} settings={settings} />
          )}

        </div>

        {/* ── RIGHT COLUMN ── */}
        <div className="xl:w-[320px] shrink-0 space-y-6">

          {/* Action Card */}
          <div className="liquid-glass-card rounded-2xl p-5 space-y-4">
            <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Action</h2>

            <PreflightCheck
              checks={buildPreflightChecks({
                audioLabel: audioInputMode === 'single' ? 'Main Audio' : 'Audio Parts ZIP',
                audioReady: audioInputMode === 'single' ? !!audioFile : !!audioZip,
                zipLabel: 'Media ZIP',
                zipReady: !!mediaZip,
                csvReady: !!timelineCsv,
              })}
            />

            <button
              onClick={handleGenerate}
              disabled={!isReady || lockState.locked}
              className={`w-full relative overflow-hidden transition-all duration-300 flex items-center justify-center gap-2 rounded-xl text-sm font-bold active:scale-[0.98] ${
                (isReady && !isAddingToQueue && !lockState.locked)
                  ? 'active:brightness-95'
                  : 'opacity-50 cursor-not-allowed'
              }`}
              style={{
                height: 52,
                background: (isReady && !isAddingToQueue && !lockState.locked) ? 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)' : 'var(--bg-elevated)',
                boxShadow: (isReady && !isAddingToQueue && !lockState.locked) ? '0 4px 16px rgba(99,102,241,0.35)' : 'none',
                color: (isReady && !isAddingToQueue && !lockState.locked) ? '#fff' : 'var(--text-muted)',
                border: (isReady && !isAddingToQueue && !lockState.locked) ? 'none' : '1px solid var(--border-default)'
              }}
              onMouseEnter={e => { if (isReady && !isAddingToQueue && !lockState.locked) (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 10px 28px rgba(99,102,241,0.55)' }}
              onMouseLeave={e => { if (isReady && !isAddingToQueue && !lockState.locked) (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 4px 16px rgba(99,102,241,0.35)' }}
            >
              {lockState.locked ? (
                <>Another video is rendering</>
              ) : status === 'uploading' ? (
                <><IconLoader size={16} className="animate-spin" /> Uploading...</>
              ) : status === 'generating' ? (
                <><IconLoader size={16} className="animate-spin" /> Generating...</>
              ) : isReady ? (
                <><IconSparkles size={16} /> Generate Video</>
              ) : (
                <>Select Required Files</>
              )}
            </button>

            {isReady && !lockState.locked && liveCreditEstimate !== null && (
              <div className="text-center text-xs text-[var(--text-muted)] font-medium mt-1">
                 {isEstimatingCredits ? 'Estimating cost...' : `Estimated cost: ${liveCreditEstimate} credits`}
              </div>
            )}

            <button
              onClick={handleAddJob}
              disabled={!isReady || ['uploading', 'generating'].includes(status) || isAddingToQueue}
              className={`w-full flex items-center justify-center gap-2 rounded-xl text-sm font-bold h-12 transition-colors border ${
                isReady && !['uploading', 'generating'].includes(status) && !isAddingToQueue
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
                <button type="button" onClick={() => onNavigate?.('batch_video')} className="text-xs font-semibold hover:underline" style={{ color: 'var(--text-primary)' }}>
                  Open Batch Queue →
                </button>
              </div>
            )}
          </div>

          {/* CSV Guide */}
          <div className="liquid-glass-card rounded-2xl p-5 space-y-4">
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
                { col: 'asset', desc: 'Filename inside ZIP', req: false },
                { col: 'text',  desc: 'Overlay text or text-only screen', req: false },
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
{`start,end,asset,text
0,5,1.png,"Opening image"
5,10,1.mp4,"First video clip"
00:10,00:15,2.jpg,"Timestamp image"
15s,+5,2.mp4,"Relative end video"
,+4,,"Text-only screen after previous row"
1m20s,1m25s,3.png,"Minute format"`}
              </pre>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={handleDownloadCsvTemplate}
                className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg transition-colors"
                style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
              >
                <IconDownload size={14} /> Template
              </button>
            </div>

            <div className="space-y-2 pt-2">
              <p className="text-[11px] font-semibold" style={{ color: 'var(--text-secondary)' }}>Advanced Options:</p>
              <ul className="text-[10px] space-y-1.5" style={{ color: 'var(--text-muted)' }}>
                <li className="space-y-1">
                  <div className="p-2 rounded bg-[var(--bg-card)] border border-[var(--border-subtle)]">
                    <span className="font-semibold block mb-1" style={{ color: 'var(--text-primary)' }}>Note on Assets:</span>
                    <ul className="list-disc pl-4 space-y-0.5 text-[9px]">
                      <li>Images/videos use standard names (<code>1.png</code>, <code>1.mp4</code>)</li>
                      <li>Media type determined by extension.</li>
                    </ul>
                  </div>
                </li>
              </ul>

              <div className="mt-2 p-2 rounded border border-[var(--border-subtle)] bg-[var(--bg-card)]">
                <p className="text-[10px] font-semibold" style={{ color: 'var(--text-primary)' }}>Global Style Overrides</p>
                <p className="text-[9px] mt-1" style={{ color: 'var(--text-muted)' }}>
                  Override global text styles per-row with these optional columns: <br/>
                  <code className="text-accent">text_position</code>, <code className="text-accent">text_size</code>, <code className="text-accent">text_color</code>, <code className="text-accent">text_background</code>, <code className="text-accent">text_alignment</code>
                </p>
              </div>
            </div>

            <div className="space-y-2 pt-2">
              <p className="text-[11px] font-semibold" style={{ color: 'var(--text-secondary)' }}>Row Behavior:</p>
              <div className="text-[10px] space-y-2" style={{ color: 'var(--text-muted)' }}>
                <p><strong>Image row:</strong> If asset is an image, it stays on screen for the CSV duration.</p>
                <p><strong>Video row:</strong> If asset is a video, it plays during the CSV time range.</p>
                <p><strong>Text-only row:</strong> If asset is empty but text exists, the app will create a text-only screen.</p>
                <p><strong>Repeat behavior:</strong> Use the same asset filename multiple times to reuse it later in the timeline.</p>
              </div>
            </div>
          </div>

        </div>
      </div>

      {jobId && (
        <ProgressOverlay
          jobId={jobId}
          onJobComplete={handleJobComplete}
          onCancelled={handleCancelled}
          onClose={() => setJobId(null)}
          renderSpec={{ resolution: settings.exportResolution, renderProfile: settings.renderProfile }}
        />
      )}

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
  )
}
