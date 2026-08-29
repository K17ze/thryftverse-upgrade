import React, { useCallback, useEffect, useRef } from 'react';
import { StyleSheet } from 'react-native';
import { Text } from 'react-native';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  Easing } from 'react-native-reanimated';
import { useReducedMotion } from 'react-native-reanimated';

import { Space, Radius, Elevation } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { useMotionConfig } from '../../hooks/useMotionConfig';
import { useHaptic } from '../../hooks/useHaptic';
import type { ThemeColors } from '../../theme/ThemeContext';

/**
 * Props for {@link Tooltip}.
 */
export interface TooltipProps {
  /** Label text shown inside the tooltip bubble. */
  label: string;
  /** Whether the dock is floating (glass) — controls tooltip background/text colour. */
  floating: boolean;
  /** Theme colours from useAppTheme. */
  colors: ThemeColors;
  /** Fired when the tooltip becomes visible (long-press feedback). */
  onShow: () => void;
  /** Imperative show trigger — when this boolean flips to true the tooltip
   *  animates in and auto-dismisses after 1.5s. */
  visible: boolean;
}

/**
 * Spring tooltip for a dock tool button.
 *
 * Appears above the tool on long-press, animates from scale 0→1 + fade in,
 * and auto-dismisses after 1.5s. Uses `useMotionConfig` spring tokens so the
 * motion respects the user's reduced-motion preference, and `useHaptic` for
 * light feedback on show.
 *
 * Extracted from CreatorToolDock so each tool button owns its own Reanimated
 * shared values (hooks can't be called inside loops/closures).
 */
export function Tooltip({ label, floating, colors, onShow, visible }: TooltipProps) {
  const reduceMotion = useReducedMotion();
  const { spring, duration } = useMotionConfig();
  const haptic = useHaptic();

  const tooltipScaleSV = useSharedValue(0);
  const tooltipOpacitySV = useSharedValue(0);
  const tooltipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Timing config derived from motion tokens — 120ms ease-out cubic fade.
  const fadeTiming = { duration: (duration as { fast: number }).fast, easing: Easing.out(Easing.cubic) };

  // Cleanup tooltip timer on unmount
  useEffect(() => {
    return () => {
      if (tooltipTimerRef.current) clearTimeout(tooltipTimerRef.current);
    };
  }, []);

  const show = useCallback(() => {
    if (tooltipTimerRef.current) clearTimeout(tooltipTimerRef.current);
    if (reduceMotion) {
      tooltipScaleSV.value = 1;
      tooltipOpacitySV.value = 1;
    } else {
      tooltipScaleSV.value = withSpring(1, spring.tap);
      tooltipOpacitySV.value = withTiming(1, fadeTiming);
    }
    haptic.light();
    onShow();
    // Auto-dismiss after 1.5s
    tooltipTimerRef.current = setTimeout(() => {
      if (reduceMotion) {
        tooltipScaleSV.value = 0;
        tooltipOpacitySV.value = 0;
      } else {
        tooltipScaleSV.value = withSpring(0, spring.tap);
        tooltipOpacitySV.value = withTiming(0, fadeTiming);
      }
    }, 1500);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduceMotion, tooltipScaleSV, tooltipOpacitySV, onShow, label, haptic, spring, duration]);

  // React to external `visible` trigger
  useEffect(() => {
    if (visible) show();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const tooltipStyle = useAnimatedStyle(() => ({
    transform: [{ scale: tooltipScaleSV.value }],
    opacity: tooltipOpacitySV.value }));

  return (
    <Reanimated.View
      style={[
        styles.tooltip,
        tooltipStyle,
        { backgroundColor: floating ? colors.overlay : colors.surfaceElevated },
      ]}
      pointerEvents="none"
    >
      <Text style={[styles.tooltipText, { color: floating ? colors.textInverse : colors.textPrimary }]}>
        {label}
      </Text>
    </Reanimated.View>
  );
}

const styles = StyleSheet.create({
  // ── Spring tooltip ──
  // Appears above the tool button on long-press.
  // Animates from scale 0.8→1.0 + fade in, auto-dismisses after 1.5s.
  tooltip: {
    position: 'absolute',
    top: -34,
    alignSelf: 'center',
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs + 1,
    borderRadius: Radius.md,
    ...Elevation.modal },
  tooltipText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: 0.1 } });

export default Tooltip;
