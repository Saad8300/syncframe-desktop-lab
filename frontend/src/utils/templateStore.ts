export type ToolKey = 'image' | 'video' | 'media' | 'audio_merger' | 'script_timestamp' | 'batch_video';

export interface StudioTemplate {
  id: string;
  name: string;
  tool: ToolKey;
  description: string;
  isBuiltIn: boolean;
  type?: 'built-in' | 'saved';
  category?: string;
  tags?: string[];
  favorite?: boolean;
  createdAt?: number;
  updatedAt?: number;
  settings: Record<string, any>;
}

export const BUILT_IN_TEMPLATES: StudioTemplate[] = [
  // --- Video Templates ---
  {
    id: 'builtin_tiktok_image',
    name: 'TikTok Shorts Image Timeline',
    tool: 'image',
    description: 'Vertical 9:16 short-form video using images, audio, and timestamp CSV.',
    isBuiltIn: true,
    type: 'built-in',
    category: 'TikTok / Shorts',
    tags: ['vertical', 'social'],
    settings: {
      aspectRatio: '9:16',
      exportResolution: '1080p',
      renderProfile: 'balanced',
      outputName: 'tiktok_short'
    }
  },
  {
    id: 'builtin_youtube_shorts_4k',
    name: 'YouTube Shorts 4K',
    tool: 'image',
    description: 'High-quality vertical 4K image timeline export for shorts.',
    isBuiltIn: true,
    type: 'built-in',
    category: 'TikTok / Shorts',
    tags: ['4k', 'vertical', 'youtube'],
    settings: {
      aspectRatio: '9:16',
      exportResolution: '4K',
      renderProfile: 'high_quality',
      outputName: 'youtube_short_4k'
    }
  },
  {
    id: 'builtin_youtube_video_landscape',
    name: 'YouTube Landscape Video Timeline',
    tool: 'video',
    description: 'Landscape 16:9 video timeline for YouTube-style videos.',
    isBuiltIn: true,
    type: 'built-in',
    category: 'YouTube',
    tags: ['landscape', '1080p'],
    settings: {
      aspectRatio: '16:9',
      exportResolution: '1080p',
      renderProfile: 'balanced',
      outputName: 'youtube_video'
    }
  },
  {
    id: 'builtin_mixed_media_reel',
    name: 'Mixed Media Reel',
    tool: 'media',
    description: 'Use images, videos, and text rows in one vertical timeline CSV.',
    isBuiltIn: true,
    type: 'built-in',
    category: 'TikTok / Shorts',
    tags: ['mixed', 'vertical'],
    settings: {
      aspectRatio: '9:16',
      exportResolution: '1080p',
      renderProfile: 'balanced',
      outputName: 'media_reel'
    }
  },
  {
    id: 'builtin_fast_test_render',
    name: 'Fast Test Render',
    tool: 'image',
    description: 'Low-resolution fast test render to quickly check timing and sync.',
    isBuiltIn: true,
    type: 'built-in',
    category: 'Video',
    tags: ['test', 'fast', 'draft'],
    settings: {
      aspectRatio: '9:16',
      exportResolution: '720p',
      renderProfile: 'fast_preview',
      outputName: 'test_render'
    }
  },
  {
    id: 'builtin_text_overlay_watermark',
    name: 'YouTube Channel Watermark',
    tool: 'video',
    description: 'A clean, subtle watermark for your videos.',
    isBuiltIn: true,
    type: 'built-in',
    category: 'Text Overlay',
    tags: ['watermark', 'branding', 'youtube'],
    settings: {
      textOverlayEnabled: true,
      textOverlayMode: 'whole_video',
      textOverlayText: 'YOUR CHANNEL',
      textOverlayFontFamily: 'Inter',
      textOverlayFontSizePercent: 3,
      textOverlayFontWeight: 'Bold',
      textOverlayColor: '#FFFFFF',
      textOverlayOpacity: 70,
      textOverlayXPercent: 95,
      textOverlayYPercent: 5,
      textOverlayAlign: 'right',
      textOverlayMaxWidthPercent: 30,
      textOverlayShadowEnabled: true,
      textOverlayStrokeEnabled: false,
      textOverlayBackgroundEnabled: false,
    }
  },
  {
    id: 'builtin_text_overlay_shorts_caption',
    name: 'Shorts Bold Caption',
    tool: 'video',
    description: 'Dynamic CSV-driven captions with bold styling and stroke.',
    isBuiltIn: true,
    type: 'built-in',
    category: 'Text Overlay',
    tags: ['shorts', 'captions', 'csv'],
    settings: {
      textOverlayEnabled: true,
      textOverlayMode: 'csv_text',
      textOverlayFontFamily: 'Inter',
      textOverlayFontSizePercent: 8,
      textOverlayFontWeight: 'Black',
      textOverlayColor: '#FFFFFF',
      textOverlayOpacity: 100,
      textOverlayXPercent: 50,
      textOverlayYPercent: 75,
      textOverlayAlign: 'center',
      textOverlayMaxWidthPercent: 90,
      textOverlayShadowEnabled: false,
      textOverlayStrokeEnabled: true,
      textOverlayStrokeColor: '#000000',
      textOverlayBackgroundEnabled: false,
    }
  },
  {
    id: 'builtin_text_overlay_cinematic',
    name: 'Cinematic Quote Overlay',
    tool: 'video',
    description: 'Elegant centered quote overlay using Georgia font.',
    isBuiltIn: true,
    type: 'built-in',
    category: 'Text Overlay',
    tags: ['cinematic', 'quote', 'elegant'],
    settings: {
      textOverlayEnabled: true,
      textOverlayMode: 'whole_video',
      textOverlayText: 'A beautiful journey.',
      textOverlayFontFamily: 'Georgia',
      textOverlayFontSizePercent: 6,
      textOverlayFontWeight: 'Normal',
      textOverlayColor: '#FFFFFF',
      textOverlayOpacity: 90,
      textOverlayXPercent: 50,
      textOverlayYPercent: 50,
      textOverlayAlign: 'center',
      textOverlayMaxWidthPercent: 80,
      textOverlayShadowEnabled: true,
      textOverlayStrokeEnabled: false,
      textOverlayBackgroundEnabled: false,
    }
  },
  {
    id: 'builtin_text_overlay_lower_third',
    name: 'Lower Third Title',
    tool: 'video',
    description: 'Professional lower third overlay with a solid background box.',
    isBuiltIn: true,
    type: 'built-in',
    category: 'Text Overlay',
    tags: ['lower third', 'title', 'professional'],
    settings: {
      textOverlayEnabled: true,
      textOverlayMode: 'whole_video',
      textOverlayText: 'YOUR NAME / TITLE',
      textOverlayFontFamily: 'Inter',
      textOverlayFontSizePercent: 5,
      textOverlayFontWeight: 'Medium',
      textOverlayColor: '#FFFFFF',
      textOverlayOpacity: 100,
      textOverlayXPercent: 10,
      textOverlayYPercent: 85,
      textOverlayAlign: 'left',
      textOverlayMaxWidthPercent: 50,
      textOverlayShadowEnabled: false,
      textOverlayStrokeEnabled: false,
      textOverlayBackgroundEnabled: true,
      textOverlayBackgroundColor: '#000000',
      textOverlayBackgroundOpacity: 70,
    }
  },

  // --- Audio Templates ---
  {
    id: 'builtin_podcast_audio',
    name: 'Podcast Audio Merge',
    tool: 'audio_merger',
    description: 'Merge multiple spoken audio parts into one clean MP3 file.',
    isBuiltIn: true,
    type: 'built-in',
    category: 'Audio',
    tags: ['podcast', 'mp3', 'voice'],
    settings: {
      outputFormat: 'mp3',
      outputName: 'podcast_audio'
    }
  },
  {
    id: 'builtin_voiceover_merge',
    name: 'Voiceover Parts Merge',
    tool: 'audio_merger',
    description: 'Combine multiple voiceover segments into one final audio track.',
    isBuiltIn: true,
    type: 'built-in',
    category: 'Audio',
    tags: ['voiceover', 'mp3'],
    settings: {
      outputFormat: 'mp3',
      outputName: 'final_voiceover'
    }
  },
  {
    id: 'builtin_wav_master',
    name: 'WAV Master Audio',
    tool: 'audio_merger',
    description: 'Create a WAV master file for editing or high-quality export.',
    isBuiltIn: true,
    type: 'built-in',
    category: 'Audio',
    tags: ['master', 'wav', 'hq'],
    settings: {
      outputFormat: 'wav',
      outputName: 'master_audio'
    }
  },

  // --- Script Templates ---
  {
    id: 'builtin_csv_timestamps',
    name: 'Image Timeline CSV Timestamps',
    tool: 'script_timestamp',
    description: 'Generate readable timestamp text and Image Timeline-ready CSV.',
    isBuiltIn: true,
    type: 'built-in',
    category: 'Script',
    tags: ['csv', 'timeline'],
    settings: {
      outputMode: 'csv_image_timeline',
      outputName: 'image_timeline_timestamps'
    }
  },
  {
    id: 'builtin_youtube_srt',
    name: 'YouTube Captions SRT',
    tool: 'script_timestamp',
    description: 'Generate SRT caption output for videos.',
    isBuiltIn: true,
    type: 'built-in',
    category: 'Script',
    tags: ['srt', 'captions', 'youtube'],
    settings: {
      outputMode: 'srt',
      outputName: 'captions'
    }
  },
  {
    id: 'builtin_txt_timestamps',
    name: 'Readable TXT Timestamps',
    tool: 'script_timestamp',
    description: 'Generate clean bracketed timestamp text for review and editing.',
    isBuiltIn: true,
    type: 'built-in',
    category: 'Script',
    tags: ['txt', 'readable'],
    settings: {
      outputMode: 'txt',
      outputName: 'timestamps'
    }
  }
];

