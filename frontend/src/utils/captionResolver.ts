import { CaptionConfig, CaptionOverrides, CustomPreset } from '../types/caption';

export type ResolvedCaptionStyle = {
  fontFamily: string;
  fontWeight: string;
  fontScale: number;
  textTransform: string;
  letterSpacing: number;
  lineHeight: string;
  textAlign: string;
  position: string;
  verticalOffset: number;
  maxWidth: number;
  maxLines: number;
  maxWords: number;
  safeMargin: number;
  primaryColor: string;
  accentColor: string;
  accentMode: string;
  outlineStyle: string;
  outlineColor: string;
  shadowStyle: string;
  shadowColor: string;
  boxStyle: string;
  boxColor: string;
};

/**
 * Preset tables are generated from shared/caption_presets.json so the preview
 * and the Python renderer can never disagree. Re-export here to keep this
 * module's existing public surface unchanged for its importers.
 */
export { BUILT_IN_DEFINITIONS, FALLBACK_DEFAULTS, PRESET_META, PRESET_ORDER, PRESET_CATEGORIES, KARAOKE_PRESET_IDS } from './captionPresetsGenerated'
import { BUILT_IN_DEFINITIONS as GEN_DEFS, FALLBACK_DEFAULTS as GEN_FALLBACK } from './captionPresetsGenerated'




export function resolveCaptionStyle(
  presetId: string,
  overrides: CaptionOverrides,
  customPresets: CustomPreset[]
): ResolvedCaptionStyle {
  
  const custom = customPresets.find(p => p.id === presetId);
  const baseDef = custom 
    ? (GEN_DEFS[custom.basePreset] || GEN_FALLBACK) 
    : (GEN_DEFS[presetId] || GEN_FALLBACK);

  let result = { ...GEN_FALLBACK, ...baseDef } as ResolvedCaptionStyle;

  if (custom && custom.overrides) {
    if (custom.overrides.text) result = { ...result, ...custom.overrides.text };
    if (custom.overrides.layout) result = { ...result, ...custom.overrides.layout };
    if (custom.overrides.appearance) result = { ...result, ...custom.overrides.appearance };
    if (custom.overrides.effects) result = { ...result, ...custom.overrides.effects };
    if (custom.overrides.timing) result = { ...result, ...custom.overrides.timing };
  }

  if (overrides.text) {
    for (const [k, v] of Object.entries(overrides.text)) {
      if (v !== undefined) (result as any)[k] = v;
    }
  }
  if (overrides.layout) {
    for (const [k, v] of Object.entries(overrides.layout)) {
      if (v !== undefined) (result as any)[k] = v;
    }
  }
  if (overrides.appearance) {
    for (const [k, v] of Object.entries(overrides.appearance)) {
      if (v !== undefined) (result as any)[k] = v;
    }
  }
  if (overrides.effects) {
    for (const [k, v] of Object.entries(overrides.effects)) {
      if (v !== undefined) (result as any)[k] = v;
    }
  }
  if (overrides.timing) {
    for (const [k, v] of Object.entries(overrides.timing)) {
      if (v !== undefined) (result as any)[k] = v;
    }
  }

  return result;
}
