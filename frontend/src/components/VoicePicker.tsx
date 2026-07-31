import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import type { TtsVoice } from '../utils/api'

/**
 * Voice picker for Text to Speech.
 *
 * A native <select> hands the open list to the OS, so however well the closed
 * control is styled the dropdown itself renders as a plain system list — no
 * badges, no grouping, no hover treatment, and different on macOS vs Windows.
 * This is built from real elements instead, so the open list is ours and looks
 * identical on both platforms in the packaged app.
 *
 * Follows the portal convention already used by CaptionSettingsSection and
 * BatchVideoGeneratorPage: createPortal to document.body, a fixed-position
 * panel placed from the trigger's rect, dismissed by a window click listener
 * plus Escape.
 *
 * Rows are windowed by hand rather than with a virtualization dependency —
 * 464 voices at a fixed row height only needs offset arithmetic, and this
 * avoids adding a package for it.
 */

const ROW_H = 34          // px; fixed so scroll offsets are pure arithmetic
const HEADER_H = 26       // px; sticky language group header
const PANEL_MAX_H = 340
const OVERSCAN = 6        // rows rendered beyond the viewport, to hide seams

type Row =
  | { kind: 'header'; label: string; count: number }
  | { kind: 'voice'; voice: TtsVoice }

interface Props {
  voices: TtsVoice[]          // already filtered by Language/Gender/Engine
  value: string
  onChange: (id: string) => void
  disabled?: boolean
  loading?: boolean
}

function buildRows(voices: TtsVoice[]): Row[] {
  const groups = new Map<string, TtsVoice[]>()
  for (const v of voices) {
    const key = v.language || 'Other'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(v)
  }
  const rows: Row[] = []
  for (const [label, list] of Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
    rows.push({ kind: 'header', label, count: list.length })
    for (const voice of list) rows.push({ kind: 'voice', voice })
  }
  return rows
}

function VoiceBadge({ engine }: { engine: 'Local' | 'Cloud' }) {
  const local = engine === 'Local'
  return (
    <span
      className="shrink-0 text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
      style={{
        background: local ? 'var(--color-success-bg)' : 'var(--secondary-subtle)',
        color: local ? 'var(--color-success)' : 'var(--secondary)',
        border: `1px solid ${local ? 'var(--color-success-border)' : 'var(--secondary-border)'}`,
      }}
    >
      {engine}
    </span>
  )
}

function describe(v: TtsVoice): string {
  const bits = [v.country]
  if (v.gender !== 'Unspecified') bits.push(v.gender)
  return bits.filter(Boolean).join(' · ')
}

