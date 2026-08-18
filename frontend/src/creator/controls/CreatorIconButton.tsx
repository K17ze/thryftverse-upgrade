/**
 * CreatorIconButton — purpose-built icon button for the creator department.
 *
 * Features:
 *   - 48pt hit target preferred (44pt minimum)
 *   - Visible glyph 22–24pt
 *   - Press scale 0.97 via Reanimated spring (tap config: damping 18,
 *     stiffness 280, mass 0.8 — AGENTS.md §27.3)
 *   - Selected state: subtle filled backplate (32pt rounded square with
 *     theme accent at 12% opacity) — NOT color alone (AGENTS.md §13)
 *   - Disabled state: 0.4 opacity
 *   - Loading state: replaces glyph with a small spinner
 *   - Light haptic on press (expo-haptics selectionAsync)
 *   - Transparent background by default (no grey circle)
 *   - Optional `overlay` prop: tiny dark translucent backplate for controls
 *     over media (AGENTS.md §4, 05_ICONS spec §6)
 *   - Reduced-motion: fade instead of spring
 *
 * Design references:
 *   - 05_ICONS_BUTTONS_CONTROL_CRAFT.md §2, §3, §6, §7, §8
 *   - AGENTS.md §4 (Separate hit area from visible shape)
 *   - AGENTS.md §13 (Control quality)
 *   - AGENTS.md §17 (Motion and interaction)
 *   - AGENTS.md §27.3 (Flagship spring configs)
 */
import React, { useCallback } from 'react';
import { StyleSheet, ActivityIndicator, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useReducedMotion } from 'react-native-reanimated';

import { CreatorGlyph, type CreatorGlyphName } from './CreatorGlyph';
import { Control, Radius } from '../../theme/designTokens';
import { Motion, REDUCED_SPRING } from '../../theme/motionTokens';
import { useAppTheme } from '../../theme/ThemeContext';
import { useHaptic } from '../../hooks/useHaptic';

// ── Constants ────────────────────────────────────────────────────────

/** Preferred hit target (48pt per spec). */
const HIT_TARGET = 48;
/** Minimum hit target (44pt per AGENTS.md §4). */
const HIT_MIN = Control.hit;
/** Selected backplate size (32pt rounded square per spec). */
const BACKPLATE_SIZE = 32;
/** Visible glyph size (22–24pt per spec). */
const GLYPH_SIZE = 23;
/** Press scale per spec and AGENTS.md §27.9. */
const PRESS_SCALE = 0.97;
/** Disabled opacity per spec. */
const DISABLED_OPACITY = 0.4;
/** Selected backplate opacity (accent at 12%). */
const SELECTED_BACKPLATE_ALPHA = 0.12;
/** Overlay backplate opacity for media contrast. */
const OVERLAY_OPACITY = 0.35;

// ── Props ────────────────────────────────────────────────────────────

export interface CreatorIconButtonProps {
  /** Creator glyph name (custom SVG). Use `icon` for Ionicons. */
  glyph?: CreatorGlyphName;
  /** Ionicons name for universally understood actions. */
  icon?: string;
  /** Glyph size override (default 23). */
  size?: number;
  /** Glyph color. Defaults to theme textSecondary; accent when selected. */
  color?: string;
  /** Selected/active state — shows filled backplate. */
  selected?: boolean;
  /** Disabled state — 0.4 opacity, no press. */
  disabled?: boolean;
  /** Loading state — replaces glyph with spinner. */
  loading?: boolean;
  /** Press handler. */
  onPress?: () => void;
  /** Accessibility label (required for icon-only controls). */
  accessibilityLabel: string;
  /** Optional accessibility hint. */
  accessibilityHint?: string;
  /** Test ID. */
  testID?: string;
  /** Hit target size (default 48). */
  hitTarget?: number;
  /** When true, adds a tiny dark translucent backplate for media contrast. */
  overlay?: boolean;
}

// ── Component ────────────────────────────────────────────────────────

