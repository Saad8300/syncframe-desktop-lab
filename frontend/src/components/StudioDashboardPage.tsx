import React, { useEffect, useState, useCallback } from 'react'
import {
  IconVideo,
  IconMusic,
  IconFileText,
  IconDownload,
  IconZap,
  IconHistory,
  IconFilm,
  IconGrid,
  IconClock,
  IconSparkles,
  IconArrowRight,
} from './icons'
import { getHistory, getBatchStats, getBatchState, startBatchQueueWithValidation, pauseBatchAfterCurrent, stopBatchQueue, type BatchState } from '../utils/api'
import { dispatchToast } from '../utils/notifications'
import StudioPageHeader from './StudioPageHeader'

// ── Tiny inline icons not in icons.tsx ──────────────────────────────────────

function IconTrendUp({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"></polyline>
      <polyline points="16 7 22 7 22 13"></polyline>
    </svg>
  )
}

function IconActivity({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
    </svg>
  )
}

// ── Types ───────────────────────────────────────────────────────────────────

interface HistoryRecord {
  id: string
  tool: string
  output_name: string
  created_at: string
  duration?: number
  size_bytes?: number
}

interface DashStats {
  total_exports: number
  total_videos: number
  tool_counts: Record<string, number>
  most_used_tool: string | null
  last_activity: string | null
  total_generated_duration: number
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatDuration(secs: number) {
  if (!secs) return '0s'
  const m = Math.floor(secs / 60)
  const s = Math.round(secs % 60)
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

function formatBytes(bytes: number) {
  if (!bytes || bytes === 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function timeAgo(iso: string) {
  try {
    const diff = (Date.now() - new Date(iso).getTime()) / 1000
    if (diff < 60) return 'just now'
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  } catch {
    return iso
  }
}

function getToolDisplay(tool: string): { label: string; color: string; bg: string; border: string; icon: React.ReactNode } {
  switch (tool) {
    case 'image_timeline':
    case 'image':
      return { label: 'Image Timeline', color: '#a78bfa', bg: 'rgba(167,139,250,0.10)', border: 'rgba(167,139,250,0.25)', icon: <IconFilm size={14} /> }
    case 'video_timeline':
    case 'video':
      return { label: 'Video Timeline', color: '#6366f1', bg: 'rgba(99,102,241,0.10)', border: 'rgba(99,102,241,0.25)', icon: <IconVideo size={14} /> }
    case 'media_timeline':
    case 'media':
      return { label: 'Media Timeline', color: '#06b6d4', bg: 'rgba(6,182,212,0.10)', border: 'rgba(6,182,212,0.25)', icon: <IconGrid size={14} /> }
    case 'audio_merger':
      return { label: 'Audio Merger', color: '#10b981', bg: 'rgba(16,185,129,0.10)', border: 'rgba(16,185,129,0.25)', icon: <IconMusic size={14} /> }
    case 'script_timestamp':
      return { label: 'Script Timestamp', color: '#f59e0b', bg: 'rgba(245,158,11,0.10)', border: 'rgba(245,158,11,0.25)', icon: <IconFileText size={14} /> }
    default:
      return { label: tool, color: '#94a3b8', bg: 'rgba(148,163,184,0.10)', border: 'rgba(148,163,184,0.20)', icon: <IconZap size={14} /> }
  }
}

function computeStats(records: HistoryRecord[]): DashStats {
  const tool_counts: Record<string, number> = {}
  let total_videos = 0
  let total_generated_duration = 0
  let last_activity: string | null = null

  for (const r of records) {
    tool_counts[r.tool] = (tool_counts[r.tool] || 0) + 1
    if (['image_timeline', 'video_timeline', 'media_timeline', 'image', 'video', 'media'].includes(r.tool)) total_videos++
    if (r.duration) total_generated_duration += r.duration
    if (!last_activity || r.created_at > last_activity) last_activity = r.created_at
  }

  const most_used_tool = Object.keys(tool_counts).length > 0
    ? Object.entries(tool_counts).sort((a, b) => b[1] - a[1])[0][0]
    : null

  return {
    total_exports: records.length,
    total_videos,
    tool_counts,
    most_used_tool,
    last_activity: last_activity ? timeAgo(last_activity) : null,
    total_generated_duration,
  }
}

// ── Radial Progress Ring ─────────────────────────────────────────────────────

function RadialRing({ value, max, size = 72, stroke = 5, color = '#6366f1', label, sublabel }: {
  value: number, max: number, size?: number, stroke?: number, color?: string, label?: string, sublabel?: string
}) {
  const r = (size - stroke * 2) / 2
  const circ = 2 * Math.PI * r
  const pct = max > 0 ? Math.min(value / max, 1) : 0
  const offset = circ - pct * circ

  return (
    <div className="flex flex-col items-center gap-1">
      <div style={{ position: 'relative', width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} />
          <circle
            cx={size / 2} cy={size / 2} r={r} fill="none"
            stroke={color} strokeWidth={stroke}
            strokeDasharray={circ} strokeDashoffset={offset}
            strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 0.8s cubic-bezier(0.4,0,0.2,1)' }}
          />
        </svg>
        {label && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>{label}</span>
          </div>
        )}
      </div>
      {sublabel && <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{sublabel}</span>}
    </div>
  )
}

// ── Mini Sparkline ──────────────────────────────────────────────────────────

function Sparkline({ data, color = '#6366f1', height = 32 }: { data: number[], color?: string, height?: number }) {
  if (!data || data.length < 2) return null
  const max = Math.max(...data, 1)
  const w = 80
  const h = height
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w
    const y = h - (v / max) * (h - 4)
    return `${x},${y}`
  }).join(' ')

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ overflow: 'visible' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points={`0,${h} ${pts} ${w},${h}`} fill={color} fillOpacity="0.12" stroke="none" />
    </svg>
  )
}

// ── Stat Card ───────────────────────────────────────────────────────────────

function StatCard({
  label, value, icon, color, bg, border,
  sparkData, trend, trendLabel,
}: {
  label: string
  value: string | number
  icon: React.ReactNode
  color: string
  bg: string
  border: string
  sparkData?: number[]
  trend?: number
  trendLabel?: string
}) {
  return (
    <div
      className="card p-5 flex flex-col gap-3 group hover:border-opacity-80 transition-all duration-200"
      style={{ borderColor: border }}
      onMouseEnter={e => (e.currentTarget.style.boxShadow = `0 8px 32px ${color}22, 0 2px 8px rgba(0,0,0,0.25)`)}
      onMouseLeave={e => (e.currentTarget.style.boxShadow = '')}
    >
      <div className="flex items-start justify-between">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-110"
          style={{ background: bg, border: `1px solid ${border}`, color }}
        >
          {icon}
        </div>
        {sparkData && sparkData.length > 1 && (
          <div style={{ opacity: 0.7 }}>
            <Sparkline data={sparkData} color={color} />
          </div>
        )}
        {trend !== undefined && (
          <div className="flex items-center gap-1" style={{ color: trend >= 0 ? '#10b981' : '#ef4444', fontSize: 11, fontWeight: 700 }}>
            <IconTrendUp size={12} />
            {Math.abs(trend)}%
          </div>
        )}
      </div>

      <div>
        <p style={{ fontSize: 28, fontWeight: 900, color: 'var(--text-primary)', lineHeight: 1.1, letterSpacing: '-0.02em' }}>
          {value}
        </p>
        <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 4 }}>
          {label}
        </p>
        {trendLabel && (
          <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{trendLabel}</p>
        )}
      </div>
    </div>
  )
}

