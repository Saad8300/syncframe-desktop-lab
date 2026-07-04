// components/ProgressOverlay.tsx – Premium Generation Panel (minimalist)

import React, { useEffect, useState, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { IconClock, IconXCircle, IconDownload, IconCheck, IconAlertTriangle, IconLoader } from './icons'
import type { JobStatus, ExportResolution, RenderProfile } from '../types'
import { getJobStatus, cancelJob, resolveBackendUrl } from '../utils/api'

// ─── Types ────────────────────────────────────────────────────────────────────

interface RenderSpec {
  resolution:    ExportResolution
  renderProfile: RenderProfile
}

interface ProgressOverlayProps {
  jobId:         string | null
  onJobComplete: (status: JobStatus) => void
  onCancelled:   () => void
  onClose?:      () => void
  renderSpec?:   RenderSpec
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PROFILE_FPS: Record<RenderProfile, string> = {
  fast_preview: '24 FPS',
  balanced:     '30 FPS',
  high_quality: '30 FPS',
}

const PROFILE_LABEL: Record<RenderProfile, string> = {
  fast_preview: 'Fast Preview',
  balanced:     'Balanced',
  high_quality: 'High Quality',
}

const RENDER_STEPS = ['Prepare', 'Timeline', 'Render', 'Encode', 'Finalize']

function progressToStepIdx(pct: number): number {
  if (pct < 10) return 0
  if (pct < 30) return 1
  if (pct < 60) return 2
  if (pct < 85) return 3
  return 4
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(seconds: number): string {
  if (!seconds || seconds < 0) return '—'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function MetaChip({ label }: { label: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '3px 9px', borderRadius: 99,
      fontSize: 10, fontWeight: 700, fontFamily: 'ui-monospace, monospace',
      letterSpacing: '0.04em',
      background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
      color: 'var(--text-secondary)',
    }}>
      {label}
    </span>
  )
}

function ThreeDots() {
  return (
    <span aria-hidden style={{ display: 'inline-flex', alignItems: 'center', gap: 3, marginLeft: 4, verticalAlign: 'middle' }}>
      {[0, 0.2, 0.4].map((delay, i) => (
        <span key={i} style={{
          display: 'inline-block', width: 3, height: 3, borderRadius: '50%',
          background: 'currentColor', opacity: 0.5,
          animation: `rpo-dotPulse 1.4s ease-in-out ${delay}s infinite`,
        }} />
      ))}
    </span>
  )
}

// ─── Step Tracker ─────────────────────────────────────────────────────────────

function StepTracker({ progress, isComplete, isFailed }: {
  progress: number; isComplete: boolean; isFailed: boolean
}) {
  const activeIdx = isFailed ? -1 : isComplete ? RENDER_STEPS.length : progressToStepIdx(progress)

  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      {RENDER_STEPS.map((label, i) => {
        const done    = isComplete || (!isFailed && i < activeIdx)
        const current = !isFailed && !isComplete && i === activeIdx

        return (
          <React.Fragment key={label}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, flex: 1 }}>
              <div style={{
                width: 22, height: 22, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 8, fontWeight: 900, transition: 'all 0.35s ease',
                background: done
                  ? 'linear-gradient(135deg,#10b981,#34d399)'
                  : current
                  ? 'linear-gradient(135deg,#6366f1,#8b5cf6)'
                  : 'var(--bg-elevated)',
                border: done || current ? 'none' : '1.5px solid var(--border-default)',
                color: done || current ? '#fff' : 'var(--text-muted)',
                boxShadow: current ? '0 0 0 3px rgba(99,102,241,0.2)' : 'none',
              }}>
                {done ? '✓' : i + 1}
              </div>
              <span style={{
                fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em',
                color: done ? '#10b981' : current ? 'var(--accent-primary)' : 'var(--text-muted)',
                transition: 'color 0.3s ease',
              }}>{label}</span>
            </div>
            {i < RENDER_STEPS.length - 1 && (
              <div style={{
                flex: 1, height: 1.5, borderRadius: 999, marginBottom: 18, maxWidth: 36,
                background: done ? '#10b981' : 'var(--border-subtle)',
                transition: 'background 0.4s ease',
              }} />
            )}
          </React.Fragment>
        )
      })}
    </div>
  )
}

