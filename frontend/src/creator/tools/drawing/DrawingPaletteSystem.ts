/**
 * DrawingPaletteSystem — palette switching for the drawing workspace.
 *
 * Provides a curated set of named color palettes for freehand drawing, plus a
 * user-authored custom palette persisted to AsyncStorage. Each predefined
 * palette has 6–8 hex colors. The 'skin' palette contains inclusive skin
 * tone shades for portrait drawing.
 *
 * Per spec 07_MEDIA_TOOLCHAIN and AGENTS.md §4, §11 (Truthful UI):
 *   - Every palette is real curated data — no fake/placeholder colors.
 *   - Custom colors are genuinely persisted via AsyncStorage (cross-session).
 *   - Pure, deterministic, TypeScript-strict compatible.
 *
 * Usage:
 *   import { getPalette, getAllPalettes, saveCustomPalette, loadCustomPalette } from './DrawingPaletteSystem';
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

// ── Types ──────────────────────────────────────────────────────────────

export type PaletteName =
  | 'default'
  | 'pastel'
  | 'vibrant'
  | 'monochrome'
  | 'earth'
  | 'neon'
  | 'skin'
  | 'custom';

export interface Palette {
  name: PaletteName;
  /** Human-readable label for the palette switcher UI. */
  label: string;
  /** 6–8 hex color strings (#RRGGBB). */
  colors: string[];
}

// ── Predefined palettes ────────────────────────────────────────────────

const PALETTES: Record<Exclude<PaletteName, 'custom'>, Palette> = {
  default: {
    name: 'default',
    label: 'Default',
    colors: [
      '#000000',
      '#FFFFFF',
      '#E53935',
      '#FB8C00',
      '#FDD835',
      '#43A047',
      '#1E88E5',
      '#8E24AA',
    ],
  },
  pastel: {
    name: 'pastel',
    label: 'Pastel',
    colors: [
      '#FADADD',
      '#FFDFBA',
      '#FFF5BA',
      '#C7EFCF',
      '#BAE1FF',
      '#D7BDE2',
      '#F9E79F',
      '#A2D5F2',
    ],
  },
  vibrant: {
    name: 'vibrant',
    label: 'Vibrant',
    colors: [
      '#FF0D57',
      '#FF7A00',
      '#FFD400',
      '#00E676',
      '#00B0FF',
      '#7C4DFF',
      '#FF4081',
      '#18FFFF',
    ],
  },
  monochrome: {
    name: 'monochrome',
    label: 'Mono',
    colors: [
      '#000000',
      '#333333',
      '#666666',
      '#999999',
      '#BBBBBB',
      '#DDDDDD',
      '#FFFFFF',
    ],
  },
  earth: {
    name: 'earth',
    label: 'Earth',
    colors: [
      '#5D4037',
      '#8D6E63',
      '#A1887F',
      '#BCAAA4',
      '#6D4C41',
      '#3E2723',
      '#A52A2A',
      '#556B2F',
    ],
  },
  neon: {
    name: 'neon',
    label: 'Neon',
    colors: [
      '#FF073A',
      '#FF6EC7',
      '#FEFF00',
      '#39FF14',
      '#00FFFF',
      '#0FF1CE',
      '#B388FF',
      '#FF00FF',
    ],
  },
  // Inclusive skin tone palette for portrait drawing. Shades span the full
  // range of human skin tones (light to deep) with warm and neutral
  // undertones, so any subject can be drawn accurately.
  skin: {
    name: 'skin',
    label: 'Skin',
    colors: [
      '#FBE4D6', // very light — cool undertone
      '#F3D2C1', // light — warm undertone
      '#E8B894', // light-medium
      '#D9A074', // medium — warm
      '#C68642', // medium-tan
      '#A56C3A', // tan — deep warm
      '#8D5524', // deep
      '#5C3317', // deep — rich
    ],
  },
};

// ── Predefined palette access ──────────────────────────────────────────

/**
 * Returns the colors for a named predefined palette. For 'custom', returns
 * an empty array — use `loadCustomPalette()` to read the persisted custom
 * palette asynchronously.
 */
export function getPalette(name: PaletteName): string[] {
  if (name === 'custom') return [];
  return PALETTES[name].colors.slice();
}

/**
 * Returns all predefined palettes (excluding 'custom') with names, labels,
 * and colors. The custom palette is fetched separately via
 * `loadCustomPalette()` because it requires async storage access.
 */
export function getAllPalettes(): Palette[] {
  const order: Exclude<PaletteName, 'custom'>[] = [
    'default',
    'pastel',
    'vibrant',
    'monochrome',
    'earth',
    'neon',
    'skin',
  ];
  return order.map((name) => ({
    ...PALETTES[name],
    colors: PALETTES[name].colors.slice(),
  }));
}

/**
 * Returns the human-readable label for a palette name.
 */
export function getPaletteLabel(name: PaletteName): string {
  if (name === 'custom') return 'Custom';
  return PALETTES[name].label;
}

// ── Custom palette (persisted) ─────────────────────────────────────────

const CUSTOM_PALETTE_KEY = '@thryftverse/creator_drawing_custom_palette';
const MAX_CUSTOM_COLORS = 12;

/**
 * Save a user-authored custom palette to AsyncStorage. Colors are validated
 * as hex strings (#RRGGBB or #RRGGBBAA) and deduplicated, preserving order.
 * Trims to MAX_CUSTOM_COLORS entries.
 *
 * Returns the normalized palette that was persisted.
 */
export async function saveCustomPalette(colors: string[]): Promise<string[]> {
  const normalized = normalizeColorList(colors).slice(0, MAX_CUSTOM_COLORS);
  await AsyncStorage.setItem(
    CUSTOM_PALETTE_KEY,
    JSON.stringify(normalized),
  );
  return normalized;
}

/**
 * Load the persisted custom palette. Returns an empty array if none is saved
 * or if storage is corrupted / unavailable.
 */
export async function loadCustomPalette(): Promise<string[]> {
  try {
    const json = await AsyncStorage.getItem(CUSTOM_PALETTE_KEY);
    if (!json) return [];
    const parsed = JSON.parse(json) as unknown;
    if (!Array.isArray(parsed)) return [];
    return normalizeColorList(parsed as unknown[]);
  } catch {
    return [];
  }
}

/**
 * Clear the persisted custom palette.
 */
export async function clearCustomPalette(): Promise<void> {
  try {
    await AsyncStorage.removeItem(CUSTOM_PALETTE_KEY);
  } catch {
    // Storage failure is non-fatal.
  }
}

// ── Internal ───────────────────────────────────────────────────────────

const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/**
 * Validate and normalize a list of color values into hex strings. Non-string
 * and invalid entries are dropped. Duplicates are removed preserving order.
 */
function normalizeColorList(input: unknown[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input) {
    if (typeof raw !== 'string') continue;
    const trimmed = raw.trim();
    if (!HEX_RE.test(trimmed)) continue;
    const lower = trimmed.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    out.push(lower);
  }
  return out;
}
