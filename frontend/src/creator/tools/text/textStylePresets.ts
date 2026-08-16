/**
 * textStylePresets — curated text style families for the creator text editor.
 *
 * Extracted from CreatorAssetPicker's monolithic TextPicker (spec 07_MEDIA_TOOLCHAIN).
 * Each preset maps a curated font/weight combination to one of the editorial
 * categories used by the creator canvas text layer.
 *
 * Font availability:
 *   - Inter set (loaded via @expo-google-fonts/inter — see app root)
 *   - Anton, Bebas Neue, Caveat, Dancing Script, Lobster, Pacifico,
 *     Playfair Display, Press Start 2P (loaded via @expo-google-fonts/*)
 *   - System fonts (San Francisco, Georgia, Courier) are available on iOS
 *     without explicit loading; on Android they fall back to the platform
 *     default, so the curated set below prefers the loaded Google fonts.
 */
import { Typography, Type } from '../../../theme/designTokens';

// ── Categories ────────────────────────────────────────────────────────
export type TextStyleCategory =
  | 'neutral-sans'
  | 'condensed-display'
  | 'elegant-serif'
  | 'geometric'
  | 'handwritten'
  | 'rounded-bubble'
  | 'high-impact';

// ── Preset definition ─────────────────────────────────────────────────
export interface TextStylePreset {
  id: string;
  name: string;
  fontFamily: string;
  fontWeight: string;
  /** Sample text shown in the font chooser rail when the user hasn't typed yet. */
  sample: string;
  category: TextStyleCategory;
  /**
   * Optional line-height multiplier. When omitted the rail uses a sensible
   * default derived from the font size.
   */
  lineHeightMultiplier?: number;
}

// ── Curated preset families ───────────────────────────────────────────
// 10 presets across the 7 categories. Font families reference the loaded
// @expo-google-fonts packages (see package.json) and the Inter set from
// design tokens. The `fontWeight` string is kept for documentation and for
// any platform that resolves weight via the family name fallback.
export const TEXT_STYLE_PRESETS: TextStylePreset[] = [
  {
    id: 'clean',
    name: 'Clean',
    fontFamily: Typography.family.medium,
    fontWeight: '500',
    sample: 'Aa',
    category: 'neutral-sans',
    lineHeightMultiplier: 1.3,
  },
  {
    id: 'headline',
    name: 'Headline',
    fontFamily: Typography.family.bold,
    fontWeight: '700',
    sample: 'Aa',
    category: 'high-impact',
    lineHeightMultiplier: 1.15,
  },
  {
    id: 'editorial',
    name: 'Editorial',
    fontFamily: 'PlayfairDisplay_700Bold',
    fontWeight: '700',
    sample: 'Aa',
    category: 'elegant-serif',
    lineHeightMultiplier: 1.2,
  },
  {
    id: 'compact',
    name: 'Compact',
    fontFamily: Typography.family.medium,
    fontWeight: '500',
    sample: 'Aa',
    category: 'neutral-sans',
    lineHeightMultiplier: 1.3,
  },
  {
    id: 'handwritten',
    name: 'Handwritten',
    fontFamily: 'Caveat_400Regular',
    fontWeight: '400',
    sample: 'Aa',
    category: 'handwritten',
    lineHeightMultiplier: 1.35,
  },
  {
    id: 'signature',
    name: 'Signature',
    fontFamily: 'DancingScript_600SemiBold',
    fontWeight: '600',
    sample: 'Aa',
    category: 'handwritten',
    lineHeightMultiplier: 1.4,
  },
  {
    id: 'bubble',
    name: 'Bubble',
    fontFamily: 'Pacifico_400Regular',
    fontWeight: '400',
    sample: 'Aa',
    category: 'rounded-bubble',
    lineHeightMultiplier: 1.2,
  },
  {
    id: 'deco',
    name: 'Deco',
    fontFamily: 'Lobster_400Regular',
    fontWeight: '400',
    sample: 'Aa',
    category: 'geometric',
    lineHeightMultiplier: 1.3,
  },
  {
    id: 'poster',
    name: 'Poster',
    fontFamily: 'Anton_400Regular',
    fontWeight: '400',
    sample: 'Aa',
    category: 'condensed-display',
    lineHeightMultiplier: 1.1,
  },
  {
    id: 'squeeze',
    name: 'Squeeze',
    fontFamily: 'BebasNeue_400Regular',
    fontWeight: '400',
    sample: 'Aa',
    category: 'condensed-display',
    lineHeightMultiplier: 1.1,
  },
];

// ── TextStyleConfig ───────────────────────────────────────────────────
/**
 * The full text style configuration produced by the text editor. Mirrors the
 * fields of the `text` layer payload in composition.ts so the caller can
 * spread it directly into a CreatorLayer.
 */
export interface TextStyleConfig {
  text: string;
  textStyle: string;
  textColor: string;
  backgroundColor?: string;
  alignment: 'left' | 'center' | 'right';
  opacity: number;
  textEffect: 'none' | 'shadow' | 'neon' | 'outline' | 'glow';
  textAnimation: 'none' | 'typewriter' | 'bounce' | 'fade' | 'slide';
}

/**
 * Default style config used when the editor is opened without an initial
 * style. Matches the defaults in composition.ts TextLayerPayloadSchema.
 */
export const DEFAULT_TEXT_STYLE: TextStyleConfig = {
  text: '',
  textStyle: 'clean',
  textColor: '#ffffff',
  alignment: 'center',
  opacity: 1,
  textEffect: 'none',
  textAnimation: 'none',
};

// ── Preset lookup helpers ─────────────────────────────────────────────
const PRESET_BY_ID: Record<string, TextStylePreset> = TEXT_STYLE_PRESETS.reduce(
  (acc, p) => {
    acc[p.id] = p;
    return acc;
  },
  {} as Record<string, TextStylePreset>,
);

export function getPresetById(id: string): TextStylePreset | undefined {
  return PRESET_BY_ID[id];
}

/**
 * Resolve a preview text style (fontFamily / fontSize / lineHeight) for a
 * given preset id and base size. Used by FontChooserRail and the live
 * preview in TextEditorSheet.
 */
export function resolvePreviewStyle(
  presetId: string,
  baseSize: number = Type.bodyEmphasis.size,
): { fontFamily: string; fontSize: number; lineHeight: number } {
  const preset = PRESET_BY_ID[presetId] ?? PRESET_BY_ID.clean;
  const multiplier = preset?.lineHeightMultiplier ?? 1.25;
  return {
    fontFamily: preset?.fontFamily ?? Typography.family.medium,
    fontSize: baseSize,
    lineHeight: Math.round(baseSize * multiplier),
  };
}
