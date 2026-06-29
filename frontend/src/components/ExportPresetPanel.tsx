// frontend/src/components/ExportPresetPanel.tsx
// Premium export preset selector + saved custom presets

import React, { useState } from 'react'
import { BUILT_IN_PRESETS, detectActivePreset } from '../utils/presets'
import { useSavedPresets } from '../hooks/useSavedPresets'
import type { ExportPreset, PresetId } from '../utils/presets'
import type { SavedPreset } from '../hooks/useSavedPresets'
import type {
  AspectRatio,
  ExportResolution,
  RenderProfile,
  MotionEffect,
  Transition,
  VisualEffect,
} from '../types/index'

// What the parent exposes for the panel to read + write
export interface PresetApplyValues {
  aspectRatio:   AspectRatio
  resolution:    ExportResolution
  renderProfile: RenderProfile
  motionEffect:  MotionEffect
  transition:    Transition
  visualEffect:  VisualEffect
}

interface ExportPresetPanelProps {
  /** Current export-related values (to detect which preset is active) */
  current:       PresetApplyValues
  /** Called when a preset is selected; parent applies the values */
  onApply:       (values: PresetApplyValues) => void
  disabled?:     boolean
  /** Unique DOM id prefix to avoid collisions when used on multiple pages */
  idPrefix?:     string
}

// Small pill badge
function Badge({ children, accent }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <span
      className="text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide"
      style={{
        background: accent ? 'rgba(99,102,241,0.15)' : 'var(--bg-input)',
        color:      accent ? '#818cf8'               : 'var(--text-muted)',
        border:     accent ? '1px solid rgba(99,102,241,0.3)' : '1px solid var(--border-subtle)',
      }}
    >
      {children}
    </span>
  )
}

// Single built-in preset card
function PresetCard({
  preset,
  active,
  onClick,
  disabled,
}: {
  preset:   ExportPreset
  active:   boolean
  onClick:  () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={preset.summary}
      className="w-full text-left rounded-xl px-3 py-2.5 transition-all duration-150 flex items-center gap-2.5 group"
      style={{
        background: active ? 'rgba(99,102,241,0.12)' : 'var(--bg-elevated)',
        border:     active ? '1px solid rgba(99,102,241,0.4)' : '1px solid var(--border-subtle)',
        cursor:     disabled ? 'not-allowed' : 'pointer',
        opacity:    disabled ? 0.5 : 1,
      }}
      onMouseEnter={e => {
        if (!active && !disabled) {
          e.currentTarget.style.border = '1px solid rgba(99,102,241,0.25)'
          e.currentTarget.style.background = 'rgba(99,102,241,0.06)'
        }
      }}
      onMouseLeave={e => {
        if (!active && !disabled) {
          e.currentTarget.style.border = '1px solid var(--border-subtle)'
          e.currentTarget.style.background = 'var(--bg-elevated)'
        }
      }}
    >
      <span className="text-base leading-none shrink-0">{preset.icon}</span>
      <div className="flex-1 min-w-0">
        <p
          className="text-xs font-semibold truncate"
          style={{ color: active ? '#818cf8' : 'var(--text-primary)' }}
        >
          {preset.label}
        </p>
        <p className="text-[10px] mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>
          {preset.summary}
        </p>
      </div>
      {active && (
        <span
          className="w-4 h-4 rounded-full shrink-0 flex items-center justify-center text-[9px] font-bold"
          style={{ background: 'rgba(99,102,241,0.3)', color: '#818cf8' }}
        >
          ✓
        </span>
      )}
    </button>
  )
}

// Saved custom preset row
function SavedPresetRow({
  preset,
  onLoad,
  onDelete,
  disabled,
}: {
  preset:   SavedPreset
  onLoad:   () => void
  onDelete: () => void
  disabled?: boolean
}) {
  return (
    <div
      className="flex items-center gap-2 rounded-lg px-3 py-2 group"
      style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}
    >
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
          {preset.name}
        </p>
        <p className="text-[9px] mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>
          {preset.aspectRatio} · {preset.resolution} · {preset.renderProfile.replace('_', ' ')}
        </p>
      </div>
      <button
        type="button"
        onClick={onLoad}
        disabled={disabled}
        className="text-[10px] font-semibold px-2 py-1 rounded-md transition-colors"
        style={{
          background: 'rgba(99,102,241,0.10)',
          color: '#818cf8',
          border: '1px solid rgba(99,102,241,0.25)',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.20)' }}
        onMouseLeave={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.10)' }}
      >
        Load
      </button>
      <button
        type="button"
        onClick={onDelete}
        disabled={disabled}
        className="text-[10px] font-semibold px-1.5 py-1 rounded-md transition-colors"
        style={{
          background: 'transparent',
          color: 'var(--text-muted)',
          border: '1px solid var(--border-subtle)',
        }}
        onMouseEnter={e => { e.currentTarget.style.color = 'var(--color-error)'; e.currentTarget.style.borderColor = 'var(--color-error-border)' }}
        onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'var(--border-subtle)' }}
        title="Delete this saved preset"
      >
        ✕
      </button>
    </div>
  )
}

