// TextToSpeechPage.tsx — Text to Speech (Local Piper + Cloud edge-tts)
import React, { useState, useEffect, useMemo, useRef } from 'react'
import {
  IconMusic,
  IconLoader,
  IconCheck,
  IconAlertTriangle,
  IconDownload,
} from './icons'
import { useAuth } from '../auth/AuthProvider'
import StudioPageHeader from './StudioPageHeader'
import {
  API_BASE_URL,
  resolveBackendUrl,
  getTtsVoices,
  detectTtsLanguage,
  startTextToSpeechJob,
  createTextToSpeechBatchJob,
  type TtsVoice,
  type TtsCatalog,
} from '../utils/api'
import { loadSettings } from '../utils/appSettings'
import { usePlan } from '../hooks/usePlan'
import { useCredits } from '../hooks/useCredits'
import { AccessLimitModal } from './billing/AccessLimitModal'
import { estimateCredits, reserveCredits, finalizeJob } from '../lib/credits'
import { canUseTool } from '../lib/plans'

type Status = 'idle' | 'generating' | 'done' | 'error'
type Mode = 'short_form' | 'long_form'
type OutputFormat = 'wav' | 'mp3'

/** Fallbacks used only until the catalog loads; server values win. */
const FALLBACK_SHORT_MAX = 5000
const FALLBACK_LONG_MAX = 30000
const FALLBACK_CHARS_PER_SEC = 15
const FALLBACK_TRANSLATE_CHARS_PER_CREDIT = 1000

function formatBytes(bytes: number) {
  if (!bytes) return ''
  const mb = bytes / 1e6
  return mb >= 1000 ? `${(mb / 1000).toFixed(1)} GB` : `${Math.round(mb)} MB`
}

function formatDuration(totalSeconds: number) {
  const s = Math.max(0, Math.round(totalSeconds))
  const m = Math.floor(s / 60)
  const r = s % 60
  if (m >= 60) {
    const h = Math.floor(m / 60)
    return `${h}h ${m % 60}m`
  }
  return m > 0 ? `${m}m ${r}s` : `${r}s`
}