// ── Tool Distribution Bar ────────────────────────────────────────────────────

function ToolBar({ label, count, total, color, icon }: { label: string, count: number, total: number, color: string, icon: React.ReactNode }) {
  const pct = total > 0 ? (count / total) * 100 : 0
  return (
    <div className="flex items-center gap-3">
      <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${color}18`, color }}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>{label}</span>
          <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{count}</span>
        </div>
        <div style={{ height: 4, borderRadius: 999, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
          <div
            style={{
              height: '100%', borderRadius: 999, background: color, width: `${pct}%`,
              transition: 'width 0.8s cubic-bezier(0.4,0,0.2,1)',
            }}
          />
        </div>
      </div>
      <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', minWidth: 28, textAlign: 'right' }}>
        {pct.toFixed(0)}%
      </span>
    </div>
  )
}

// ── Activity Feed Item ────────────────────────────────────────────────────────

function ActivityItem({ record, isLast }: { record: HistoryRecord, isLast: boolean }) {
  const tool = getToolDisplay(record.tool)
  return (
    <div className={`flex items-start gap-3 py-3 ${!isLast ? 'border-b' : ''}`} style={{ borderColor: 'var(--border-subtle)' }}>
      <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5" style={{ background: tool.bg, border: `1px solid ${tool.border}`, color: tool.color }}>
        {tool.icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
          {record.output_name || 'Unnamed Export'}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: tool.bg, color: tool.color }}>
            {tool.label}
          </span>
          {record.duration && (
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{formatDuration(record.duration)}</span>
          )}
          {record.size_bytes && (
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{formatBytes(record.size_bytes)}</span>
          )}
        </div>
      </div>
      <span style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap', flexShrink: 0 }}>
        {timeAgo(record.created_at)}
      </span>
    </div>
  )
}

// ── Loading Skeleton ──────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="card p-5 space-y-3">
      <div className="w-10 h-10 rounded-xl animate-pulse" style={{ background: 'var(--bg-elevated)' }} />
      <div className="space-y-2">
        <div className="h-7 w-16 rounded-lg animate-pulse" style={{ background: 'var(--bg-elevated)' }} />
        <div className="h-3 w-24 rounded animate-pulse" style={{ background: 'var(--bg-elevated)' }} />
      </div>
    </div>
  )
}

// ── Empty State ───────────────────────────────────────────────────────────────

function EmptyDashboard() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center animate-fade-in">
      <div
        className="w-20 h-20 rounded-3xl flex items-center justify-center mb-6"
        style={{ background: 'var(--accent-subtle)', border: '1px solid var(--accent-border)' }}
      >
        <IconActivity size={32} />
      </div>
      <h2 className="text-xl font-black mb-2" style={{ color: 'var(--text-primary)' }}>No activity yet</h2>
      <p className="text-sm max-w-sm" style={{ color: 'var(--text-secondary)' }}>
        Generate your first video, merge audio, or create timestamps to start building your Studio analytics.
      </p>
      <div className="flex items-center gap-2 mt-6 px-4 py-2 rounded-xl text-xs font-bold" style={{ background: 'var(--accent-subtle)', color: 'var(--accent-primary)', border: '1px solid var(--accent-border)' }}>
        <IconSparkles size={14} />
        Head to Tools to get started
        <IconArrowRight size={13} />
      </div>
    </div>
  )
}

// ── Queue State Helpers ──────────────────────────────────────────────────────

function getQueueStateLabel(state: BatchState | null): { label: string; color: string; bg: string; dot: string } {
  if (!state) return { label: 'Unknown', color: 'var(--text-muted)', bg: 'var(--bg-elevated)', dot: '#94a3b8' }
  if (state.stopping) return { label: 'Stopping…', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', dot: '#f59e0b' }
  if (state.paused_after_current) return { label: 'Pausing after current', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', dot: '#f59e0b' }
  if (state.is_running) return { label: 'Running', color: '#10b981', bg: 'rgba(16,185,129,0.1)', dot: '#10b981' }
  return { label: 'Idle', color: '#6366f1', bg: 'rgba(99,102,241,0.08)', dot: '#6366f1' }
}

// ── Batch Queue Panel (premium main-area card) ────────────────────────────────

function BatchQueuePanel({
  batchStats, batchState, queueActionLoading, onAction, onOpenBatch,
}: {
  batchStats: any
  batchState: BatchState | null
  queueActionLoading: boolean
  onAction: (action: 'start' | 'pause' | 'stop') => void
  onOpenBatch?: () => void
}) {
  const stats = batchStats || {}
  const total = stats.total || 0
  const queued = stats.queued || 0
  const running = stats.running || 0
  const completed = stats.completed || 0
  const failed = stats.failed || 0
  const isRunning = batchState?.is_running ?? false
  const stateInfo = getQueueStateLabel(batchState)
  const completionPct = total > 0 ? Math.round((completed / total) * 100) : 0

  const counters = [
    { label: 'Total Jobs', value: total, color: '#94a3b8', bg: 'rgba(148,163,184,0.1)' },
    { label: 'Queued', value: queued, color: '#3b82f6', bg: 'rgba(59,130,246,0.1)' },
    { label: 'Running', value: running, color: '#a855f7', bg: 'rgba(168,85,247,0.1)' },
    { label: 'Completed', value: completed, color: '#10b981', bg: 'rgba(16,185,129,0.1)' },
    { label: 'Failed', value: failed, color: '#ef4444', bg: 'rgba(239,68,68,0.1)' },
  ]

  return (
    <div className="card p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Batch Queue Status</h2>
          <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>Live render queue overview</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold"
               style={{ background: stateInfo.bg, color: stateInfo.color }}>
            <span style={{
              width: 6, height: 6, borderRadius: '50%', background: stateInfo.dot, display: 'inline-block',
              animation: isRunning ? 'dashLivePulse 1.8s ease-in-out infinite' : 'none',
            }} />
            {stateInfo.label}
          </div>
          {onOpenBatch && (
            <button
              onClick={onOpenBatch}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold"
              style={{ background: 'var(--accent-subtle)', color: 'var(--accent-primary)', border: '1px solid var(--accent-border)' }}
            >
              <IconZap size={11} /> Open Queue
            </button>
          )}
        </div>
      </div>

      {total === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-3"
               style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
            <IconGrid size={20} style={{ color: 'var(--text-muted)' } as React.CSSProperties} />
          </div>
          <p className="text-sm font-semibold" style={{ color: 'var(--text-muted)' }}>No batch jobs queued yet</p>
          <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)', opacity: 0.7 }}>Add jobs from any timeline tool to get started</p>
        </div>
      ) : (
        <>
          {/* Counter chips */}
          <div className="grid grid-cols-5 gap-3 mb-5">
            {counters.map(c => (
              <div key={c.label} className="flex flex-col items-center justify-center rounded-xl py-3 gap-1"
                   style={{ background: c.bg, border: `1px solid ${c.color}28` }}>
                <span style={{ fontSize: 20, fontWeight: 900, lineHeight: 1, color: c.color, fontVariantNumeric: 'tabular-nums' }}>{c.value}</span>
                <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)' }}>{c.label}</span>
              </div>
            ))}
          </div>

          {/* Progress bar */}
          <div className="mb-5">
            <div className="flex items-center justify-between mb-1.5">
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>Overall Completion</span>
              <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{completionPct}%</span>
            </div>
            <div style={{ height: 6, borderRadius: 999, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 999, width: `${completionPct}%`,
                background: 'linear-gradient(90deg, #6366f1, #10b981)',
                transition: 'width 0.8s cubic-bezier(0.4,0,0.2,1)',
              }} />
            </div>
          </div>

          {/* Current job */}
          {batchState?.current_job_id && (
            <div className="mb-5 flex items-center gap-2.5 px-3 py-2.5 rounded-xl"
                 style={{ background: 'rgba(168,85,247,0.07)', border: '1px solid rgba(168,85,247,0.2)' }}>
              <span style={{
                width: 7, height: 7, borderRadius: '50%', background: '#a855f7', flexShrink: 0,
                animation: 'dashLivePulse 1.8s ease-in-out infinite',
              }} />
              <div className="min-w-0 flex-1">
                <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#a855f7' }}>Currently Rendering</p>
                <p className="truncate text-xs font-semibold" style={{ color: 'var(--text-primary)', marginTop: 1 }}>{batchState.current_job_id}</p>
              </div>
            </div>
          )}

          {/* Controls */}
          <div className="flex items-center gap-2">
            {!isRunning ? (
              <button
                disabled={queueActionLoading || queued === 0}
                onClick={() => onAction('start')}
                className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold transition-all"
                style={{
                  background: queueActionLoading || queued === 0 ? 'var(--bg-elevated)' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                  color: queueActionLoading || queued === 0 ? 'var(--text-muted)' : '#fff',
                  opacity: queueActionLoading || queued === 0 ? 0.5 : 1,
                  cursor: queueActionLoading || queued === 0 ? 'not-allowed' : 'pointer',
                  boxShadow: queueActionLoading || queued === 0 ? 'none' : '0 4px 14px rgba(99,102,241,0.3)',
                }}
              >
                <IconZap size={12} /> Start Queue
              </button>
            ) : (
              <>
                <button
                  disabled={queueActionLoading || !!(batchState?.paused_after_current)}
                  onClick={() => onAction('pause')}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold transition-all"
                  style={{
                    background: 'rgba(245,158,11,0.1)', color: '#f59e0b',
                    border: '1px solid rgba(245,158,11,0.3)',
                    opacity: queueActionLoading || batchState?.paused_after_current ? 0.5 : 1,
                    cursor: queueActionLoading || batchState?.paused_after_current ? 'not-allowed' : 'pointer',
                  }}
                >
                  Pause After Current
                </button>
                <button
                  disabled={queueActionLoading}
                  onClick={() => onAction('stop')}
                  className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold"
                  style={{
                    background: 'rgba(239,68,68,0.08)', color: '#ef4444',
                    border: '1px solid rgba(239,68,68,0.25)',
                    opacity: queueActionLoading ? 0.5 : 1,
                    cursor: queueActionLoading ? 'not-allowed' : 'pointer',
                  }}
                >
                  Stop
                </button>
              </>
            )}
          </div>
        </>
      )}

      <style>{`
        @keyframes dashLivePulse {
          0%, 100% { opacity: 0.4; transform: scale(0.85); }
          50% { opacity: 1; transform: scale(1.2); }
        }
      `}</style>
    </div>
  )
}

// ── Main Dashboard ───────────────────────────────────────────────────────────

export default function StudioDashboardPage({ onNavigateToBatch }: { onNavigateToBatch?: () => void } = {}) {
  const [records, setRecords] = useState<HistoryRecord[]>([])
  const [batchStats, setBatchStats] = useState<any>(null)
  const [batchState, setBatchState] = useState<BatchState | null>(null)
  const [loading, setLoading] = useState(true)
  const [queueActionLoading, setQueueActionLoading] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([
      getHistory().catch(() => []),
      getBatchStats().catch(() => ({})),
      getBatchState().catch(() => null),
    ])
      .then(([historyData, batchData, stateData]) => { 
        setRecords(historyData)
        setBatchStats(batchData)
        setBatchState(stateData)
        setLoading(false) 
      })
  }, [])

  useEffect(() => { load() }, [load])

  // Refresh batch state on a lighter poll
  useEffect(() => {
    const t = setInterval(() => {
      getBatchState().catch(() => null).then(s => { if (s) setBatchState(s) })
      getBatchStats().catch(() => null).then(s => { if (s) setBatchStats(s) })
    }, 4000)
    return () => clearInterval(t)
  }, [])

  const handleQueueAction = async (action: 'start' | 'pause' | 'stop') => {
    setQueueActionLoading(true)
    try {
      if (action === 'start') await startBatchQueueWithValidation()
      else if (action === 'pause') await pauseBatchAfterCurrent()
      else if (action === 'stop') await stopBatchQueue()
      setTimeout(() => {
        getBatchState().catch(() => null).then(s => { if (s) setBatchState(s) })
        getBatchStats().catch(() => null).then(s => { if (s) setBatchStats(s) })
      }, 500)
    } catch (err: any) { 
      dispatchToast('info', 'Notice', String(err.message || err))
    } finally {
      setQueueActionLoading(false)
    }
  }

  const stats = computeStats(records)
  const hasActivity = stats.total_exports > 0

  // Weekly bucketed sparkline (last 7 days per-day count)
  const weeklyData = (() => {
    const buckets = Array(7).fill(0)
    const now = Date.now()
    for (const r of records) {
      const diff = Math.floor((now - new Date(r.created_at).getTime()) / 86400000)
      if (diff >= 0 && diff < 7) buckets[6 - diff]++
    }
    return buckets
  })()

  // Tool usage distribution
  const toolDistribution = [
    { key: 'image_timeline', ...getToolDisplay('image_timeline') },
    { key: 'video_timeline', ...getToolDisplay('video_timeline') },
    { key: 'media_timeline', ...getToolDisplay('media_timeline') },
    { key: 'audio_merger', ...getToolDisplay('audio_merger') },
    { key: 'script_timestamp', ...getToolDisplay('script_timestamp') },
  ].map(t => ({ ...t, count: stats.tool_counts[t.key] || 0 }))
    .filter(t => t.count > 0)
    .sort((a, b) => b.count - a.count)

  // Recent 8 records
  const recent = [...records].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 8)

  // Most used tool display
  const mostUsed = stats.most_used_tool ? getToolDisplay(stats.most_used_tool) : null
  const videoCount = stats.total_videos
  const audioCount = stats.tool_counts['audio_merger'] || 0
  const scriptCount = stats.tool_counts['script_timestamp'] || 0
  const totalDurationMins = (stats.total_generated_duration / 60)

  return (
    <div className="w-full px-5 sm:px-8 py-8 space-y-8 animate-fade-in" style={{ maxWidth: 1280 }}>

      <StudioPageHeader
        icon={<IconDashboard size={16} />}
        title="Dashboard"
        subtitle="Your local SyncFrame Studio analytics and export activity."
      />

      {/* ── Loading State ── */}
      {loading && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}
        </div>
      )}

      {/* ── Empty State ── */}
      {!loading && !hasActivity && <EmptyDashboard />}

      {/* ── Dashboard Content ── */}
      {!loading && hasActivity && (
        <>
          {/* ── Stat Cards Row ── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Total Exports"
              value={stats.total_exports}
              icon={<IconDownload size={18} />}
              color="#6366f1"
              bg="rgba(99,102,241,0.12)"
              border="rgba(99,102,241,0.25)"
              sparkData={weeklyData}
            />
            <StatCard
              label="Videos Generated"
              value={videoCount}
              icon={<IconFilm size={18} />}
              color="#a78bfa"
              bg="rgba(167,139,250,0.12)"
              border="rgba(167,139,250,0.25)"
              trendLabel="Image, Video & Media Timeline"
            />
            <StatCard
              label="Audio Merged"
              value={audioCount}
              icon={<IconMusic size={18} />}
              color="#10b981"
              bg="rgba(16,185,129,0.12)"
              border="rgba(16,185,129,0.25)"
            />
            <StatCard
              label="Timestamps Created"
              value={scriptCount}
              icon={<IconFileText size={18} />}
              color="#f59e0b"
              bg="rgba(245,158,11,0.12)"
              border="rgba(245,158,11,0.25)"
            />
          </div>

          {/* ── Middle Section: Wide Analytics + Sidebar ── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

            {/* ── Left: Batch Queue + Tool Distribution ── */}
            <div className="lg:col-span-2 space-y-6">

              {/* ── Batch Queue Status ── */}
              <BatchQueuePanel
                batchStats={batchStats}
                batchState={batchState}
                queueActionLoading={queueActionLoading}
                onAction={handleQueueAction}
                onOpenBatch={onNavigateToBatch}
              />

              {/* Tool Distribution Card */}
              {toolDistribution.length > 0 && (
                <div className="card p-5">
                  <div className="flex items-center justify-between mb-5">
                    <div>
                      <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Tool Usage</h2>
                      <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>Distribution across all tools</p>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>{stats.total_exports} total</span>
                  </div>
                  <div className="space-y-4">
                    {toolDistribution.map(t => (
                      <ToolBar key={t.key} label={t.label} count={t.count} total={stats.total_exports} color={t.color} icon={t.icon} />
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* ── Right Sidebar ── */}
            <div className="space-y-6">

              {/* Summary Ring Card */}
              <div className="card p-5">
                <h2 className="text-sm font-bold mb-5" style={{ color: 'var(--text-primary)' }}>Studio Summary</h2>
                <div className="flex items-center justify-around py-2">
                  <RadialRing
                    value={videoCount} max={Math.max(stats.total_exports, 1)}
                    color="#6366f1" label={String(videoCount)} sublabel="Videos"
                  />
                  <RadialRing
                    value={audioCount} max={Math.max(stats.total_exports, 1)}
                    color="#10b981" label={String(audioCount)} sublabel="Audio"
                  />
                  <RadialRing
                    value={scriptCount} max={Math.max(stats.total_exports, 1)}
                    color="#f59e0b" label={String(scriptCount)} sublabel="Scripts"
                  />
                </div>

                {/* Duration stat */}
                {stats.total_generated_duration > 0 && (
                  <div className="mt-4 pt-4 border-t flex items-center justify-between" style={{ borderColor: 'var(--border-subtle)' }}>
                    <div className="flex items-center gap-2">
                      <IconClock size={14} style={{ color: 'var(--text-muted)' }} />
                      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Total Duration</span>
                    </div>
                    <span className="text-sm font-black" style={{ color: 'var(--text-primary)' }}>
                      {totalDurationMins >= 1 ? `${totalDurationMins.toFixed(1)}m` : `${stats.total_generated_duration.toFixed(0)}s`}
                    </span>
                  </div>
                )}

                {/* Most used */}
                {mostUsed && (
                  <div className="mt-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <IconZap size={14} style={{ color: 'var(--text-muted)' }} />
                      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Most Used</span>
                    </div>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-lg" style={{ background: mostUsed.bg, color: mostUsed.color, border: `1px solid ${mostUsed.border}` }}>
                      {mostUsed.label}
                    </span>
                  </div>
                )}

                {/* Last active */}
                {stats.last_activity && (
                  <div className="mt-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <IconHistory size={14} style={{ color: 'var(--text-muted)' }} />
                      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Last Active</span>
                    </div>
                    <span className="text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>{stats.last_activity}</span>
                  </div>
                )}
              </div>

              {/* Quick Export Stats */}
              <div className="card p-5 space-y-3">
                <h2 className="text-sm font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Quick Stats</h2>

                {[
                  { label: 'Image Timeline', count: stats.tool_counts['image_timeline'] || 0, color: '#a78bfa' },
                  { label: 'Video Timeline', count: stats.tool_counts['video_timeline'] || 0, color: '#6366f1' },
                  { label: 'Media Timeline', count: stats.tool_counts['media_timeline'] || 0, color: '#06b6d4' },
                  { label: 'Audio Merger', count: stats.tool_counts['audio_merger'] || 0, color: '#10b981' },
                  { label: 'Script Timestamp', count: stats.tool_counts['script_timestamp'] || 0, color: '#f59e0b' },
                ].map(item => (
                  <div key={item.label} className="flex items-center justify-between py-1">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ background: item.color }} />
                      <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{item.label}</span>
                    </div>
                    <span className="text-xs font-black tabular-nums" style={{ color: 'var(--text-primary)' }}>{item.count}</span>
                  </div>
                ))}
              </div>

            </div>
          </div>

          {/* ── Recent Activity Feed ── */}
          {recent.length > 0 && (
            <div className="card p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Recent Exports</h2>
                  <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>Your latest {Math.min(recent.length, 8)} generated outputs</p>
                </div>
                <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                  <IconHistory size={12} />
                  Live feed
                </div>
              </div>
              <div>
                {recent.map((r, i) => (
                  <ActivityItem key={r.id} record={r} isLast={i === recent.length - 1} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// Inline IconDashboard since we need it in the header
function IconDashboard({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7"></rect>
      <rect x="14" y="3" width="7" height="7"></rect>
      <rect x="14" y="14" width="7" height="7"></rect>
      <rect x="3" y="14" width="7" height="7"></rect>
    </svg>
  )
}
