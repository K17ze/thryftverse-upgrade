// ThryftVerse color tokens — single source of truth for all color values.
// ThemeContext.tsx imports DARK_COLORS/LIGHT_COLORS from this file and exposes
// them via useAppTheme().colors for React components. Non-component modules
// can import Colors directly from this file when hooks are unavailable.
// All WCAG-compliant values (textMuted, danger, success, warning) and semantic
// colors are defined here and consumed identically in both light and dark themes.

import { Appearance } from 'react-native';

export type ThemeMode = 'dark' | 'light';

const THEME_OVERRIDE_GLOBAL_KEY = '__THRYFTVERSE_THEME_OVERRIDE__';

// ============================================================================
// CONSOLIDATED 5-CORE COLOR PALETTE
// Based on luxury e-commerce reference designs (Farfetch/SSENSE aesthetic)
// Principle: Restraint - use sparingly, let content breathe
// Values mirror theme/ThemeContext.tsx DARK_COLORS exactly.
// ============================================================================

export const DARK_COLORS = {
  // 1. BACKGROUND - Deep neutral
  background: '#0A0A0A',

  // 2. SURFACE - Slightly elevated (replaces `card`)
  surface: '#141414',
  // 2b. SURFACE ALT - More elevated tier (replaces `cardAlt`)
  surfaceAlt: '#1C1C1C',
  // 2c. SURFACE RAISED - Between surface and surfaceElevated (mirrors ThemeContext)
  surfaceRaised: '#1F1F1F',
  // 2d. SURFACE ELEVATED - Highest elevation tier (mirrors ThemeContext)
  surfaceElevated: '#242424',

  // 3. BRAND/PRIMARY - Warm off-white luxury accent (replaces gold)
  brand: '#F4F0E8',
  brandPressed: '#D8D0C3',
  // Subtle brand tint — selected states, active tabs, focused fields
  brandSubtle: 'rgba(244,240,232,0.08)',

  // 4. TEXT - Three levels of hierarchy + inverse for on-brand surfaces
  textPrimary: '#FFFFFF',
  textSecondary: '#A3A3A3',
  // WCAG 2.2 AA: 5.2:1 on surface #141414, 4.81:1 on surfaceAlt #1C1C1C (was #7A7A7A at 4.29:1/3.97:1 — failed AA)
  textMuted: '#888888',
  textInverse: '#000000',

  // 5. BORDERS - Subtle separators
  border: '#262626',
  // Canonical name (mirrors ThemeContext). borderLight kept as alias below.
  borderSubtle: '#1E1E1E',

  // Status (minimal set) — WCAG-compliant, mirrors ThemeContext
  danger: '#9b0202',
  dangerSubtle: 'rgba(155,2,2,0.10)',
  success: '#215634',
  successSubtle: 'rgba(33,86,52,0.10)',
  warning: '#D49454',
  warningSubtle: 'rgba(212,148,84,0.12)',
  brandBorder: 'rgba(244,240,232,0.20)',
  warningBorder: 'rgba(212,148,84,0.25)',
  dangerBorder: 'rgba(155,2,2,0.20)',
  successBorder: 'rgba(33,86,52,0.20)',
  coownUpBorder: 'rgba(28,86,49,0.20)',
  coownDownBorder: 'rgba(95,22,22,0.20)',
  commerceTrustBorder: 'rgba(74,122,196,0.20)',

  // Co-Own financial truth — up/down movement only. Per Design.md
  // proposed-semantic: coown-up #1C5631, coown-down #5F1616.
  coownUp: '#1C5631',
  coownDown: '#5F1616',
  coownUpSubtle: 'rgba(28,86,49,0.12)',
  coownDownSubtle: 'rgba(95,22,22,0.12)',

  // Semantic accent colors from Design.md proposed-semantic section.
  // Used for category icon badges and contextual accents — never decorative.
  social: '#9A6B7A',
  discovery: '#B85566',
  commerceTrust: '#4A7AC4',
  commerceTrustSubtle: 'rgba(74,122,196,0.10)',
  discoverySubtle: 'rgba(184,85,102,0.12)',
  // @deprecated Premium accent — many external consumers remain. Do not add
  // new uses; creator surfaces should use neutral tokens per AGENTS.md §4.
  bronzeSubtle: 'rgba(138,106,63,0.12)',

  // @deprecated Premium accent from Design.md proposed-luxury. Used sparingly
  // for verified status, authenticated value, or curated distinction. Do not
  // add new uses; creator surfaces should use neutral tokens per AGENTS.md §4.
  antiqueGold: '#C9A46A',
  /** @deprecated Premium accent — many external consumers remain. */
  bronze: '#8A6A3F',
  // Text over media scrims — always white regardless of theme
  scrimTextPrimary: '#FFFFFF',
  scrimTextSecondary: 'rgba(255,255,255,0.88)',
  scrimTextTertiary: 'rgba(255,255,255,0.40)',
  // Price deltas over media scrims — light enough to read on dark scrim in both themes
  scrimDeltaPositive: '#158d41',
  scrimDeltaNegative: '#a22e2e',

  // Media overlay — semantic tokens for text/shadows on top of images.
  // These express intent (media overlay) not mechanism (scrim). Always
  // white-on-dark-scrim in both themes — identical values in light/dark.
  mediaOverlayText: '#FFFFFF',
  mediaOverlayTextMuted: 'rgba(255,255,255,0.7)',
  mediaOverlayScrim: 'rgba(0,0,0,0.6)',
  mediaOverlayShadow: 'rgba(0,0,0,0.6)',

  // Structural / utility colors (mirrors ThemeContext)
  overlay: 'rgba(0,0,0,0.6)',
  input: '#1A1A1A',
  inputText: '#FFFFFF',
  row: '#141414',
  rowPressed: '#1A1A1A',
  tabBar: '#0A0A0A',
  header: '#0A0A0A',
  shadow: '#000000',
  // @deprecated Glass/blur surface tokens — many external consumers remain.
  // Do not add new uses; use surfaceElevated + hairline per AGENTS.md §4.
  glassBg: 'rgba(255,255,255,0.04)',
  /** @deprecated Glass/blur border — use border (hairline) per AGENTS.md §4. */
  glassBorder: 'rgba(255,255,255,0.08)',

  // Outfit builder background swatches — muted darks for dark mode.
  // Restrained, authored palette: warm-charcoal neutrals and deep tonal
  // backdrops, never bright/saturated. Pairs with light-mode warm-paper set.
  outfitBackgrounds: [
    '#1A1A1A', // deep charcoal
    '#241F1A', // deep warm brown
    '#1E2226', // deep slate blue
    '#1B201C', // deep forest
    '#221E20', // deep taupe
    '#241E22', // deep plum
    '#26221C', // deep clay
    '#202020', // deep neutral grey
  ],
} as const;

