/**
 * GradientPresets — 9 flagship gradient presets (data + preview cards).
 *
 * Extracted from BackgroundPicker.tsx as part of the shared-abstraction split.
 * The gradient preset *colours* are decorative content (user-facing gradient
 * backgrounds) and are intentionally not theme tokens. The active-indicator
 * ring, however, uses the shared GradientRing component which derives its
 * colours from the active theme.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withDelay,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';

import { Typography, Radius, Space, Stroke } from '../../../theme/designTokens';
import { AnimatedPressable } from '../../AnimatedPressable';
import { useHaptic } from '../../../hooks/useHaptic';
import { useMotionConfig } from '../../../hooks/useMotionConfig';
import { GradientRing } from '../shared/GradientRing';

// ── Types ────────────────────────────────────────────────────────────

export type GradientPreset = { label: string; colors: [string, string, string] };

// ── 9 flagship gradient presets (3-stop for richer depth) ────────────
// Note: Bronze's first two stops mirror the theme's bronze / antiqueGold
// tokens (#8A6A3F / #C9A46A). The remaining colours are decorative and
// intentionally not tokenised — they are user-facing gradient content.
export const GRADIENTS: GradientPreset[] = [
  { label: 'Bronze',   colors: ['#8A6A3F', '#C9A46A', '#E8C896'] },
  { label: 'Sunset',   colors: ['#FF6B35', '#F72585', '#7209B7'] },
  { label: 'Ocean',    colors: ['#0077BE', '#00B4D8', '#48CAE4'] },
  { label: 'Forest',   colors: ['#2D6A4F', '#40916C', '#52B788'] },
  { label: 'Lavender', colors: ['#7B2CBF', '#C77DFF', '#FF70A6'] },
  { label: 'Peach',    colors: ['#FFA07A', '#FF8C61', '#FF6B6B'] },
  { label: 'Midnight', colors: ['#0D1B2A', '#1B263B', '#415A77'] },
  { label: 'Aurora',   colors: ['#06FFA5', '#3D5AFE', '#7209B7'] },
  { label: 'Rose',     colors: ['#FF006E', '#E91E63', '#C9184A'] },
];

// ── Constants ────────────────────────────────────────────────────────

const GRADIENT_SIZE = 64;

// ── GradientPresetCard — staggered entrance + GradientRing + LinearGradient ──

export interface GradientPresetCardProps {
  gradient: GradientPreset;
  isActive: boolean;
  index: number;
  reducedMotion: boolean;
  onSelect: (color: string) => void;
}

export const GradientPresetCard = React.memo(function GradientPresetCard({
  gradient,
  isActive,
  index,
  reducedMotion,
  onSelect,
}: GradientPresetCardProps) {
  const haptic = useHaptic();
  const { spring, stagger } = useMotionConfig();

  // Per-card staggered entrance: scale 0.8->1.0 with spring
  const entrance = useSharedValue(reducedMotion ? 1 : 0);
  React.useEffect(() => {
    if (reducedMotion) {
      entrance.value = 1;
    } else {
      entrance.value = withDelay(
        index * stagger.fast,
        withSpring(1, spring.entrance),
      );
    }
  }, [index, reducedMotion, stagger.fast, spring.entrance, entrance]);

  const entranceStyle = useAnimatedStyle(() => {
    'worklet';
    const scale = interpolate(entrance.value, [0, 1], [0.8, 1], Extrapolation.CLAMP);
    const opacity = interpolate(entrance.value, [0, 1], [0, 1], Extrapolation.CLAMP);
    return { transform: [{ scale }], opacity };
  });

  const handlePress = React.useCallback(() => {
    haptic.selection();
    // Preserve existing contract: pass first color as the selected value
    onSelect(gradient.colors[0]);
  }, [haptic, onSelect, gradient.colors]);

  return (
    <Reanimated.View style={entranceStyle}>
      <GradientRing
        isActive={isActive}
        size={GRADIENT_SIZE}
        borderRadius={Radius.md}
        strokeWidth={2}
      >
        <AnimatedPressable
          style={styles.gradientCard}
          onPress={handlePress}
          scaleValue={0.94}
          activeOpacity={0.85}
          hapticFeedback="selection"
          accessibilityLabel={`${gradient.label} gradient`}
          accessibilityHint={`Applies the ${gradient.label.toLowerCase()} gradient background`}
          accessibilityRole="button"
          accessibilityState={{ selected: isActive }}
        >
          <LinearGradient
            colors={gradient.colors}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <Text style={styles.gradientLabel}>{gradient.label}</Text>
        </AnimatedPressable>
      </GradientRing>
    </Reanimated.View>
  );
});

// ── Styles ───────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  gradientCard: {
    width: GRADIENT_SIZE,
    height: GRADIENT_SIZE,
    borderRadius: Radius.md,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: Stroke.standard,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  gradientLabel: {
    fontSize: 10,
    fontFamily: Typography.family.bold,
    color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 4,
    zIndex: 2,
  },
});
