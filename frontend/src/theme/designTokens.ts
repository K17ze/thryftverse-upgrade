/**
 * Design Tokens - Thryftverse Visual System
 * Based on Instagram/Depop/Vinted/Pinterest patterns
 * Use these instead of random inline values
 */

// ============================================================================
// SPACING SCALE (4px base grid)
// ============================================================================
export const Space = {
  /** 4px - Micro adjustments, icon gaps */
  xs: 4,
  /** 8px - Tight spacing, inline elements, grid gaps */
  sm: 8,
  /** 16px - Default padding, card padding, section gaps */
  md: 16,
  /** 24px - Section breaks, major separators */
  lg: 24,
  /** 32px - Major sections, hero spacing */
  xl: 32,
  /** 48px - Large hero sections, onboarding */
  xxl: 48,
} as const;

// ============================================================================
// BORDER RADIUS (Intentional, consistent shapes)
// ============================================================================
export const Radius = {
  /** 0 - Images (full-bleed), sharp edges */
  none: 0,
  /** 4px - Buttons, inputs, small elements */
  sm: 4,
  /** 8px - Small cards, chips, badges */
  md: 8,
  /** 12px - Modals, sheets, medium cards */
  lg: 12,
  /** 16px - Large cards, containers */
  xl: 16,
  /** 24px - Navigation docks and genuinely dominant panels only */
  xxl: 24,
  /** 999px - Pills, avatars, floating buttons, tags */
  full: 999,
} as const;

// ============================================================================
// TYPOGRAPHY (San Francisco / iOS style)
// ============================================================================
interface TypeStyle {
  size: number;
  lineHeight: number;
  weight: '400' | '500' | '600' | '700';
  letterSpacing: number;
}

// ============================================================================
// FONT FAMILIES (Inter set)
// ============================================================================
export const FontFamily = {
  light: 'Inter_300Light',
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  extrabold: 'Inter_800ExtraBold',
} as const;

export const FontSize = {
  micro: 10,
  caption: 12,
  body: 15,
  bodyLarge: 16,
  title: 21,
  heading: 30,
  display: 40,
  hero: 56,
  giant: 72,
} as const;

export const LetterSpacing = {
  tight: -0.42,
  normal: 0,
  wide: 0.12,
  caps: 0.82,
} as const;

// ============================================================================
// SIMPLIFIED TYPOGRAPHY - 5 VARIANTS ONLY (Phase 1 Cleanup)
// Reference: Luxury e-commerce uses strict hierarchy
// ============================================================================
export const Type: Record<string, TypeStyle> = {
  /** 24/32/700 - Hero titles, screen headers, profile names */
  title: { size: 24, lineHeight: 32, weight: '700', letterSpacing: -0.6 },

  /** 17/24/600 - Section titles, card headers, product names */
  subtitle: { size: 17, lineHeight: 24, weight: '600', letterSpacing: -0.4 },

  /** 14/20/400 - Body text, descriptions, general content */
  body: { size: 14, lineHeight: 20, weight: '400', letterSpacing: -0.2 },

  /** 15/21/600 - Strong body, picker values, emphasized descriptions */
  bodyEmphasis: { size: 15, lineHeight: 21, weight: '600', letterSpacing: 0 },

  /** 14/20/600 - Button text, emphasized content, prices (LEGACY — prefer priceList for actual prices) */
  price: { size: 14, lineHeight: 20, weight: '600', letterSpacing: -0.2 },

  /** 20/24/700 - Prices in lists, totals (ELEVATED per OVERALL spec) */
  priceList: { size: 20, lineHeight: 24, weight: '700', letterSpacing: -0.3 },

  /** 28/32/700 - Hero prices, checkout totals (ELEVATED per OVERALL spec) */
  priceLarge: { size: 28, lineHeight: 32, weight: '700', letterSpacing: -0.5 },

  /** 12/16/400 - Captions, metadata, timestamps, hints */
  caption: { size: 12, lineHeight: 16, weight: '400', letterSpacing: 0 },

  /** 13/18/400 - Metadata, timestamps, hints (ELEVATED per OVERALL spec) */
  captionElevated: { size: 13, lineHeight: 18, weight: '400', letterSpacing: 0.1 },

  /** 11/14/500 - Small metadata, seller handles */
  meta: { size: 11, lineHeight: 14, weight: '500', letterSpacing: 0.15 },

  /** 11/14/600 - Labels, badges, section headers (ELEVATED per OVERALL spec) */
  metaElevated: { size: 11, lineHeight: 14, weight: '600', letterSpacing: 0.5 },

  /** 32/38/700 - Auth hero, empty state titles (ELEVATED per OVERALL spec) */
  display: { size: 32, lineHeight: 38, weight: '700', letterSpacing: -0.5 },
} as const;