export const LIGHT_COLORS = {
  // 1. BACKGROUND - Clean white
  background: '#FFFFFF',

  // 2. SURFACE - Light grey for cards (replaces `card`)
  surface: '#F5F5F5',
  // 2b. SURFACE ALT - More elevated tier (replaces `cardAlt`)
  surfaceAlt: '#EFEFEF',
  // 2c. SURFACE RAISED - Between surface and surfaceElevated (mirrors ThemeContext)
  // Monotonic: surface(245) < surfaceAlt(239=darker=recessed) | surfaceRaised(248) > surface(245) = raised
  surfaceRaised: '#F8F8F8',
  // 2d. SURFACE ELEVATED - Highest elevation tier (mirrors ThemeContext)
  surfaceElevated: '#FFFFFF',

  // 3. BRAND/PRIMARY - Dark neutral luxury accent (replaces gold)
  brand: '#111111',
  brandPressed: '#333333',
  // Subtle brand tint — selected states, active tabs, focused fields
  brandSubtle: 'rgba(17,17,17,0.06)',

  // 4. TEXT - Three levels of hierarchy + inverse for on-brand surfaces
  textPrimary: '#000000',
  textSecondary: '#666666',
  // WCAG 2.2 AA: 4.82:1 on surface #F5F5F5, 4.56:1 on surfaceAlt #EFEFEF (was #767676 at 4.17:1/3.95:1 — failed AA)
  textMuted: '#6C6C6C',
  textInverse: '#FFFFFF',

  // 5. BORDERS - Subtle separators
  border: '#E5E5E5',
  // Canonical name (mirrors ThemeContext). borderLight kept as alias below.
  borderSubtle: '#F0F0F0',

  // Status (minimal set) — WCAG-compliant, mirrors ThemeContext
  danger: '#9b0202',
  dangerSubtle: 'rgba(155,2,2,0.08)',
  success: '#215634',
  successSubtle: 'rgba(33,86,52,0.08)',
  warning: '#C47A2E',
  warningSubtle: 'rgba(196,122,46,0.10)',
  brandBorder: 'rgba(17,17,17,0.16)',
  warningBorder: 'rgba(196,122,46,0.20)',
  dangerBorder: 'rgba(155,2,2,0.16)',
  successBorder: 'rgba(33,86,52,0.16)',
  coownUpBorder: 'rgba(28,86,49,0.16)',
  coownDownBorder: 'rgba(95,22,22,0.16)',
  commerceTrustBorder: 'rgba(6,72,154,0.16)',

  // Co-Own financial truth — up/down movement only.
  coownUp: '#1C5631',
  coownDown: '#5F1616',
  coownUpSubtle: 'rgba(28,86,49,0.10)',
  coownDownSubtle: 'rgba(95,22,22,0.10)',

  // Semantic accent colors — never decorative.
  social: '#6B3245',
  discovery: '#7B0E1E',
  commerceTrust: '#06489A',
  commerceTrustSubtle: 'rgba(6,72,154,0.08)',
  discoverySubtle: 'rgba(123,14,30,0.10)',
  // @deprecated Premium accent — many external consumers remain. Do not add
  // new uses; creator surfaces should use neutral tokens per AGENTS.md §4.
  bronzeSubtle: 'rgba(138,106,63,0.10)',

  // @deprecated Premium accents — used sparingly. Do not add new uses;
  // creator surfaces should use neutral tokens per AGENTS.md §4.
  antiqueGold: '#C9A46A',
  /** @deprecated Premium accent — many external consumers remain. */
  bronze: '#8A6A3F',
  // Text over media scrims — always white regardless of theme
  scrimTextPrimary: '#FFFFFF',
  scrimTextSecondary: 'rgba(255,255,255,0.88)',
  scrimTextTertiary: 'rgba(255,255,255,0.40)',
  // Price deltas over media scrims — light enough to read on dark scrim in both themes
  scrimDeltaPositive: '#3a9d5e',
  scrimDeltaNegative: '#852a2a',

  // Media overlay — semantic tokens for text/shadows on top of images.
  // These express intent (media overlay) not mechanism (scrim). Always
  // white-on-dark-scrim in both themes — identical values in light/dark.
  mediaOverlayText: '#FFFFFF',
  mediaOverlayTextMuted: 'rgba(255,255,255,0.7)',
  mediaOverlayScrim: 'rgba(0,0,0,0.6)',
  mediaOverlayShadow: 'rgba(0,0,0,0.6)',

  // Structural / utility colors (mirrors ThemeContext)
  overlay: 'rgba(0,0,0,0.4)',
  input: '#FFFFFF',
  inputText: '#000000',
  row: '#F5F5F5',
  rowPressed: '#EBEBEB',
  tabBar: '#FFFFFF',
  header: '#FFFFFF',
  shadow: '#000000',
  // @deprecated Glass/blur surface tokens — many external consumers remain.
  // Do not add new uses; use surfaceElevated + hairline per AGENTS.md §4.
  glassBg: 'rgba(0,0,0,0.04)',
  /** @deprecated Glass/blur border — use border (hairline) per AGENTS.md §4. */
  glassBorder: 'rgba(0,0,0,0.08)',

  // Outfit builder background swatches — warm-paper neutrals for light mode.
  // Pinterest-paper aesthetic: muted neutrals, warm greys, soft pastels.
  // Restrained, authored palette — not a rainbow. Pairs with dark-mode set.
  outfitBackgrounds: [
    '#F5F1EA', // warm off-white (paper)
    '#EDE6DA', // warm cream
    '#E2D9CB', // light taupe
    '#D4C9BE', // clay
    '#CDD4DE', // dusty blue
    '#D4D8CC', // soft sage
    '#E0D2D0', // muted rose
    '#D8D0E1', // soft lavender
  ],
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
// - Tab bar specific colors (use text hierarchy)
// - sold, star colors (use text or brand)
//
// KEPT (deprecated, many external consumers remain — do not add new uses):
// - glassBg, glassBorder (glass/blur surface colors — use surfaceElevated + hairline)
// - antiqueGold, bronze, bronzeSubtle (premium accents — use neutral tokens)

type ThemeColors = {
  [Key in keyof typeof DARK_COLORS]: typeof DARK_COLORS[Key] extends string
    ? string
    : readonly string[];
};

// Backward-compatibility alias: `borderLight` was the legacy field name for
// what ThemeContext calls `borderSubtle`. We keep `borderLight` accessible on
// `Colors` so the 22 existing import sites continue to type-check, while
// `borderSubtle` is the canonical name mirroring ThemeContext.
type CompatThemeColors = ThemeColors & { borderLight: string };

function resolveActiveTheme(): ThemeMode {
  const runtimeThemeOverride = (globalThis as Record<string, unknown>)[THEME_OVERRIDE_GLOBAL_KEY] as
    | ThemeMode
    | null
    | undefined;

  if (runtimeThemeOverride === 'light' || runtimeThemeOverride === 'dark') {
    return runtimeThemeOverride;
  }

  return Appearance.getColorScheme() === 'light' ? 'light' : 'dark';
}

function buildColors(mode: ThemeMode): CompatThemeColors {
  const base = mode === 'light' ? LIGHT_COLORS : DARK_COLORS;
  return { ...base, borderLight: base.borderSubtle };
}

export let ActiveTheme: ThemeMode = resolveActiveTheme();
export let Colors: CompatThemeColors = buildColors(ActiveTheme);
Object.freeze(ActiveTheme);
Object.freeze(Colors);

export function refreshThemeFromRuntime(): ThemeMode {
  ActiveTheme = resolveActiveTheme();
  Colors = buildColors(ActiveTheme);
  Object.freeze(ActiveTheme);
  Object.freeze(Colors);
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