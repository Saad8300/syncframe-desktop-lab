import React, { useState, useRef, useEffect } from 'react'
import {
  IconMusic,
  IconUpload,
  IconX,
  IconLoader,
  IconCheck,
  IconAlertTriangle,
  IconDownload,
  IconChevronDown,
  IconChevronRight
} from './icons'
import StudioPageHeader from './StudioPageHeader'
import { API_BASE_URL, apiUrl } from '../utils/api'
import { loadSettings } from '../utils/appSettings'
import { consumePendingTemplate, saveTemplate } from '../utils/templateStore'

function IconMic({ size = 24, style }: { size?: number; style?: React.CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={style}>
      <path d="M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3Z"/>
      <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
      <line x1="12" x2="12" y1="19" y2="22"/>
    </svg>
  )
}
function IconCopy({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect width="14" height="14" x="8" y="8" rx="2" ry="2"/>
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
    </svg>
  )
}

type AppStatus = 'idle' | 'transcribing' | 'done' | 'error'

const OUTPUT_MODES: { value: string; label: string; desc: string }[] = [
  { value: 'simple',   label: 'Simple Timestamp Script', desc: '[0:00] Line here' },
  { value: 'detailed', label: 'Detailed Timestamp Script', desc: '[0:00 - 0:04] Line here' },
  { value: 'scene',    label: 'Scene Plan', desc: 'Scene 1 | 0:00 - 0:04 | Line here' },
  { value: 'srt',      label: 'SRT Captions', desc: 'Standard subtitle format' },
  { value: 'csv',      label: 'Image Timeline CSV', desc: 'TXT preview + Image Timeline CSV using 1.jpg, 2.jpg, 3.jpg…' },
]

const MODELS = [
  { value: 'tiny',  label: 'Whisper Tiny — fastest' },
  { value: 'base',  label: 'Whisper Base — balanced' },
  { value: 'small', label: 'Whisper Small — better accuracy, slower' },
]

const STYLES = [
  { value: 'standard', label: 'Standard Mode', desc: 'Keep natural sentences' },
  { value: 'visual_beat', label: 'Visual Beat Mode', desc: 'Shorter lines for image/video changes' },
]

const INTENSITIES = [
  { value: 'normal', label: 'Normal', desc: 'Minimal splitting' },
  { value: 'detailed', label: 'Detailed', desc: 'Moderate splitting on punctuation' },
  { value: 'aggressive', label: 'Aggressive', desc: 'Split more aggressively' },
]

const LANGUAGES = [
  { code: 'auto', label: 'Auto Detect' },
  { code: 'en',   label: 'English' },
  { code: 'ur',   label: 'Urdu' },
  { code: 'hi',   label: 'Hindi' },
  { code: 'ar',   label: 'Arabic' },
  { code: 'es',   label: 'Spanish' },
  { code: 'fr',   label: 'French' },
  { code: 'de',   label: 'German' },
  { code: 'pt',   label: 'Portuguese' },
  { code: 'id',   label: 'Indonesian' },
  { code: 'tr',   label: 'Turkish' },
  { code: 'ru',   label: 'Russian' },
  { code: 'ja',   label: 'Japanese' },
  { code: 'ko',   label: 'Korean' },
  { code: 'zh',   label: 'Mandarin Chinese' },
]

