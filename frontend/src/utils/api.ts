// utils/api.ts – API client for Audio Image Sync Studio backend

import type { 
  GenerateSettings, 
  GenerateResponse, 
  GenerateStatus, 
  JobStatus, 
  VideoTimelineSettings, 
  MediaTimelineSettings, 
  BatchJob 
} from '../types'

export function resolveApiBaseUrl(): string {
  if (typeof window !== 'undefined') {
    if (window.location.protocol === 'file:') {
      return 'http://127.0.0.1:8000';
    } else if ((window as any).electron) {
      return 'http://127.0.0.1:8000';
    }
  }
  return '';
}

export const API_BASE_URL = resolveApiBaseUrl();

if ((import.meta as any).env?.DEV) {
  console.log('[API] Resolved API_BASE_URL:', API_BASE_URL || 'relative proxy', '| protocol:', typeof window !== 'undefined' ? window.location.protocol : 'none');
}

export function resolveBackendUrl(pathOrUrl: string): string {
  if (!pathOrUrl) return '';
  if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://') || pathOrUrl.startsWith('blob:')) return pathOrUrl;
  return apiUrl(pathOrUrl);
}

export function apiUrl(path: string): string {
  if (path.startsWith('/')) {
    return `${API_BASE_URL}${path}`;
  }
  return `${API_BASE_URL}/${path}`;
}

function parseErrorResponse(status: number, text: string): string {
  try {
    const data = JSON.parse(text)
    if (data.detail) {
      if (typeof data.detail === 'string') return data.detail
      if (Array.isArray(data.detail)) {
        const msgs = data.detail.map((err: any) => {
          if (err.type === "missing" && err.loc) {
            const field = err.loc[err.loc.length - 1]
            if (field === "audio_zip") return "Please upload an Audio Parts ZIP."
            if (field === "audio_file") return "Please upload a main audio file."
            return `Missing required field: ${field}`
          }
          const loc = err.loc ? err.loc.join('.') : 'Field'
          return `${loc}: ${err.msg}`
        })
        return msgs.join(' | ')
      }
    }
  } catch (e) {
    // ignore
  }
  if (status === 413) return "Payload too large. Please upload smaller files."
  if (status >= 500) return "Internal server error. Please check backend logs."
  return `Server error ${status}: ${text}`
}


export async function checkHealth(): Promise<boolean> {
  const url = apiUrl('/api/health')
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
    if ((import.meta as any).env?.DEV) {
      console.log(`[API] Health check to ${url}: ${res.ok ? 'OK' : 'FAILED'}`)
    }
    return res.ok
  } catch (err) {
    if ((import.meta as any).env?.DEV) {
      console.log(`[API] Health check to ${url} ERROR:`, err)
    }
    return false
  }
}

// ---------------------------------------------------------------------------
// Job-based API (preferred)
// ---------------------------------------------------------------------------

/**
 * Start a background generation job.
 * Returns immediately with a job_id; poll getJobStatus() for updates.
 */

function appendTextOverlaySettings(form: FormData, settings: any) {
  form.append('text_overlay_enabled', settings.textOverlayEnabled ? 'true' : 'false')
  form.append('text_overlay_mode', settings.textOverlayMode || 'whole_video')
  form.append('text_overlay_items', JSON.stringify(settings.textOverlayItems || []))
  form.append('text_overlay_text', settings.textOverlayText || '')
  form.append('text_overlay_font_family', settings.textOverlayFontFamily || 'Inter')
  form.append('text_overlay_font_size_percent', String(settings.textOverlayFontSizePercent || 5))
  form.append('text_overlay_font_weight', settings.textOverlayFontWeight || 'Bold')
  form.append('text_overlay_color', settings.textOverlayColor || '#FFFFFF')
  form.append('text_overlay_opacity', String(settings.textOverlayOpacity || 100))
  form.append('text_overlay_x_percent', String(settings.textOverlayXPercent || 50))
  form.append('text_overlay_y_percent', String(settings.textOverlayYPercent || 90))
  form.append('text_overlay_align', settings.textOverlayAlign || 'center')
  form.append('text_overlay_max_width_percent', String(settings.textOverlayMaxWidthPercent || 80))
  form.append('text_overlay_shadow_enabled', settings.textOverlayShadowEnabled ? 'true' : 'false')
  form.append('text_overlay_stroke_enabled', settings.textOverlayStrokeEnabled ? 'true' : 'false')
  form.append('text_overlay_stroke_color', settings.textOverlayStrokeColor || '#000000')
  form.append('text_overlay_background_enabled', settings.textOverlayBackgroundEnabled ? 'true' : 'false')
  form.append('text_overlay_background_color', settings.textOverlayBackgroundColor || '#000000')
  form.append('text_overlay_background_opacity', String(settings.textOverlayBackgroundOpacity || 50))
}

