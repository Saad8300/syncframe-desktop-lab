import fontsData from '../../public/fonts/fonts.json';

export interface FontManifestItem {
  id: string;
  displayName: string;
  cssFamily: string;
  assFamily: string;
  category: string;
  weights: { weight: number; file: string }[];
}

export interface FontManifest {
  fonts: FontManifestItem[];
}

export const FONTS_MANIFEST: FontManifest = fontsData as FontManifest;

export const FONT_CATEGORIES = Array.from(new Set(FONTS_MANIFEST.fonts.map(f => f.category)));