// ─── Progress Bar ─────────────────────────────────────────────────────────────

function ProgressBar({ pct, color, animated }: { pct: number; color: string; animated: boolean }) {
  return (
    <div style={{
      height: 6, borderRadius: 999, overflow: 'hidden',
      background: 'var(--bg-elevated)', position: 'relative',
    }}>
      <div style={{
        position: 'absolute', top: 0, left: 0, bottom: 0,
        width: `${pct}%`, borderRadius: 999, background: color,
        transition: 'width 0.6s cubic-bezier(0.4,0,0.2,1)',
        overflow: 'hidden',
      }}>
        {animated && (
          <div style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(90deg, transparent 20%, rgba(255,255,255,0.26) 50%, transparent 80%)',
            animation: 'rpo-shimmer 1.8s linear infinite',
          }} />
        )}
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ProgressOverlay({
  jobId, onJobComplete, onCancelled, onClose, renderSpec,
}: ProgressOverlayProps) {
  const [jobStatus,   setJobStatus]   = useState<JobStatus | null>(null)
  const [pollError,   setPollError]   = useState<string | null>(null)
  const [showConfirm, setShowConfirm] = useState(false)
  const [cancelling,  setCancelling]  = useState(false)
  const pollRef      = useRef<ReturnType<typeof setInterval> | null>(null)
  const completedRef = useRef(false)

  const stopPolling = useCallback(() => {
    if (pollRef.current !== null) { clearInterval(pollRef.current); pollRef.current = null }
  }, [])

  useEffect(() => {
    if (!jobId) return
    completedRef.current = false
    setPollError(null); setJobStatus(null); setShowConfirm(false); setCancelling(false)

    let pollErrorCount = 0

    const poll = async () => {
      if (completedRef.current) return
      try {
        const status = await getJobStatus(jobId)
        pollErrorCount = 0 // reset on success
        setJobStatus(status); setPollError(null)
        if (status.status === 'completed' || status.status === 'failed') {
          completedRef.current = true; stopPolling(); onJobComplete(status)
        } else if (status.status === 'cancelled') {
          completedRef.current = true; stopPolling(); onCancelled()
        }
      } catch (err) {
        pollErrorCount++
        if (pollErrorCount > 5) {
          setPollError(String(err))
        } else {
          // Soft error: don't show to user yet, might be transient
          console.warn(`Poll error (attempt ${pollErrorCount}):`, err)
        }
      }
    }

    poll()
    pollRef.current = setInterval(poll, 1500)
    return () => stopPolling()
  }, [jobId, onJobComplete, onCancelled, stopPolling])

  const handleCancelClick   = () => setShowConfirm(true)
  const handleCancelDismiss = () => setShowConfirm(false)
  const handleCancelConfirm = async () => {
    if (!jobId) return
    setCancelling(true); setShowConfirm(false)
    try { await cancelJob(jobId) } catch { /* polling catches terminal state */ }
  }

  const progress   = jobStatus?.progress ?? 0
  const step       = cancelling
    ? 'Cancelling…'
    : (jobStatus?.current_step ?? (jobId ? 'Connecting…' : 'Starting…'))
  const elapsed    = jobStatus?.elapsed_seconds ?? 0
  const isTerminal = jobStatus?.status === 'completed' || jobStatus?.status === 'failed' || jobStatus?.status === 'cancelled'
  const isActive   = !isTerminal && !cancelling
  const isFailed   = jobStatus?.status === 'failed'
  const isComplete = jobStatus?.status === 'completed'

  const titleText = cancelling ? 'Cancelling…'
    : isFailed   ? 'Generation Failed'
    : isComplete ? 'Export Complete'
    : 'Rendering Video'

  const progressColor = isFailed
    ? 'linear-gradient(90deg,#ef4444,#f87171)'
    : isComplete
    ? 'linear-gradient(90deg,#10b981,#34d399)'
    : 'linear-gradient(90deg,#6366f1 0%,#8b5cf6 55%,#06b6d4 100%)'

  const accentHex = isFailed ? '#ef4444' : isComplete ? '#10b981' : '#6366f1'

  // ── Render ─────────────────────────────────────────────────────────────────

  return createPortal(
    <>
      <style>{`
        @keyframes rpo-fadeIn  { from { opacity: 0; } to { opacity: 1; } }
        @keyframes rpo-slideUp { from { opacity: 0; transform: translateY(20px) scale(0.97); } to { opacity: 1; transform: none; } }
        @keyframes rpo-shimmer { 0% { transform: translateX(-120%); } 100% { transform: translateX(220%); } }
        @keyframes rpo-dotPulse{ 0%,100% { opacity: 0.2; transform: scale(0.7); } 50% { opacity: 1; transform: scale(1.2); } }
        @keyframes rpo-border  { 0% { background-position: 0% 0%; } 100% { background-position: 200% 0%; } }
        @keyframes rpo-popIn   { 0% { opacity: 0; transform: scale(0.6); } 70% { transform: scale(1.08); } 100% { opacity: 1; transform: scale(1); } }
        @keyframes rpo-scan    { 0% { left: -40px; } 100% { left: calc(100% + 8px); } }
      `}</style>

      {/* ── Backdrop ──────────────────────────────────────────────── */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 50,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.78)',
        backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)',
        animation: 'rpo-fadeIn 0.18s ease-out',
        padding: 20,
      }}>

        {/* ── Glow border ──────────────────────────────────────────── */}
        <div style={{
          position: 'relative',
          padding: isActive ? 1.5 : 1,
          borderRadius: 24,
          background: isActive
            ? 'linear-gradient(90deg,#6366f1,#8b5cf6,#06b6d4,#6366f1)'
            : isFailed   ? 'rgba(239,68,68,0.4)'
            : isComplete ? 'rgba(16,185,129,0.4)'
            : 'var(--border-default)',
          backgroundSize: isActive ? '200% 100%' : '100% 100%',
          animation: isActive ? 'rpo-border 3s linear infinite' : 'none',
          boxShadow: isActive
            ? '0 0 36px rgba(99,102,241,0.18), 0 16px 48px rgba(0,0,0,0.5)'
            : `0 16px 48px rgba(0,0,0,0.5)`,
        }}>

          {/* ── Card ─────────────────────────────────────────────── */}
          <div
            role="dialog"
            aria-modal="true"
            aria-label={titleText}
            style={{
              width: 460,
              maxWidth: 'calc(100vw - 40px)',
              background: 'var(--bg-card)',
              borderRadius: 22,
              animation: 'rpo-slideUp 0.26s cubic-bezier(0.34,1.1,0.64,1)',
              overflow: 'hidden',
            }}
          >
            {/* ── Top accent stripe ────────────────────────────── */}
            <div style={{
              height: 3,
              background: isFailed
                ? '#ef4444'
                : isComplete
                ? 'linear-gradient(90deg,#10b981,#34d399)'
                : 'linear-gradient(90deg,#6366f1,#8b5cf6,#06b6d4)',
              transition: 'background 0.4s ease',
              position: 'relative', overflow: 'hidden',
            }}>
              {isActive && (
                <div style={{
                  position: 'absolute', top: 0, bottom: 0, width: 60,
                  background: 'linear-gradient(90deg,transparent,rgba(255,255,255,0.55),transparent)',
                  animation: 'rpo-scan 2s linear infinite',
                }} />
              )}
            </div>

            {/* ── Content ──────────────────────────────────────── */}
            <div style={{ padding: '24px 26px 26px', display: 'flex', flexDirection: 'column', gap: 18 }}>

              {/* Zone 1 — Header row */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 13 }}>

                {/* Status icon */}
                <div style={{
                  width: 46, height: 46, borderRadius: 14, flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: `${accentHex}14`,
                  border: `1.5px solid ${accentHex}38`,
                  animation: isComplete ? 'rpo-popIn 0.4s cubic-bezier(0.34,1.2,0.64,1)' : 'none',
                }}>
                  {isFailed   ? <IconAlertTriangle size={20} style={{ color: '#ef4444' }} />
                  : isComplete ? <IconCheck size={20} style={{ color: '#10b981' }} />
                  : <IconLoader size={20} style={{ color: cancelling ? '#f59e0b' : 'var(--accent-primary)' }} />}
                </div>

                {/* Title + step */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3 style={{
                    margin: 0, fontSize: 16, fontWeight: 800,
                    letterSpacing: '-0.022em', color: 'var(--text-primary)', lineHeight: 1.25,
                  }}>
                    {titleText}
                  </h3>
                  <div aria-live="polite" style={{
                    fontSize: 12, fontWeight: 500, marginTop: 3,
                    color: isFailed ? '#ef4444' : isComplete ? '#10b981' : cancelling ? '#f59e0b' : 'var(--accent-primary)',
                    display: 'flex', alignItems: 'center', minHeight: 17,
                  }}>
                    {isFailed && jobStatus?.errors?.length
                      ? jobStatus.errors[0]
                      : isComplete ? 'Your video is ready.'
                      : step}
                    {isActive && <ThreeDots />}
                  </div>
                </div>

                {/* Elapsed badge */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0,
                  padding: '4px 9px', borderRadius: 99,
                  background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
                  fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)',
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  <IconClock size={11} style={{ color: 'var(--text-muted)' }} />
                  {elapsed > 0 ? formatTime(elapsed) : '—'}
                </div>
              </div>

              {/* Zone 2 — Spec chips */}
              {renderSpec && (
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  <MetaChip label={renderSpec.resolution} />
                  <MetaChip label={PROFILE_FPS[renderSpec.renderProfile]} />
                  <MetaChip label={PROFILE_LABEL[renderSpec.renderProfile]} />
                </div>
              )}

              {/* Zone 3 — Step tracker */}
              <StepTracker progress={progress} isComplete={isComplete} isFailed={isFailed} />

              {/* Zone 4 — Progress */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>
                    {isFailed ? 'Stopped' : isComplete ? 'Complete' : 'Progress'}
                  </span>
                  <span style={{
                    fontSize: 24, fontWeight: 900, letterSpacing: '-0.04em',
                    color: isFailed ? '#ef4444' : isComplete ? '#10b981' : 'var(--text-primary)',
                    fontVariantNumeric: 'tabular-nums', lineHeight: 1,
                  }}>
                    {progress}<span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginLeft: 1 }}>%</span>
                  </span>
                </div>
                <ProgressBar pct={progress} color={progressColor} animated={isActive} />
              </div>

              {/* Zone 5 — Output filename on success */}
              {isComplete && jobStatus?.output_filename && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '7px 11px', borderRadius: 9,
                  background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.18)',
                }}>
                  <IconCheck size={11} style={{ color: '#10b981', flexShrink: 0 }} />
                  <span style={{
                    fontSize: 11, fontFamily: 'ui-monospace, monospace',
                    color: 'var(--text-secondary)', overflow: 'hidden',
                    textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {jobStatus.output_filename}
                  </span>
                </div>
              )}

              {/* Poll error */}
              {pollError && (
                <div style={{
                  fontSize: 11, textAlign: 'center', color: '#f59e0b',
                  padding: '5px 10px', borderRadius: 8,
                  background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.18)',
                }}>
                  ⚠ Rendering is still running, but the backend is slow. Retrying…
                </div>
              )}

              {/* Zone 6 — Actions */}
              <div>
                {/* Abort (while running) */}
                {!isTerminal && !cancelling && (
                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <button
                      id="cancel-generation-btn"
                      onClick={handleCancelClick}
                      aria-label="Cancel video generation"
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        padding: '7px 16px', borderRadius: 10,
                        fontSize: 12, fontWeight: 500, color: 'var(--text-muted)',
                        background: 'transparent', border: '1px solid transparent',
                        cursor: 'pointer', transition: 'all 0.15s',
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.color = '#ef4444'
                        e.currentTarget.style.borderColor = 'rgba(239,68,68,0.28)'
                        e.currentTarget.style.background = 'rgba(239,68,68,0.06)'
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.color = 'var(--text-muted)'
                        e.currentTarget.style.borderColor = 'transparent'
                        e.currentTarget.style.background = 'transparent'
                      }}
                    >
                      <IconXCircle size={13} />
                      Abort generation
                    </button>
                  </div>
                )}

                {/* Terminal actions */}
                {isTerminal && onClose && (
                  <div style={{ display: 'flex', gap: 8 }}>
                    {isComplete && jobStatus?.output_video_url && (
                      <a
                        href={resolveBackendUrl(jobStatus.output_video_url)}
                        download={jobStatus.output_filename ?? 'video.mp4'}
                        onClick={() => { setTimeout(onClose!, 100) }}
                        style={{
                          flex: 1, display: 'inline-flex', alignItems: 'center',
                          justifyContent: 'center', gap: 7,
                          padding: '10px 16px', borderRadius: 11, textDecoration: 'none',
                          fontSize: 13, fontWeight: 700, color: '#fff',
                          background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
                          boxShadow: '0 4px 14px rgba(99,102,241,0.36)',
                          cursor: 'pointer', transition: 'all 0.15s',
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.transform = 'translateY(-1px)'
                          e.currentTarget.style.boxShadow = '0 8px 22px rgba(99,102,241,0.48)'
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.transform = ''
                          e.currentTarget.style.boxShadow = '0 4px 14px rgba(99,102,241,0.36)'
                        }}
                      >
                        <IconDownload size={14} />
                        Download Video
                      </a>
                    )}
                    <button
                      onClick={onClose}
                      style={{
                        flex: isComplete && jobStatus?.output_video_url ? '0 0 auto' : 1,
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                        padding: '10px 20px', borderRadius: 11,
                        fontSize: 13, fontWeight: 600,
                        color: isFailed ? '#ef4444' : 'var(--text-primary)',
                        background: isFailed ? 'rgba(239,68,68,0.06)' : 'var(--bg-elevated)',
                        border: `1px solid ${isFailed ? 'rgba(239,68,68,0.22)' : 'var(--border-default)'}`,
                        cursor: 'pointer', transition: 'all 0.15s',
                      }}
                    >
                      {isFailed ? 'Close' : isComplete ? 'View Result' : 'Close'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Cancel confirmation ─────────────────────────────────── */}
        {showConfirm && (
          <div style={{
            position: 'fixed', inset: 0, zIndex: 60,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)',
            animation: 'rpo-fadeIn 0.15s ease-out',
          }}>
            <div style={{
              width: 320, maxWidth: '90vw',
              background: 'var(--bg-card)', border: '1px solid var(--border-default)',
              borderRadius: 18, padding: '28px 24px 22px',
              boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
              animation: 'rpo-slideUp 0.2s ease-out',
              display: 'flex', flexDirection: 'column', gap: 16, textAlign: 'center',
            }}>
              <div style={{
                width: 46, height: 46, borderRadius: 13, margin: '0 auto',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(245,158,11,0.09)', border: '1px solid rgba(245,158,11,0.28)',
                fontSize: 20,
              }}>⚠</div>
              <div>
                <h4 style={{ margin: '0 0 7px', fontSize: 15, fontWeight: 800, color: 'var(--text-primary)' }}>
                  Abort generation?
                </h4>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                  All progress will be lost and the job will stop.
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  id="cancel-confirm-no-btn"
                  onClick={handleCancelDismiss}
                  className="btn-secondary"
                  style={{ flex: 1, padding: '10px 0', borderRadius: 10 }}
                >
                  Keep going
                </button>
                <button
                  id="cancel-confirm-yes-btn"
                  onClick={handleCancelConfirm}
                  style={{
                    flex: 1, padding: '10px 0', borderRadius: 10,
                    fontWeight: 700, fontSize: 13, cursor: 'pointer',
                    background: 'rgba(239,68,68,0.09)', border: '1px solid rgba(239,68,68,0.28)',
                    color: '#ef4444',
                  }}
                >
                  Yes, abort
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>,
    document.body
  )
}