export default function ExportPresetPanel({
  current,
  onApply,
  disabled,
  idPrefix = 'ep',
}: ExportPresetPanelProps) {
  const activeBuiltInId: PresetId = detectActivePreset(
    current.aspectRatio,
    current.resolution,
    current.renderProfile,
  )

  const { savedPresets, savePreset, deletePreset } = useSavedPresets()

  const [showSaved,       setShowSaved]       = useState(false)
  const [newPresetName,   setNewPresetName]   = useState('')
  const [saveSuccess,     setSaveSuccess]     = useState(false)

  function handleSelectChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value
    if (val === 'custom') return
    
    const preset = BUILT_IN_PRESETS.find(p => p.id === val)
    if (preset) {
      onApply({
        aspectRatio:   preset.aspectRatio,
        resolution:    preset.resolution,
        renderProfile: preset.renderProfile,
        motionEffect:  preset.motionEffect,
        transition:    preset.transition,
        visualEffect:  preset.visualEffect,
      })
    }
  }

  function handleLoadSaved(p: SavedPreset) {
    onApply({
      aspectRatio:   p.aspectRatio,
      resolution:    p.resolution,
      renderProfile: p.renderProfile,
      motionEffect:  p.motionEffect,
      transition:    p.transition,
      visualEffect:  p.visualEffect,
    })
  }

  function handleSaveNew() {
    if (!newPresetName.trim()) return
    savePreset(newPresetName, {
      aspectRatio:   current.aspectRatio,
      resolution:    current.resolution,
      renderProfile: current.renderProfile,
      motionEffect:  current.motionEffect,
      transition:    current.transition,
      visualEffect:  current.visualEffect,
    })
    setNewPresetName('')
    setSaveSuccess(true)
    setTimeout(() => setSaveSuccess(false), 2000)
  }

  // Active preset summary line
  const activePreset = BUILT_IN_PRESETS.find(p => p.id === activeBuiltInId)
  const summaryLine = activePreset
    ? activePreset.summary
    : `${current.aspectRatio} · ${current.resolution} · ${current.renderProfile.replace('_', ' ')}`

  return (
    <div className="space-y-3">
      {/* Header & Dropdown */}
      <div>
        <label htmlFor={`${idPrefix}-select`} className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
          Export Preset
        </label>
        <select
          id={`${idPrefix}-select`}
          value={activeBuiltInId}
          onChange={handleSelectChange}
          disabled={disabled}
          className="form-select w-full mt-1.5"
          style={{ fontSize: '12px' }}
        >
          <option value="custom" disabled hidden>Custom Settings</option>
          {BUILT_IN_PRESETS.map(preset => (
            <option key={preset.id} value={preset.id}>
              {preset.icon} {preset.label}
            </option>
          ))}
        </select>
        <p className="text-[10px] mt-1.5" style={{ color: 'var(--text-muted)' }}>
          Quickly apply aspect ratio, resolution, and quality.
        </p>
      </div>

      {/* Active summary */}
      <div
        className="rounded-lg px-3 py-1.5 flex items-center gap-2"
        style={{ background: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}
      >
        <span className="text-[10px] font-mono font-semibold" style={{ color: 'var(--accent-primary)' }}>
          {summaryLine}
        </span>
      </div>

      {/* Divider for Custom Presets */}
      <div className="flex items-center gap-2 pt-1">
        <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
          Custom Presets
        </span>
        <div className="flex-1 h-px" style={{ background: 'var(--border-subtle)' }} />
        <button
          type="button"
          className="text-[10px] font-semibold transition-colors"
          style={{ color: 'var(--accent-primary)' }}
          onClick={() => setShowSaved(s => !s)}
        >
          {showSaved ? 'Hide' : `Show${savedPresets.length > 0 ? ` (${savedPresets.length})` : ''}`}
        </button>
      </div>

      {/* Save current settings as custom preset */}
      <div className="flex items-center gap-2">
        <input
          id={`${idPrefix}-new-preset-name`}
          type="text"
          value={newPresetName}
          onChange={e => setNewPresetName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSaveNew()}
          placeholder="Preset name…"
          maxLength={40}
          className="form-input flex-1 text-xs"
          disabled={disabled}
        />
        <button
          type="button"
          onClick={handleSaveNew}
          disabled={disabled || !newPresetName.trim()}
          className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors shrink-0"
          style={{
            background: newPresetName.trim() ? 'rgba(99,102,241,0.15)' : 'var(--bg-elevated)',
            color:      newPresetName.trim() ? '#818cf8'               : 'var(--text-muted)',
            border:     newPresetName.trim() ? '1px solid rgba(99,102,241,0.3)' : '1px solid var(--border-subtle)',
            cursor:     (disabled || !newPresetName.trim()) ? 'not-allowed' : 'pointer',
          }}
        >
          {saveSuccess ? '✓ Saved' : 'Save'}
        </button>
      </div>

      {/* Saved presets list */}
      {showSaved && (
        <div className="space-y-1.5 animate-fade-in">
          {savedPresets.length === 0 ? (
            <p className="text-[11px] text-center py-3" style={{ color: 'var(--text-muted)' }}>
              No saved presets yet.
            </p>
          ) : (
            savedPresets.map(p => (
              <SavedPresetRow
                key={p.id}
                preset={p}
                onLoad={() => handleLoadSaved(p)}
                onDelete={() => deletePreset(p.id)}
                disabled={disabled}
              />
            ))
          )}
        </div>
      )}
    </div>
  )
}
