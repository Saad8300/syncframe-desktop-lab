// frontend/src/hooks/useSavedPresets.ts
// localStorage-backed saved custom presets

import { useState, useCallback } from 'react'
import type { AspectRatio, ExportResolution, RenderProfile, MotionEffect, Transition, VisualEffect } from '../types/index'

const STORAGE_KEY = 'syncframe_saved_presets'

export interface SavedPreset {
  id:            string   // UUID-like: timestamp + name
  name:          string
  savedAt:       number   // Date.now()
  aspectRatio:   AspectRatio
  resolution:    ExportResolution
  renderProfile: RenderProfile
  motionEffect:  MotionEffect
  transition:    Transition
  visualEffect:  VisualEffect
}

function loadFromStorage(): SavedPreset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed as SavedPreset[]
  } catch {
    return []
  }
}

function saveToStorage(presets: SavedPreset[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(presets))
  } catch { /* quota exceeded or private browsing */ }
}

export function useSavedPresets() {
  const [savedPresets, setSavedPresets] = useState<SavedPreset[]>(loadFromStorage)

  const savePreset = useCallback((
    name: string,
    values: Omit<SavedPreset, 'id' | 'name' | 'savedAt'>,
  ) => {
    const trimmed = name.trim()
    if (!trimmed) return
    const id = `${Date.now()}_${trimmed.replace(/\s+/g, '_').toLowerCase()}`
    const newPreset: SavedPreset = { id, name: trimmed, savedAt: Date.now(), ...values }
    setSavedPresets(prev => {
      const updated = [...prev.filter(p => p.name !== trimmed), newPreset]
      saveToStorage(updated)
      return updated
    })
  }, [])

  const deletePreset = useCallback((id: string) => {
    setSavedPresets(prev => {
      const updated = prev.filter(p => p.id !== id)
      saveToStorage(updated)
      return updated
    })
  }, [])

  return { savedPresets, savePreset, deletePreset }
}