export function CreatorIconButton({
  glyph,
  icon,
  size = GLYPH_SIZE,
  color,
  selected = false,
  disabled = false,
  loading = false,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  testID,
  hitTarget = HIT_TARGET,
  overlay = false,
}: CreatorIconButtonProps): React.ReactElement {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const reduceMotion = useReducedMotion();

  const pressedSV = useSharedValue(0);

  // Resolve glyph color: explicit > selected accent > theme secondary
  const resolvedColor = color ?? (selected ? colors.brand : colors.textSecondary);

  // Spring config for press feedback (tap config per AGENTS.md §27.3)
  const springConfig = reduceMotion ? REDUCED_SPRING : Motion.spring.tap;

  const handlePressIn = useCallback(() => {
    if (disabled || loading) return;
    pressedSV.value = withSpring(1, springConfig);
  }, [disabled, loading, pressedSV, springConfig]);

  const handlePressOut = useCallback(() => {
    if (disabled || loading) return;
    pressedSV.value = withSpring(0, springConfig);
  }, [disabled, loading, pressedSV, springConfig]);

  const handlePress = useCallback(() => {
    if (disabled || loading) return;
    haptic.selection();
    onPress?.();
  }, [disabled, loading, haptic, onPress]);

  // Animated scale style — runs on UI thread for 60fps
  const animatedStyle = useAnimatedStyle(() => {
    if (reduceMotion) {
      return {
        transform: [{ scale: 1 }],
        opacity: 1 - 0.3 * pressedSV.value,
      };
    }
    return {
      transform: [{ scale: 1 - (1 - PRESS_SCALE) * pressedSV.value }],
    };
  });

  // Selected backplate — single animated view, opacity 0→0.12
  const backplateStyle = useAnimatedStyle(() => {
    const target = selected ? SELECTED_BACKPLATE_ALPHA : 0;
    if (reduceMotion) {
      return { opacity: target };
    }
    return {
      opacity: withTiming(target, {
        duration: Motion.duration.fast,
        easing: Easing.out(Easing.cubic),
      }),
    };
  });

  const isDisabled = disabled || loading;
  const targetSize = Math.max(hitTarget, HIT_MIN);

  return (
    <Pressable
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{
        disabled: isDisabled || undefined,
        selected: selected || undefined,
      }}
      testID={testID}
      hitSlop={{ top: 2, bottom: 2, left: 2, right: 2 }}
      style={{ width: targetSize, height: targetSize, opacity: disabled ? DISABLED_OPACITY : 1 }}
    >
      {/* Selected backplate — 32pt rounded square, accent at 12% opacity */}
      <Reanimated.View
        style={[
          styles.backplate,
          {
            width: BACKPLATE_SIZE,
            height: BACKPLATE_SIZE,
            borderRadius: Radius.sm,
            backgroundColor: colors.brand,
          },
          backplateStyle,
        ]}
        pointerEvents="none"
      />

      {/* Media contrast overlay — tiny dark translucent backplate */}
      {overlay && !selected && (
        <View
          style={[
            styles.overlay,
            {
              width: BACKPLATE_SIZE,
              height: BACKPLATE_SIZE,
              borderRadius: Radius.sm,
              backgroundColor: '#000000',
              opacity: OVERLAY_OPACITY,
            },
          ]}
          pointerEvents="none"
        />
      )}

      {/* Pressable content with animated scale */}
      <Reanimated.View style={[styles.content, animatedStyle]}>
        {loading ? (
          <ActivityIndicator size="small" color={resolvedColor} />
        ) : glyph ? (
          <CreatorGlyph
            name={glyph}
            size={size}
            color={resolvedColor}
            selected={selected}
          />
        ) : icon ? (
          <Ionicons name={icon as React.ComponentProps<typeof Ionicons>['name']} size={size} color={resolvedColor} />
        ) : null}
      </Reanimated.View>
    </Pressable>
  );
}

// ── Styles ───────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  backplate: {
    position: 'absolute',
    alignSelf: 'center',
  },
  overlay: {
    position: 'absolute',
    alignSelf: 'center',
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
});

export default CreatorIconButton;
