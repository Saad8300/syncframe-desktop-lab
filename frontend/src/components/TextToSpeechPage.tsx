// TextToSpeechPage.tsx — Piper text-to-speech (local, offline, CPU)
import React, { useState, useEffect, useMemo } from 'react'
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
  apiUrl,
  resolveBackendUrl,
  getTtsVoices,
  startTextToSpeechJob,
  createTextToSpeechBatchJob,
  type TtsVoice,
} from '../utils/api'
import { loadSettings } from '../utils/appSettings'
import { usePlan } from '../hooks/usePlan'
import { useCredits } from '../hooks/useCredits'
import { AccessLimitModal } from './billing/AccessLimitModal'
import { estimateCredits, reserveCredits, finalizeJob } from '../lib/credits'
import { canUseTool } from '../lib/plans'

type Status = 'idle' | 'generating' | 'done' | 'error'

const MAX_CHARS = 5000

/**
 * Average speaking rate used to turn a character count into an estimated
 * audio duration for credit estimation. Mirrors TTS_CHARS_PER_SECOND in
 * backend/plan_limits.py so the displayed estimate and the charged amount
 * agree.
 */
const CHARS_PER_SECOND = 15

function formatBytes(bytes: number) {
  if (!bytes) return ''
  const mb = bytes / 1e6
  return mb >= 1000 ? `${(mb / 1000).toFixed(1)} GB` : `${Math.round(mb)} MB`
}

