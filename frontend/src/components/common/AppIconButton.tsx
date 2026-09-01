/**
 * AppIconButton — Flagship Interactive Icon Button Primitive
 *
 * Authored according to AGENTS.md §4, §13, §17 & Design.md:
 * 1. Decoupled Hit Target: Guarantees 44pt minimum touch target without artificial grey boxes.
 * 2. Transparent by Default: No decorative circles or pills; visible containment only when needed.
 * 3. Native Spring Feedback: 0.97 scale tap spring with reduced-motion support.
 * 4. Light Haptics: Tactile feedback on press.
 * 5. Optical Glyph Scaling: Uses normalized IconSize tokens.
 */

import React, { useCallback, memo } from 'react';
import {
  StyleSheet,
  Pressable,
  View,
  Text,
  ActivityIndicator,
  type StyleProp,
  type ViewStyle,
  type GestureResponderEvent,
} from 'react-native';
import { BlurView } from 'expo-blur';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useReducedMotion } from 'react-native-reanimated';

import { AppIcon, type AppIconProps } from './AppIcon';
import {
  IconSize,
  IconHitTarget,
  type IconSizeKey,
  type IoniconsGlyphName,
  type SemanticIconName,
} from '../../theme/iconTokens';
import { Control, Radius, Space, Stroke } from '../../theme/designTokens';
import { Motion, REDUCED_SPRING } from '../../theme/motionTokens';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { useHaptic } from '../../hooks/useHaptic';

const AnimatedPressable = Reanimated.createAnimatedComponent(Pressable);

export interface AppIconButtonProps {
  /**
   * Semantic name ('heart', 'cart', 'search', etc.) or direct Ionicons name.
   */
  name: SemanticIconName | IoniconsGlyphName;
  /**
   * Action triggered on press.
   */
  onPress?: (event: GestureResponderEvent) => void;
  /**
   * Action triggered on long press.
   */
  onLongPress?: (event: GestureResponderEvent) => void;
  /**
   * Optical glyph size ('sm' | 'md' | 'lg' | 'xl') or numeric point size. Defaults to 'lg' (24pt).
   */
  size?: IconSizeKey | number;
  /**
   * Glyph color token key or raw color string. Defaults to 'textPrimary'.
   */
  color?: keyof ThemeColors | string;
  /**
   * State variant of the icon: 'outline' vs 'filled'.
   */
  variant?: 'outline' | 'filled';
  /**
   * Visual button container style:
   * - 'ghost' (default): transparent background, 44pt touch hit target.
   * - 'contained': 36pt subtle surface for contrast over media or floating docks.
   * - 'blur': frosted glass blur container for camera/media overlays.
   * - 'tinted': subtle brand accent backplate for active/selected tools.
   */
  containerVariant?: 'ghost' | 'contained' | 'blur' | 'tinted';
  /**
   * Active / selected state boolean.
   */
  selected?: boolean;
  /**
   * Disabled state boolean.
   */
  disabled?: boolean;
  /**
   * Loading state boolean (replaces glyph with spinner).
   */
  loading?: boolean;
  /**
   * Badge counter number or custom string badge.
   */
  badgeCount?: number;
  /**
   * Custom badge label.
   */
  badgeLabel?: string;
  /**
   * Accessibility label for screen readers (required for accessibility).
   */
  accessibilityLabel: string;
  /**
   * Accessibility hint.
   */
  accessibilityHint?: string;
  /**
   * Target size override for the touch area (defaults to 44pt).
   */
  hitSize?: number;
  /**
   * Whether to trigger haptic feedback on press (default true).
   */
  enableHaptic?: boolean;
  /**
   * Custom container style override.
   */
  style?: StyleProp<ViewStyle>;
  /**
   * Optional testID.
   */
  testID?: string;
}