const TEMPLATES_KEY = 'syncframe_templates_v1';
const PENDING_TEMPLATE_KEY = 'syncframe_pending_template_v1';

export function getSavedTemplates(): StudioTemplate[] {
  try {
    const data = localStorage.getItem(TEMPLATES_KEY);
    if (!data) return [];
    const parsed: any[] = JSON.parse(data);
    if (!Array.isArray(parsed)) return [];

    return parsed.map(t => {
      // Safely migrate older templates to the new structure
      return {
        ...t,
        type: t.type || 'saved',
        category: t.category || 'Custom',
        tags: Array.isArray(t.tags) ? t.tags : [],
        favorite: !!t.favorite,
        settings: typeof t.settings === 'object' && t.settings !== null ? t.settings : {}
      } as StudioTemplate;
    });
  } catch (err) {
    console.error('Failed to load saved templates', err);
    return [];
  }
}

export function saveTemplate(template: Omit<StudioTemplate, 'id' | 'createdAt' | 'isBuiltIn' | 'type' | 'updatedAt'>): StudioTemplate {
  const newTemplate: StudioTemplate = {
    ...template,
    id: 'tpl_' + crypto.randomUUID(),
    type: 'saved',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    isBuiltIn: false
  };

  const templates = getSavedTemplates();
  templates.push(newTemplate);
  localStorage.setItem(TEMPLATES_KEY, JSON.stringify(templates));
  return newTemplate;
}