export default function TextToSpeechPage() {
  const { requireAuth, user } = useAuth()
  const { plan } = usePlan()
  const { remaining, refreshCredits } = useCredits()

  const [limitModalOpen, setLimitModalOpen] = useState(false)
  const [limitModalReason, setLimitModalReason] = useState('')
  const [limitModalRequiredPlan, setLimitModalRequiredPlan] = useState<string | undefined>(undefined)

  const [catalog, setCatalog] = useState<TtsCatalog | null>(null)
  const [voicesLoading, setVoicesLoading] = useState(true)
  const [voicesError, setVoicesError] = useState<string | null>(null)

  // Mode is an explicit choice, never inferred from length.
  const [mode, setMode] = useState<Mode>('short_form')

  const [text, setText] = useState('')
  const [voiceId, setVoiceId] = useState('')
  const [speed, setSpeed] = useState(1.0)
  const [outputFormat, setOutputFormat] = useState<OutputFormat>('wav')
  const [outputName, setOutputName] = useState(() => loadSettings().defaultAudioFilename || 'speech')

  // Filters
  const [filterLanguage, setFilterLanguage] = useState('all')
  const [filterGender, setFilterGender] = useState<'all' | 'Male' | 'Female'>('all')
  const [filterEngine, setFilterEngine] = useState<'all' | 'Local' | 'Cloud'>('all')

  // Auto-translate
  const [autoTranslate, setAutoTranslate] = useState(false)
  const [langCheck, setLangCheck] = useState<{ detected: string; voice: string; mismatch: boolean } | null>(null)

  const [liveCredits, setLiveCredits] = useState<number | null>(null)
  const [estimating, setEstimating] = useState(false)

  const [status, setStatus] = useState<Status>('idle')
  const [progress, setProgress] = useState(0)
  const [statusMsg, setStatusMsg] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [jobId, setJobId] = useState<string | null>(null)
  const [result, setResult] = useState<any | null>(null)
  const [activeClientJobId, setActiveClientJobId] = useState<string | null>(null)

  const [isAddingToQueue, setIsAddingToQueue] = useState(false)
  const [successQueueMsg, setSuccessQueueMsg] = useState<string | null>(null)

  const voices = catalog?.voices || []
  const charsPerSecond = catalog?.chars_per_second || FALLBACK_CHARS_PER_SEC
  const translateCharsPerCredit = catalog?.translation_chars_per_credit || FALLBACK_TRANSLATE_CHARS_PER_CREDIT
  const maxChars = mode === 'long_form'
    ? (catalog?.long_form_max_chars || FALLBACK_LONG_MAX)
    : (catalog?.short_form_max_chars || FALLBACK_SHORT_MAX)

  // ── Load catalog ──────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    getTtsVoices()
      .then(c => {
        if (cancelled) return
        setCatalog(c)
        const preferred =
          c.voices.find(v => v.engine === 'piper' && v.downloaded) ||
          c.voices.find(v => v.language_code.startsWith('en')) ||
          c.voices[0]
        if (preferred) setVoiceId(preferred.id)
        setVoicesError(null)
      })
      .catch(err => { if (!cancelled) setVoicesError(String(err.message || err)) })
      .finally(() => { if (!cancelled) setVoicesLoading(false) })
    return () => { cancelled = true }
  }, [])

  // ── Filtered + grouped voices ─────────────────────────────────────────────
  const languages = useMemo(
    () => Array.from(new Set(voices.map(v => v.language))).sort((a, b) => a.localeCompare(b)),
    [voices]
  )

  const filtered = useMemo(() => voices.filter(v => {
    if (filterLanguage !== 'all' && v.language !== filterLanguage) return false
    if (filterEngine !== 'all' && v.engine_label !== filterEngine) return false
    // Local (Piper) voices publish no gender metadata, so "Unspecified" is
    // treated as matching any gender rather than being filtered out — which
    // would otherwise make every Local voice vanish and look like a bug.
    if (filterGender !== 'all' && v.gender !== filterGender && v.gender !== 'Unspecified') return false
    return true
  }), [voices, filterLanguage, filterGender, filterEngine])

  const grouped = useMemo(() => {
    const g = new Map<string, TtsVoice[]>()
    for (const v of filtered) {
      const key = v.language || 'Other'
      if (!g.has(key)) g.set(key, [])
      g.get(key)!.push(v)
    }
    return Array.from(g.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [filtered])

  // Keep the selection valid when filters exclude the current voice.
  useEffect(() => {
    if (!voiceId) return
    if (filtered.length && !filtered.some(v => v.id === voiceId)) {
      setVoiceId(filtered[0].id)
    }
  }, [filtered, voiceId])

  const selectedVoice = voices.find(v => v.id === voiceId)
  const charCount = text.length
  const estDurationSeconds = Math.max(1, Math.ceil(charCount / charsPerSecond))
  const overLimit = charCount > maxChars

  // ── Language mismatch detection (debounced) ───────────────────────────────
  const detectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (detectTimer.current) clearTimeout(detectTimer.current)
    if (!text.trim() || text.trim().length < 12 || !voiceId) {
      setLangCheck(null)
      setAutoTranslate(false)
      return
    }
    detectTimer.current = setTimeout(() => {
      detectTtsLanguage(text.slice(0, 1000), voiceId)
        .then(r => setLangCheck({ detected: r.detected_language, voice: r.voice_language, mismatch: r.mismatch }))
        .catch(() => setLangCheck(null))
    }, 700)
    return () => { if (detectTimer.current) clearTimeout(detectTimer.current) }
  }, [text, voiceId])

  // Auto-translate only applies while a mismatch is actually detected.
  useEffect(() => {
    if (!langCheck?.mismatch) setAutoTranslate(false)
  }, [langCheck?.mismatch])

  const willTranslate = Boolean(autoTranslate && langCheck?.mismatch)

  // ── Live credit estimate (debounced, same call used for the real charge) ──
  useEffect(() => {
    let cancelled = false
    if (!charCount || overLimit) { setLiveCredits(null); return }
    setEstimating(true)
    const t = setTimeout(() => {
      estimateCredits('text_to_speech', {
        duration_seconds: estDurationSeconds,
        translate_chars: willTranslate ? charCount : 0,
      })
        .then(c => { if (!cancelled) setLiveCredits(c) })
        .catch(() => { if (!cancelled) setLiveCredits(null) })
        .finally(() => { if (!cancelled) setEstimating(false) })
    }, 400)
    return () => { cancelled = true; clearTimeout(t) }
  }, [charCount, estDurationSeconds, willTranslate, overLimit])

  const canGenerate = !!text.trim() && !!voiceId && status !== 'generating' && !overLimit

  /** Shared credit gate. Returns the estimate actually used for the charge. */
  const runCreditGate = async (isBatch: boolean) => {
    const estimatedCredits = await estimateCredits('text_to_speech', {
      duration_seconds: estDurationSeconds,
      translate_chars: willTranslate ? charCount : 0,
    })

    // Force a live balance check right before gating — `remaining` can be
    // stale, and the blocking decision must never use an out-of-date balance.
    let currentCredits = remaining
    if (user) {
      try {
        currentCredits = await refreshCredits()
      } catch {
        setLimitModalReason('Could not verify your current credit balance. Check your connection and try again.')
        setLimitModalRequiredPlan(undefined)
        setLimitModalOpen(true)
        return null
      }
    }

    const access = canUseTool(
      plan, currentCredits, 'text_to_speech',
      { duration_seconds: estDurationSeconds, ...(isBatch ? { is_batch: true } : {}) },
      estimatedCredits
    )
    if (!access.allowed) {
      setLimitModalReason(access.reason)
      setLimitModalRequiredPlan(access.requiredPlan)
      setLimitModalOpen(true)
      return null
    }
    return estimatedCredits
  }

  /** Options shared by direct generation and batch enqueue. */
  const jobOptions = () => ({
    outputFormat,
    mode,
    autoTranslate: willTranslate,
  })

  /** Credit reservation payload — mirrors what the server re-computes. */
  const reservePayload = () => ({
    duration_seconds: estDurationSeconds,
    translate_chars: willTranslate ? charCount : 0,
  })

  const handleGenerate = async () => {
    if (!requireAuth()) return
    if (!text.trim()) { setErrorMsg('Please enter some text.'); return }
    if (!voiceId) { setErrorMsg('Please select a voice.'); return }

    const estimatedCredits = await runCreditGate(false)
    if (estimatedCredits === null) return

    const cjid = crypto.randomUUID()
    setActiveClientJobId(cjid)

    if (user) {
      try {
        await reserveCredits('text_to_speech', estDurationSeconds, estimatedCredits, cjid, reservePayload())
      } catch (err: any) {
        setActiveClientJobId(null)
        setLimitModalReason(err.message || 'Internet connection is required to verify credits before generating.')
        setLimitModalOpen(true)
        return
      }
    }

    setStatus('generating')
    setErrorMsg('')
    setProgress(0)
    setStatusMsg(willTranslate ? 'Translating script…' : 'Preparing voice…')
    setResult(null)
    setJobId(null)

    try {
      const { job_id } = await startTextToSpeechJob(
        text, voiceId, speed, outputName, estimatedCredits, jobOptions()
      )
      setJobId(job_id)
    } catch (err: any) {
      if (user) {
        await finalizeJob(cjid, 'failed')
        setActiveClientJobId(null)
      }
      setErrorMsg(String(err.message || err))
      setStatus('error')
    }
  }

  const handleAddToQueue = async () => {
    if (!requireAuth()) return
    if (!text.trim()) { setErrorMsg('Please enter some text.'); return }
    if (!voiceId) { setErrorMsg('Please select a voice.'); return }

    const estimatedCredits = await runCreditGate(true)
    if (estimatedCredits === null) return

    setIsAddingToQueue(true)
    setSuccessQueueMsg(null)

    let cjid: string | null = null
    let reserved = false

    try {
      if (user) {
        cjid = crypto.randomUUID()
        try {
          await reserveCredits('text_to_speech', estDurationSeconds, estimatedCredits, cjid, {
            is_batch: true, ...reservePayload(),
          })
          reserved = true
        } catch (err: any) {
          setLimitModalReason(err.message || 'Internet connection is required to verify credits before queueing.')
          setLimitModalOpen(true)
          setIsAddingToQueue(false)
          return
        }
      }

      await createTextToSpeechBatchJob(text, voiceId, speed, outputName, {
        cjid: cjid || undefined,
        credit_cost: estimatedCredits,
        credit_reserved: true,
        credit_tool_name: 'text_to_speech',
        duration_seconds: estDurationSeconds,
      }, jobOptions())

      setSuccessQueueMsg('Added to Batch Queue')
      setTimeout(() => setSuccessQueueMsg(null), 4000)
    } catch (err: any) {
      if (user && cjid && reserved) {
        await finalizeJob(cjid, 'failed').catch(console.error)
      }
      setErrorMsg('Failed to add to queue: ' + (err.message || err))
    } finally {
      setIsAddingToQueue(false)
    }
  }

  // ── Poll job status ───────────────────────────────────────────────────────
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>
    if (status === 'generating' && jobId) {
      interval = setInterval(async () => {
        try {
          const res = await fetch(`${API_BASE_URL}/api/jobs/${jobId}/status`)
          if (!res.ok) throw new Error('Failed to fetch status')
          const data = await res.json()

          setProgress(data.progress ?? 0)
          setStatusMsg(data.current_step || '')

          if (data.status === 'completed') {
            clearInterval(interval)
            if (user && activeClientJobId) {
              await finalizeJob(activeClientJobId, 'success')
              setActiveClientJobId(null)
            }
            setResult((data.timeline_report || [])[0] || null)
            setStatus('done')
          } else if (data.status === 'error' || data.status === 'cancelled') {
            clearInterval(interval)
            if (user && activeClientJobId) {
              await finalizeJob(activeClientJobId, data.status === 'cancelled' ? 'cancelled' : 'failed')
              setActiveClientJobId(null)
            }
            setErrorMsg(data.current_step || 'Generation failed.')
            setStatus('error')
          }
        } catch {
          // transient — retry next poll
        }
      }, 1000)
    }
    return () => clearInterval(interval)
  }, [status, jobId, user, activeClientJobId])

  const langName = (code: string) =>
    voices.find(v => v.language_code.replace('_', '-').split('-')[0].toLowerCase() === code)?.language || code.toUpperCase()

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 pb-24 space-y-6 animate-fade-in">
      <StudioPageHeader
        icon={<IconMusic size={17} />}
        title="Text to Speech"
        subtitle="Generate natural speech from text. Local voices run offline on your CPU; Cloud voices send your text to Microsoft's speech service."
      />

      {errorMsg && (
        <div className="alert-error">
          <IconAlertTriangle size={18} className="shrink-0" />
          <p className="text-sm font-medium">{errorMsg}</p>
        </div>
      )}

      {/* ── Mode tabs ── */}
      <div className="flex gap-2">
        {([
          ['short_form', 'Short Form', `Single pass · up to ${(catalog?.short_form_max_chars || FALLBACK_SHORT_MAX).toLocaleString()} chars`],
          ['long_form', 'Long Form', `Chunked & joined · up to ${(catalog?.long_form_max_chars || FALLBACK_LONG_MAX).toLocaleString()} chars`],
        ] as [Mode, string, string][]).map(([id, label, desc]) => {
          const active = mode === id
          return (
            <button
              key={id}
              onClick={() => setMode(id)}
              disabled={status === 'generating'}
              className="flex-1 text-left rounded-xl px-4 py-3 border transition-all"
              style={{
                background: active ? 'linear-gradient(135deg, rgba(99,102,241,0.14), rgba(139,92,246,0.14))' : 'var(--bg-elevated)',
                borderColor: active ? 'var(--color-accent)' : 'var(--border-default)',
                cursor: status === 'generating' ? 'not-allowed' : 'pointer',
              }}
            >
              <div className="text-sm font-bold" style={{ color: active ? 'var(--color-accent)' : 'var(--text-primary)' }}>{label}</div>
              <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{desc}</div>
            </button>
          )
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-8 space-y-6">
          {/* Text */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                {mode === 'long_form' ? 'Long Script' : 'Text'}
              </h2>
              <span className="text-[11px] font-semibold"
                    style={{ color: overLimit ? 'var(--color-error)' : 'var(--text-muted)' }}>
                {charCount.toLocaleString()} / {maxChars.toLocaleString()}
              </span>
            </div>
            <p className="text-[11px] mb-3" style={{ color: 'var(--text-muted)' }}>
              {mode === 'long_form'
                ? 'Long scripts are split into chunks, voiced separately, then joined into one file.'
                : 'Type or paste the script you want spoken.'}
            </p>
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              disabled={status === 'generating'}
              placeholder="Enter the text you want to convert to speech…"
              className="w-full text-sm rounded-xl p-3 resize-y"
              style={{
                minHeight: mode === 'long_form' ? 300 : 200,
                background: 'var(--bg-input)',
                border: `1px solid ${overLimit ? 'var(--color-error)' : 'var(--border-subtle)'}`,
                color: 'var(--text-primary)', lineHeight: 1.7,
              }}
            />
            {overLimit && (
              <p className="text-[11px] mt-2 font-semibold" style={{ color: 'var(--color-error)' }}>
                Text is over the {maxChars.toLocaleString()}-character limit for {mode === 'long_form' ? 'Long Form' : 'Short Form'}.
                {mode === 'short_form' && ' Switch to Long Form for longer scripts.'}
              </p>
            )}
          </div>

          {/* Voice filters + picker */}
          <div className="card p-5 space-y-4">
            <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Voice &amp; Settings</h2>

            {voicesError ? (
              <div className="alert-error">
                <IconAlertTriangle size={16} className="shrink-0" />
                <p className="text-xs font-medium">Could not load voices: {voicesError}</p>
              </div>
            ) : (
              <>
                {catalog && !catalog.cloud_available && (
                  <div className="rounded-lg p-2.5 text-[11px]" style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>
                    Cloud voices are unavailable right now (no internet connection). Local voices still work offline.
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="form-label mb-1.5">Language</label>
                    <select className="form-select" value={filterLanguage} disabled={voicesLoading}
                            onChange={e => setFilterLanguage(e.target.value)}>
                      <option value="all">All languages ({languages.length})</option>
                      {languages.map(l => <option key={l} value={l}>{l}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="form-label mb-1.5">Gender</label>
                    <select className="form-select" value={filterGender} disabled={voicesLoading}
                            onChange={e => setFilterGender(e.target.value as any)}>
                      <option value="all">All</option>
                      <option value="Female">Female</option>
                      <option value="Male">Male</option>
                    </select>
                  </div>
                  <div>
                    <label className="form-label mb-1.5">Engine</label>
                    <select className="form-select" value={filterEngine} disabled={voicesLoading}
                            onChange={e => setFilterEngine(e.target.value as any)}>
                      <option value="all">All</option>
                      <option value="Local">Local (offline)</option>
                      <option value="Cloud">Cloud (online)</option>
                    </select>
                  </div>
                </div>

                {filterGender !== 'all' && (
                  <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                    Local voices don't publish gender information, so they remain listed under any gender filter.
                  </p>
                )}

                <div>
                  <label className="form-label mb-2">
                    Voice{voicesLoading ? ' (loading…)' : ` — ${filtered.length} match${filtered.length === 1 ? '' : 'es'}`}
                  </label>
                  <select
                    className="form-select"
                    value={voiceId}
                    disabled={voicesLoading || status === 'generating' || !filtered.length}
                    onChange={e => setVoiceId(e.target.value)}
                  >
                    {grouped.map(([lang, list]) => (
                      <optgroup key={lang} label={`${lang} (${list.length})`}>
                        {list.map(v => (
                          <option key={v.id} value={v.id}>
                            {v.name} · {v.engine_label}
                            {v.gender !== 'Unspecified' ? ` · ${v.gender}` : ''}
                            {v.country ? ` · ${v.country}` : ''}
                            {v.engine === 'piper' && !v.downloaded ? ' · download' : ''}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  {!filtered.length && !voicesLoading && (
                    <p className="text-[11px] mt-1.5" style={{ color: 'var(--color-error)' }}>
                      No voices match these filters.
                    </p>
                  )}
                  {selectedVoice?.engine === 'piper' && !selectedVoice.downloaded && (
                    <p className="text-[10px] mt-1.5 flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
                      <IconDownload size={11} />
                      One-time {formatBytes(selectedVoice.size_bytes)} download on first use.
                    </p>
                  )}
                  {selectedVoice?.requires_internet && (
                    <p className="text-[10px] mt-1.5" style={{ color: 'var(--text-muted)' }}>
                      Cloud voice — your text is sent to Microsoft's speech service to generate audio.
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="form-label mb-2">Speed — {speed.toFixed(2)}x</label>
                    <input type="range" min={0.5} max={2} step={0.05} value={speed}
                           disabled={status === 'generating'}
                           onChange={e => setSpeed(parseFloat(e.target.value))} className="w-full" />
                  </div>
                  <div>
                    <label className="form-label mb-2">Format</label>
                    <select className="form-select" value={outputFormat}
                            disabled={status === 'generating'}
                            onChange={e => setOutputFormat(e.target.value as OutputFormat)}>
                      <option value="wav">WAV (uncompressed)</option>
                      <option value="mp3">MP3 (smaller)</option>
                    </select>
                  </div>
                  <div>
                    <label className="form-label mb-2">Output filename</label>
                    <input type="text" className="form-input w-full" value={outputName}
                           disabled={status === 'generating'}
                           onChange={e => setOutputName(e.target.value)} placeholder="speech" />
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Auto-translate — only offered on a detected mismatch */}
          {langCheck?.mismatch && (
            <div className="card p-5" style={{ borderColor: 'var(--color-accent)' }}>
              <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" className="form-checkbox mt-0.5" checked={autoTranslate}
                       disabled={status === 'generating'}
                       onChange={e => setAutoTranslate(e.target.checked)} />
                <span>
                  <span className="text-sm font-bold block" style={{ color: 'var(--text-primary)' }}>
                    Auto-Translate before voicing
                  </span>
                  <span className="text-[11px] block mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    Your <strong>{langName(langCheck.detected)}</strong> text will be translated to{' '}
                    <strong>{langName(langCheck.voice)}</strong> before it's voiced
                    {' '}— <strong>+{Math.max(1, Math.ceil(charCount / translateCharsPerCredit))} credits</strong>.
                  </span>
                  <span className="text-[10px] block mt-1" style={{ color: 'var(--text-muted)' }}>
                    Translation uses a free public online service, so it needs an internet connection.
                  </span>
                </span>
              </label>
            </div>
          )}

          {/* Live estimate + actions */}
          <div className="card p-5">
            {charCount > 0 && !overLimit && (
              <div className="grid grid-cols-3 gap-2 mb-4">
                {[
                  ['Characters', charCount.toLocaleString()],
                  ['Est. duration', formatDuration(estDurationSeconds)],
                  ['Est. credits', estimating ? '…' : (liveCredits !== null ? String(liveCredits) : '—')],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg p-2.5 text-center" style={{ background: 'var(--bg-elevated)' }}>
                    <p className="text-[9px] uppercase tracking-wider mb-0.5 opacity-70" style={{ color: 'var(--text-muted)' }}>{label}</p>
                    <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{value}</p>
                  </div>
                ))}
              </div>
            )}

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
              {status === 'generating'
                ? <><IconLoader size={18} className="animate-spin" /> {statusMsg || 'Generating…'}</>
                : <><IconMusic size={18} /> Generate {mode === 'long_form' ? 'Long Form' : 'Speech'}</>}
            </button>

            {status === 'generating' && (
              <div className="mt-3 space-y-1.5">
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-input)' }}>
                  <div className="h-full rounded-full transition-all duration-300"
                       style={{ width: `${progress}%`, background: 'linear-gradient(90deg, #6366f1, #8b5cf6)' }} />
                </div>
                <p className="text-[11px] text-center" style={{ color: 'var(--text-muted)' }}>{statusMsg}</p>
              </div>
            )}

            <button
              onClick={handleAddToQueue}
              disabled={!canGenerate || isAddingToQueue}
              className={`w-full mt-3 flex items-center justify-center gap-2 rounded-xl text-sm font-bold h-12 transition-colors border ${
                canGenerate && !isAddingToQueue
                  ? 'hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer border-[var(--border-default)]'
                  : 'opacity-50 cursor-not-allowed border-transparent bg-[var(--bg-elevated)]'
              }`}
              style={{ color: 'var(--text-primary)' }}
            >
              {isAddingToQueue
                ? <><IconLoader size={16} className="animate-spin" /> Adding…</>
                : <><IconMusic size={16} /> Add to Batch Queue</>}
            </button>

            {successQueueMsg && (
              <div className="flex items-center justify-center gap-2 mt-2 p-3 rounded-lg border bg-green-500/10 border-green-500/20 text-green-500 font-bold text-sm">
                <IconCheck size={16} /> {successQueueMsg}
              </div>
            )}
          </div>

          {/* Result */}
          {status === 'done' && result && (
            <div className="card p-5 space-y-4">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full flex items-center justify-center"
                     style={{ background: 'rgba(16,185,129,0.15)', color: '#10b981' }}>
                  <IconCheck size={13} />
                </div>
                <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Speech generated</h3>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  ['Duration', formatDuration(result.duration_seconds || 0)],
                  ['Characters', (result.char_count ?? 0).toLocaleString()],
                  ['Format', String(result.output_format || '').toUpperCase()],
                  [result.mode === 'long_form' ? 'Chunks' : 'Engine',
                   result.mode === 'long_form' ? String(result.total_chunks ?? 1) : (result.engine === 'edge' ? 'Cloud' : 'Local')],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg p-2.5" style={{ background: 'var(--bg-elevated)' }}>
                    <p className="text-[9px] uppercase tracking-wider mb-0.5 opacity-70" style={{ color: 'var(--text-muted)' }}>{label}</p>
                    <p className="text-[11px] font-bold truncate" style={{ color: 'var(--text-primary)' }}>{value}</p>
                  </div>
                ))}
              </div>

              {result.translated && (
                <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  Translated from {langName(result.translated_from || '')} to {langName(result.translated_to || '')} before voicing.
                </p>
              )}

              {result.output_url && (
                <>
                  <audio controls src={resolveBackendUrl(result.output_url)} className="w-full" />
                  <a href={resolveBackendUrl(result.output_url)}
                     download={result.output_name || `speech.${result.output_format || 'wav'}`}
                     className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg btn-primary">
                    <IconDownload size={13} /> Download {String(result.output_format || '').toUpperCase()}
                  </a>
                </>
              )}
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="lg:col-span-4 space-y-6">
          <div className="card p-5">
            <h3 className="text-sm font-bold mb-3" style={{ color: 'var(--text-primary)' }}>About the engines</h3>
            <ul className="space-y-2 text-[11px]" style={{ color: 'var(--text-muted)' }}>
              <li>• <strong>Local</strong> ({voices.filter(v => v.engine === 'piper').length} voices) — runs offline on your CPU. Nothing leaves your device. Voices download once, then stay cached.</li>
              <li>• <strong>Cloud</strong> ({voices.filter(v => v.engine === 'edge').length} voices) — higher-quality neural voices. Sends your text over the internet to Microsoft's speech service.</li>
              <li>• {languages.length} languages available in total.</li>
              <li>• Output is WAV or MP3, saved to your history.</li>
            </ul>
          </div>
        </div>
      </div>

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
