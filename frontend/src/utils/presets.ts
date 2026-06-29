// frontend/src/utils/presets.ts
// Built-in export presets for Image / Video / Media Timeline

import type {
  AspectRatio,
  ExportResolution,
  RenderProfile,
  MotionEffect,
  Transition,
  VisualEffect,
} from '../types/index'

export type PresetId =
  | 'tiktok_4k'
  | 'tiktok_1080p'
  | 'youtube_4k'
  | 'youtube_1080p'
  | 'instagram_reel'
  | 'square_post'
  | 'fast_test'
  | 'custom'

export interface ExportPreset {
  id:          PresetId
  label:       string
  icon:        string    // emoji icon
  summary:     string    // e.g. "9:16 · 4K · High"
  aspectRatio: AspectRatio
  resolution:  ExportResolution
  renderProfile: RenderProfile
  // These are applied if supported by the timeline type
  motionEffect:  MotionEffect
  transition:    Transition
  visualEffect:  VisualEffect
}

export const BUILT_IN_PRESETS: ExportPreset[] = [
  {
    id:          'tiktok_4k',
    label:       'TikTok / Shorts 4K',
    icon:        '📱',
    summary:     '9:16 · 4K · High Quality',
    aspectRatio: '9:16',
    resolution:  '4K',
    renderProfile: 'high_quality',
    motionEffect:  'none',
    transition:    'none',
    visualEffect:  'none',
  },
  {
    id:          'tiktok_1080p',
    label:       'TikTok / Shorts 1080p',
    icon:        '📱',
    summary:     '9:16 · 1080p · Balanced',
    aspectRatio: '9:16',
    resolution:  '1080p',
    renderProfile: 'balanced',
    motionEffect:  'none',
    transition:    'none',
    visualEffect:  'none',
  },
  {
    id:          'youtube_4k',
    label:       'YouTube Landscape 4K',
    icon:        '▶️',
    summary:     '16:9 · 4K · High Quality',
    aspectRatio: '16:9',
    resolution:  '4K',
    renderProfile: 'high_quality',
    motionEffect:  'none',
    transition:    'none',
    visualEffect:  'none',
  },
  {
    id:          'youtube_1080p',
    label:       'YouTube Landscape 1080p',
    icon:        '▶️',
    summary:     '16:9 · 1080p · Balanced',
    aspectRatio: '16:9',
    resolution:  '1080p',
    renderProfile: 'balanced',
    motionEffect:  'none',
    transition:    'none',
    visualEffect:  'none',
  },
  {
    id:          'instagram_reel',
    label:       'Instagram Reel',
    icon:        '📸',
    summary:     '9:16 · 1080p · Balanced',
    aspectRatio: '9:16',
    resolution:  '1080p',
    renderProfile: 'balanced',
    motionEffect:  'none',
    transition:    'none',
    visualEffect:  'none',
  },
  {
    id:          'square_post',
    label:       'Square Post',
    icon:        '⬜',
    summary:     '1:1 · 1080p · Balanced',
    aspectRatio: '1:1',
    resolution:  '1080p',
    renderProfile: 'balanced',
    motionEffect:  'none',
    transition:    'none',
    visualEffect:  'none',
  },
  {
    id:          'fast_test',
    label:       'Fast Test Render',
    icon:        '⚡',
    summary:     '9:16 · 720p · Fast Preview',
    aspectRatio: '9:16',
    resolution:  '720p',
    renderProfile: 'fast_preview',
    motionEffect:  'none',
    transition:    'none',
    visualEffect:  'none',
  },
]

export const CUSTOM_PRESET: ExportPreset = {
  id:          'custom',
  label:       'Custom',
  icon:        '✏️',
  summary:     'Custom settings',
  aspectRatio: '9:16',
  resolution:  '1080p',
  renderProfile: 'balanced',
  motionEffect:  'none',
  transition:    'none',
  visualEffect:  'none',
}

/** Check if the current settings match a built-in preset (for auto-selection). */
export function detectActivePreset(
  aspectRatio: AspectRatio,
  resolution: ExportResolution,
  renderProfile: RenderProfile,
): PresetId {
  const match = BUILT_IN_PRESETS.find(
    p =>
      p.aspectRatio === aspectRatio &&
      p.resolution  === resolution &&
      p.renderProfile === renderProfile,
  )
  return match?.id ?? 'custom'
}
