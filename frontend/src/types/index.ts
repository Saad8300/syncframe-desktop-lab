// types/index.ts – shared TypeScript types for Audio Image Sync Studio

export type AspectRatio      = '9:16' | '16:9' | '1:1'
export type ExportResolution = '720p' | '1080p' | '2K' | '4K'
export type FitMode          = 'cover' | 'contain'
export type Transition       = 
  | 'none'
  | 'fade'
  | 'crossfade'
  | 'fade_black'
  | 'fade_white'
  | 'slide_left'
  | 'slide_right'
  | 'slide_up'
  | 'slide_down'
  | 'push_left'
  | 'push_right'
  | 'zoom_in'
  | 'zoom_out'
  | 'blur_crossfade'
  | 'flash'
export type ZoomEffect       = 'none' | 'slow_zoom_in'
export type RenderProfile    = 'fast_preview' | 'balanced' | 'high_quality'

// ── Batch 9A — new motion / style types ─────────────────────────────────────

export type StylePreset =
  | 'clean_default'
  | 'youtube_documentary'
  | 'tiktok_reels'
  | 'cinematic_story'
  | 'news_report'
  | 'calm_educational'
  | 'dramatic_shorts'

export type MotionEffect =
  | 'none'
  | 'slow_zoom_in'
  | 'slow_zoom_out'
  | 'ken_burns'
  | 'pan_left'
  | 'pan_right'
  | 'pan_up'
  | 'pan_down'
  | 'subtle_random'
  | 'dynamic_shorts'

export type MotionIntensity = 'low' | 'medium' | 'high'
export type TransitionDuration = '0.2' | '0.5' | '0.8' | '1.0'

export type VisualEffect =
  | 'none'
  | 'cinematic'
  | 'warm'
  | 'high_contrast'
  | 'black_and_white'
  | 'clean_bright'

export type EffectStrength = 'low' | 'medium' | 'high'

// Removed Background visual style options based on correction.

// ─────────────────────────────────────────────────────────────────────────────

export interface GenerateSettings {
  // Core video
  aspectRatio:      AspectRatio
  exportResolution: ExportResolution
  fitMode:          FitMode
  transition:       Transition
  zoomEffect:       ZoomEffect       // kept for backward compat — maps to motionEffect on send
  renderProfile:    RenderProfile
  outputName:       string

  // Batch 9A — motion & style
  stylePreset:         StylePreset
  motionEffect:        MotionEffect
  motionIntensity:     MotionIntensity
  transitionDuration:  TransitionDuration
  visualEffect:        VisualEffect
  effectStrength:      EffectStrength

  // Batch 2 — background music
  enableBgMusic: boolean
  musicVolume:   number    // 0–100 (integer percentage)
  musicFade:     boolean

  // Batch 16A — Text Overlay
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

export interface TimelineRow {
  image:    string
  start:    string
  end:      string
  duration: string
  text:     string
  status:   'ok' | 'error' | 'missing'
}

export interface GenerateResponse {
  success:            boolean
  job_id?:            string
  elapsed_seconds?:   number
  output_video_url?:  string | null
  output_filename?:   string | null
  timeline_report:    TimelineRow[]
  warnings:           string[]
  errors:             string[]
  visual_duration?:   number
  audio_duration?:    number
}

export type GenerateStatus = 'idle' | 'uploading' | 'generating' | 'cancelling' | 'done' | 'error'

/** Shape returned by GET /api/jobs/{job_id}/status */
export interface JobStatus {
  job_id:                      string
  status:                      'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
  progress:                    number
  current_step:                string
  elapsed_seconds:             number
  estimated_remaining_seconds: number | null
  warnings:                    string[]
  errors:                      string[]
  output_video_url:            string | null
  output_filename:             string | null
  timeline_report:             TimelineRow[]
  visual_duration?:            number
  audio_duration?:             number
}

// ── Batch 10B + 10C — Video Timeline ─────────────────────────────────────────

export type ClipFillMode = 'loop' | 'trim_only' | 'freeze'

export interface VideoTimelineSettings {
  // Core
  aspectRatio:      AspectRatio
  exportResolution: ExportResolution
  fitMode:          FitMode
  fillMode:         ClipFillMode
  renderProfile:    RenderProfile
  outputName:       string

  // Batch 10C — styling
  transition:          Transition
  transitionDuration:  TransitionDuration
  visualEffect:        VisualEffect
  effectStrength:      EffectStrength

  // Batch 12A — Motion
  motionStyle:         MotionEffect
  motionIntensity:     MotionIntensity

  // Background Music
  backgroundMusicFile:   File | null
  backgroundMusicVolume: number
  backgroundMusicLoop:   boolean
  backgroundMusicFade:   boolean


  // Batch 10C — intro / outro
  enableIntro:  boolean
  enableOutro:  boolean

  // Batch 16C — Text Overlay
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

// ── Batch 11C — Media Timeline Text Styling ────────────────────────────────
export type TextPosition   = 'bottom_center' | 'lower_third' | 'center' | 'top_center' | 'bottom_left' | 'bottom_right'
export type TextSize       = 'small' | 'medium' | 'large' | 'extra_large'
export type TextColor      = 'white' | 'yellow' | 'black' | 'accent'
export type TextBackground = 'none' | 'soft_shadow' | 'dark_box' | 'light_box' | 'blur_box'
export type TextWidth      = 'narrow' | 'medium' | 'wide'
export type TextAlignment  = 'left' | 'center' | 'right'

// ── Batch 11B/11C — Media Timeline ───────────────────────────────────────────

export interface MediaTimelineSettings {
  aspectRatio:      AspectRatio
  exportResolution: ExportResolution
  fitMode:          FitMode
  fillMode:         ClipFillMode
  renderProfile:    RenderProfile
  outputName:       string
  
  // Batch 11C
  textPosition:   TextPosition
  textSize:       TextSize
  textColor:      TextColor
  textBackground: TextBackground
  textWidth:      TextWidth
  textAlignment:  TextAlignment
  
  // Batch 11D — styling & enhancements
  transition:            Transition
  transitionDuration:    TransitionDuration
  visualEffect:          VisualEffect
  effectStrength:        EffectStrength
  
  // Batch 12A — Motion
  motionStyle:           MotionEffect
  motionIntensity:       MotionIntensity
  
  // Background Music
  backgroundMusicFile:   File | null
  backgroundMusicVolume: number
  backgroundMusicLoop:   boolean
  backgroundMusicFade:   boolean
  enableIntro:           boolean
  enableOutro:           boolean

  // Batch 16C — Text Overlay
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

// ── Batch Queue ──────────────────────────────────────────────────────────────

export interface BatchJob {
  id: string
  created_at: string
  updated_at: string
  source_tool: string
  source_tool_label: string
  title: string
  output_name: string
  output_type: string
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
  progress: number
  message: string
  export_preset: string
  aspect_ratio: string
  resolution: string
  render_profile: string
  config?: any
  assets?: any
  metadata?: any
}

