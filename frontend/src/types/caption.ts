export interface CaptionOverrides {
  text?: {
    fontFamily?: string;
    fontWeight?: string;
    fontScale?: number;
    textTransform?: 'original' | 'uppercase' | 'title_case' | 'lowercase';
    letterSpacing?: number;
    lineHeight?: 'tight' | 'normal' | 'relaxed';
    textAlign?: 'left' | 'center' | 'right';
  };
  layout?: {
    profile?: 'auto' | 'youtube' | 'shorts' | 'square' | 'custom';
    position?: 'top' | 'center' | 'lower_center' | 'bottom';
    verticalOffset?: number;
    maxWidth?: number;
    maxLines?: number;
    maxWords?: number;
    safeMargin?: number;
  };
  appearance?: {
    primaryColor?: string;
    accentColor?: string;
    accentMode?: 'none' | 'first_word' | 'last_word' | 'longest_word' | 'second_line' | 'alternate_phrase';
    outlineStyle?: 'none' | 'thin' | 'medium' | 'thick';
    outlineColor?: string;
    shadowStyle?: 'none' | 'soft' | 'medium' | 'strong';
    shadowColor?: string;
    boxStyle?: 'none' | 'subtle' | 'medium' | 'strong';
    boxColor?: string;
  };
  effects?: {
    entryAnimation?: 'none' | 'fade' | 'pop' | 'rise';
    exitAnimation?: 'none' | 'fade';
    emphasis?: 'none' | 'scale' | 'accent_pulse';
    /**
     * Word-by-word highlighting.
     *   none        – whole caption shown at once (the pre-rebuild behaviour)
     *   fill        – native ASS \kf colour sweep, one event per caption
     *   word_window – one event per word; allows scale pop, highlight pill and
     *                 dimming of inactive words
     */
    karaokeMode?: 'none' | 'fill' | 'word_window';
    activeColor?: string;
    /** 0–255 extra transparency on non-active words (255 = typewriter reveal) */
    inactiveAlpha?: number;
    /** percent; word_window only */
    activeScale?: number;
    /** ms for the scale to settle back to 100% */
    activePop?: number;
    activeOutlineColor?: string;
    /** highlight pill behind the active word; '' = none */
    activeBoxColor?: string;
  };
  timing?: {
    chunkingMode?: 'smart' | 'punctuation' | 'fixed';
    minDuration?: number | 'auto';
    maxDuration?: number | 'auto';
  };
}

export interface CustomPreset {
  id: string;
  name: string;
  category: string;
  createdAt: string;
  updatedAt: string;
  basePreset: string;
  isFavorite?: boolean; // The built-in preset ID this was based on
  overrides: CaptionOverrides;
  schemaVersion: number;
}

/** A single hand-authored caption cue (source: 'manual'). */
export interface ManualCaptionCue {
  id: string;
  start: number;
  end: number;
  text: string;
}

export interface CaptionConfig {
  source: 'none' | 'auto' | 'srt' | 'manual';
  presetId: string; // built-in or custom UUID
  overrides: CaptionOverrides;
  srtFile: File | null;
  /** Only used when source === 'manual'. */
  manualCues?: ManualCaptionCue[];
}

export const DEFAULT_CAPTION_CONFIG: CaptionConfig = {
  source: 'none',
  presetId: 'viral_bold',
  overrides: {},
  srtFile: null,
  manualCues: [],
};
