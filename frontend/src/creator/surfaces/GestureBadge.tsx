/**
 * GestureBadge — floating transform indicator (Snapchat/Instagram pattern).
 *
 * A compact pill that appears near the actively manipulated layer showing the
 * real-time scale percentage or rotation degrees. Positioned above the
 * layer's center and driven by Reanimated shared values so it tracks the
 * layer in real-time during drag/pinch/rotate.
 *
 * Visual-only — `pointerEvents="none"` so it never intercepts gestures.
 * Respects `useReducedMotion` (instant appear/disappear when enabled).
 *
 * Per AGENTS.md §4: a single small pill, restrained chrome, one motion
 * language. The badge is a semi-transparent dark pill with white text —
 * readable over any content, not a decorated card.
 */
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  Easing,
  type SharedValue } from 'react-native-reanimated';
import { Space, Radius, FontFamily, Elevation } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { Motion } from '../../theme/motionTokens';

export interface GestureBadgeProps {
  /** Current badge text (e.g. "120%" or "45°"). `null` = hidden (fade-out). */
  badgeText: string | null;
  /** Shared value for the layer's center x in canvas pixels. Drives
   *  real-time horizontal tracking during drag. */
  positionXSv: SharedValue<number>;
  /** Shared value for the layer's center y in canvas pixels. Drives
   *  real-time vertical tracking during drag. */
  positionYSv: SharedValue<number>;
  /** Pixel offset above the layer center (positive = higher). Default 60. */
  offsetY?: number;
}

// Semi-transparent dark pill — readable over any content (Instagram pattern).
const PILL_FILL = 'rgba(0,0,0,0.62)';
const PILL_TEXT = '#FFFFFF';

export function GestureBadge({
  badgeText,
  positionXSv,
  positionYSv,
  offsetY = 60 }: GestureBadgeProps) {
  const reducedMotion = useReducedMotion();
  const opacitySV = useSharedValue(0);
  const scaleSV = useSharedValue(reducedMotion ? 1 : 0.85);
  // Hold the last text so it remains visible during the fade-out when
  // badgeText becomes null (gesture end).
  const [displayText, setDisplayText] = useState('');

  useEffect(() => {
    if (badgeText !== null) {
      setDisplayText(badgeText);
      if (reducedMotion) {
        opacitySV.value = 1;
        scaleSV.value = 1;
      } else {
        opacitySV.value = withTiming(1, {
          duration: Motion.duration.fast,
          easing: Easing.out(Easing.cubic) });
        scaleSV.value = withSpring(1, { damping: 16, stiffness: 200 });
      }
    } else {
      // Fade out — displayText retains the last value for the exit.
      if (reducedMotion) {
        opacitySV.value = 0;
      } else {
        opacitySV.value = withTiming(0, {
          duration: Motion.duration.fast,
          easing: Easing.in(Easing.cubic) });
        scaleSV.value = withSpring(0.85, { damping: 16, stiffness: 200 });
      }
    }
  }, [badgeText, reducedMotion, opacitySV, scaleSV]);

  // Position + appearance in one animated style so the pill tracks the
  // layer center on the UI thread without JS bridge hops.
  const containerStyle = useAnimatedStyle(() => ({
    left: positionXSv.value,
    top: positionYSv.value - offsetY,
    opacity: opacitySV.value,
    transform: [{ scale: scaleSV.value }] }));

  return (
    <Reanimated.View
      style={[styles.anchor, containerStyle]}
      pointerEvents="none"
      accessibilityLabel={badgeText ? `Transform ${badgeText}` : undefined}
      accessibilityRole="text"
    >
      <View style={styles.pill}>
        <Text style={styles.text} numberOfLines={1}>
          {displayText}
        </Text>
      </View>
    </Reanimated.View>
  );
}

const styles = StyleSheet.create({
  // Zero-width anchor at the layer center — the pill centers on this point
  // so it stays horizontally centered regardless of text length.
  anchor: {
    position: 'absolute',
    width: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 50 },
  pill: {
    backgroundColor: PILL_FILL,
    borderRadius: Radius.full,
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs,
    ...Elevation.modal },
  text: {
    fontFamily: FontFamily.semibold,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    color: PILL_TEXT,
    letterSpacing: 0.3 } });
