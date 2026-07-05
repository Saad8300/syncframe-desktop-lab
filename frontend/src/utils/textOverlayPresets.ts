
export interface TextOverlaySettings {
  textOverlayEnabled: boolean
  textOverlayMode?: 'whole_video' | 'timed_text' | 'csv_text'
  textOverlayItems?: Array<{ id: string; text: string; start: string; end: string; }>
  textOverlayText: string
  textOverlayFontFamily: string
  textOverlayFontSizePercent: number
  textOverlayFontWeight: string
  textOverlayColor: string
  textOverlayOpacity: number
  textOverlayXPercent: number
  textOverlayYPercent: number
  textOverlayAlign: 'left' | 'center' | 'right'
  textOverlayMaxWidthPercent: number
  textOverlayShadowEnabled: boolean
  textOverlayStrokeEnabled: boolean
  textOverlayStrokeColor: string
  textOverlayBackgroundEnabled: boolean
  textOverlayBackgroundColor: string
  textOverlayBackgroundOpacity: number
}

export interface TextOverlayPreset {
  id: string
  name: string
  type: 'built-in' | 'saved'
  createdAt: number
  updatedAt: number
  settings: TextOverlaySettings
}

const STORAGE_KEY = 'syncframe_text_overlay_presets'

export const BUILT_IN_PRESETS: TextOverlayPreset[] = [
  {
    id: 'builtin-channel-watermark',
    name: 'Channel Watermark',
    type: 'built-in',
    createdAt: 0,
    updatedAt: 0,
    settings: {
      textOverlayEnabled: true,
      textOverlayMode: 'whole_video',
      textOverlayItems: [],
      textOverlayText: 'Your Channel',
      textOverlayFontFamily: 'Inter',
      textOverlayFontSizePercent: 3,
      textOverlayFontWeight: 'Bold',
      textOverlayColor: '#FFFFFF',
      textOverlayOpacity: 70,
      textOverlayXPercent: 86,
      textOverlayYPercent: 8,
      textOverlayAlign: 'center',
      textOverlayMaxWidthPercent: 40,
      textOverlayShadowEnabled: true,
      textOverlayStrokeEnabled: false,
      textOverlayStrokeColor: '#000000',
      textOverlayBackgroundEnabled: false,
      textOverlayBackgroundColor: '#000000',
      textOverlayBackgroundOpacity: 50,
    }
  },
  {
    id: 'builtin-shorts-caption',
    name: 'Shorts Bold Caption',
    type: 'built-in',
    createdAt: 0,
    updatedAt: 0,
    settings: {
      textOverlayEnabled: true,
      textOverlayMode: 'whole_video',
      textOverlayItems: [],
      textOverlayText: 'Your caption here',
      textOverlayFontFamily: 'Anton',
      textOverlayFontSizePercent: 6,
      textOverlayFontWeight: 'Regular',
      textOverlayColor: '#FFFFFF',
      textOverlayOpacity: 100,
      textOverlayXPercent: 50,
      textOverlayYPercent: 82,
      textOverlayAlign: 'center',
      textOverlayMaxWidthPercent: 90,
      textOverlayShadowEnabled: true,
      textOverlayStrokeEnabled: true,
      textOverlayStrokeColor: '#000000',
      textOverlayBackgroundEnabled: false,
      textOverlayBackgroundColor: '#000000',
      textOverlayBackgroundOpacity: 50,
    }
  },
  {
    id: 'builtin-lower-third',
    name: 'Lower Third Title',
    type: 'built-in',
    createdAt: 0,
    updatedAt: 0,
    settings: {
      textOverlayEnabled: true,
      textOverlayMode: 'whole_video',
      textOverlayItems: [],
      textOverlayText: 'Lower third title',
      textOverlayFontFamily: 'Inter',
      textOverlayFontSizePercent: 4.5,
      textOverlayFontWeight: 'Bold',
      textOverlayColor: '#FFFFFF',
      textOverlayOpacity: 100,
      textOverlayXPercent: 50,
      textOverlayYPercent: 78,
      textOverlayAlign: 'center',
      textOverlayMaxWidthPercent: 85,
      textOverlayShadowEnabled: true,
      textOverlayStrokeEnabled: false,
      textOverlayStrokeColor: '#000000',
      textOverlayBackgroundEnabled: true,
      textOverlayBackgroundColor: '#000000',
      textOverlayBackgroundOpacity: 45,
    }
  },
  {
    id: 'builtin-cta-banner',
    name: 'CTA Banner',
    type: 'built-in',
    createdAt: 0,
    updatedAt: 0,
    settings: {
      textOverlayEnabled: true,
      textOverlayMode: 'whole_video',
      textOverlayItems: [],
      textOverlayText: 'Follow for more',
      textOverlayFontFamily: 'Inter',
      textOverlayFontSizePercent: 5,
      textOverlayFontWeight: 'Bold',
      textOverlayColor: '#FFFFFF',
      textOverlayOpacity: 100,
      textOverlayXPercent: 50,
      textOverlayYPercent: 90,
      textOverlayAlign: 'center',
      textOverlayMaxWidthPercent: 85,
      textOverlayShadowEnabled: false,
      textOverlayStrokeEnabled: false,
      textOverlayStrokeColor: '#000000',
      textOverlayBackgroundEnabled: true,
      textOverlayBackgroundColor: '#111827',
      textOverlayBackgroundOpacity: 70,
    }
  },
  {
    id: 'builtin-cinematic-quote',
    name: 'Cinematic Quote',
    type: 'built-in',
    createdAt: 0,
    updatedAt: 0,
    settings: {
      textOverlayEnabled: true,
      textOverlayMode: 'whole_video',
      textOverlayItems: [],
      textOverlayText: 'A cinematic quote',
      textOverlayFontFamily: 'Lora',
      textOverlayFontSizePercent: 5,
      textOverlayFontWeight: 'Medium',
      textOverlayColor: '#F8FAFC',
      textOverlayOpacity: 100,
      textOverlayXPercent: 50,
      textOverlayYPercent: 50,
      textOverlayAlign: 'center',
      textOverlayMaxWidthPercent: 80,
      textOverlayShadowEnabled: true,
      textOverlayStrokeEnabled: false,
      textOverlayStrokeColor: '#000000',
      textOverlayBackgroundEnabled: false,
      textOverlayBackgroundColor: '#000000',
      textOverlayBackgroundOpacity: 50,
    }
  },
  {
    id: 'builtin-minimal-top',
    name: 'Minimal Top Label',
    type: 'built-in',
    createdAt: 0,
    updatedAt: 0,
    settings: {
      textOverlayEnabled: true,
      textOverlayMode: 'whole_video',
      textOverlayItems: [],
      textOverlayText: 'Video Title',
      textOverlayFontFamily: 'Inter',
      textOverlayFontSizePercent: 3.5,
      textOverlayFontWeight: 'Medium',
      textOverlayColor: '#FFFFFF',
      textOverlayOpacity: 90,
      textOverlayXPercent: 50,
      textOverlayYPercent: 10,
      textOverlayAlign: 'center',
      textOverlayMaxWidthPercent: 80,
      textOverlayShadowEnabled: true,
      textOverlayStrokeEnabled: false,
      textOverlayStrokeColor: '#000000',
      textOverlayBackgroundEnabled: false,
      textOverlayBackgroundColor: '#000000',
      textOverlayBackgroundOpacity: 50,
    }
  }
]