// REMOVED (to reduce visual chaos):
// - captionEmphasis (merged into caption or price)
// - bodyEmphasis (merged into price)
// - headline (renamed to subtitle)
// - title3, title2, title1 (consolidated to title only)
// - Multiple letterSpacing values (standardized)

// ============================================================================
// BACKWARD-COMPATIBLE TYPOGRAPHY RE-EXPORT (Phase 0 Migration)
// Use FontFamily / Type / FontSize directly in new code.
// ============================================================================
export const Typography = {
  family: FontFamily,
  size: FontSize,
  tracking: LetterSpacing,
} as const;

export const TypeStyles: { [key: string]: import('react-native').TextStyle } = {
  display: {
    fontFamily: FontFamily.extrabold,
    fontSize: FontSize.display,
    letterSpacing: LetterSpacing.tight,
    lineHeight: 46,
  },
  hero: {
    fontFamily: FontFamily.extrabold,
    fontSize: FontSize.hero,
    letterSpacing: -1.1,
    lineHeight: 60,
  },
  heroDisplay: {
    fontFamily: FontFamily.extrabold,
    fontSize: FontSize.hero,
    letterSpacing: -1.4,
    lineHeight: 60,
  },
  giantDisplay: {
    fontFamily: FontFamily.extrabold,
    fontSize: FontSize.giant,
    letterSpacing: -2,
    lineHeight: 74,
  },
  heading: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.heading,
    letterSpacing: LetterSpacing.tight,
    lineHeight: 36,
  },
  title: {
    fontFamily: FontFamily.semibold,
    fontSize: FontSize.title,
    letterSpacing: LetterSpacing.normal,
    lineHeight: 28,
  },
  body: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.body,
    letterSpacing: LetterSpacing.normal,
    lineHeight: 22,
  },
  bodyEmphasis: {
    fontFamily: FontFamily.semibold,
    fontSize: 15,
    letterSpacing: 0,
    lineHeight: 21,
  },
  caption: {
    fontFamily: FontFamily.light,
    fontSize: FontSize.caption,
    letterSpacing: LetterSpacing.wide,
    lineHeight: 18,
  },
  metadata: {
    fontFamily: FontFamily.light,
    fontSize: FontSize.caption,
    letterSpacing: 0.4,
    lineHeight: 18,
  },
  overline: {
    fontFamily: FontFamily.medium,
    fontSize: FontSize.micro,
    letterSpacing: LetterSpacing.caps,
    textTransform: 'uppercase',
    lineHeight: 14,
  },
  button: {
    fontFamily: FontFamily.semibold,
    fontSize: FontSize.bodyLarge,
    letterSpacing: LetterSpacing.wide,
    lineHeight: 20,
  },
};

// ============================================================================
// ELEVATION / SHADOWS
// ============================================================================
interface ShadowConfig {
  shadowColor: string;
  shadowOffset: { width: number; height: number };
  shadowOpacity: number;
  shadowRadius: number;
  elevation: number;
}

export const Elevation: Record<string, ShadowConfig> = {
  /** No shadow - flat elements */
  none: {
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  /** Subtle - Cards, small elements (ELEVATED: softer, larger radius) */
  subtle: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  /** Card - Elevated cards, buttons (ELEVATED: refined values) */
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  /** Floating - FABs, overlays (ELEVATED: larger radius) */
  floating: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
  },
  /** Modal - Bottom sheets, dialogs (ELEVATED: premium feel) */
  modal: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 16,
  },
} as const;

// ============================================================================
// ANIMATION DURATIONS
// ============================================================================
export const Duration = {
  /** 0ms - Immediate */
  instant: 0,
  /** 150ms - Quick feedback (button press) */
  fast: 150,
  /** 250ms - Standard transitions */
  normal: 250,
  /** 400ms - Emphasis animations */
  slow: 400,
  /** 600ms - Hero/page transitions */
  slower: 600,
} as const;

// ============================================================================
// LAYOUT CONSTANTS
// ============================================================================
import { Dimensions } from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export const Layout = {
  screenWidth: SCREEN_WIDTH,
  screenHeight: SCREEN_HEIGHT,
  /** 2-column masonry grid item width with 16px gaps */
  gridItemWidth: (SCREEN_WIDTH - Space.md * 3) / 2,
  /** Full width minus padding */
  contentWidth: SCREEN_WIDTH - Space.md * 2,
  /** Standard grid configuration */
  gridColumns: 2,
  gridGap: Space.sm,
} as const;