export async function startJob(
  audioInputMode: 'single' | 'zip',
  audioFile:    File | null,
  audioZip:     File | null,
  imagesZip:    File,
  timestampCsv: File,
  settings:     GenerateSettings,
  introFile?:   File | null,
  outroFile?:   File | null,
  bgMusicFile?: File | null,
): Promise<{ job_id: string }> {
  const form = new FormData()

  // Required
  form.append('audio_input_mode', audioInputMode)
  if (audioInputMode === 'single' && audioFile) {
    form.append('audio_file', audioFile)
  } else if (audioInputMode === 'zip' && audioZip) {
    form.append('audio_zip', audioZip)
  }
  
  form.append('images_zip',     imagesZip)
  form.append('timestamp_csv',  timestampCsv)

  // Core video settings
  form.append('aspect_ratio',      settings.aspectRatio)
  form.append('export_resolution', settings.exportResolution)
  form.append('fit_mode',          settings.fitMode)
  form.append('transition',        settings.transition)
  form.append('transition_duration', settings.transitionDuration)
  form.append('render_profile',    settings.renderProfile)
  form.append('output_name',       settings.outputName || 'video')

  // Batch 9A — motion & style
  form.append('motion_effect',    settings.motionEffect)
  form.append('motion_intensity', settings.motionIntensity)
  form.append('visual_effect',    settings.visualEffect)
  form.append('effect_strength',  settings.effectStrength)
  form.append('style_preset',     settings.stylePreset)


  // Background music (Batch 2)
  const musicActive = !!bgMusicFile
  form.append('enable_bg_music', musicActive ? 'true' : 'false')
  form.append('music_volume',    (settings.musicVolume / 100).toFixed(4))
  form.append('music_fade',      settings.musicFade ? 'true' : 'false')

  appendTextOverlaySettings(form, settings)

  // Optional file uploads
  if (introFile)   form.append('intro_file',    introFile)
  if (outroFile)   form.append('outro_file',    outroFile)
  if (bgMusicFile) form.append('bg_music_file', bgMusicFile)

  const res = await fetch(apiUrl('/api/jobs/start'), {
    method: 'POST',
    body: form,
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(parseErrorResponse(res.status, text))
  }

  return res.json() as Promise<{ job_id: string }>
}

/**
 * Save an Image Timeline configuration to the Batch Queue instead of running immediately.
 */
export async function createImageTimelineBatchJob(
  audioInputMode: 'single' | 'zip',
  audioFile:    File | null,
  audioZip:     File | null,
  imagesZip:    File,
  timestampCsv: File,
  settings:     GenerateSettings,
  introFile?:   File | null,
  outroFile?:   File | null,
  bgMusicFile?: File | null,
): Promise<{ job: BatchJob }> {
  const form = new FormData()

  // Required
  form.append('audio_input_mode', audioInputMode)
  if (audioInputMode === 'single' && audioFile) {
    form.append('audio_file', audioFile)
  } else if (audioInputMode === 'zip' && audioZip) {
    form.append('audio_zip', audioZip)
  }
  
  form.append('images_zip',     imagesZip)
  form.append('timestamp_csv',  timestampCsv)

  // Core video settings
  form.append('aspect_ratio',      settings.aspectRatio)
  form.append('export_resolution', settings.exportResolution)
  form.append('fit_mode',          settings.fitMode)
  form.append('transition',        settings.transition)
  form.append('transition_duration', settings.transitionDuration)
  form.append('render_profile',    settings.renderProfile)
  form.append('output_name',       settings.outputName || 'video')

  // Batch 9A — motion & style
  form.append('motion_effect',    settings.motionEffect)
  form.append('motion_intensity', settings.motionIntensity)
  form.append('visual_effect',    settings.visualEffect)
  form.append('effect_strength',  settings.effectStrength)
  form.append('style_preset',     settings.stylePreset)


  // Background music
  const musicActive = !!bgMusicFile
  form.append('enable_bg_music', musicActive ? 'true' : 'false')
  form.append('music_volume',    (settings.musicVolume / 100).toFixed(4))
  form.append('music_fade',      settings.musicFade ? 'true' : 'false')

  // Optional file uploads
  if (introFile)   form.append('intro_file',    introFile)
  if (outroFile)   form.append('outro_file',    outroFile)
  if (bgMusicFile) form.append('bg_music_file', bgMusicFile)

  appendTextOverlaySettings(form, settings)

  const res = await fetch(apiUrl('/api/batch/jobs/image-timeline'), {
    method: 'POST',
    body: form,
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(parseErrorResponse(res.status, text))
  }

  return res.json() as Promise<{ job: BatchJob }>
}

/**
 * Save a Video Timeline configuration to the Batch Queue instead of running immediately.
 */
export async function createVideoTimelineBatchJob(
  audioInputMode: 'single' | 'zip',
  audioFile:   File | null,
  audioZip:    File | null,
  videosZip:   File,
  timelineCsv: File,
  settings:    VideoTimelineSettings & { cjid?: string | null },
  introFile?:  File | null,
  outroFile?:  File | null,
): Promise<{ job: BatchJob }> {
  const form = new FormData()

  // Required uploads
  form.append('audio_input_mode', audioInputMode)
  if (audioInputMode === 'single' && audioFile) {
    form.append('audio_file', audioFile)
  } else if (audioInputMode === 'zip' && audioZip) {
    form.append('audio_zip', audioZip)
  }

  form.append('videos_zip',   videosZip)
  form.append('timeline_csv', timelineCsv)

  // Optional uploads
  if (introFile) form.append('intro_file', introFile)
  if (outroFile) form.append('outro_file', outroFile)

  // Core settings
  form.append('aspect_ratio',      settings.aspectRatio)
  form.append('export_resolution', settings.exportResolution)
  if (settings.cjid) form.append('cjid', settings.cjid)
  form.append('fit_mode',          settings.fitMode)
  form.append('fill_mode',         settings.fillMode)
  form.append('render_profile',    settings.renderProfile)
  form.append('output_name',       settings.outputName || 'video_timeline')

  // Styling
  form.append('transition',          settings.transition)
  form.append('transition_duration', settings.transitionDuration)
  form.append('visual_effect',       settings.visualEffect)
  form.append('effect_strength',     settings.effectStrength)

  // Motion
  form.append('motion_style',         settings.motionStyle)
  form.append('motion_intensity',     settings.motionIntensity)

  // Background Music
  if (settings.backgroundMusicFile) {
    form.append('background_music_file', settings.backgroundMusicFile)
  }
  form.append('background_music_volume', String(settings.backgroundMusicVolume))
  form.append('background_music_loop',   String(settings.backgroundMusicLoop))
  form.append('background_music_fade',   String(settings.backgroundMusicFade))

  appendTextOverlaySettings(form, settings)

  const res = await fetch(apiUrl('/api/batch/jobs/video-timeline'), {
    method: 'POST',
    body: form,
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(parseErrorResponse(res.status, text))
  }

  return res.json() as Promise<{ job: BatchJob }>
}

/**
 * Save a Media Timeline configuration to the Batch Queue instead of running immediately.
 */
export async function createMediaTimelineBatchJob(
  audioInputMode: 'single' | 'zip',
  audioFile:   File | null,
  audioZip:    File | null,
  mediaZip:    File,
  timelineCsv: File,
  settings:    {
    aspectRatio:      string
    exportResolution: string
    fitMode:          string
    fillMode:         string
    renderProfile:    string
    outputName:       string
    textPosition:     string
    textSize:         string
    textColor:        string
    textBackground:   string
    textWidth:        string
    textAlignment:    string
    transition:       string
    transitionDuration: string
    visualEffect:     string
    effectStrength:   string
    enableIntro:           boolean
    enableOutro:           boolean
    motionStyle:           string
    motionIntensity:       string
    backgroundMusicFile:   File | null
    backgroundMusicVolume: number
    backgroundMusicLoop:   boolean
    backgroundMusicFade:   boolean
  },
  introFile?:  File | null,
  outroFile?:  File | null,
): Promise<{ job: BatchJob }> {
  const form = new FormData()

  form.append('audio_input_mode', audioInputMode)
  if (audioInputMode === 'single' && audioFile) {
    form.append('audio_file', audioFile)
  } else if (audioInputMode === 'zip' && audioZip) {
    form.append('audio_zip', audioZip)
  }
  
  form.append('media_zip',    mediaZip)
  form.append('timeline_csv', timelineCsv)

  form.append('aspect_ratio',      settings.aspectRatio)
  form.append('export_resolution', settings.exportResolution)
  form.append('fit_mode',          settings.fitMode)
  form.append('fill_mode',         settings.fillMode)
  form.append('render_profile',    settings.renderProfile)
  form.append('output_name',       settings.outputName || 'media_timeline')

  form.append('text_position',   settings.textPosition)
  form.append('text_size',       settings.textSize)
  form.append('text_color',      settings.textColor)
  form.append('text_background', settings.textBackground)
  form.append('text_width',      settings.textWidth)
  form.append('text_alignment',  settings.textAlignment)

  form.append('transition',          settings.transition)
  form.append('transition_duration', settings.transitionDuration)
  form.append('visual_effect',       settings.visualEffect)
  form.append('effect_strength',     settings.effectStrength)

  form.append('motion_style',         settings.motionStyle)
  form.append('motion_intensity',     settings.motionIntensity)

  if (settings.backgroundMusicFile) {
    form.append('background_music_file', settings.backgroundMusicFile)
  }
  form.append('background_music_volume', String(settings.backgroundMusicVolume))
  form.append('background_music_loop',   String(settings.backgroundMusicLoop))
  form.append('background_music_fade',   String(settings.backgroundMusicFade))

  if (introFile) form.append('intro_file', introFile)
  if (outroFile) form.append('outro_file', outroFile)

  appendTextOverlaySettings(form, settings)

  const res = await fetch(apiUrl('/api/batch/jobs/media-timeline'), {
    method: 'POST',
    body: form,
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(parseErrorResponse(res.status, text))
  }

  return res.json() as Promise<{ job: BatchJob }>
}

/** Poll a job's current status. */
export async function getJobStatus(jobId: string): Promise<JobStatus> {
  if (!jobId) throw new Error("Invalid Job ID")
  const res = await fetch(apiUrl(`/api/jobs/${jobId}/status`), {
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(parseErrorResponse(res.status, text))
  }
  return res.json() as Promise<JobStatus>
}

/** Request cancellation of a running job. */
export async function cancelJob(jobId: string): Promise<void> {
  if (!jobId) throw new Error("Invalid Job ID")
  const res = await fetch(apiUrl(`/api/jobs/${jobId}/cancel`), {
    method: 'POST',
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(parseErrorResponse(res.status, text))
  }
}

// ---------------------------------------------------------------------------
// Video Timeline job API (Batch 10B)
// ---------------------------------------------------------------------------

/**
 * Start a Video Timeline background job (Batch 10B + 10C).
 * Returns immediately with a job_id; poll getJobStatus() for updates.
 */
export async function startVideoTimelineJob(
  audioInputMode: 'single' | 'zip',
  audioFile:   File | null,
  audioZip:    File | null,
  videosZip:   File,
  timelineCsv: File,
  settings:    VideoTimelineSettings,
  introFile?:  File | null,
  outroFile?:  File | null,
): Promise<{ job_id: string }> {
  const form = new FormData()

  // Required uploads
  form.append('audio_input_mode', audioInputMode)
  if (audioInputMode === 'single' && audioFile) {
    form.append('audio_file', audioFile)
  } else if (audioInputMode === 'zip' && audioZip) {
    form.append('audio_zip', audioZip)
  }

  form.append('videos_zip',   videosZip)
  form.append('timeline_csv', timelineCsv)

  // Optional uploads
  if (introFile) form.append('intro_file', introFile)
  if (outroFile) form.append('outro_file', outroFile)

  // Core settings
  form.append('aspect_ratio',      settings.aspectRatio)
  form.append('export_resolution', settings.exportResolution)
  form.append('fit_mode',          settings.fitMode)
  form.append('fill_mode',         settings.fillMode)
  form.append('render_profile',    settings.renderProfile)
  form.append('output_name',       settings.outputName || 'video_timeline')

  // Batch 10C — styling
  form.append('transition',          settings.transition)
  form.append('transition_duration', settings.transitionDuration)
  form.append('visual_effect',       settings.visualEffect)
  form.append('effect_strength',     settings.effectStrength)

  // Batch 12A — Motion
  form.append('motion_style',         settings.motionStyle)
  form.append('motion_intensity',     settings.motionIntensity)

  // Background Music
  if (settings.backgroundMusicFile) {
    form.append('background_music_file', settings.backgroundMusicFile)
  }
  form.append('background_music_volume', String(settings.backgroundMusicVolume))
  form.append('background_music_loop',   String(settings.backgroundMusicLoop))
  form.append('background_music_fade',   String(settings.backgroundMusicFade))

  appendTextOverlaySettings(form, settings)

  const res = await fetch(apiUrl('/api/jobs/start-video-timeline'), {
    method: 'POST',
    body: form,
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(parseErrorResponse(res.status, text))
  }

  return res.json() as Promise<{ job_id: string }>
}


// ---------------------------------------------------------------------------
// Legacy synchronous API (kept for backward compat — not used by main UI)
// ---------------------------------------------------------------------------

export async function generateVideo(
  audioFile:    File,
  imagesZip:    File,
  timestampCsv: File,
  settings:     GenerateSettings,
): Promise<GenerateResponse> {
  const form = new FormData()
  form.append('audio_file',    audioFile)
  form.append('images_zip',    imagesZip)
  form.append('timestamp_csv', timestampCsv)
  form.append('video_format',  settings.aspectRatio)
  form.append('fit_mode',      settings.fitMode)
  form.append('transition',    settings.transition)
  form.append('zoom_effect',   settings.zoomEffect)
  form.append('output_name',   settings.outputName || 'video')

  const res = await fetch(apiUrl('/api/generate'), {
    method: 'POST',
    body: form,
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(parseErrorResponse(res.status, text))
  }

  return res.json() as Promise<GenerateResponse>
}

// ---------------------------------------------------------------------------
// Media Timeline job API (Batch 11B)
// ---------------------------------------------------------------------------

/**
 * Start a Media Timeline background job (Batch 11B).
 * Returns immediately with a job_id; poll getJobStatus() for updates.
 */
export async function startMediaTimelineJob(
  audioInputMode: 'single' | 'zip',
  audioFile:   File | null,
  audioZip:    File | null,
  mediaZip:    File,
  timelineCsv: File,
  settings:    {
    aspectRatio:      string
    exportResolution: string
    fitMode:          string
    fillMode:         string
    renderProfile:    string
    outputName:       string
    textPosition:     string
    textSize:         string
    textColor:        string
    textBackground:   string
    textWidth:        string
    textAlignment:    string
    transition:       string
    transitionDuration: string
    visualEffect:     string
    effectStrength:   string
    enableIntro:           boolean
    enableOutro:           boolean
    motionStyle:           string
    motionIntensity:       string
    backgroundMusicFile:   File | null
    backgroundMusicVolume: number
    backgroundMusicLoop:   boolean
    backgroundMusicFade:   boolean
    cjid?:                 string | null
  },
  introFile?:  File | null,
  outroFile?:  File | null,
): Promise<{ job_id: string }> {
  const form = new FormData()

  form.append('audio_input_mode', audioInputMode)
  if (audioInputMode === 'single' && audioFile) {
    form.append('audio_file', audioFile)
  } else if (audioInputMode === 'zip' && audioZip) {
    form.append('audio_zip', audioZip)
  }
  
  form.append('media_zip',    mediaZip)
  form.append('timeline_csv', timelineCsv)

  form.append('aspect_ratio',      settings.aspectRatio)
  form.append('export_resolution', settings.exportResolution)
  form.append('fit_mode',          settings.fitMode)
  form.append('fill_mode',         settings.fillMode)
  form.append('render_profile',    settings.renderProfile)
  form.append('output_name',       settings.outputName || 'media_timeline')
  if (settings.cjid) form.append('cjid', settings.cjid)

  form.append('text_position',   settings.textPosition)
  form.append('text_size',       settings.textSize)
  form.append('text_color',      settings.textColor)
  form.append('text_background', settings.textBackground)
  form.append('text_width',      settings.textWidth)
  form.append('text_alignment',  settings.textAlignment)

  // Batch 11D — styling & enhancements
  form.append('transition',          settings.transition)
  form.append('transition_duration', settings.transitionDuration)
  form.append('visual_effect',       settings.visualEffect)
  form.append('effect_strength',     settings.effectStrength)

  // Batch 12A — Motion
  form.append('motion_style',         settings.motionStyle)
  form.append('motion_intensity',     settings.motionIntensity)

  // Background Music
  if (settings.backgroundMusicFile) {
    form.append('background_music_file', settings.backgroundMusicFile)
  }
  form.append('background_music_volume', String(settings.backgroundMusicVolume))
  form.append('background_music_loop',   String(settings.backgroundMusicLoop))
  form.append('background_music_fade',   String(settings.backgroundMusicFade))

  if (introFile) form.append('intro_file', introFile)
  if (outroFile) form.append('outro_file', outroFile)

  appendTextOverlaySettings(form, settings)

  const res = await fetch(apiUrl('/api/jobs/start-media-timeline'), {
    method: 'POST',
    body: form,
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(parseErrorResponse(res.status, text))
  }

  return res.json() as Promise<{ job_id: string }>
}

// ---------------------------------------------------------------------------
// History API (Batch 14B)
// ---------------------------------------------------------------------------

export async function getHistory(): Promise<any[]> {
  const res = await fetch(apiUrl('/api/history'))
  if (!res.ok) throw new Error("Failed to load history")
  const data = await res.json()
  return data.records || []
}

export async function getHistoryStats(): Promise<any> {
  const res = await fetch(apiUrl('/api/history/stats'))
  if (!res.ok) throw new Error("Failed to load history stats")
  return res.json()
}

export async function deleteHistoryItem(id: string): Promise<void> {
  const res = await fetch(apiUrl(`/api/history/${id}`), { method: 'DELETE' })
  if (!res.ok) throw new Error("Failed to delete history item")
}

export async function clearHistory(): Promise<void> {
  const res = await fetch(apiUrl('/api/history'), { method: 'DELETE' })
  if (!res.ok) throw new Error("Failed to clear history")
}

// ---------------------------------------------------------------------------
// Batch Video Generator API (Batch 15A)
// ---------------------------------------------------------------------------

export async function getBatchJobs(): Promise<any[]> {
  const res = await fetch(apiUrl('/api/batch/jobs'))
  if (!res.ok) throw new Error("Failed to load batch jobs")
  const data = await res.json()
  return data.jobs || []
}

export async function getBatchStats(): Promise<any> {
  const res = await fetch(apiUrl('/api/batch/stats'))
  if (!res.ok) throw new Error("Failed to load batch stats")
  const data = await res.json()
  return data.stats || {}
}

export async function createBatchJob(payload: any): Promise<any> {
  const res = await fetch(apiUrl('/api/batch/jobs'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  if (!res.ok) throw new Error("Failed to create batch job")
  return res.json()
}

export async function getBatchJob(id: string): Promise<any> {
  const res = await fetch(apiUrl(`/api/batch/jobs/${id}`))
  if (!res.ok) throw new Error("Failed to get batch job")
  return res.json()
}

export async function updateBatchJob(id: string, payload: any): Promise<any> {
  const res = await fetch(apiUrl(`/api/batch/jobs/${id}`), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  if (!res.ok) throw new Error("Failed to update batch job")
  return res.json()
}

export async function deleteBatchJob(id: string): Promise<void> {
  const res = await fetch(apiUrl(`/api/batch/jobs/${id}`), { method: 'DELETE' })
  if (!res.ok) throw new Error("Failed to delete batch job")
}

export async function clearCompletedBatchJobs(): Promise<void> {
  const res = await fetch(apiUrl('/api/batch/jobs/completed'), { method: 'DELETE' })
  if (!res.ok) throw new Error("Failed to clear completed jobs")
}

export async function clearFailedBatchJobs(): Promise<void> {
  const res = await fetch(apiUrl('/api/batch/jobs/failed'), { method: 'DELETE' })
  if (!res.ok) throw new Error("Failed to clear failed jobs")
}

export async function clearCancelledBatchJobs(): Promise<void> {
  const res = await fetch(apiUrl('/api/batch/jobs/cancelled'), { method: 'DELETE' })
  if (!res.ok) throw new Error("Failed to clear cancelled jobs")
}

export async function clearAllBatchJobs(): Promise<void> {
  const res = await fetch(apiUrl('/api/batch/jobs'), { method: 'DELETE' })
  if (!res.ok) throw new Error("Failed to clear all jobs")
}

export async function moveBatchJobUp(id: string): Promise<void> {
  const res = await fetch(apiUrl(`/api/batch/jobs/${id}/move-up`), { method: 'POST' })
  if (!res.ok) throw new Error("Failed to move job up")
}

export async function moveBatchJobDown(id: string): Promise<void> {
  const res = await fetch(apiUrl(`/api/batch/jobs/${id}/move-down`), { method: 'POST' })
  if (!res.ok) throw new Error("Failed to move job down")
}

export async function duplicateBatchJob(id: string): Promise<any> {
  const res = await fetch(apiUrl(`/api/batch/jobs/${id}/duplicate`), { method: 'POST' })
  if (!res.ok) throw new Error("Failed to duplicate job")
  return res.json()
}

// ---------------------------------------------------------------------------
// Batch Queue Runner API (Batch 15C)
// ---------------------------------------------------------------------------

export interface BatchState {
  is_running: boolean
  current_job_id: string | null
  paused_after_current: boolean
  stopping: boolean
  message: string
}

export async function getBatchState(): Promise<BatchState> {
  const res = await fetch(apiUrl('/api/batch/state'))
  if (!res.ok) throw new Error("Failed to get batch state")
  return res.json()
}

export async function startBatchQueue(): Promise<any> {
  const res = await fetch(apiUrl('/api/batch/start'), { method: 'POST' })
  if (!res.ok) throw new Error("Failed to start batch queue")
  return res.json()
}

export async function pauseBatchAfterCurrent(): Promise<any> {
  const res = await fetch(apiUrl('/api/batch/pause-after-current'), { method: 'POST' })
  if (!res.ok) throw new Error("Failed to pause batch queue")
  return res.json()
}

export async function stopBatchQueue(): Promise<any> {
  const res = await fetch(apiUrl('/api/batch/stop'), { method: 'POST' })
  if (!res.ok) throw new Error("Failed to stop batch queue")
  return res.json()
}

export async function retryFailedBatchJobs(): Promise<any> {
  const res = await fetch(apiUrl('/api/batch/retry-failed'), { method: 'POST' })
  if (!res.ok) throw new Error("Failed to retry failed jobs")
  return res.json()
}

export async function retryBatchJob(jobId: string): Promise<any> {
  const res = await fetch(apiUrl(`/api/batch/jobs/${jobId}/retry`), { method: 'POST' })
  if (!res.ok) throw new Error("Failed to retry job")
  return res.json()
}

