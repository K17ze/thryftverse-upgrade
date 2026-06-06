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
  /** Glow - Brand-colored halo for active CTAs, avatars, unread indicators */
  glow: {
    shadowColor: '#F4F0E8',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 0,
  },
  /** Legacy aliases for backward compatibility */
  sm: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 2, elevation: 2 },
  md: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 4, elevation: 4 },
  lg: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.16, shadowRadius: 8, elevation: 8 },
  xl: { shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.2, shadowRadius: 16, elevation: 16 },
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
    ...Elevation.sm,
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