// ============================================================================
// Z-INDEX SCALE
// ============================================================================
export const ZIndex = {
  base: 0,
  elevated: 10,
  sticky: 100,
  dropdown: 200,
  modal: 300,
  toast: 400,
  overlay: 500,
} as const;

// ============================================================================
// COMMON STYLE PRESETS
// ============================================================================
export const CommonStyles = {
  /** Standard card container */
  card: {
    padding: Space.md,
    borderRadius: Radius.lg,
    ...Elevation.card,
  },
  /** Standard screen container */
  screen: {
    flex: 1,
    paddingHorizontal: Space.md,
  },
  /** Row with items centered */
  rowCenter: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  /** Row with items spread apart */
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  /** Center content both directions */
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
} as const;

// ============================================================================
// STICKY DOCK GEOMETRY
// ============================================================================
// CoOwnStickyActionDock and CommerceStickyDock both have minHeight: 72.
// Use these to compute scroll bottom padding instead of hardcoded spacers.
export const DockConstants = {
  /** Base dock content height (minHeight from dock styles) */
  baseHeight: 72,
  /** Single-action dock (one full-width button) — typical total */
  singleActionHeight: 96,
  /** Two-action dock (cancel + confirm side by side) — typical total */
  dualActionHeight: 132,
  /** Stacked compact dock (buttons stacked vertically) — typical total */
  stackedActionHeight: 180,
} as const;

// ============================================================================
// EXCHANGE LAYOUT GEOMETRY — Co-Own market surfaces
// Deterministic geometry for skeletons to match final layouts.
// ============================================================================
export const ExchangeLayout = {
  // Order ticket sheet snap points (bottom sheet on mobile)
  ticketSnapCollapsed: 120,
  ticketSnapExpanded: '80%' as const,
  // Order book row height — deterministic for skeleton match (44pt touch target)
  bookRowHeight: 44,
  bookVisibleLevels: 5,      // mobile default; 10 on tablet
  // Market-status strip height
  statusStripHeight: 36,
  // Value strip (last/bid/ask/mid/NAV) row height
  valueStripRowHeight: 44,
  // Chart hero min height on AssetDetail
  chartHeroMinHeight: 220,
} as const;

// ============================================================================
// NUMERIC TYPOGRAPHY — tabular figures for all 1ZE values
// Inter supports tnum via fontVariant: ['tabular-nums'] — no new font needed.
// Every 1ZE amount, unit count, percentage, P&L uses a Numeric.* style.
// ============================================================================
export const Numeric = {
  // Prices in lists, totals
  price: {
    ...Type.price,
    fontVariant: ['tabular-nums'] as ['tabular-nums'],
    fontFeatureSettings: '"tnum" 1, "lnum" 1',
  },
  // Elevated price (20/24/700)
  priceList: {
    ...Type.priceList,
    fontVariant: ['tabular-nums'] as ['tabular-nums'],
  },
  // Hero price (28/32/700)
  priceLarge: {
    ...Type.priceLarge,
    fontVariant: ['tabular-nums'] as ['tabular-nums'],
  },
  // Hero portfolio / wallet value (32/38/700)
  display: {
    ...Type.display,
    fontVariant: ['tabular-nums'] as ['tabular-nums'],
  },
  // Order book, depth, stats grids — compact mono feel
  mono: {
    size: 13,
    lineHeight: 18,
    weight: '500' as const,
    letterSpacing: 0,
    fontVariant: ['tabular-nums'] as ['tabular-nums'],
  },
} as const;

// ============================================================================
// CONTROL GEOMETRY (hit area and visible chrome are deliberately separate)
// ============================================================================
export const Control = {
  /** Minimum practical touch target. This is not the visible button size. */
  hit: 44,
  /** Compact visible background used only when a control needs containment. */
  chromeCompact: 32,
  /** Standard visible background used for prominent contained controls. */
  chrome: 36,
  /** Standard navigation/action glyph. */
  icon: 22,
  /** Compact inline glyph. */
  iconCompact: 18,
} as const;

export const Stroke = {
  /** Subtle separators and grouped-list hairlines. */
  hairline: 0.5,
  /** Fields and intentionally outlined controls. */
  standard: 1,
  /** Selection/focus only; never routine card decoration. */
  emphasis: 2,
} as const;
