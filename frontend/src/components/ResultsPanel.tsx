// components/ResultsPanel.tsx – Premium export results panel

import React, { useState } from 'react'
import {
  IconDownload,
  IconCheck,
  IconAlertTriangle,
  IconX,
  IconVideo,
} from './icons'
import type { GenerateResponse, TimelineRow, GenerateSettings } from '../types'

interface ResultsPanelProps {
  result:   GenerateResponse
  settings: GenerateSettings
}

function StatusBadge({ status }: { status: TimelineRow['status'] }) {
  if (status === 'ok')      return <span className="badge-ok">✓ OK</span>
  if (status === 'missing') return <span className="badge-missing">⚠ Missing</span>
  return <span className="badge-error">✗ Error</span>
}

function cleanErrorMessage(msg: string): string {
  // Clean up raw FastAPI / backend JSON errors into human-readable messages
  if (msg.includes('Field required') && msg.includes('audio_files')) {
    return 'Please upload a main audio file or Audio Parts ZIP.'
  }
  if (msg.includes('Field required') && (msg.includes('images_zip') || msg.includes('media_zip') || msg.includes('videos_zip'))) {
    return 'Please upload the required ZIP file.'
  }
  if (msg.includes('Field required') && msg.includes('timeline_csv')) {
    return 'Please upload the timeline CSV.'
  }
  if (msg.toLowerCase().includes('csv') && msg.toLowerCase().includes('format')) {
    return 'CSV format issue. Please check the row shown in the error.'
  }
  if (msg.toLowerCase().includes('audio merge') || msg.toLowerCase().includes('merging audio')) {
    return 'Audio merge failed. Please check your audio files and try again.'
  }
  // Strip raw JSON-like messages
  if (msg.startsWith('{') || msg.startsWith('[')) {
    try {
      const parsed = JSON.parse(msg)
      if (parsed.detail) return String(parsed.detail)
    } catch {}
    return 'An error occurred. Please check your files and try again.'
  }
  return msg
}

function cleanWarningMessage(msg: string): string {
  // Make "unused files" warnings less scary
  if (
    msg.toLowerCase().includes('not used') ||
    msg.toLowerCase().includes('unused') ||
    msg.toLowerCase().includes('not referenced')
  ) {
    return 'Some files in the ZIP were not used by the CSV. This is okay if you intentionally included extra files.'
  }
  return msg
}

function MessageList({ items, type }: { items: string[]; type: 'warning' | 'error' }) {
  if (!items.length) return null
  const isWarn = type === 'warning'
  const cleanedItems = items.map(m => isWarn ? cleanWarningMessage(m) : cleanErrorMessage(m))
  // Deduplicate cleaned messages
  const uniqueItems = cleanedItems.filter((m, i) => cleanedItems.indexOf(m) === i)
  // For warnings: show max 5 + collapsible
  const SHOW_MAX = 5
  const visibleItems = isWarn ? uniqueItems.slice(0, SHOW_MAX) : uniqueItems
  const hiddenCount = isWarn ? Math.max(0, uniqueItems.length - SHOW_MAX) : 0
  return (
    <div
      className="rounded-xl p-4 space-y-2"
      style={{
        background: isWarn ? 'var(--bg-elevated)' : 'var(--color-error-bg)',
        border: `1px solid ${isWarn ? 'var(--border-subtle)' : 'var(--color-error-border)'}`,
      }}
    >
      <div className="flex items-center gap-2 text-xs font-bold" style={{ color: isWarn ? 'var(--color-warning)' : 'var(--color-error)' }}>
        {isWarn ? <IconAlertTriangle size={13} /> : <IconX size={13} />}
        {isWarn ? `${uniqueItems.length} Note${uniqueItems.length > 1 ? 's' : ''}` : `${uniqueItems.length} Error${uniqueItems.length > 1 ? 's' : ''}`}
      </div>
      <ul className="space-y-1.5">
        {visibleItems.map((msg, i) => (
          <li key={i} className="text-xs flex items-start gap-2" style={{ color: isWarn ? 'var(--text-secondary)' : 'var(--color-error)', opacity: 0.9 }}>
            <span className="shrink-0 mt-0.5 text-[10px]" style={{ color: isWarn ? 'var(--color-warning)' : 'var(--color-error)' }}>·</span>
            <span>{msg}</span>
          </li>
        ))}
        {hiddenCount > 0 && (
          <li className="text-[10px] italic" style={{ color: 'var(--text-muted)' }}>+ {hiddenCount} more</li>
        )}
      </ul>
    </div>
  )
}

