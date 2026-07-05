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

export const BUILT_IN_DEFINITIONS: Record<string, Partial<ResolvedCaptionStyle>> = {
  viral_bold: {
    fontFamily: "Roboto", fontWeight: "900", fontScale: 1.0, textTransform: "uppercase",
    letterSpacing: 0.02, lineHeight: "tight", textAlign: "center", position: "lower_center",
    verticalOffset: 0, maxWidth: 85, maxLines: 2, maxWords: 5, primaryColor: "#FFFFFF",
    accentColor: "#FFE600", accentMode: "second_line", outlineStyle: "thick",
    outlineColor: "#000000", shadowStyle: "medium", shadowColor: "#FFE600", boxStyle: "none",
  },
  impact_stack: {
    fontFamily: "Anton", fontWeight: "400", fontScale: 1.0, textTransform: "uppercase",
    letterSpacing: 0.04, lineHeight: "tight", textAlign: "center", position: "bottom",
    maxWidth: 90, maxLines: 3, maxWords: 4, primaryColor: "#FFFFFF", accentColor: "#A855F7",
    accentMode: "alternate_phrase", outlineStyle: "medium", outlineColor: "#A855F7",
    shadowStyle: "strong", shadowColor: "#000000", boxStyle: "none",
  },
  highlight_bar: {
    fontFamily: "Inter", fontWeight: "900", fontScale: 1.0, textTransform: "uppercase",
    lineHeight: "tight", textAlign: "center", position: "lower_center", maxWidth: 80,
    maxLines: 2, maxWords: 6, primaryColor: "#000000", accentColor: "#FF8A00",
    accentMode: "none", outlineStyle: "none", shadowStyle: "none", boxStyle: "medium",
    boxColor: "#FF8A00",
  },
  neon_pop: {
    fontFamily: "Montserrat", fontWeight: "800", fontScale: 1.0, textTransform: "uppercase",
    letterSpacing: 0.03, lineHeight: "tight", textAlign: "center", position: "bottom",
    maxWidth: 85, maxLines: 2, maxWords: 4, primaryColor: "#FFFFFF", accentColor: "#00E5FF",
    accentMode: "none", outlineStyle: "thin", outlineColor: "#000000", shadowStyle: "strong",
    shadowColor: "#00E5FF", boxStyle: "none",
  },
  minimal: {
    fontFamily: "Inter", fontWeight: "400", fontScale: 0.8, textTransform: "original",
    letterSpacing: 0.01, lineHeight: "relaxed", textAlign: "center", position: "bottom",
    maxWidth: 90, maxLines: 2, maxWords: 8, primaryColor: "#FFFFFF", accentColor: "#CCCCCC",
    accentMode: "none", outlineStyle: "none", shadowStyle: "soft", shadowColor: "#000000", boxStyle: "none",
  },
  hot_take: {
    fontFamily: "Bangers", fontWeight: "400", fontScale: 1.2, textTransform: "uppercase",
    letterSpacing: 0.02, lineHeight: "tight", textAlign: "center", position: "center",
    maxWidth: 95, maxLines: 2, maxWords: 3, primaryColor: "#3333FF", accentColor: "#FF6633",
    accentMode: "none", outlineStyle: "thick", outlineColor: "#FF6633", shadowStyle: "none", boxStyle: "none",
  },
  clean_subtitle: {
    fontFamily: "Roboto", fontWeight: "400", fontScale: 0.9, textTransform: "original",
    letterSpacing: 0, lineHeight: "normal", textAlign: "center", position: "bottom",
    maxWidth: 85, maxLines: 2, maxWords: 10, primaryColor: "#EAEAEA", accentColor: "#FFFFFF",
    accentMode: "none", outlineStyle: "thin", outlineColor: "#000000", shadowStyle: "soft", shadowColor: "#000000", boxStyle: "none",
  },
  documentary: {
    fontFamily: "Lora", fontWeight: "400", fontScale: 0.85, textTransform: "original",
    letterSpacing: 0.01, lineHeight: "relaxed", textAlign: "left", position: "bottom",
    maxWidth: 90, maxLines: 2, maxWords: 12, primaryColor: "#F5F5F5", accentColor: "#FFCC00",
    accentMode: "none", outlineStyle: "none", shadowStyle: "medium", shadowColor: "#000000", boxStyle: "none",
  },
  podcast_bold: {
    fontFamily: "Anton", fontWeight: "400", fontScale: 1.1, textTransform: "uppercase",
    letterSpacing: 0, lineHeight: "tight", textAlign: "center", position: "center",
    maxWidth: 80, maxLines: 3, maxWords: 3, primaryColor: "#FFFFFF", accentColor: "#00FF66",
    accentMode: "first_word", outlineStyle: "medium", outlineColor: "#000000", shadowStyle: "none", boxStyle: "none",
  },
  soft_box: {
    fontFamily: "Lato", fontWeight: "700", fontScale: 0.9, textTransform: "original",
    letterSpacing: 0, lineHeight: "normal", textAlign: "center", position: "lower_center",
    maxWidth: 85, maxLines: 2, maxWords: 8, primaryColor: "#FFFFFF", accentColor: "#FF3399",
    accentMode: "none", outlineStyle: "none", shadowStyle: "none", boxStyle: "subtle", boxColor: "#000000",
  },
  punch_yellow: {
    fontFamily: "Inter", fontWeight: "900", fontScale: 1.1, textTransform: "uppercase",
    letterSpacing: 0.05, lineHeight: "tight", textAlign: "center", position: "center",
    maxWidth: 80, maxLines: 2, maxWords: 4, primaryColor: "#FFE600", accentColor: "#FFFFFF",
    accentMode: "none", outlineStyle: "thick", outlineColor: "#000000", shadowStyle: "strong", shadowColor: "#000000", boxStyle: "none",
  },
  mono_tech: {
    fontFamily: "Roboto Condensed", fontWeight: "700", fontScale: 0.85, textTransform: "uppercase",
    letterSpacing: 0.1, lineHeight: "normal", textAlign: "left", position: "bottom",
    maxWidth: 90, maxLines: 3, maxWords: 6, primaryColor: "#00FF00", accentColor: "#FFFFFF",
    accentMode: "none", outlineStyle: "none", shadowStyle: "soft", shadowColor: "#00FF00", boxStyle: "subtle", boxColor: "#002200",
  },
  cinema_clean: {
    fontFamily: "Playfair Display", fontWeight: "400", fontScale: 0.75, textTransform: "original",
    letterSpacing: 0.1, lineHeight: "relaxed", textAlign: "center", position: "bottom",
    maxWidth: 90, maxLines: 2, maxWords: 8, primaryColor: "#FFFFFF", accentColor: "#E0E0E0",
    accentMode: "none", outlineStyle: "none", shadowStyle: "none", boxStyle: "none",
  },
  news_bar: {
    fontFamily: "Oswald", fontWeight: "700", fontScale: 0.9, textTransform: "uppercase",
    letterSpacing: 0, lineHeight: "normal", textAlign: "left", position: "bottom",
    maxWidth: 100, maxLines: 1, maxWords: 15, primaryColor: "#FFFFFF", accentColor: "#FF0000",
    accentMode: "none", outlineStyle: "none", shadowStyle: "soft", shadowColor: "#000000", boxStyle: "medium",
    boxColor: "#000000",
  },
  electric_blue: {
    fontFamily: "Inter", fontWeight: "900", fontScale: 1.0, textTransform: "uppercase",
    letterSpacing: 0.03, lineHeight: "tight", textAlign: "center", position: "center",
    maxWidth: 80, maxLines: 3, maxWords: 5, primaryColor: "#00FFFF", accentColor: "#FFFFFF",
    accentMode: "alternate_phrase", outlineStyle: "medium", outlineColor: "#0000FF", shadowStyle: "glow", shadowColor: "#00FFFF", boxStyle: "none",
  },
  red_alert: {
    fontFamily: "Anton", fontWeight: "400", fontScale: 1.25, textTransform: "uppercase",
    letterSpacing: 0.05, lineHeight: "tight", textAlign: "center", position: "center",
    maxWidth: 90, maxLines: 2, maxWords: 3, primaryColor: "#FF0000", accentColor: "#FFFFFF",
    accentMode: "first_word", outlineStyle: "thick", outlineColor: "#000000", shadowStyle: "strong", shadowColor: "#FF0000", boxStyle: "none",
  }
};

