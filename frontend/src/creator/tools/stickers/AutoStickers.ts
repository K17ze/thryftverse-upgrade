/**
 * AutoStickers — media-derived sticker suggestions.
 *
 * Per spec 08_DRAWING_STICKERS_CUTOUT_MASKING: Auto Stickers are suggestions
 * derived from real analysis of the current composition, not random or
 * AI-fabricated. This module analyzes:
 *
 *   1. Dominant colors from the current media (via MediaPalette) → mood
 *      (warm → sun/heart, cool → snow/water, vibrant → fire/sparkle).
 *   2. Content type — if a product layer exists → shopping/sale stickers.
 *   3. Season/time — if metadata has a timestamp → seasonal stickers.
 *
 * The output is an ordered array of StickerDef suggestions (5–8 entries),
 * labeled truthfully as "Suggested" (never "AI-generated").
 */
import type { MediaPaletteEntry } from '../../color/ColorTypes';
import type { CreatorDocument, CreatorLayer } from '../../composition';
import { rgbToHsv, relativeLuminance } from '../../color/ColorMath';
import type { StickerDef } from './StickerCategories';

// ── Types ─────────────────────────────────────────────────────────────

/** Input for auto-sticker suggestion generation. */
export interface AutoStickerInput {
  /** Dominant color palette extracted from the current media (may be empty). */
  palette: MediaPaletteEntry[];
  /** The full creator document (used to detect product layers, metadata, etc). */
  document?: CreatorDocument;
  /** Optional timestamp (ms epoch) for seasonal suggestions; defaults to now. */
  timestamp?: number;
}

/** A scored sticker suggestion with the reason it was selected. */
export interface ScoredSticker {
  sticker: StickerDef;
  /** 0..1 relevance score; higher = more relevant. */
  score: number;
  /** Human-readable reason for transparency (used in accessibility/debug). */
  reason: string;
}

// ── Mood classification from palette ──────────────────────────────────

type Mood = 'warm' | 'cool' | 'vibrant' | 'muted' | 'neutral';

/**
 * Classify the overall mood of a palette by examining hue distribution and
 * saturation. Returns the dominant mood.
 */
function classifyMood(palette: MediaPaletteEntry[]): Mood {
  if (palette.length === 0) return 'neutral';

  let warmVotes = 0;
  let coolVotes = 0;
  let vibrantVotes = 0;
  let mutedVotes = 0;

  for (const entry of palette) {
    const hsv = rgbToHsv(entry.color);
    const weight = entry.weight > 0 ? entry.weight : 0.1;

    // Vibrant = high saturation + medium-high value
    if (hsv.s > 0.5 && hsv.v > 0.4) {
      vibrantVotes += weight;
    }
    // Muted = low saturation
    if (hsv.s < 0.25) {
      mutedVotes += weight;
    }
    // Warm hues: red (0..60), orange/yellow (60..90), magenta (300..360)
    if ((hsv.h >= 0 && hsv.h <= 90) || hsv.h >= 300) {
      warmVotes += weight;
    }
    // Cool hues: green (90..180), cyan/blue (180..300)
    if (hsv.h > 90 && hsv.h < 300) {
      coolVotes += weight;
    }
  }

  const max = Math.max(warmVotes, coolVotes, vibrantVotes, mutedVotes);
  if (max === 0) return 'neutral';
  if (max === warmVotes) return 'warm';
  if (max === coolVotes) return 'cool';
  if (max === vibrantVotes) return 'vibrant';
  return 'muted';
}

/**
 * Compute the average luminance of the palette to detect bright vs dark media.
 */
function averageLuminance(palette: MediaPaletteEntry[]): number {
  if (palette.length === 0) return 0.5;
  const totalWeight = palette.reduce((s, e) => s + (e.weight > 0 ? e.weight : 0.1), 0);
  const weighted = palette.reduce(
    (s, e) => s + relativeLuminance(e.color) * (e.weight > 0 ? e.weight : 0.1),
    0,
  );
  return weighted / totalWeight;
}

// ── Seasonal detection ────────────────────────────────────────────────

type Season = 'spring' | 'summer' | 'autumn' | 'winter' | 'holiday';

function getSeason(date: Date): Season {
  const month = date.getMonth(); // 0..11
  // Holiday season: late Nov → Dec
  if (month === 10 && date.getDate() >= 20) return 'holiday';
  if (month === 11) return 'holiday';
  if (month >= 2 && month <= 4) return 'spring';
  if (month >= 5 && month <= 7) return 'summer';
  if (month >= 8 && month <= 10) return 'autumn';
  return 'winter';
}

// ── Sticker candidate pools ───────────────────────────────────────────

const MOOD_STICKERS: Record<Mood, StickerDef[]> = {
  warm: [
    { id: 'auto-sun', name: 'Sun', emoji: '☀️', category: 'auto' },
    { id: 'auto-heart', name: 'Heart', emoji: '❤️', category: 'auto' },
    { id: 'auto-fire', name: 'Fire', emoji: '🔥', category: 'auto' },
  ],
  cool: [
    { id: 'auto-snow', name: 'Snow', emoji: '❄️', category: 'auto' },
    { id: 'auto-water', name: 'Water', emoji: '💧', category: 'auto' },
    { id: 'auto-moon', name: 'Moon', emoji: '🌙', category: 'auto' },
  ],
  vibrant: [
    { id: 'auto-sparkle', name: 'Sparkle', emoji: '✨', category: 'auto' },
    { id: 'auto-party', name: 'Party', emoji: '🎉', category: 'auto' },
    { id: 'auto-rainbow', name: 'Rainbow', emoji: '🌈', category: 'auto' },
  ],
  muted: [
    { id: 'auto-leaf', name: 'Leaf', emoji: '🍃', category: 'auto' },
    { id: 'auto-cloud', name: 'Cloud', emoji: '☁️', category: 'auto' },
  ],
  neutral: [
    { id: 'auto-star', name: 'Star', emoji: '⭐', category: 'auto' },
    { id: 'auto-sparkle', name: 'Sparkle', emoji: '✨', category: 'auto' },
  ],
};

