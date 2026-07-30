import React, { useMemo } from 'react'
import { ManualCaptionCue } from '../types/caption'

interface Props {
  cues: ManualCaptionCue[]
  onChange: (cues: ManualCaptionCue[]) => void
  disabled?: boolean
}

const newId = () => `cue_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

/** "1:02.5" | "62.5" | "1:02" -> seconds. Returns null if unparseable. */
export function parseCueTime(raw: string): number | null {
  const t = (raw || '').trim()
  if (!t) return null
  if (/^\d+(\.\d+)?$/.test(t)) return parseFloat(t)
  const m = t.match(/^(?:(\d+):)?(\d{1,2}):(\d{1,2}(?:\.\d+)?)$/)
  if (m) {
    const h = m[1] ? parseInt(m[1], 10) : 0
    return h * 3600 + parseInt(m[2], 10) * 60 + parseFloat(m[3])
  }
  const ms = t.match(/^(\d{1,2}):(\d{1,2}(?:\.\d+)?)$/)
  if (ms) return parseInt(ms[1], 10) * 60 + parseFloat(ms[2])
  return null
}

export function formatCueTime(sec: number): string {
  if (!isFinite(sec) || sec < 0) return '0:00.0'
  const m = Math.floor(sec / 60)
  const s = sec - m * 60
  return `${m}:${s.toFixed(1).padStart(4, '0')}`
}

/**
 * Validates the cue list the same way the backend does, so problems surface
 * while typing instead of failing mid-render.
 */
export function validateCues(cues: ManualCaptionCue[]): string[] {
  const errs: string[] = []
  const sorted = [...cues].sort((a, b) => a.start - b.start)
  sorted.forEach((c, i) => {
    const n = i + 1
    if (!c.text.trim()) errs.push(`Caption ${n} has no text.`)
    if (c.end <= c.start) errs.push(`Caption ${n} ends at or before it starts.`)
    if (i > 0 && c.start < sorted[i - 1].end) {
      errs.push(`Caption ${n} overlaps the one before it.`)
    }
  })
  return errs
}

export function ManualCaptionEditor({ cues, onChange, disabled }: Props) {
  const errors = useMemo(() => validateCues(cues), [cues])

  const update = (id: string, patch: Partial<ManualCaptionCue>) =>
    onChange(cues.map(c => (c.id === id ? { ...c, ...patch } : c)))

  const addCue = () => {
    const last = [...cues].sort((a, b) => a.end - b.end)[cues.length - 1]
    const start = last ? last.end : 0
    onChange([...cues, { id: newId(), start, end: start + 2, text: '' }])
  }

  const removeCue = (id: string) => onChange(cues.filter(c => c.id !== id))

  return (
    <div className={`p-3 space-y-2 ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-widest font-bold"
             style={{ color: 'var(--text-muted)' }}>
          Manual Captions ({cues.length})
        </div>
        <button
          type="button"
          onClick={addCue}
          className="text-[11px] font-bold px-2.5 py-1 rounded-md transition-all duration-200 hover:scale-105 active:scale-95"
          style={{ background: 'var(--accent-subtle)', color: 'var(--accent-primary)', border: '1px solid var(--accent-border)' }}
        >
          + Add line
        </button>
      </div>

      {cues.length === 0 && (
        <p className="text-[11px] py-3 text-center" style={{ color: 'var(--text-muted)' }}>
          No captions yet — add a line to start.
        </p>
      )}

      <div className="space-y-1.5 max-h-64 overflow-y-auto">
        {cues.map((c, i) => (
          <div key={c.id} className="flex items-start gap-1.5">
            <span className="text-[10px] w-5 pt-2 text-right shrink-0"
                  style={{ color: 'var(--text-muted)' }}>{i + 1}</span>
            <input
              aria-label={`Caption ${i + 1} start time`}
              defaultValue={formatCueTime(c.start)}
              onBlur={e => {
                const v = parseCueTime(e.target.value)
                if (v === null) { e.target.value = formatCueTime(c.start); return }
                update(c.id, { start: v })
                e.target.value = formatCueTime(v)
              }}
              className="w-16 text-[11px] rounded-md px-1.5 py-1.5 outline-none transition-colors duration-200 focus:border-indigo-500/60"
              style={{ background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-subtle)' }}
            />
            <input
              aria-label={`Caption ${i + 1} end time`}
              defaultValue={formatCueTime(c.end)}
              onBlur={e => {
                const v = parseCueTime(e.target.value)
                if (v === null) { e.target.value = formatCueTime(c.end); return }
                update(c.id, { end: v })
                e.target.value = formatCueTime(v)
              }}
              className="w-16 text-[11px] rounded-md px-1.5 py-1.5 outline-none transition-colors duration-200 focus:border-indigo-500/60"
              style={{ background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-subtle)' }}
            />
            <input
              aria-label={`Caption ${i + 1} text`}
              value={c.text}
              placeholder="Caption text…"
              onChange={e => update(c.id, { text: e.target.value })}
              className="flex-1 min-w-0 text-[11px] rounded-md px-2 py-1.5 outline-none transition-colors duration-200 focus:border-indigo-500/60"
              style={{ background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-subtle)' }}
            />
            <button
              type="button"
              onClick={() => removeCue(c.id)}
              aria-label={`Delete caption ${i + 1}`}
              className="text-[11px] px-1.5 py-1.5 rounded-md transition-colors duration-200 hover:text-red-400"
              style={{ color: 'var(--text-muted)' }}
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      {errors.length > 0 && (
        <ul className="text-[10px] space-y-0.5 pt-1" style={{ color: 'var(--color-error)' }}>
          {errors.slice(0, 4).map((e, i) => <li key={i}>• {e}</li>)}
        </ul>
      )}
    </div>
  )
}