export default function TextToSpeechPage() {
  const { requireAuth, user } = useAuth()
  const { plan } = usePlan()
  const { remaining, refreshCredits } = useCredits()

  const [limitModalOpen, setLimitModalOpen] = useState(false)
  const [limitModalReason, setLimitModalReason] = useState('')
  const [limitModalRequiredPlan, setLimitModalRequiredPlan] = useState<string | undefined>(undefined)

  const [voices, setVoices] = useState<TtsVoice[]>([])
  const [voicesLoading, setVoicesLoading] = useState(true)
  const [voicesError, setVoicesError] = useState<string | null>(null)

  const [text, setText] = useState('')
  const [voiceId, setVoiceId] = useState('')
  const [speed, setSpeed] = useState(1.0)
  const [outputName, setOutputName] = useState(() => loadSettings().defaultAudioFilename || 'speech')

  const [status, setStatus] = useState<Status>('idle')
  const [progress, setProgress] = useState(0)
  const [statusMsg, setStatusMsg] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [jobId, setJobId] = useState<string | null>(null)
  const [result, setResult] = useState<any | null>(null)
  const [activeClientJobId, setActiveClientJobId] = useState<string | null>(null)

  const [isAddingToQueue, setIsAddingToQueue] = useState(false)
  const [successQueueMsg, setSuccessQueueMsg] = useState<string | null>(null)

  // Load the voice catalog once
  useEffect(() => {
    let cancelled = false
    getTtsVoices()
      .then(vs => {
        if (cancelled) return
        setVoices(vs)
        // Prefer an already-downloaded voice so the first run needs no network
        const preferred = vs.find(v => v.downloaded) || vs.find(v => v.language_code.startsWith('en')) || vs[0]
        if (preferred) setVoiceId(preferred.id)
        setVoicesError(null)
      })
      .catch(err => { if (!cancelled) setVoicesError(String(err.message || err)) })
      .finally(() => { if (!cancelled) setVoicesLoading(false) })
    return () => { cancelled = true }
  }, [])

  // Group voices by language for the picker
  const grouped = useMemo(() => {
    const g = new Map<string, TtsVoice[]>()
    for (const v of voices) {
      const key = v.language || 'Other'
      if (!g.has(key)) g.set(key, [])
      g.get(key)!.push(v)
    }
    return Array.from(g.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [voices])

  const selectedVoice = voices.find(v => v.id === voiceId)
  const charCount = text.length
  const estDurationSeconds = Math.max(1, Math.ceil(charCount / CHARS_PER_SECOND))
  const canGenerate = !!text.trim() && !!voiceId && status !== 'generating' && charCount <= MAX_CHARS

  /** Shared credit gate: live balance check, then plan/credit validation. */
  const runCreditGate = async (isBatch: boolean) => {
    const estimatedCredits = await estimateCredits('text_to_speech', {
      duration_seconds: estDurationSeconds,
    })

    // Force a live balance check right before gating — `remaining` can be
    // stale, and the blocking decision must never be made on a number
    // that's out of sync with the real Supabase balance.
    let currentCredits = remaining
    if (user) {
      try {
        currentCredits = await refreshCredits()
      } catch (err) {
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
        await reserveCredits('text_to_speech', estDurationSeconds, estimatedCredits, cjid, {
          duration_seconds: estDurationSeconds,
        })
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
    setStatusMsg('Preparing voice…')
    setResult(null)
    setJobId(null)

    try {
      const { job_id } = await startTextToSpeechJob(text, voiceId, speed, outputName, estimatedCredits)
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
            is_batch: true, duration_seconds: estDurationSeconds,
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
      })

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

  // Poll job status
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
        } catch (err) {
          // transient — retry on next poll
        }
      }, 1000)
    }
    return () => clearInterval(interval)
  }, [status, jobId, user, activeClientJobId])

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 pb-24 space-y-6 animate-fade-in">
      <StudioPageHeader
        icon={<IconMusic size={17} />}
        title="Text to Speech"
        subtitle="Generate natural speech from text using local Piper AI voices. Runs offline on your CPU."
      />

      {errorMsg && (
        <div className="alert-error">
          <IconAlertTriangle size={18} className="shrink-0" />
          <p className="text-sm font-medium">{errorMsg}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-8 space-y-6">
          {/* Text input */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Text</h2>
              <span className="text-[11px] font-semibold"
                    style={{ color: charCount > MAX_CHARS ? 'var(--color-error)' : 'var(--text-muted)' }}>
                {charCount.toLocaleString()} / {MAX_CHARS.toLocaleString()}
              </span>
            </div>
            <p className="text-[11px] mb-3" style={{ color: 'var(--text-muted)' }}>
              Type or paste the script you want spoken. Your text never leaves your device.
            </p>
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              disabled={status === 'generating'}
              placeholder="Enter the text you want to convert to speech…"
              className="w-full text-sm rounded-xl p-3 resize-y"
              style={{
                minHeight: 200, background: 'var(--bg-input)',
                border: `1px solid ${charCount > MAX_CHARS ? 'var(--color-error)' : 'var(--border-subtle)'}`,
                color: 'var(--text-primary)', lineHeight: 1.7,
              }}
            />
            {charCount > MAX_CHARS && (
              <p className="text-[11px] mt-2 font-semibold" style={{ color: 'var(--color-error)' }}>
                Text is too long. Please shorten it to {MAX_CHARS.toLocaleString()} characters or fewer.
              </p>
            )}
          </div>

          {/* Voice + settings */}
          <div className="card p-5 space-y-4">
            <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Voice &amp; Settings</h2>

            {voicesError ? (
              <div className="alert-error">
                <IconAlertTriangle size={16} className="shrink-0" />
                <p className="text-xs font-medium">Could not load voices: {voicesError}</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="form-label mb-2">Voice{voicesLoading ? ' (loading…)' : ''}</label>
                  <select
                    className="form-select"
                    value={voiceId}
                    disabled={voicesLoading || status === 'generating'}
                    onChange={e => setVoiceId(e.target.value)}
                  >
                    {grouped.map(([lang, list]) => (
                      <optgroup key={lang} label={`${lang} (${list.length})`}>
                        {list.map(v => (
                          <option key={v.id} value={v.id}>
                            {v.name} — {v.quality}{v.country ? ` · ${v.country}` : ''}{v.downloaded ? '' : ' · download'}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  {selectedVoice && !selectedVoice.downloaded && (
                    <p className="text-[10px] mt-1.5 flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
                      <IconDownload size={11} />
                      One-time {formatBytes(selectedVoice.size_bytes)} download on first use.
                    </p>
                  )}
                </div>

                <div>
                  <label className="form-label mb-2">Speed — {speed.toFixed(2)}x</label>
                  <input
                    type="range" min={0.5} max={2} step={0.05}
                    value={speed}
                    disabled={status === 'generating'}
                    onChange={e => setSpeed(parseFloat(e.target.value))}
                    className="w-full"
                  />
                  <div className="flex justify-between text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
                    <span>0.5x slower</span><span>2x faster</span>
                  </div>
                </div>

                <div className="sm:col-span-2">
                  <label className="form-label mb-2">Output filename</label>
                  <input
                    type="text" className="form-input w-full"
                    value={outputName}
                    disabled={status === 'generating'}
                    onChange={e => setOutputName(e.target.value)}
                    placeholder="speech"
                  />
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
              {status === 'generating'
                ? <><IconLoader size={18} className="animate-spin" /> {statusMsg || 'Generating…'}</>
                : <><IconMusic size={18} /> Generate Speech</>}
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

            {canGenerate && (
              <p className="text-center text-[11px] mt-3" style={{ color: 'var(--text-muted)' }}>
                Estimated ~{estDurationSeconds}s of audio from {charCount.toLocaleString()} characters.
              </p>
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
                  ['Duration', `${result.duration_seconds ?? '—'}s`],
                  ['Characters', (result.char_count ?? 0).toLocaleString()],
                  ['Sample rate', `${result.sample_rate ?? '—'} Hz`],
                  ['Speed', `${result.speed ?? 1}x`],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg p-2.5" style={{ background: 'var(--bg-elevated)' }}>
                    <p className="text-[9px] uppercase tracking-wider mb-0.5 opacity-70" style={{ color: 'var(--text-muted)' }}>{label}</p>
                    <p className="text-[11px] font-bold truncate" style={{ color: 'var(--text-primary)' }}>{value}</p>
                  </div>
                ))}
              </div>

              {result.output_url && (
                <>
                  <audio controls src={resolveBackendUrl(result.output_url)} className="w-full" />
                  <a
                    href={resolveBackendUrl(result.output_url)}
                    download={result.output_name || 'speech.wav'}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg btn-primary"
                  >
                    <IconDownload size={13} /> Download WAV
                  </a>
                </>
              )}
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="lg:col-span-4 space-y-6">
          <div className="card p-5">
            <h3 className="text-sm font-bold mb-3" style={{ color: 'var(--text-primary)' }}>About Piper voices</h3>
            <ul className="space-y-2 text-[11px]" style={{ color: 'var(--text-muted)' }}>
              <li>• {voices.length} voices across {grouped.length} languages.</li>
              <li>• Runs fully offline on your CPU — no GPU needed.</li>
              <li>• Voices download once on first use, then stay cached.</li>
              <li>• Output is a 16-bit WAV, saved to your history.</li>
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