export function updateTemplate(id: string, updates: Partial<Omit<StudioTemplate, 'id' | 'createdAt' | 'isBuiltIn' | 'type'>>): StudioTemplate | null {
  const templates = getSavedTemplates();
  const index = templates.findIndex(t => t.id === id);
  if (index === -1) return null;

  const updated: StudioTemplate = {
    ...templates[index],
    ...updates,
    updatedAt: Date.now()
  };
  
  templates[index] = updated;
  localStorage.setItem(TEMPLATES_KEY, JSON.stringify(templates));
  return updated;
}

export function duplicateTemplate(id: string): StudioTemplate | null {
  // Can duplicate both built-in and saved templates, but the copy is always "saved"
  const allTemplates = [...BUILT_IN_TEMPLATES, ...getSavedTemplates()];
  const source = allTemplates.find(t => t.id === id);
  if (!source) return null;

  return saveTemplate({
    name: `${source.name} (Copy)`,
    tool: source.tool,
    description: source.description,
    category: source.category,
    tags: source.tags ? [...source.tags] : [],
    favorite: false,
    settings: JSON.parse(JSON.stringify(source.settings))
  });
}

export function toggleFavorite(id: string, isBuiltIn: boolean): void {
  if (isBuiltIn) {
    // We could store favorites for built-in in a separate list if we wanted to
    // For now, only saved templates support favoriting properly.
    console.warn("Favoriting built-in templates is not fully persisted yet.");
    return;
  }
  const templates = getSavedTemplates();
  const template = templates.find(t => t.id === id);
  if (template) {
    template.favorite = !template.favorite;
    template.updatedAt = Date.now();
    localStorage.setItem(TEMPLATES_KEY, JSON.stringify(templates));
  }
}

export function deleteTemplate(id: string) {
  let templates = getSavedTemplates();
  templates = templates.filter(t => t.id !== id);
  localStorage.setItem(TEMPLATES_KEY, JSON.stringify(templates));
}

export function setPendingTemplate(template: StudioTemplate) {
  // Store just the tool and the settings to be picked up
  localStorage.setItem(PENDING_TEMPLATE_KEY, JSON.stringify({
    tool: template.tool,
    settings: template.settings,
    templateId: template.id
  }));
}

export function consumePendingTemplate(tool: ToolKey): Record<string, any> | null {
  try {
    const data = localStorage.getItem(PENDING_TEMPLATE_KEY);
    if (!data) return null;
    const parsed = JSON.parse(data);
    if (parsed.tool === tool) {
      localStorage.removeItem(PENDING_TEMPLATE_KEY);
      return parsed.settings || null;
    }
    return null; // Not meant for this tool
  } catch (err) {
    console.error('Failed to consume pending template', err);
    return null;
  }
}