export const FALLBACK_DEFAULTS: ResolvedCaptionStyle = {
  fontFamily: "Roboto",
  fontWeight: "bold",
  fontScale: 1.0,
  textTransform: "original",
  letterSpacing: 0,
  lineHeight: "normal",
  textAlign: "center",
  position: "bottom",
  verticalOffset: 0,
  maxWidth: 85,
  maxLines: 2,
  maxWords: 5,
  safeMargin: 5,
  primaryColor: "#FFFFFF",
  accentColor: "#FF0000",
  accentMode: "none",
  outlineStyle: "medium",
  outlineColor: "#000000",
  shadowStyle: "none",
  shadowColor: "#000000",
  boxStyle: "none",
  boxColor: "#000000",
};

export function resolveCaptionStyle(
  presetId: string,
  overrides: CaptionOverrides,
  customPresets: CustomPreset[]
): ResolvedCaptionStyle {
  
  const custom = customPresets.find(p => p.id === presetId);
  const baseDef = custom 
    ? (BUILT_IN_DEFINITIONS[custom.basePreset] || FALLBACK_DEFAULTS) 
    : (BUILT_IN_DEFINITIONS[presetId] || FALLBACK_DEFAULTS);

  let result = { ...FALLBACK_DEFAULTS, ...baseDef } as ResolvedCaptionStyle;

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
