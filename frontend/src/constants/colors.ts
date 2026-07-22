import { Appearance } from 'react-native';

export type ThemeMode = 'dark' | 'light';

const THEME_OVERRIDE_GLOBAL_KEY = '__THRYFTVERSE_THEME_OVERRIDE__';

// ============================================================================
// CONSOLIDATED 5-CORE COLOR PALETTE
// Based on luxury e-commerce reference designs (Farfetch/SSENSE aesthetic)
// Principle: Restraint - use sparingly, let content breathe
// ============================================================================

const DARK_COLORS = {
  // 1. BACKGROUND - Deep neutral
  background: '#0A0A0A',

  // 2. SURFACE - Slightly elevated (replaces `card`)
  surface: '#141414',
  // 2b. SURFACE ALT - More elevated tier (replaces `cardAlt`)
  surfaceAlt: '#1F1F1F',

  // 3. BRAND/PRIMARY - Warm off-white luxury accent (replaces gold)
  brand: '#F4F0E8',
  brandPressed: '#D8D0C3',

  // 4. TEXT - Three levels of hierarchy + inverse for on-brand surfaces
  textPrimary: '#FFFFFF',
  textSecondary: '#A3A3A3',
  textMuted: '#666666',
  textInverse: '#000000',

  // 5. BORDERS - Subtle separators
  border: '#262626',
  borderLight: '#333333',

  // Status (minimal set)
  danger: '#7e0202',
  success: '#0c5728',
  warning: '#f2d097',
} as const;

const LIGHT_COLORS = {
  // 1. BACKGROUND - Clean white
  background: '#FFFFFF',

  // 2. SURFACE - Light grey for cards (replaces `card`)
  surface: '#F5F5F5',
  // 2b. SURFACE ALT - More elevated tier (replaces `cardAlt`)
  surfaceAlt: '#EBEBEB',

  // 3. BRAND/PRIMARY - Dark neutral luxury accent (replaces gold)
  brand: '#111111',
  brandPressed: '#333333',

  // 4. TEXT - Three levels of hierarchy + inverse for on-brand surfaces
  textPrimary: '#000000',
  textSecondary: '#666666',
  textMuted: '#999999',
  textInverse: '#FFFFFF',

  // 5. BORDERS - Subtle separators
  border: '#E5E5E5',
  borderLight: '#F0F0F0',

  // Status (minimal set)
  danger: '#790e0e',
  success: '#077c32',
  warning: '#ffd48a',
} as const;

// ============================================================================
// USAGE GUIDELINES (simplified from previous complex rules)
// ============================================================================
// - background: Screen backgrounds only
// - surface: Cards, sheets, elevated content
// - brand: Primary CTAs only (buy buttons, main actions)
// - textPrimary: Headlines, body text, important labels
// - textSecondary: Subtitles, metadata, captions
// - textMuted: Placeholders, disabled states, hints
// - border: Subtle dividers (0.5-1px)
// - danger: Errors, destructive actions
// - success: Confirmations, positive states
//
// REMOVED (to reduce visual noise):
// - Multiple card variants (cardAlt, cardElevated, etc.)
// - accent, accentPress (replaced with brand only)
// - accentGold, accentGoldPress, accentGoldMuted (consolidated)
// - Multiple border variants
// - Overlay colors (use opacity on backgrounds instead)
// - Glass/blur surface colors
// - Tab bar specific colors (use text hierarchy)
// - sold, star colors (use text or brand)

type ThemeColors = { [Key in keyof typeof DARK_COLORS]: string };

function resolveActiveTheme(): ThemeMode {
  const runtimeThemeOverride = (globalThis as any)[THEME_OVERRIDE_GLOBAL_KEY] as
    | ThemeMode
    | null
    | undefined;

  if (runtimeThemeOverride === 'light' || runtimeThemeOverride === 'dark') {
    return runtimeThemeOverride;
  }

  return Appearance.getColorScheme() === 'light' ? 'light' : 'dark';
}

export let ActiveTheme: ThemeMode = resolveActiveTheme();
export let Colors: ThemeColors = ActiveTheme === 'light' ? LIGHT_COLORS : DARK_COLORS;

export function refreshThemeFromRuntime(): ThemeMode {
  ActiveTheme = resolveActiveTheme();
  Colors = ActiveTheme === 'light' ? LIGHT_COLORS : DARK_COLORS;
  return ActiveTheme;
}

// ============================================================================
// EXCHANGE SEMANTIC COLOURS — Co-Own market microstructure
// Dark luxury shades only — no light, bright, or saturated hues.
// These are standalone exports, not part of ThemeColors interface.
// States are distinguishable by shape + label + dot, not colour alone.
// ============================================================================

export type CoOwnMarketMode = 'continuous' | 'call_auction' | 'rfq' | 'halted' | 'closed';

export const MARKET_COLORS = {
  // Continuous trading — deep navy. Calm, authoritative, "live but quiet".
  continuous: {
    dot: '#1B2845',
    ink: 'transparent',
    shape: 'circle' as const,
  },
  // Call auction — taupe. Warm but muted, distinct from warning cream.
  auction: {
    dot: '#6B5D4F',
    ink: '#6B5D4F22',
    shape: 'diamond' as const,
  },
  // Halted — cherry red. Dark, serious, not alarm red.
  halted: {
    dot: '#6B1A1A',
    ink: '#6B1A1A22',
    shape: 'circle' as const,
  },
  // Closed / outside session — neutral muted (matches textMuted).
  closed: {
    dot: '#666666',
    ink: 'transparent',
    shape: 'circle' as const,
  },
  // RFQ — deep plum. Distinct from navy continuous, still dark and luxury.
  rfq: {
    dot: '#3D2B3D',
    ink: '#3D2B3D22',
    shape: 'diamond' as const,
  },
} as const;

// Direction semantics — derived from existing success/danger hue family.
// Dark forest green and dark cherry red, lifted ~1 stop for tick contrast.
// Always paired with ▲ / ▼ / − glyph and sign — never colour alone.
export const DIRECTION_COLORS = {
  up: '#1A6B3A',
  upFill: '#1A6B3A18',
  down: '#8B2020',
  downFill: '#8B202018',
  flat: '#A3A3A3',
} as const;

// Depth-bar semantics — same direction hues at lower alpha.
// Read as structure, not decoration.
export const DEPTH_COLORS = {
  bidBar: '#1A6B3A18',
  askBar: '#8B202018',
  bidBarEdge: '#1A6B3A30',
  askBarEdge: '#8B202030',
} as const;