const CHIP_LABELS: Record<string, string> = {
  exportResolution: 'Res',
  renderProfile: 'Profile',
  motionEffect: 'Motion',
  transition: 'Transition',
  visualEffect: 'Visual',
}

export default function ResultsPanel({ result, settings }: ResultsPanelProps) {
  const [timelineOpen, setTimelineOpen] = useState(false)

  const videoUrl      = result.output_video_url
  const hasVideo      = result.success && videoUrl
  const totalItems    = result.timeline_report.length
  const totalWarns    = result.warnings.length
  const lastItem      = result.timeline_report[result.timeline_report.length - 1]
  const totalDuration = lastItem ? lastItem.end : '0:00'
  const hasIssues     = result.timeline_report.some(r => r.status !== 'ok')
  const filename      = result.output_filename ?? 'video.mp4'

  const metaChips = [
    { key: 'exportResolution', label: 'Res', value: settings.exportResolution },
    { key: 'renderProfile',    label: 'Profile', value: settings.renderProfile.replace(/_/g, ' ') },
    { key: 'motionEffect',     label: 'Motion', value: settings.motionEffect.replace(/_/g, ' ') },
    { key: 'transition',       label: 'Transition', value: settings.transition.replace(/_/g, ' ') },
    { key: 'visualEffect',     label: 'Visual', value: settings.visualEffect.replace(/_/g, ' ') },
  ]

  return (
    <div className="space-y-4 animate-slide-up">

      {/* ── Success / fail banner ── */}
      {result.success ? (
        <div style={{
          borderRadius: 18,
          background: 'var(--bg-card)',
          border: '1px solid var(--border-default)',
          overflow: 'hidden',
          boxShadow: 'var(--shadow-card)',
        }}>
          {/* Gradient top stripe */}
          <div style={{ height: 4, background: 'linear-gradient(90deg, #10b981, #34d399, #06b6d4)' }} />

          <div style={{ padding: '20px 24px', display: 'flex', alignItems: 'flex-start', gap: 16 }}>
            {/* Check icon */}
            <div style={{
              width: 48, height: 48, borderRadius: 14, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'var(--color-success-bg)',
              border: '1px solid var(--color-success-border)',
            }}>
              <IconCheck size={22} style={{ color: 'var(--color-success)' }} />
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em', margin: 0 }}>
                Export Complete
              </h3>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
                Video ready to preview and download.
                {result.elapsed_seconds != null && (
                  <span style={{ marginLeft: 6 }}>
                    Completed in <strong style={{ color: 'var(--color-success)' }}>{result.elapsed_seconds}s</strong>.
                  </span>
                )}
              </p>

              {/* Metadata chips */}
              <div style={{ display: 'flex', gap: 5, marginTop: 10, flexWrap: 'wrap' }}>
                {metaChips.map(chip => (
                  <span
                    key={chip.key}
                    className="meta-chip"
                  >
                    <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>{chip.label}</span>
                    <span style={{ color: 'var(--border-default)' }}>·</span>
                    <span style={{ textTransform: 'capitalize' }}>{chip.value}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div
          className="rounded-2xl p-5 flex items-start gap-4"
          style={{
            background: 'var(--color-error-bg)',
            border: '1px solid var(--color-error-border)',
          }}
        >
          <div style={{
            width: 40, height: 40, borderRadius: 12, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--color-error-bg)', border: '1px solid var(--color-error-border)',
          }}>
            <IconX size={18} style={{ color: 'var(--color-error)' }} />
          </div>
          <div>
            <p className="font-bold text-sm" style={{ color: 'var(--color-error)' }}>Generation Failed</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>See the error details below for more information.</p>
          </div>
        </div>
      )}

      {/* Messages */}
      {result.errors.length   > 0 && <MessageList items={result.errors}   type="error"   />}
      {result.warnings.length > 0 && <MessageList items={result.warnings} type="warning" />}

      {/* Video preview + download */}
      {hasVideo && (
        <div style={{
          borderRadius: 18,
          background: 'var(--bg-card)',
          border: '1px solid var(--border-default)',
          overflow: 'hidden',
          boxShadow: 'var(--shadow-card)',
        }}>
          {/* Video container */}
          <div style={{ background: '#000', aspectRatio: '16/9', position: 'relative' }}>
            <video
              src={videoUrl!}
              controls
              style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
              aria-label="Generated video preview"
            />
          </div>

          {/* Download row */}
          <div style={{ padding: '16px 20px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Filename */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                fontSize: 9, color: 'var(--text-muted)', fontWeight: 700,
                textTransform: 'uppercase', letterSpacing: '0.08em', flexShrink: 0,
              }}>
                Output file
              </span>
              <span style={{
                flex: 1, fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'ui-monospace, monospace',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                padding: '2px 8px', borderRadius: 6,
                background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
              }} title={filename}>
                {filename}
              </span>
            </div>

            {/* Download button */}
            <a
              href={videoUrl!}
              download={filename}
              id="download-video-btn"
              aria-label="Download MP4"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                padding: '13px 20px', borderRadius: 12,
                fontWeight: 700, fontSize: 14, color: '#fff',
                background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                textDecoration: 'none',
                transition: 'transform 0.18s ease, box-shadow 0.18s ease',
                boxShadow: '0 4px 16px rgba(99,102,241,0.35)',
                position: 'relative', overflow: 'hidden',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.transform = 'translateY(-2px)'
                e.currentTarget.style.boxShadow = '0 8px 24px rgba(99,102,241,0.50)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = 'translateY(0)'
                e.currentTarget.style.boxShadow = '0 4px 16px rgba(99,102,241,0.35)'
              }}
            >
              <IconDownload size={17} />
              Download MP4
            </a>
          </div>
        </div>
      )}

      {/* Timeline report */}
      {result.timeline_report.length > 0 && (
        <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border-subtle)', background: 'var(--bg-card)', boxShadow: 'var(--shadow-card)' }}>
          <button
            onClick={() => setTimelineOpen(v => !v)}
            className="w-full flex items-center justify-between gap-4 px-4 py-3.5 text-left transition-colors"
            style={{ background: timelineOpen ? 'var(--accent-subtle)' : 'transparent' }}
            aria-expanded={timelineOpen}
          >
            <div className="flex items-center gap-2.5">
              <IconVideo size={14} style={{ color: 'var(--text-muted)' }} />
              <div>
                <span className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>Timeline Report</span>
                <div className="flex items-center gap-1.5 mt-0.5 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                  <span style={{ color: 'var(--accent-primary)', fontWeight: 600 }}>{totalItems} clips</span>
                  <span>·</span>
                  <span>{totalDuration}</span>
                  <span>·</span>
                  {hasIssues
                    ? <span style={{ color: 'var(--color-error)' }}>Issues found</span>
                    : totalWarns > 0
                    ? <span style={{ color: 'var(--color-warning)' }}>{totalWarns} warnings</span>
                    : <span style={{ color: 'var(--color-success)' }}>All clips OK</span>
                  }
                </div>
              </div>
            </div>
            <span
              className="text-[11px] font-bold transition-transform duration-200 shrink-0"
              style={{ color: 'var(--text-muted)', transform: timelineOpen ? 'rotate(180deg)' : 'none' }}
            >
              ▾
            </span>
          </button>

          {timelineOpen && (
            <div className="px-4 pb-4 animate-slide-down" style={{ borderTop: '1px solid var(--border-subtle)' }}>
              <div className="overflow-x-auto rounded-xl mt-3" style={{ border: '1px solid var(--border-subtle)' }}>
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border-subtle)' }}>
                      {['Image', 'Start', 'End', 'Duration', 'Text', 'Status'].map(h => (
                        <th key={h} className="px-3 py-2.5 text-left font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)', fontSize: '9px' }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.timeline_report.slice(0, 100).map((row, i) => (
                      <tr
                        key={i}
                        style={{
                          borderBottom: '1px solid var(--border-subtle)',
                          background: row.status !== 'ok' ? 'var(--color-error-bg)' : 'transparent',
                        }}
                      >
                        <td className="px-3 py-2 font-mono" style={{ color: 'var(--text-secondary)' }}>{row.image}</td>
                        <td className="px-3 py-2 font-mono" style={{ color: 'var(--text-muted)' }}>{row.start}</td>
                        <td className="px-3 py-2 font-mono" style={{ color: 'var(--text-muted)' }}>{row.end}</td>
                        <td className="px-3 py-2 font-mono" style={{ color: 'var(--text-muted)' }}>{row.duration}</td>
                        <td className="px-3 py-2 max-w-[160px] truncate" style={{ color: 'var(--text-muted)' }}>
                          {row.text || <span style={{ opacity: 0.35, fontStyle: 'italic' }}>—</span>}
                        </td>
                        <td className="px-3 py-2">
                          <StatusBadge status={row.status} />
                        </td>
                      </tr>
                    ))}
                    {result.timeline_report.length > 100 && (
                      <tr style={{ background: 'var(--bg-elevated)' }}>
                        <td colSpan={6} className="px-3 py-3 text-center text-[10px] italic" style={{ color: 'var(--text-muted)' }}>
                          + {result.timeline_report.length - 100} more items hidden for performance.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