export function VoicePicker({ voices, value, onChange, disabled, loading }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIdx, setActiveIdx] = useState(-1)
  const [scrollTop, setScrollTop] = useState(0)
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null)

  const triggerRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const selected = voices.find(v => v.id === value)

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return voices
    return voices.filter(v =>
      v.name.toLowerCase().includes(q) ||
      v.language.toLowerCase().includes(q) ||
      v.country.toLowerCase().includes(q) ||
      v.id.toLowerCase().includes(q)
    )
  }, [voices, query])

  const rows = useMemo(() => buildRows(matches), [matches])
  const voiceIdxs = useMemo(
    () => rows.map((r, i) => (r.kind === 'voice' ? i : -1)).filter(i => i >= 0),
    [rows]
  )

  // Row tops are precomputed once per list so lookups stay O(1) while scrolling.
  const offsets = useMemo(() => {
    const out: number[] = []
    let y = 0
    for (const r of rows) { out.push(y); y += r.kind === 'header' ? HEADER_H : ROW_H }
    return out
  }, [rows])
  const totalH = offsets.length ? offsets[offsets.length - 1] + (rows[rows.length - 1].kind === 'header' ? HEADER_H : ROW_H) : 0

  const firstVisible = useMemo(() => {
    let lo = 0, hi = offsets.length - 1, res = 0
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      if (offsets[mid] <= scrollTop) { res = mid; lo = mid + 1 } else { hi = mid - 1 }
    }
    return Math.max(0, res - OVERSCAN)
  }, [offsets, scrollTop])

  const lastVisible = useMemo(() => {
    let i = firstVisible
    while (i < offsets.length && offsets[i] < scrollTop + PANEL_MAX_H) i++
    return Math.min(offsets.length - 1, i + OVERSCAN)
  }, [offsets, firstVisible, scrollTop])

  const place = useCallback(() => {
    const el = triggerRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const below = window.innerHeight - r.bottom
    const height = Math.min(PANEL_MAX_H + 52, below - 12)
    // Flip above the trigger when there isn't room below.
    const top = height < 180 ? Math.max(8, r.top - (PANEL_MAX_H + 60)) : r.bottom + 6
    setRect({ top, left: r.left, width: r.width })
  }, [])

  const openPanel = () => {
    if (disabled) return
    place()
    setQuery('')
    setScrollTop(0)
    const sel = rows.findIndex(r => r.kind === 'voice' && r.voice.id === value)
    setActiveIdx(sel >= 0 ? sel : (voiceIdxs[0] ?? -1))
    setOpen(true)
  }

  const closePanel = useCallback((restoreFocus = true) => {
    setOpen(false)
    if (restoreFocus) triggerRef.current?.focus()
  }, [])

  // Dismiss on outside click / Escape, and keep the panel anchored on
  // scroll+resize. Matches the existing portal-menu convention.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (triggerRef.current?.contains(t)) return
      if (listRef.current?.closest('[data-voicepicker-panel]')?.contains(t)) return
      const panel = document.querySelector('[data-voicepicker-panel]')
      if (panel && panel.contains(t)) return
      closePanel(false)
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, place, closePanel])

  useEffect(() => { if (open) searchRef.current?.focus() }, [open])

  // Keep the active row on screen during keyboard navigation.
  //
  // The render window is driven by the `scrollTop` state, and a programmatic
  // assignment to el.scrollTop does not reliably round-trip back through the
  // onScroll handler in time. Without setting the state here too, a jump like
  // Home or End moved the scrollbar while leaving the window rendering the
  // previous slice, so aria-activedescendant pointed at an element that was
  // not in the DOM. Setting both keeps them in lockstep.
  useEffect(() => {
    if (!open || activeIdx < 0 || !listRef.current) return
    const top = offsets[activeIdx]
    const h = rows[activeIdx]?.kind === 'header' ? HEADER_H : ROW_H
    const el = listRef.current
    let next: number | null = null
    if (top < el.scrollTop) next = top
    else if (top + h > el.scrollTop + el.clientHeight) next = top + h - el.clientHeight
    if (next !== null) {
      el.scrollTop = next
      setScrollTop(next)
    }
  }, [activeIdx, open, offsets, rows])

  const step = (dir: 1 | -1) => {
    if (!voiceIdxs.length) return
    const pos = voiceIdxs.indexOf(activeIdx)
    const next = pos === -1
      ? (dir === 1 ? voiceIdxs[0] : voiceIdxs[voiceIdxs.length - 1])
      : voiceIdxs[Math.min(voiceIdxs.length - 1, Math.max(0, pos + dir))]
    setActiveIdx(next)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); step(1); break
      case 'ArrowUp':   e.preventDefault(); step(-1); break
      case 'Home':      e.preventDefault(); setActiveIdx(voiceIdxs[0] ?? -1); break
      case 'End':       e.preventDefault(); setActiveIdx(voiceIdxs[voiceIdxs.length - 1] ?? -1); break
      case 'Enter': {
        e.preventDefault()
        const r = rows[activeIdx]
        if (r && r.kind === 'voice') { onChange(r.voice.id); closePanel() }
        break
      }
      case 'Escape': e.preventDefault(); closePanel(); break
      case 'Tab': closePanel(false); break
    }
  }

  const label = loading
    ? 'Loading voices…'
    : selected
      ? selected.name
      : (voices.length ? 'Select a voice' : 'No voices match these filters')

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? closePanel() : openPanel())}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Voice"
        className="form-select flex items-center gap-2 text-left"
      >
        {selected && <VoiceBadge engine={selected.engine_label} />}
        <span className="truncate flex-1" style={{ color: 'var(--text-primary)' }}>{label}</span>
        {selected && (
          <span className="shrink-0 text-[10px] truncate" style={{ color: 'var(--text-muted)' }}>
            {describe(selected)}
          </span>
        )}
      </button>

      {open && rect && createPortal(
        <div
          data-voicepicker-panel
          className="fixed z-[9999] rounded-xl overflow-hidden animate-fade-in"
          style={{
            top: rect.top, left: rect.left, width: rect.width,
            background: 'var(--bg-card)',
            border: '1px solid var(--border-strong)',
            boxShadow: 'var(--shadow-elevated)',
          }}
          onKeyDown={onKeyDown}
        >
          <div className="p-2" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            <input
              ref={searchRef}
              value={query}
              onChange={e => { setQuery(e.target.value); setScrollTop(0); setActiveIdx(-1) }}
              placeholder="Search voices…"
              aria-label="Search voices"
              className="form-input w-full text-xs"
            />
          </div>

          <div
            ref={listRef}
            role="listbox"
            aria-label="Voices"
            aria-activedescendant={activeIdx >= 0 ? `voice-row-${activeIdx}` : undefined}
            tabIndex={-1}
            onScroll={e => setScrollTop((e.target as HTMLDivElement).scrollTop)}
            style={{ maxHeight: PANEL_MAX_H, overflowY: 'auto', position: 'relative' }}
          >
            {rows.length === 0 && (
              <p className="text-[11px] text-center py-6" style={{ color: 'var(--text-muted)' }}>
                No voices match “{query}”.
              </p>
            )}

            {/* Spacer gives the scrollbar the full list height while only the
                visible slice is actually in the DOM. */}
            <div style={{ height: totalH, position: 'relative' }}>
              {rows.slice(firstVisible, lastVisible + 1).map((row, k) => {
                const i = firstVisible + k
                const top = offsets[i]
                if (row.kind === 'header') {
                  return (
                    <div
                      key={`h-${i}`}
                      className="absolute left-0 right-0 flex items-center px-3 text-[9px] font-bold uppercase tracking-wider"
                      style={{
                        top, height: HEADER_H,
                        background: 'var(--bg-elevated)',
                        color: 'var(--text-muted)',
                        borderBottom: '1px solid var(--border-subtle)',
                      }}
                    >
                      {row.label} <span className="ml-1 opacity-60">({row.count})</span>
                    </div>
                  )
                }
                const v = row.voice
                const isSel = v.id === value
                const isActive = i === activeIdx
                return (
                  <div
                    key={v.id}
                    id={`voice-row-${i}`}
                    role="option"
                    aria-selected={isSel}
                    onMouseEnter={() => setActiveIdx(i)}
                    onClick={() => { onChange(v.id); closePanel() }}
                    className="absolute left-0 right-0 flex items-center gap-2 px-3 cursor-pointer transition-colors duration-100"
                    style={{
                      top, height: ROW_H,
                      background: isActive ? 'var(--accent-subtle)' : 'transparent',
                      borderLeft: `2px solid ${isSel ? 'var(--accent-primary)' : 'transparent'}`,
                    }}
                  >
                    <VoiceBadge engine={v.engine_label} />
                    <span className="truncate text-[12px] font-semibold flex-1"
                          style={{ color: isSel ? 'var(--accent-primary)' : 'var(--text-primary)' }}>
                      {v.name}
                    </span>
                    <span className="shrink-0 text-[10px] truncate max-w-[45%]"
                          style={{ color: 'var(--text-muted)' }}>
                      {describe(v)}
                    </span>
                    {v.engine_label === 'Local' && !v.downloaded && (
                      <span title="Downloads on first use"
                            className="shrink-0 text-[9px] px-1 rounded"
                            style={{ color: 'var(--text-muted)', border: '1px solid var(--border-subtle)' }}>
                        ↓
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          <div className="px-3 py-1.5 text-[9px] flex justify-between"
               style={{ borderTop: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
            <span>{matches.length} of {voices.length} voices</span>
            <span>↑↓ navigate · ↵ select · esc close</span>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
