/**
 * Gradient Tokens — Thryftverse Visual System
 * Compatible with expo-linear-gradient and React Native styles
 *
 * Theme-aware: gradient and glass tokens derive from the active Colors
 * palette so they adapt to light/dark mode. Use the static exports for
 * module-level convenience (correct after theme reload) or the `get*`
 * functions / `useGradients` hook for live-reactive updates.
 *
 * Usage:
 *   import { Gradients } from '../theme/gradients';
 *   <LinearGradient colors={Gradients.brand} ... />
 *
 *   // Reactive (preferred inside components):
 *   const { gradients, glass, glow } = useGradients();
 */

import { Colors } from '../constants/colors';
import { useAppTheme } from './ThemeContext';

// ============================================================================
// Minimal color shape used by gradient computation — works with both
// constants/colors.ts Colors and ThemeContext ThemeColors.
interface GradientColorSource {
  background: string;
  surface: string;
  brand: string;
  brandPressed: string;
  danger: string;
  success: string;
  textPrimary: string;
}

// THEME-AWARE GRADIENT COMPUTATION
// ============================================================================

function computeGradients(colors: GradientColorSource) {
  return {
    /** Brand accent gradient — warm neutral direction (dark) / dark neutral (light) */
    brand: [colors.brandPressed, colors.brand] as [string, string],
    /** Brand gradient — horizontal variant */
    brandH: [colors.brandPressed, colors.brand] as [string, string],
    /** Surface gradient — subtle depth on backgrounds */
    dark: [colors.background, colors.surface] as [string, string],
    /** Danger gradient for destructive states */
    danger: ['#FF6B6B', colors.danger] as [string, string],
    /** Success gradient for positive states */
    success: ['#4ADE80', colors.success] as [string, string],
  };
}

function computeGlass(colors: GradientColorSource) {
  // In dark mode, glass uses white tints; in light mode, black tints.
  const isDark = colors.background === '#0A0A0A' || colors.textPrimary === '#FFFFFF';
  if (isDark) {
    return {
      bg: 'rgba(255,255,255,0.04)',
      border: 'rgba(255,255,255,0.08)',
      borderFocus: `${colors.brand}4D`,
      bgLight: 'rgba(0,0,0,0.03)',
      borderLight: 'rgba(0,0,0,0.08)',
    };
  }
  return {
    bg: 'rgba(0,0,0,0.03)',
    border: 'rgba(0,0,0,0.08)',
    borderFocus: `${colors.brand}4D`,
    bgLight: 'rgba(255,255,255,0.04)',
    borderLight: 'rgba(255,255,255,0.08)',
  };
}

function computeGlow(colors: GradientColorSource) {
  return {
    brand: `${colors.brand}26`,
    danger: 'rgba(255,77,77,0.20)',
    success: 'rgba(76,175,80,0.15)',
  };
}

// ============================================================================
// REACTIVE HOOK (for live theme switching without reload)
// ============================================================================

export function useGradients() {
  const { colors } = useAppTheme();
  return {
    gradients: computeGradients(colors),
    glass: computeGlass(colors),
    glow: computeGlow(colors),
  };
}

// ============================================================================
// DYNAMIC GETTERS (read current Colors at call time)
// ============================================================================

export function getGradients() {
  return computeGradients(Colors);
}

export function getGlass() {
  return computeGlass(Colors);
}

export function getGlow() {
  return computeGlow(Colors);
}

// ============================================================================
// STATIC EXPORTS (computed from Colors at module load — correct after reload)
// ============================================================================

/** Brand accent gradient — warm neutral direction */
export const BrandGradient = computeGradients(Colors).brand;

/** Brand gradient — horizontal variant */
export const BrandGradientH = computeGradients(Colors).brandH;

/** Dark surface gradient — subtle depth on backgrounds */
export const DarkGradient = computeGradients(Colors).dark;

/** Danger gradient for destructive states */
export const DangerGradient = computeGradients(Colors).danger;

/** Success gradient for positive states */
export const SuccessGradient = computeGradients(Colors).success;

// ============================================================================
// GLASSMORPHISM TOKENS (reusable across components)
// ============================================================================

export const GLASS_BG = computeGlass(Colors).bg;
export const GLASS_BORDER = computeGlass(Colors).border;
export const GLASS_BORDER_FOCUS = computeGlass(Colors).borderFocus;
export const GLASS_BG_LIGHT = computeGlass(Colors).bgLight;
export const GLASS_BORDER_LIGHT = computeGlass(Colors).borderLight;

// ============================================================================
// GLOW TOKENS
// ============================================================================

export const BRAND_GLOW = computeGlow(Colors).brand;
export const DANGER_GLOW = computeGlow(Colors).danger;
export const SUCCESS_GLOW = computeGlow(Colors).success;

// ============================================================================
// EXPORT CONVENIENCE OBJECT (static — correct after reload)
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