export function loadSavedPresets(): TextOverlayPreset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      return parsed.filter(p => p.type === 'saved' && p.id && p.name && p.settings)
    }
  } catch (err) {
    console.error('Failed to load presets from local storage', err)
  }
  return []
}

export function savePreset(name: string, settings: TextOverlaySettings): TextOverlayPreset {
  const currentPresets = loadSavedPresets()
  const newPreset: TextOverlayPreset = {
    id: crypto.randomUUID(),
    name,
    type: 'saved',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    settings: { ...settings }
  }
  const updated = [...currentPresets, newPreset]
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
  return newPreset
}

export function updatePreset(id: string, name: string): TextOverlayPreset[] {
  const currentPresets = loadSavedPresets()
  const updated = currentPresets.map(p => {
    if (p.id === id) {
      return { ...p, name, updatedAt: Date.now() }
    }
    return p
  })
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
  return updated
}

export function renamePreset(id: string, newName: string): TextOverlayPreset[] {
  return updatePreset(id, newName);
}

export function deletePreset(id: string): TextOverlayPreset[] {
  const currentPresets = loadSavedPresets()
  const updated = currentPresets.filter(p => p.id !== id)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
  return updated
}

export function duplicatePreset(id: string): TextOverlayPreset | null {
  const allPresets = getAllPresets()
  const existing = allPresets.find(p => p.id === id)
  if (!existing) return null

  const newPreset: TextOverlayPreset = {
    id: crypto.randomUUID(),
    name: `${existing.name} (Copy)`,
    type: 'saved',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    settings: { ...existing.settings }
  }
  const currentSaved = loadSavedPresets()
  const updated = [...currentSaved, newPreset]
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
  return newPreset
}

export function getAllPresets(): TextOverlayPreset[] {
  return [...BUILT_IN_PRESETS, ...loadSavedPresets()]
}
