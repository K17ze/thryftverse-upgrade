/**
 * CreatorPrimaryButton — full-width primary action button.
 *
 * Features:
 *   - Filled with theme accent color
 *   - 48pt height minimum
 *   - Press scale 0.97
 *   - Loading spinner replaces label
 *   - Disabled at 0.4 opacity
 *   - Corner radius 12pt
 *   - Bold label
 *   - Light haptic on press
 *   - Reduced-motion: fade instead of spring
 *
 * Design references:
 *   - 05_ICONS_BUTTONS_CONTROL_CRAFT.md §2
 *   - AGENTS.md §13 (Control quality — primary actions visually dominant)
 *   - AGENTS.md §17 (Motion and interaction)
 *   - AGENTS.md §27.3 (Flagship spring configs — tap)
 */
import React, { useCallback } from 'react';
import { StyleSheet, Pressable, ActivityIndicator, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { useReducedMotion } from 'react-native-reanimated';

import { CreatorGlyph, type CreatorGlyphName } from './CreatorGlyph';
import { Radius, Space } from '../../theme/designTokens';
import { Motion, REDUCED_SPRING } from '../../theme/motionTokens';
import { FontFamily } from '../../theme/designTokens';
import { useAppTheme } from '../../theme/ThemeContext';
import { useHaptic } from '../../hooks/useHaptic';

// ── Constants ────────────────────────────────────────────────────────

const MIN_HEIGHT = 48;
const PRESS_SCALE = 0.97;
const DISABLED_OPACITY = 0.4;
const LABEL_SIZE = 15;
const ICON_SIZE = 20;

// ── Props ────────────────────────────────────────────────────────────

export interface CreatorPrimaryButtonProps {
  /** Button label text. */
  label: string;
  /** Press handler. */
  onPress?: () => void;
  /** Disabled state. */
  disabled?: boolean;
  /** Loading state — spinner replaces label. */
  loading?: boolean;
  /** Optional leading icon (Ionicons name). */
  icon?: string;
  /** Optional leading creator glyph. */
  glyph?: CreatorGlyphName;
  /** Accessibility label override. */
  accessibilityLabel?: string;
  /** Test ID. */
  testID?: string;
}

// ── Component ────────────────────────────────────────────────────────

export function CreatorPrimaryButton({
  label,
  onPress,
  disabled = false,
  loading = false,
  icon,
  glyph,
  accessibilityLabel,
  testID,
}: CreatorPrimaryButtonProps): React.ReactElement {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const reduceMotion = useReducedMotion();

  const pressedSV = useSharedValue(0);
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

  const isDisabled = disabled || loading;
  const labelColor = colors.textInverse;
  const iconColor = labelColor;

  return (
    <Pressable
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: isDisabled || undefined }}
      testID={testID}
      style={{ opacity: disabled ? DISABLED_OPACITY : 1 }}
    >
      <Reanimated.View
        style={[
          styles.button,
          { backgroundColor: colors.brand, borderRadius: Radius.lg },
          animatedStyle,
        ]}
      >
        {loading ? (
          <ActivityIndicator size="small" color={labelColor} />
        ) : (
          <View style={styles.content}>
            {(icon || glyph) && (
              <View style={styles.iconWrap}>
                {glyph ? (
                  <CreatorGlyph name={glyph} size={ICON_SIZE} color={iconColor} />
                ) : icon ? (
                  <Ionicons
                    name={icon as React.ComponentProps<typeof Ionicons>['name']}
                    size={ICON_SIZE}
                    color={iconColor}
                  />
                ) : null}
              </View>
            )}
            <Reanimated.Text
              style={[styles.label, { color: labelColor }]}
              numberOfLines={1}
            >
              {label}
            </Reanimated.Text>
          </View>
        )}
      </Reanimated.View>
    </Pressable>
  );
}

// ── Styles ───────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  button: {
    minHeight: MIN_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.xs,
  },
  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontFamily: FontFamily.bold,
    fontSize: LABEL_SIZE,
    letterSpacing: 0,
  },
});

export default CreatorPrimaryButton;
