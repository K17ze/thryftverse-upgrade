/**
 * FontRegistry — curated font archetypes for the ThryftVerse creator editor.
 *
 * Per spec 06_TEXT_TYPOGRAPHY_EDITORIAL_SYSTEM §2:
 * "Launch with 8–12 excellent archetypes. Each needs reliable loading,
 *  glyph coverage and fallback. Avoid filling the list with novelty
 *  scripts simply to increase count."
 *
 * The fonts below are already loaded in the project via @expo-google-fonts
 * packages (see package.json) and the Inter set from design tokens.
 * Each archetype maps to a distinct visual role in the editorial system.
 *
 * Per spec §3: "Preview the user's real words." The FontChooserRail renders
 * the user's actual text in each font, not just the font name.
 */
import { FontFamily } from '../../../theme/designTokens';

// ── Categories ───────────────────────────────────────────────────────

export type FontCategory =
  | 'neutral-sans'
  | 'geometric-sans'
  | 'condensed-display'
  | 'editorial-serif'
  | 'high-contrast-serif'
  | 'rounded'
  | 'marker-hand'
  | 'signature'
  | 'poster'
  | 'mono-typewriter';

// ── Archetype definition ─────────────────────────────────────────────

export type FontArchetype = {
  /** Unique identifier (matches textStyle preset IDs for backward compat). */
  id: string;
  /** Human-readable display name. */
  name: string;
  /** The font family string to use in React Native styles. */
  family: string;
  /** The editorial category this font represents. */
  category: FontCategory;
  /** Available font weights (numeric). */
  weights: number[];
  /** Whether an italic variant is available. */
  italicAvailable: boolean;
  /** Sample text shown in the chooser rail when the user hasn't typed. */
  previewText: string;
  /** Optional line-height multiplier for this font. */
  lineHeightMultiplier?: number;
};

// ── Curated font archetypes ──────────────────────────────────────────
//
// 10 archetypes covering the full editorial range. All fonts are loaded
// via @expo-google-fonts packages (see app root) or the Inter set from
// design tokens. No novelty scripts — every font earns its place.

export const CURATED_FONTS: FontArchetype[] = [
  // 1. Neutral sans — the workhorse body text
  {
    id: 'clean',
    name: 'Clean',
    family: FontFamily.medium,
    category: 'neutral-sans',
    weights: [400, 500, 600, 700],
    italicAvailable: true,
    previewText: 'Aa',
    lineHeightMultiplier: 1.3,
  },
  // 2. Neutral sans (compact) — tighter, for captions and UI
  {
    id: 'compact',
    name: 'Compact',
    family: FontFamily.regular,
    category: 'neutral-sans',
    weights: [400, 500, 600],
    italicAvailable: true,
    previewText: 'Aa',
    lineHeightMultiplier: 1.25,
  },
  // 3. Geometric sans — bold, modern, for headlines
  {
    id: 'headline',
    name: 'Headline',
    family: FontFamily.bold,
    category: 'geometric-sans',
    weights: [600, 700, 800],
    italicAvailable: false,
    previewText: 'Aa',
    lineHeightMultiplier: 1.15,
  },
  // 4. Condensed display — tall, narrow, high-impact
  {
    id: 'squeeze',
    name: 'Squeeze',
    family: 'BebasNeue_400Regular',
    category: 'condensed-display',
    weights: [400],
    italicAvailable: false,
    previewText: 'Aa',
    lineHeightMultiplier: 1.1,
  },
  // 5. Poster — heavy condensed for poster titles
  {
    id: 'poster',
    name: 'Poster',
    family: 'Anton_400Regular',
    category: 'poster',
    weights: [400],
    italicAvailable: false,
    previewText: 'Aa',
    lineHeightMultiplier: 1.1,
  },
  // 6. Editorial serif — elegant, readable, for body and titles
  {
    id: 'editorial',
    name: 'Editorial',
    family: 'PlayfairDisplay_700Bold',
    category: 'editorial-serif',
    weights: [400, 700],
    italicAvailable: true,
    previewText: 'Aa',
    lineHeightMultiplier: 1.2,
  },
  // 7. High-contrast serif — dramatic, for display
  {
    id: 'deco',
    name: 'Deco',
    family: 'Lobster_400Regular',
    category: 'high-contrast-serif',
    weights: [400],
    italicAvailable: false,
    previewText: 'Aa',
    lineHeightMultiplier: 1.3,
  },
  // 8. Rounded — friendly, soft, for bubble/casual
  {
    id: 'bubble',
    name: 'Bubble',
    family: 'Pacifico_400Regular',
    category: 'rounded',
    weights: [400],
    italicAvailable: false,
    previewText: 'Aa',
    lineHeightMultiplier: 1.2,
  },
  // 9. Marker/hand — casual handwriting
  {
    id: 'handwritten',
    name: 'Handwritten',
    family: 'Caveat_400Regular',
    category: 'marker-hand',
    weights: [400],
    italicAvailable: false,
    previewText: 'Aa',
    lineHeightMultiplier: 1.35,
  },
  // 10. Signature — elegant script for signatures and accents
  {
    id: 'signature',
    name: 'Signature',
    family: 'DancingScript_600SemiBold',
    category: 'signature',
    weights: [400, 600],
    italicAvailable: false,
    previewText: 'Aa',
    lineHeightMultiplier: 1.4,
  },
];

// ── Lookup helpers ───────────────────────────────────────────────────

const FONT_BY_ID: Map<string, FontArchetype> = CURATED_FONTS.reduce(
  (map, font) => {
    map.set(font.id, font);
    return map;
  },
  new Map<string, FontArchetype>(),
);

/**
 * Get a font archetype by its ID. Returns undefined if not found.
 */
export function getFontById(id: string): FontArchetype | undefined {
  return FONT_BY_ID.get(id);
}

/**
 * Get the default font archetype (Clean / neutral sans).
 */
export function getDefaultFont(): FontArchetype {
  return CURATED_FONTS[0]!;
}

/**
 * Resolve a preview text style (fontFamily / fontSize / lineHeight) for a
 * given font ID and base size. Used by FontChooserRail and the live
 * preview in TextEditorSheet.
 */
export function resolveFontPreviewStyle(
  fontId: string,
  baseSize: number,
): { fontFamily: string; fontSize: number; lineHeight: number } {
  const font = FONT_BY_ID.get(fontId) ?? getDefaultFont();
  const multiplier = font.lineHeightMultiplier ?? 1.25;
  return {
    fontFamily: font.family,
    fontSize: baseSize,
    lineHeight: Math.round(baseSize * multiplier),
  };
}

/**
 * Get all fonts in a specific category.
 */
export function getFontsByCategory(category: FontCategory): FontArchetype[] {
  return CURATED_FONTS.filter((f) => f.category === category);
}