const SEASON_STICKERS: Record<Season, StickerDef[]> = {
  spring: [
    { id: 'auto-flower', name: 'Flower', emoji: '🌸', category: 'auto' },
    { id: 'auto-tulip', name: 'Tulip', emoji: '🌷', category: 'auto' },
  ],
  summer: [
    { id: 'auto-sun', name: 'Sun', emoji: '☀️', category: 'auto' },
    { id: 'auto-beach', name: 'Beach', emoji: '🏖️', category: 'auto' },
  ],
  autumn: [
    { id: 'auto-leaf', name: 'Leaf', emoji: '🍂', category: 'auto' },
    { id: 'auto-maple', name: 'Maple', emoji: '🍁', category: 'auto' },
  ],
  winter: [
    { id: 'auto-snow', name: 'Snow', emoji: '❄️', category: 'auto' },
    { id: 'auto-snowman', name: 'Snowman', emoji: '⛄', category: 'auto' },
  ],
  holiday: [
    { id: 'auto-gift', name: 'Gift', emoji: '🎁', category: 'auto' },
    { id: 'auto-tree', name: 'Tree', emoji: '🎄', category: 'auto' },
  ],
};

const PRODUCT_STICKERS: StickerDef[] = [
  { id: 'auto-sale', name: 'Sale', emoji: '🏷️', category: 'auto' },
  { id: 'auto-shopping', name: 'Shopping', emoji: '🛍️', category: 'auto' },
  { id: 'auto-money', name: 'Money', emoji: '💰', category: 'auto' },
];

const BRIGHT_STICKERS: StickerDef[] = [
  { id: 'auto-sparkle', name: 'Sparkle', emoji: '✨', category: 'auto' },
  { id: 'auto-star', name: 'Star', emoji: '⭐', category: 'auto' },
];

const DARK_STICKERS: StickerDef[] = [
  { id: 'auto-moon', name: 'Moon', emoji: '🌙', category: 'auto' },
  { id: 'auto-sparkle', name: 'Sparkle', emoji: '✨', category: 'auto' },
];

// ── Layer analysis helpers ────────────────────────────────────────────

function hasProductLayer(doc?: CreatorDocument): boolean {
  if (!doc) return false;
  return doc.pages.some((page) =>
    page.layers.some((layer: CreatorLayer) => layer.type === 'product'),
  );
}

// ── Public API ────────────────────────────────────────────────────────

/**
 * Generate 5–8 media-derived sticker suggestions.
 *
 * The suggestions are genuinely derived from:
 *   - palette mood (warm/cool/vibrant/muted)
 *   - palette brightness (bright/dark media)
 *   - composition content (product layers → shopping stickers)
 *   - season (from timestamp)
 *
 * Each suggestion carries a human-readable reason. The results are deduped
 * by sticker id and sorted by score descending.
 */
export function suggestAutoStickers(input: AutoStickerInput): ScoredSticker[] {
  const { palette, document: doc, timestamp } = input;
  const date = timestamp ? new Date(timestamp) : new Date();
  const mood = classifyMood(palette);
  const luminance = averageLuminance(palette);
  const season = getSeason(date);
  const hasProduct = hasProductLayer(doc);

  const scored: ScoredSticker[] = [];
  const seen = new Set<string>();

  const add = (sticker: StickerDef, score: number, reason: string) => {
    if (seen.has(sticker.id)) {
      // Boost existing entry's score
      const existing = scored.find((s) => s.sticker.id === sticker.id);
      if (existing) {
        existing.score = Math.max(existing.score, score);
      }
      return;
    }
    seen.add(sticker.id);
    scored.push({ sticker, score, reason });
  };

  // 1. Mood-derived suggestions (highest weight)
  for (const sticker of MOOD_STICKERS[mood] ?? []) {
    add(sticker, 0.8, `Matches ${mood} tones in your media`);
  }

  // 2. Brightness-derived suggestions
  if (luminance > 0.6) {
    for (const sticker of BRIGHT_STICKERS) {
      add(sticker, 0.6, 'Bright media — sparkle accents');
    }
  } else if (luminance < 0.3) {
    for (const sticker of DARK_STICKERS) {
      add(sticker, 0.6, 'Dark media — glow accents');
    }
  }

  // 3. Seasonal suggestions
  for (const sticker of SEASON_STICKERS[season] ?? []) {
    add(sticker, 0.5, `Seasonal: ${season}`);
  }

  // 4. Product-derived suggestions
  if (hasProduct) {
    for (const sticker of PRODUCT_STICKERS) {
      add(sticker, 0.7, 'Product detected — shopping stickers');
    }
  }

  // Sort by score descending and return top 8
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 8);
}
