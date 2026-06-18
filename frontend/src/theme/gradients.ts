/**
 * Gradient Tokens — Thryftverse Visual System
 * Compatible with expo-linear-gradient and React Native styles
 *
 * Usage:
 *   import { Gradients } from '../theme/gradients';
 *   <LinearGradient colors={Gradients.gold} ... />
 */

import { Colors } from '../constants/colors';

// ============================================================================
// GRADIENT COLOR ARRAYS (for expo-linear-gradient)
// ============================================================================

/** Brand accent gradient — warm neutral direction */
export const BrandGradient = ['#D8D0C3', '#F4F0E8'] as const;

/** Brand gradient — horizontal variant */
export const BrandGradientH = ['#D8D0C3', '#F4F0E8'] as const;

/** Dark surface gradient — subtle depth on backgrounds */
export const DarkGradient = ['#0A0A0A', '#121212'] as const;

/** Danger gradient for destructive states */
export const DangerGradient = ['#FF6B6B', '#DC2626'] as const;

/** Success gradient for positive states */
export const SuccessGradient = ['#4ADE80', '#16A34A'] as const;

// ============================================================================
// GLASSMORPHISM TOKENS (reusable across components)
// ============================================================================

/** Standard glass background — barely visible white tint */
export const GLASS_BG = 'rgba(255,255,255,0.025)';

/** Standard glass border — hairline white */
export const GLASS_BORDER = 'rgba(255,255,255,0.06)';

/** Slightly stronger glass border — for focused/active states */
export const GLASS_BORDER_FOCUS = 'rgba(244,240,232,0.30)';

/** Light-mode glass background — barely visible black tint */
export const GLASS_BG_LIGHT = 'rgba(0,0,0,0.03)';

/** Light-mode glass border — hairline black */
export const GLASS_BORDER_LIGHT = 'rgba(0,0,0,0.08)';

// ============================================================================
// GLOW TOKENS
// ============================================================================

/** Brand glow halo color */
export const BRAND_GLOW = 'rgba(244,240,232,0.15)';

/** Danger glow halo color */
export const DANGER_GLOW = 'rgba(255,77,77,0.20)';

/** Success glow halo color */
export const SUCCESS_GLOW = 'rgba(76,175,80,0.15)';

// ============================================================================
// EXPORT CONVENIENCE OBJECT
// ============================================================================

export const Gradients = {
  brand: [...BrandGradient],
  brandH: [...BrandGradientH],
  dark: [...DarkGradient],
  danger: [...DangerGradient],
  success: [...SuccessGradient],
} as const;

export const Glass = {
  bg: GLASS_BG,
  border: GLASS_BORDER,
  borderFocus: GLASS_BORDER_FOCUS,
  bgLight: GLASS_BG_LIGHT,
  borderLight: GLASS_BORDER_LIGHT,
} as const;

export const Glow = {
  brand: BRAND_GLOW,
  danger: DANGER_GLOW,
  success: SUCCESS_GLOW,
} as const;