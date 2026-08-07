import React from 'react';
import { Platform, StyleSheet, View, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import {
  LiquidGlassView,
  isLiquidGlassSupported as packageSupported,
} from '@callstack/liquid-glass';
import { useAppTheme } from '../theme/ThemeContext';

/**
 * LiquidGlassBackdrop
 *
 * Applies Apple's iOS 26 Liquid Glass material to floating chrome
 * (tab bars, sheets, docks) when the device supports it, and falls
 * back to `expo-blur`'s BlurView on older iOS / Android so the
 * glassmorphism parity is preserved across themes and platforms.
 *
 * Per Apple HIG, Liquid Glass is used sparingly here — only on
 * floating chrome that seeks to bring attention to underlying
 * content. It is NOT intended for content cards, list rows, form
 * fields or static backgrounds.
 *
 * Note: `@callstack/liquid-glass` v0.8.0 ships a JS-side
 * `isLiquidGlassSupported` constant that is statically `false`; the
 * real device detection lives in the native module constant. To stay
 * robust across library revisions and to gate correctly on devices
 * where the native constant has not propagated into JS, we supplement
 * the package flag with an explicit iOS 26+ Platform.Version check.
 */

export interface LiquidGlassBackdropProps {
  /** Blur intensity for the BlurView fallback (0-100). Default 60. */
  intensity?: number;
  /** BlurView tint for the fallback. Defaults to the current theme. */
  tint?: 'light' | 'dark' | 'system';
  /** Style applied to the backing glass / blur surface. */
  style?: ViewStyle | ViewStyle[];
  /** Content rendered above the glass material. */
  children?: React.ReactNode;
  /**
   * When true, the Liquid Glass material responds to touch with a
   * shimmer + grow effect (Apple HIG: use only on genuinely
   * interactive chrome). Defaults to false.
   */
  interactive?: boolean;
  /**
   * Liquid Glass effect variant. 'regular' (default) is the standard
   * frosted material; 'clear' is more transparent. Ignored on the
   * BlurView fallback.
   */
  effect?: 'clear' | 'regular' | 'none';
  /**
   * When true (default), the glass surface is positioned with
   * `StyleSheet.absoluteFill` — the typical backdrop case (tab bar,
   * sheet dimming). When false, only `style` is applied, so the
   * component can act as a flex container (e.g. a floating pill dock
   * that wraps scrolling content).
   */
  absoluteFill?: boolean;
}

/** Robust runtime detection of iOS 26 Liquid Glass support. */
function useLiquidGlassSupported(): boolean {
  const { isDark } = useAppTheme();
  void isDark; // theme parity is handled via colorScheme, not detection
  if (Platform.OS !== 'ios') return false;
  // Package-native flag (true once the native constant propagates).
  if (packageSupported) return true;
  // Explicit iOS major-version gate. Platform.Version on iOS may be
  // a number or string depending on RN revision; normalise both.
  const raw = Platform.Version as unknown;
  const major =
    typeof raw === 'number'
      ? raw
      : parseInt(String(raw), 10);
  return Number.isFinite(major) && major >= 26;
}

export function LiquidGlassBackdrop({
  intensity = 60,
  tint,
  style,
  children,
  interactive = false,
  effect = 'regular',
  absoluteFill = true,
}: LiquidGlassBackdropProps) {
  const { isDark } = useAppTheme();
  const supported = useLiquidGlassSupported();
  const resolvedTint: 'light' | 'dark' = tint === 'dark' || (tint !== 'light' && isDark) ? 'dark' : 'light';
  const baseStyle = absoluteFill ? StyleSheet.absoluteFill : null;

  if (supported) {
    return (
      <LiquidGlassView
        interactive={interactive}
        effect={effect}
        colorScheme={isDark ? 'dark' : 'light'}
        style={[baseStyle, style as ViewStyle]}
      >
        {children}
      </LiquidGlassView>
    );
  }

  return (
    <BlurView
      intensity={intensity}
      tint={resolvedTint}
      style={[baseStyle, style as ViewStyle]}
    >
      {children}
    </BlurView>
  );
}

export default LiquidGlassBackdrop;