function formatBytes(bytes: number) {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}
function formatDuration(s: number) {
  const m = Math.floor(s / 60), sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

/** Format seconds as MM:SS or HH:MM:SS for CSV export */
function secsToTimecode(totalSec: number): string {
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = Math.floor(totalSec % 60)
  if (h > 0) {
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
  }
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
}

/** Build the readable bracket-format TXT preview from segments */
function buildImageTimelinePreview(segments: { start: number; end: number; text: string }[]): string {
  return segments
    .filter(s => s.text.trim())
    .map(s => {
      const start = formatDuration(s.start)
      const end = formatDuration(s.end)
      return `[${start} - ${end}] ${s.text.trim()}`
    })
    .join('\n')
}

/** Build Image Timeline CSV from segments (image,start,end,text) */
function buildImageTimelineCsv(segments: { start: number; end: number; text: string }[]): string {
  const filtered = segments.filter(s => s.text.trim())
  const rows = filtered.map((s, i) => {
    const image = `${i + 1}.jpg`
    const start = secsToTimecode(s.start)
    const end = secsToTimecode(s.end)
    // Escape text: wrap in double-quotes, escape inner double-quotes by doubling
    const safeText = `"${s.text.trim().replace(/"/g, '""')}"`
    return `${image},${start},${end},${safeText}`
  })
  return ['image,start,end,text', ...rows].join('\n')
}

export default function ScriptTimestampPage() {
  const [audioFile, setAudioFile]   = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  // Settings - new defaults for Short-form video workflow
  const [modelKey, setModelKey]     = useState('base')
  const [language, setLanguage]     = useState('auto')
  const [outputStyle, setOutputStyle] = useState('visual_beat')
  const [segmentationIntensity, setSegmentationIntensity] = useState('detailed')
  const [outputMode, setOutputMode] = useState('csv')
  const [outputName, setOutputName] = useState(() => loadSettings().defaultScriptFilename)

  useEffect(() => {
    const pending = consumePendingTemplate('script_timestamp')
    if (pending) {
      if (pending.modelKey) setModelKey(pending.modelKey as string)
      if (pending.language) setLanguage(pending.language as string)
      if (pending.outputStyle) setOutputStyle(pending.outputStyle as string)
      if (pending.segmentationIntensity) setSegmentationIntensity(pending.segmentationIntensity as string)
      if (pending.outputMode) setOutputMode(pending.outputMode as string)
      if (pending.outputName) setOutputName(pending.outputName as string)
    }
  }, [])
  
  // Original Script
  const [originalScript, setOriginalScript] = useState('')
  const [showOriginalScript, setShowOriginalScript] = useState(false)

  // Advanced Segmentation
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [targetSegmentLength, setTargetSegmentLength] = useState('1-3')
  const [maxWordsPerLine, setMaxWordsPerLine] = useState('4-8')
  const [splitOnPunctuation, setSplitOnPunctuation] = useState(true)
  const [avoidVeryShortLines, setAvoidVeryShortLines] = useState(true)
  
  const [status, setStatus]         = useState<AppStatus>('idle')
  const [progress, setProgress]     = useState(0)
  const [statusMsg, setStatusMsg]   = useState('')
  const [errorMsg, setErrorMsg]     = useState('')
  const [jobId, setJobId]           = useState<string | null>(null)
  const [result, setResult]         = useState<any | null>(null)
  const [copied, setCopied]         = useState(false)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
    if (!['mp3', 'wav', 'm4a', 'aac', 'webm', 'mp4', 'ogg', 'flac'].includes(ext)) {
      setErrorMsg('This audio format is not supported. Use mp3, wav, m4a, aac, webm, or mp4.')
      return
    }
    setAudioFile(file)
    setErrorMsg('')
    setResult(null)
    setStatus('idle')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleGenerate = async () => {
    if (!audioFile) {
      setErrorMsg('Please upload an audio file.')
      return
    }
    setStatus('transcribing')
    setErrorMsg('')
    setProgress(0)
    setStatusMsg('Uploading audio…')
    setResult(null)
    setJobId(null)

    const formData = new FormData()
    formData.append('audio_file', audioFile)
    formData.append('model_name', modelKey)
    formData.append('language', language)
    formData.append('output_style', outputStyle)
    formData.append('segmentation_intensity', segmentationIntensity)
    formData.append('output_format', outputMode)
    
    if (originalScript.trim()) {
      formData.append('original_script', originalScript)
    }

    if (showAdvanced) {
      formData.append('target_segment_length', targetSegmentLength)
      formData.append('max_words_per_line', maxWordsPerLine)
      formData.append('split_on_punctuation', splitOnPunctuation ? 'true' : 'false')
      formData.append('avoid_very_short_lines', avoidVeryShortLines ? 'true' : 'false')
    }

    try {
      const res = await fetch(`${API_BASE_URL}/api/jobs/start-script-timestamp`, {
        method: 'POST',
        body: formData,
      })
      if (!res.ok) {
        throw new Error('Backend transcription failed. Please check your audio file and try again.')
      }
      const data = await res.json()
      setJobId(data.job_id)
    } catch (err: any) {
      if (err.message && err.message.includes('Backend transcription failed')) {
        setErrorMsg('Backend transcription failed. Please check your audio file and try again.')
      } else {
        setErrorMsg('Backend is offline. Start the backend and try again.')
      }
      setStatus('error')
    }
  }

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>
    if (status === 'transcribing' && jobId) {
      interval = setInterval(async () => {
        try {
          const res = await fetch(`${API_BASE_URL}/api/jobs/${jobId}/status`)
          if (!res.ok) throw new Error('Failed to fetch status')
          const data = await res.json()
          
          if (data.status === 'completed') {
            clearInterval(interval)
            const rep = data.timeline_report?.[0]
            if (rep) {
              setResult(rep)
              setStatus('done')
            } else {
              setErrorMsg('No output received.')
              setStatus('error')
            }
          } else if (data.status === 'error') {
            clearInterval(interval)
            const rawErr = String(data.errors?.[0] || '')
            if (rawErr.includes('KeyError') || rawErr.includes('formatting')) {
              setErrorMsg('Script Timestamp result formatting failed. Please check backend logs.')
            } else if (rawErr.includes('WhisperModel') || rawErr.includes('compute_type') || rawErr.includes('OutOfMemory') || rawErr.includes('Failed to load')) {
              setErrorMsg('Whisper model failed to load. Try a smaller model.')
            } else if (rawErr) {
              setErrorMsg('Unexpected Script Timestamp error. Check backend logs for details.')
            } else {
              setErrorMsg('Backend transcription failed. Please check your audio file and try again.')
            }
            setStatus('error')
          } else if (data.status === 'cancelled') {
            clearInterval(interval)
            setErrorMsg('Transcription cancelled.')
            setStatus('error')
          } else {
            setProgress(data.progress || 0)
            setStatusMsg(data.current_step || 'Processing…')
          }
        } catch (err) {
          // just retry next poll
        }
      }, 1000)
    }
    return () => clearInterval(interval)
  }, [status, jobId])

  const handleCopy = async () => {
    if (!result) return
    // For Image Timeline CSV mode, copy the readable TXT preview
    const textToCopy = (outputMode === 'csv' && result.segments?.length)
      ? buildImageTimelinePreview(result.segments)
      : result.text
    await navigator.clipboard.writeText(textToCopy)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const downloadAs = (content: string, filename: string, mime = 'text/plain') => {
    const blob = new Blob([content], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = filename
    document.body.appendChild(a); a.click()
    a.remove(); URL.revokeObjectURL(url)
  }

  const canGenerate = !!audioFile && status !== 'transcribing'
  const baseName = audioFile ? audioFile.name.replace(/\.[^.]+$/, '') : 'transcript'

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 pb-24 space-y-6 animate-fade-in">
      <StudioPageHeader
        icon={<IconMic size={17} />}
        title="Script Timestamp"
        subtitle="Generate timestamps, scene plans, and transcripts automatically using local Whisper AI."
      />

      {errorMsg && (
        <div className="alert-error">
          <IconAlertTriangle size={18} className="shrink-0" />
          <p className="text-sm font-medium">{errorMsg}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-8 space-y-6">
          {/* Upload */}
          <div className="card p-5">
            <h2 className="text-sm font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Upload Audio File</h2>
            <p className="text-[11px] mb-4" style={{ color: 'var(--text-muted)' }}>
              Supported: mp3, wav, m4a, aac, webm, mp4. Your audio never leaves your device.
            </p>

            {audioFile ? (
              <div className="flex items-center justify-between p-3 rounded-xl border"
                   style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-elevated)' }}>
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                       style={{ background: 'var(--accent-subtle)' }}>
                    <IconMusic size={16} style={{ color: 'var(--accent-primary)' }} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{audioFile.name}</p>
                    <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{formatBytes(audioFile.size)}</p>
                  </div>
                </div>
                <button onClick={() => { setAudioFile(null); setResult(null) }}
                        className="w-7 h-7 rounded flex items-center justify-center hover:bg-red-500/10 text-red-500 shrink-0">
                  <IconX size={14} />
                </button>
              </div>
            ) : (
              <button onClick={() => fileInputRef.current?.click()}
                      disabled={status === 'transcribing'}
                      className="w-full border-2 border-dashed rounded-xl py-14 flex flex-col items-center gap-3 transition-colors group animate-fade-in-up"
                      style={{ borderColor: 'var(--border-default)', background: 'var(--bg-elevated)' }}>
                <div className="w-14 h-14 rounded-full flex items-center justify-center transition-transform group-hover:scale-110 mb-2"
                     style={{ background: 'var(--bg-input)' }}>
                  <IconUpload size={24} style={{ color: 'var(--text-muted)' }} />
                </div>
                <div className="text-center px-4">
                  <p className="text-lg font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Click to upload audio</p>
                  <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Upload audio and generate timestamped text for your timeline workflow.</p>
                  <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>mp3, wav, m4a, aac, webm, mp4</p>
                </div>
              </button>
            )}

            <input ref={fileInputRef} type="file" className="hidden"
                   accept=".mp3,.wav,.m4a,.aac,.webm,.mp4,.ogg,.flac"
                   onChange={handleFileChange} />
          </div>

          {/* Original Script (Optional) */}
          <div className="card p-5">
            <button 
              onClick={() => setShowOriginalScript(!showOriginalScript)}
              className="flex items-center justify-between w-full text-left"
            >
              <div>
                <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Paste Original Script <span className="font-normal opacity-70">(Optional)</span></h2>
                <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>Helps the tool create cleaner timestamped lines that follow your original wording.</p>
              </div>
              <div className="shrink-0 ml-4 p-1 rounded hover:bg-white/5 transition-colors">
                {showOriginalScript ? <IconChevronDown size={18} /> : <IconChevronRight size={18} />}
              </div>
            </button>

            {showOriginalScript && (
              <div className="mt-4 animate-fade-in space-y-2">
                <textarea
                  value={originalScript}
                  onChange={e => setOriginalScript(e.target.value)}
                  disabled={status === 'transcribing'}
                  placeholder="Paste your original script here if you want timestamps aligned with your written script..."
                  className="w-full text-sm rounded-xl p-3 resize-y"
                  style={{ minHeight: 120, background: 'var(--bg-input)', border: '1px solid var(--border-subtle)',
                           color: 'var(--text-primary)' }}
                />
              </div>
            )}
          </div>

          {/* Settings */}
          <div className="card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Settings</h2>
              <button 
                onClick={() => {
                  const name = window.prompt('Enter template name:', 'My Script Template')
                  if (name) {
                    saveTemplate({ 
                      name, 
                      tool: 'script_timestamp', 
                      description: 'Saved from Script Timestamp', 
                      settings: { modelKey, language, outputStyle, segmentationIntensity, outputMode, outputName } 
                    })
                    alert('Template saved to your templates library!')
                  }
                }} 
                className="text-[10px] font-bold px-2 py-1 bg-[var(--bg-input)] hover:bg-[var(--accent-primary)] hover:text-white rounded border border-[var(--border-subtle)] transition-colors"
              >
                Save as Template
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="form-label">AI Model</label>
                <select value={modelKey} onChange={e => setModelKey(e.target.value)}
                        className="form-select" disabled={status === 'transcribing'}>
                  {MODELS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
                <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                  Models run locally in the backend.
                </p>
              </div>

              <div className="space-y-1">
                <label className="form-label">Language</label>
                <select value={language} onChange={e => setLanguage(e.target.value)}
                        className="form-select" disabled={status === 'transcribing'}>
                  {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
                </select>
              </div>

              <div className="space-y-1">
                <label className="form-label">Output Style</label>
                <select value={outputStyle} onChange={e => setOutputStyle(e.target.value)}
                        className="form-select" disabled={status === 'transcribing'}>
                  {STYLES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
                <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                  {STYLES.find(s => s.value === outputStyle)?.desc}
                </p>
              </div>

              <div className="space-y-1">
                <label className="form-label">Segmentation Intensity</label>
                <select value={segmentationIntensity} onChange={e => setSegmentationIntensity(e.target.value)}
                        className="form-select" disabled={status === 'transcribing'}>
                  {INTENSITIES.map(i => <option key={i.value} value={i.value}>{i.label}</option>)}
                </select>
                <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                  {INTENSITIES.find(i => i.value === segmentationIntensity)?.desc}
                </p>
              </div>

              <div className="space-y-1 sm:col-span-1">
                <label className="form-label">Output Format</label>
                <select value={outputMode}
                        onChange={e => setOutputMode(e.target.value)}
                        className="form-select" disabled={status === 'transcribing'}>
                  {OUTPUT_MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
                <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                  {OUTPUT_MODES.find(m => m.value === outputMode)?.desc}
                </p>
              </div>

              <div className="space-y-1 sm:col-span-1">
                <label className="form-label">Output Filename</label>
                <input 
                  type="text" 
                  className="form-input bg-[var(--bg-input)]"
                  value={outputName}
                  onChange={e => setOutputName(e.target.value)}
                  disabled={status === 'transcribing'}
                  placeholder="script_timestamp"
                />
              </div>
            </div>
          </div>

          {/* Advanced Segmentation (Optional) */}
          <div className="card p-5">
            <button 
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center justify-between w-full text-left"
            >
              <div>
                <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Advanced Segmentation Controls</h2>
              </div>
              <div className="shrink-0 ml-4 p-1 rounded hover:bg-white/5 transition-colors">
                {showAdvanced ? <IconChevronDown size={18} /> : <IconChevronRight size={18} />}
              </div>
            </button>

            {showAdvanced && (
              <div className="mt-4 animate-fade-in grid grid-cols-1 sm:grid-cols-2 gap-4 border-t pt-4" style={{ borderColor: 'var(--border-subtle)' }}>
                <div className="space-y-1">
                  <label className="form-label">Target segment length</label>
                  <select value={targetSegmentLength} onChange={e => setTargetSegmentLength(e.target.value)} className="form-select" disabled={status === 'transcribing'}>
                    <option value="1-2">1–2 sec</option>
                    <option value="1-3">1–3 sec (Visual Beat Default)</option>
                    <option value="3-5">3–5 sec</option>
                  </select>
                </div>
                
                <div className="space-y-1">
                  <label className="form-label">Max words per line</label>
                  <select value={maxWordsPerLine} onChange={e => setMaxWordsPerLine(e.target.value)} className="form-select" disabled={status === 'transcribing'}>
                    <option value="4-6">4–6 words</option>
                    <option value="4-8">4–8 words (Visual Beat Default)</option>
                    <option value="9-12">9–12 words</option>
                  </select>
                </div>
                
                <div className="space-y-2 mt-2 sm:col-span-2">
                  <label className="flex items-center gap-2 cursor-pointer group w-max">
                    <input type="checkbox" className="form-checkbox" checked={splitOnPunctuation} onChange={e => setSplitOnPunctuation(e.target.checked)} disabled={status === 'transcribing'} />
                    <span className="text-sm group-hover:text-white transition-colors" style={{ color: 'var(--text-primary)' }}>Split on punctuation</span>
                  </label>
                  
                  <label className="flex items-center gap-2 cursor-pointer group w-max">
                    <input type="checkbox" className="form-checkbox" checked={avoidVeryShortLines} onChange={e => setAvoidVeryShortLines(e.target.checked)} disabled={status === 'transcribing'} />
                    <span className="text-sm group-hover:text-white transition-colors" style={{ color: 'var(--text-primary)' }}>Avoid very short lines</span>
                  </label>
                </div>
              </div>
            )}
          </div>

          {/* Generate */}
          <div className="card p-5">
            <button
              onClick={handleGenerate}
              disabled={!canGenerate}
              className="w-full flex items-center justify-center gap-2 rounded-xl text-sm font-bold transition-all"
              style={{
                height: 52,
                background: canGenerate ? 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)' : 'var(--bg-elevated)',
                color: canGenerate ? '#fff' : 'var(--text-muted)',
                boxShadow: canGenerate ? '0 4px 16px rgba(99,102,241,0.35)' : 'none',
                border: canGenerate ? 'none' : '1px solid var(--border-default)',
                cursor: canGenerate ? 'pointer' : 'not-allowed',
              }}
            >
              {status === 'transcribing' ? (
                <><IconLoader size={18} className="animate-spin" /> {statusMsg || 'Transcribing…'}</>
              ) : (
                <><IconMic size={18} /> Generate Timestamps</>
              )}
            </button>

            {status === 'transcribing' && (
              <div className="mt-3 space-y-1.5">
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-input)' }}>
                  <div className="h-full rounded-full transition-all duration-300"
                       style={{ width: `${progress}%`, background: 'linear-gradient(90deg, #6366f1, #8b5cf6)' }} />
                </div>
                <p className="text-[11px] text-center" style={{ color: 'var(--text-muted)' }}>{statusMsg}</p>
                <p className="text-[10px] text-center" style={{ color: 'var(--text-muted)' }}>
                  For long audio, keep the backend running and avoid closing this window.
                </p>
              </div>
            )}
          </div>

          {/* Results */}
          {status === 'done' && result && (
            <div className="card p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full flex items-center justify-center"
                       style={{ background: 'rgba(34,197,94,0.15)' }}>
                    <IconCheck size={12} style={{ color: '#22c55e' }} />
                  </div>
                  <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Transcription Complete</h2>
                </div>
                <div className="text-[10px] uppercase font-bold tracking-wider opacity-60">Result Stats</div>
              </div>

              {result.original_script_used && (
                <div className="rounded-lg p-3 text-xs mb-2"
                     style={{ background: 'rgba(99, 102, 241, 0.1)', border: '1px solid rgba(99, 102, 241, 0.2)' }}>
                  <p className="font-semibold" style={{ color: 'var(--accent-primary)' }}>✨ Original Script Applied</p>
                  <p style={{ color: 'var(--text-secondary)' }}>
                    Original script was used as guidance. Timing is based on transcription and may be approximate.
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {[
                  { label: 'Style', value: STYLES.find(s => s.value === (result.output_style || outputStyle))?.label.replace(' Mode','') ?? (result.output_style || outputStyle) },
                  { label: 'Lang', value: ['auto','detected'].includes(result.language) ? 'Auto' : result.language.toUpperCase() },
                  { label: 'Duration', value: formatDuration(result.duration_seconds || result.duration || 0) },
                  { label: 'Lines', value: String(result.segments_count || 0) },
                  { label: 'Avg Sec/Line', value: (result.average_segment_seconds || result.avg_segment_length) ? `${result.average_segment_seconds || result.avg_segment_length}s` : '—' },
                ].map(({ label, value }) => (
                  <div key={label} className="rounded-lg p-2 text-center flex flex-col justify-center"
                       style={{ background: 'var(--bg-elevated)', minHeight: 56 }}>
                    <p className="text-[9px] uppercase tracking-wider mb-0.5 opacity-70" style={{ color: 'var(--text-muted)' }}>{label}</p>
                    <p className="text-[11px] font-bold truncate" style={{ color: 'var(--text-primary)' }}>{value}</p>
                  </div>
                ))}
              </div>

              <div>
                <label className="form-label mb-2">Output</label>
                <textarea
                  readOnly
                  value={
                    // Image Timeline CSV mode: show readable TXT preview, not raw CSV
                    outputMode === 'csv' && result.segments?.length
                      ? buildImageTimelinePreview(result.segments)
                      : result.text
                  }
                  className="w-full text-xs font-mono rounded-xl p-3 resize-y"
                  style={{ minHeight: 180, background: 'var(--bg-input)', border: '1px solid var(--border-subtle)',
                           color: 'var(--text-primary)', lineHeight: 1.7 }}
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <button onClick={handleCopy}
                        className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg transition-colors"
                        style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border-default)' }}>
                  {copied ? <IconCheck size={13} /> : <IconCopy size={13} />}
                  {copied ? 'Copied!' : 'Copy Output'}
                </button>

                <button onClick={() => {
                  const now = new Date()
                  const ts = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}${String(now.getSeconds()).padStart(2,'0')}`
                  // For Image Timeline CSV mode: TXT download = readable bracket preview
                  const txtContent = (outputMode === 'csv' && result.segments?.length)
                    ? buildImageTimelinePreview(result.segments)
                    : result.text
                  downloadAs(txtContent, `${outputName}.txt`)
                }}
                        className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg transition-colors"
                        style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border-default)' }}>
                  <IconDownload size={13} /> Download TXT
                </button>

                {(result.output_format === 'srt' || result.format === 'srt') && (
                  <button onClick={() => downloadAs(result.text, `${outputName}.srt`)}
                          className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg btn-primary transition-colors">
                    <IconDownload size={13} /> Download SRT
                  </button>
                )}

                {(result.output_format === 'csv' || result.format === 'csv') && (
                  <button onClick={() => {
                    const now = new Date()
                    const ts = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}${String(now.getSeconds()).padStart(2,'0')}`
                    // Build proper Image Timeline CSV from raw segments if available
                    const csvContent = result.segments?.length
                      ? buildImageTimelineCsv(result.segments)
                      : (() => {
                          // Fallback: if no segments, wrap raw text with header
                          let c = result.text
                          if (!c.includes('image,start,end,text')) c = 'image,start,end,text\n' + c
                          return c
                        })()
                    downloadAs(csvContent, `${outputName}.csv`, 'text/csv')
                  }}
                          className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg btn-primary transition-colors">
                    <IconDownload size={13} /> Download CSV
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right sidebar */}
        <div className="lg:col-span-4 space-y-6">
          <div className="card p-5 space-y-3">
            <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Usage Details</h2>
            <ul className="text-xs space-y-1.5" style={{ color: 'var(--text-secondary)' }}>
              <li><strong>Mode:</strong> Backend Local Whisper</li>
              <li><strong>Model:</strong> {MODELS.find(m => m.value === modelKey)?.label || modelKey}</li>
              <li><strong>Language:</strong> {LANGUAGES.find(l => l.code === language)?.label || language}</li>
              <li><strong>Output Style:</strong> {STYLES.find(s => s.value === outputStyle)?.label || outputStyle}</li>
              <li><strong>Segmentation:</strong> {INTENSITIES.find(i => i.value === segmentationIntensity)?.label || segmentationIntensity}</li>
              <li><strong>Output Format:</strong> {OUTPUT_MODES.find(m => m.value === outputMode)?.label || outputMode}</li>
              {audioFile && <li><strong>File Size:</strong> {formatBytes(audioFile.size)}</li>}
              {result && (
                <>
                  <li className="pt-2 mt-2 border-t" style={{ borderColor: 'var(--border-subtle)' }}><strong>Duration:</strong> {formatDuration(result.duration_seconds || result.duration || 0)}</li>
                  <li><strong>Segments:</strong> {result.segments_count}</li>
                  <li><strong>Avg Segment:</strong> {result.average_segment_seconds || result.avg_segment_length || 0} sec</li>
                  <li><strong>Original Script:</strong> {result.original_script_used ? 'Yes' : 'No'}</li>
                  <li><strong>Processing Time:</strong> {result.processing_seconds ? `${result.processing_seconds}s` : 'N/A'}</li>
                </>
              )}
            </ul>
          </div>

          <div className="card p-5 space-y-3">
            <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Quick Guide</h2>
            <div className="space-y-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
              {[
                ['1', 'Upload your voiceover audio file'],
                ['2', <span key="2"><strong>Optional Script:</strong> Paste your original script to help create cleaner timestamped lines.</span>],
                ['3', 'Choose language — Auto Detect works for most files'],
                ['4', 'Select Output Style (Visual Beat is great for Shorts)'],
                ['5', 'Select output format for your workflow'],
                ['6', 'Click Generate Timestamps'],
              ].map(([step, desc]) => (
                <div key={step as string} className="flex gap-2.5">
                  <span className="w-5 h-5 rounded-full shrink-0 flex items-center justify-center text-[10px] font-bold"
                        style={{ background: 'var(--accent-subtle)', color: 'var(--accent-primary)' }}>
                    {step}
                  </span>
                  <span className="leading-snug">{desc}</span>
                </div>
              ))}
            </div>
            <div className="rounded-lg p-3 text-xs space-y-1 mt-4"
                 style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
              <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>🔒 Backend Local Whisper</p>
              <p style={{ color: 'var(--text-muted)' }}>
                Audio is processed locally by the SyncFrame backend on this machine. No cloud API is used. For long audio, keep the backend running until transcription finishes.
              </p>
            </div>
          </div>

          <div className="card p-5 space-y-3">
            <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Visual Beat Mode</h2>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              Visual Beat Mode creates short 1–3 second lines for image/video switches, perfect for TikTok and Shorts. 
            </p>
            <div className="rounded-lg p-3 text-xs"
                 style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
              <p className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>💡 Image Timeline CSV Tip</p>
              <p style={{ color: 'var(--text-muted)' }}>
                Use Visual Beat + Image Timeline CSV output for the fastest image-sync workflow.
                The CSV downloads with auto-numbered image names: 1.jpg, 2.jpg, 3.jpg…
                Just name your images the same way inside the Images ZIP.
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
