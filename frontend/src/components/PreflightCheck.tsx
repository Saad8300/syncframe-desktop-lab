// PreflightCheck.tsx — Preflight check panel for all timeline pages

import React from 'react'
import { IconCheck, IconAlertTriangle, IconX } from './icons'

interface CheckItem {
  label: string
  status: 'ready' | 'warning' | 'missing'
  detail?: string
}

interface PreflightCheckProps {
  checks: CheckItem[]
  /** If true, shows CSV header warning */
  csvHeaderWarning?: boolean
}

function StatusIcon({ status }: { status: CheckItem['status'] }) {
  if (status === 'ready') {
    return (
      <span
        className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
        style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e' }}
      >
        <IconCheck size={11} />
      </span>
    )
  }
  if (status === 'warning') {
    return (
      <span
        className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
        style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}
      >
        <IconAlertTriangle size={11} />
      </span>
    )
  }
  return (
    <span
      className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
      style={{ background: 'rgba(239,68,68,0.12)', color: '#ef4444' }}
    >
      <IconX size={10} />
    </span>
  )
}

export default function PreflightCheck({ checks, csvHeaderWarning }: PreflightCheckProps) {
  const allReady = checks.every(c => c.status === 'ready')
  const hasMissing = checks.some(c => c.status === 'missing')

  return (
    <div className="rounded-xl p-4 space-y-3"
         style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
          Preflight Check
        </p>
        <span
          className="text-[10px] font-bold px-2 py-0.5 rounded-full"
          style={{
            background: allReady ? 'rgba(34,197,94,0.12)' : hasMissing ? 'rgba(239,68,68,0.10)' : 'rgba(245,158,11,0.12)',
            color: allReady ? '#22c55e' : hasMissing ? '#ef4444' : '#f59e0b',
            border: `1px solid ${allReady ? 'rgba(34,197,94,0.25)' : hasMissing ? 'rgba(239,68,68,0.20)' : 'rgba(245,158,11,0.25)'}`,
          }}
        >
          {allReady ? '✓ Ready' : hasMissing ? 'Missing Files' : 'Warning'}
        </span>
      </div>

      {/* Checks */}
      <div className="space-y-2">
        {checks.map(c => (
          <div key={c.label} className="flex items-start gap-2">
            <StatusIcon status={c.status} />
            <div className="flex-1 min-w-0">
              <p
                className="text-xs font-medium"
                style={{ color: c.status === 'missing' ? 'var(--color-error)' : 'var(--text-primary)' }}
              >
                {c.label}
              </p>
              {c.detail && (
                <p className="text-[10px] mt-0.5 leading-snug" style={{ color: 'var(--text-muted)' }}>
                  {c.detail}
                </p>
              )}
            </div>
          </div>
        ))}

        {/* CSV header warning */}
        {csvHeaderWarning && (
          <div className="flex items-start gap-2 pt-1">
            <span
              className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
              style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}
            >
              <IconAlertTriangle size={11} />
            </span>
            <p className="text-[10px] leading-snug" style={{ color: '#f59e0b' }}>
              CSV header may be invalid. Please check the format guide.
            </p>
          </div>
        )}
      </div>

      {/* Bottom status message */}
      <div
        className="rounded-lg px-3 py-2 text-[11px] font-semibold text-center"
        style={{
          background: allReady ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.06)',
          color: allReady ? '#22c55e' : 'var(--text-muted)',
          border: `1px solid ${allReady ? 'rgba(34,197,94,0.20)' : 'var(--border-subtle)'}`,
        }}
      >
        {allReady ? '✓ Ready to Generate' : 'Complete required files before generating'}
      </div>
    </div>
  )
}

// Helper to build checks — exported so each page can call it
export function buildPreflightChecks({
  audioLabel,
  audioReady,
  zipLabel,
  zipReady,
  csvReady,
}: {
  audioLabel: string
  audioReady: boolean
  zipLabel: string
  zipReady: boolean
  csvReady: boolean
}): CheckItem[] {
  return [
    {
      label: audioLabel,
      status: audioReady ? 'ready' : 'missing',
      detail: audioReady ? undefined : 'Upload a main audio file or Audio Parts ZIP',
    },
    {
      label: zipLabel,
      status: zipReady ? 'ready' : 'missing',
      detail: zipReady ? undefined : 'Upload a ZIP file with your media',
    },
    {
      label: 'Timeline CSV',
      status: csvReady ? 'ready' : 'missing',
      detail: csvReady ? undefined : 'Upload a timeline CSV file',
    },
    {
      label: 'Export Settings',
      status: 'ready',
    },
  ]
}