export const AppIconButton = memo(function AppIconButton({
  name,
  onPress,
  onLongPress,
  size = 'lg',
  color = 'textPrimary',
  variant = 'outline',
  containerVariant = 'ghost',
  selected = false,
  disabled = false,
  loading = false,
  badgeCount,
  badgeLabel,
  accessibilityLabel,
  accessibilityHint,
  hitSize = IconHitTarget.min,
  enableHaptic = true,
  style,
  testID,
}: AppIconButtonProps) {
  const { colors, isDark } = useAppTheme();
  const haptic = useHaptic();
  const reducedMotion = useReducedMotion();
  const scale = useSharedValue(1);

  const handlePressIn = useCallback(() => {
    if (disabled || loading) return;
    if (reducedMotion) {
      scale.value = withTiming(0.97, { duration: 80 });
    } else {
      scale.value = withSpring(0.97, Motion.spring.tap);
    }
  }, [disabled, loading, reducedMotion, scale]);

  const handlePressOut = useCallback(() => {
    if (disabled || loading) return;
    if (reducedMotion) {
      scale.value = withTiming(1, { duration: 120 });
    } else {
      scale.value = withSpring(1, Motion.spring.settle);
    }
  }, [disabled, loading, reducedMotion, scale]);

  const handlePress = useCallback(
    (event: GestureResponderEvent) => {
      if (disabled || loading) return;
      if (enableHaptic) {
        haptic.light();
      }
      onPress?.(event);
    },
    [disabled, loading, enableHaptic, haptic, onPress]
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  // Resolve glyph color based on state
  let resolvedColor: keyof ThemeColors | string = color;
  if (selected && containerVariant === 'tinted') {
    resolvedColor = 'brand';
  } else if (disabled) {
    resolvedColor = 'textMuted';
  }

  // Determine badge text
  const displayBadge =
    (badgeCount !== undefined && badgeCount > 0) || Boolean(badgeLabel);
  const formattedBadge =
    badgeLabel ?? (badgeCount && badgeCount > 99 ? '99+' : String(badgeCount));

  // Resolved container visual styles
  const isContained = containerVariant === 'contained';
  const isBlur = containerVariant === 'blur';
  const isTinted = containerVariant === 'tinted';

  const containerVisualSize = isContained || isBlur || isTinted ? 36 : hitSize;

  return (
    <AnimatedPressable
      onPress={handlePress}
      onLongPress={onLongPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled || loading}
      accessible={true}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled, selected, busy: loading }}
      testID={testID}
      style={[
        styles.hitTarget,
        { width: hitSize, height: hitSize },
        style,
        animatedStyle,
      ]}
    >
      <View
        style={[
          styles.visualContainer,
          {
            width: containerVisualSize,
            height: containerVisualSize,
            borderRadius: containerVisualSize / 2,
          },
          isContained && {
            backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
          },
          isTinted && {
            backgroundColor: selected ? colors.brandSubtle : 'transparent',
            borderColor: selected ? colors.brand : 'transparent',
            borderWidth: selected ? Stroke.standard : 0,
          },
          disabled && styles.disabled,
        ]}
      >
        {isBlur && (
          <BlurView
            intensity={isDark ? 60 : 80}
            tint={isDark ? 'dark' : 'light'}
            style={[
              StyleSheet.absoluteFill,
              { borderRadius: containerVisualSize / 2, overflow: 'hidden' },
            ]}
          />
        )}

        {loading ? (
          <ActivityIndicator
            size="small"
            color={
              typeof resolvedColor === 'string' && resolvedColor in colors
                ? (colors[resolvedColor as keyof ThemeColors] as string)
                : (resolvedColor as string)
            }
          />
        ) : (
          <AppIcon
            name={name}
            size={size}
            color={resolvedColor}
            variant={selected ? 'filled' : variant}
            accessible={false}
          />
        )}

        {displayBadge && (
          <View
            style={[
              styles.badge,
              {
                backgroundColor: colors.danger,
                borderColor: colors.surface,
              },
            ]}
          >
            <Text
              style={[styles.badgeText, { color: colors.surface }]}
              numberOfLines={1}
            >
              {formattedBadge}
            </Text>
          </View>
        )}
      </View>
    </AnimatedPressable>
  );
});

const styles = StyleSheet.create({
  hitTarget: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: IconHitTarget.min,
    minHeight: IconHitTarget.min,
  },
  visualContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  disabled: {
    opacity: 0.4,
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.5,
    paddingHorizontal: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '700',
    lineHeight: 11,
    textAlign: 'center',
  },
});
