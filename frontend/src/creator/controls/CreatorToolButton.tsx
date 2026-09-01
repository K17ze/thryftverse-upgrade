/**
 * CreatorToolButton — the main tool button for the ContextToolRail.
 *
 * Extends CreatorIconButton with:
 *   - Icon + optional label below (11pt, only for ambiguous tools)
 *   - Active state model: when `active` is true, shows selected backplate
 *     + glyph treatment
 *   - `selectedStyle='fill'`: filled backplate with accent
 *   - `selectedStyle='accent'`: accent-colored glyph (no backplate)
 *   - `selectedStyle='indicator'`: small dot indicator below glyph
 *   - Pinned state: small pin indicator in corner
 *   - 48pt hit target
 *   - Press scale 0.97 + light haptic
 *
 * Design references:
 *   - 05_ICONS_BUTTONS_CONTROL_CRAFT.md §3, §4, §5
 *   - AGENTS.md §4 (Separate hit area from visible shape)
 *   - AGENTS.md §13 (Control quality — selected state uses shape, not color alone)
 *   - AGENTS.md §17 (Motion and interaction)
 */
import React, { useCallback } from 'react';
import { StyleSheet, View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useReducedMotion } from 'react-native-reanimated';

import { CreatorGlyph, type CreatorGlyphName } from './CreatorGlyph';
import { Control, EditorRadius, Space } from '../../theme/designTokens';
import { Motion, REDUCED_SPRING } from '../../theme/motionTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { useAppTheme } from '../../theme/ThemeContext';
import { useHaptic } from '../../hooks/useHaptic';
import { AppIcon } from '../../components/common/AppIcon';
import { IconSize } from '../../theme/iconTokens';

// ── Constants ────────────────────────────────────────────────────────

const HIT_TARGET = 48;
const HIT_MIN = Control.hit;
const GLYPH_SIZE = 23;
const BACKPLATE_SIZE = 32;
const PRESS_SCALE = 0.97;
const DISABLED_OPACITY = 0.4;
const SELECTED_BACKPLATE_ALPHA = 0.12;
const INDICATOR_DOT_SIZE = 4;
const PIN_SIZE = 6;

// ── Types ────────────────────────────────────────────────────────────

export type SelectedStyle = 'fill' | 'accent' | 'indicator';

export interface CreatorToolButtonProps {
  /** Creator glyph name (custom SVG). Use `icon` for Ionicons. */
  glyph?: CreatorGlyphName;
  /** Ionicons name for universally understood actions. */
  icon?: string;
  /** Optional label below the icon (11pt, only for ambiguous tools). */
  label?: string;
  /** Active/selected state — drives the visual treatment. */
  active?: boolean;
  /** How to show the active state. Default 'fill'. */
  selectedStyle?: SelectedStyle;
  /** Pinned state — shows a small pin indicator in the corner. */
  pinned?: boolean;
  /** Disabled state. */
  disabled?: boolean;
  /** Loading state. */
  loading?: boolean;
  /** Press handler. */
  onPress?: () => void;
  /** Accessibility label (required). */
  accessibilityLabel: string;
  /** Optional accessibility hint. */
  accessibilityHint?: string;
  /** Test ID. */
  testID?: string;
}

// ── Component ────────────────────────────────────────────────────────

export function CreatorToolButton({
  glyph,
  icon,
  label,
  active = false,
  selectedStyle = 'fill',
  pinned = false,
  disabled = false,
  loading = false,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  testID,
}: CreatorToolButtonProps): React.ReactElement {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const reduceMotion = useReducedMotion();

  const pressedSV = useSharedValue(0);

  // Determine glyph color based on active state and selectedStyle
  const glyphColor = active
    ? selectedStyle === 'accent' || selectedStyle === 'fill'
      ? colors.brand
      : colors.textPrimary
    : colors.textSecondary;

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

  // Backplate only for 'fill' style
  const backplateStyle = useAnimatedStyle(() => {
    const showBackplate = active && selectedStyle === 'fill';
    const target = showBackplate ? SELECTED_BACKPLATE_ALPHA : 0;
    if (reduceMotion) {
      return { opacity: target };
    }
    return {
      opacity: withTiming(target, {
        duration: Motion.duration.fast,
        easing: Motion.easing.entrance,
      }),
    };
  });

  // Indicator dot for 'indicator' style
  const indicatorStyle = useAnimatedStyle(() => {
    const target = active && selectedStyle === 'indicator' ? 1 : 0;
    if (reduceMotion) {
      return { opacity: target };
    }
    return {
      opacity: withTiming(target, {
        duration: Motion.duration.fast,
        easing: Motion.easing.entrance,
      }),
    };
  });

  const isDisabled = disabled || loading;
  const targetSize = Math.max(HIT_TARGET, HIT_MIN);
  const showLabel = label !== undefined && label !== '';

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
        selected: active || undefined,
      }}
      testID={testID}
      hitSlop={{ top: 2, bottom: 2, left: 2, right: 2 }}
      style={{
        width: targetSize,
        minHeight: targetSize,
        opacity: disabled ? DISABLED_OPACITY : 1,
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
      }}
    >
      {/* Selected backplate (fill style only) — 10pt radius glass plate
          (2026 flagship: 4pt square → 10pt rounded, matches IG/Snapchat) */}
      <Reanimated.View
        style={[
          styles.backplate,
          {
            width: BACKPLATE_SIZE,
            height: BACKPLATE_SIZE,
            top: (targetSize - BACKPLATE_SIZE) / 2,
            borderRadius: EditorRadius.plate,
            backgroundColor: colors.brand,
          },
          backplateStyle,
        ]}
        pointerEvents="none"
      />

      {/* Pinned indicator — small pin in top-right corner */}
      {pinned && (
        <View
          style={[
            styles.pin,
            { backgroundColor: colors.brand },
          ]}
          pointerEvents="none"
        />
      )}

      {/* Content: glyph + optional label (animated scale) */}
      <Reanimated.View style={[styles.content, animatedStyle]}>
        {loading ? null : glyph ? (
          <CreatorGlyph
            name={glyph}
            size={IconSize.lg}
            color={glyphColor}
            selected={active}
          />
        ) : icon ? (
          <AppIcon
            name={icon}
            size={IconSize.lg}
            color={glyphColor}
            opticalCenter={true}
            accessible={false}
          />
        ) : null}

        {showLabel && (
          <Text
            style={[
              styles.label,
              { color: active ? colors.textPrimary : colors.textMuted },
            ]}
            numberOfLines={1}
          >
            {label}
          </Text>
        )}
      </Reanimated.View>

      {/* Indicator dot (indicator style only) */}
      <Reanimated.View
        style={[
          styles.indicator,
          { backgroundColor: colors.brand },
          indicatorStyle,
        ]}
        pointerEvents="none"
      />
    </Pressable>
  );
}

// ── Styles ───────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  backplate: {
    position: 'absolute',
    alignSelf: 'center',
  },
  pin: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: PIN_SIZE,
    height: PIN_SIZE,
    borderRadius: PIN_SIZE / 2,
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontFamily: TypographyV2.meta.fontFamily,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    letterSpacing: TypographyV2.meta.letterSpacing,
    marginTop: Space.xxs,
    textAlign: 'center',
  },
  indicator: {
    position: 'absolute',
    bottom: 0,
    width: INDICATOR_DOT_SIZE,
    height: INDICATOR_DOT_SIZE,
    borderRadius: INDICATOR_DOT_SIZE / 2,
    alignSelf: 'center',
  },
});

export default CreatorToolButton;
