import React from 'react';
import {
  Pressable,
  PressableProps,
  StyleProp,
  ViewStyle,
} from 'react-native';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useHaptic } from '../hooks/useHaptic';
import { useMotionConfig } from '../hooks/useMotionConfig';
import { Motion } from '../theme/motionTokens';
import { hapticForScale, triggerHaptic, HapticType } from '../utils/haptics';
import { HapticPatterns } from '../utils/hapticPatterns';

type HapticFeedbackStyle = 'none' | 'light' | 'medium' | 'heavy' | 'selection';

interface Props extends Omit<PressableProps, 'style' | 'children' | 'hitSlop'> {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  scaleValue?: number;
  activeOpacity?: number;
  disableAnimation?: boolean;
  hapticFeedback?: HapticFeedbackStyle;
  /** When true, automatically selects haptic intensity based on scaleValue. Overrides hapticFeedback. */
  autoHaptic?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  /**
   * Hit-slop padding expands the tappable area beyond the visible bounds.
   * Defaults to 8pt on all sides so small icon-only controls meet the
   * WCAG 2.2 SC 2.5.8 minimum 24×24 CSS-pixel touch target, and help
   * approach the 44×44pt recommended target (AGENTS.md §13).
   */
  hitSlop?: PressableProps['hitSlop'];
}

const AnimatedNativePressable = Reanimated.createAnimatedComponent(Pressable);

/**
 * Default hit-slop — 8pt on all sides. This expands small icon-only controls
 * (e.g. 20–24pt glyphs) to meet the WCAG 2.2 SC 2.5.8 minimum 24×24 CSS-pixel
 * touch target and helps approach the 44×44pt recommended target.
 * Callers can override with a custom `hitSlop` prop.
 */
const DEFAULT_HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 };

export function AnimatedPressable({
  children,
  onPress,
  onLongPress,
  onPressIn,
  onPressOut,
  style,
  scaleValue = 0.96,
  disableAnimation = false,
  disabled = false,
  activeOpacity = 0.65,
  hapticFeedback = 'none',
  autoHaptic = false,
  accessibilityState,
  accessibilityRole,
  hitSlop,
  ...rest
}: Props) {
  const haptic = useHaptic();
  const { spring, isEnabled } = useMotionConfig();
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  const triggerHapticFeedback = React.useCallback(() => {
    if (autoHaptic && scaleValue < 1) {
      triggerHaptic(hapticForScale(scaleValue));
      return;
    }

    if (hapticFeedback === 'none') {
      return;
    }

    if (hapticFeedback === 'selection') {
      haptic.selection();
      return;
    }

    if (hapticFeedback === 'heavy') {
      haptic.heavy();
      return;
    }

    if (hapticFeedback === 'medium') {
      haptic.medium();
      return;
    }

    haptic.light();
  }, [haptic, hapticFeedback, autoHaptic, scaleValue]);

  const animStyle = useAnimatedStyle(() => {
    'worklet';
    return {
      transform: [{ scale: scale.value }],
      opacity: opacity.value,
    };
  });

  const mergedAccessibilityState = React.useMemo(
    () => ({
      ...(accessibilityState ?? {}),
      disabled: !!disabled,
    }),
    [accessibilityState, disabled]
  );

  return (
    <AnimatedNativePressable
      style={[style, animStyle]}
      accessible={true}
      accessibilityRole={accessibilityRole ?? 'button'}
      accessibilityState={mergedAccessibilityState}
      hitSlop={hitSlop ?? DEFAULT_HIT_SLOP}
      onPressIn={(event) => {
        if (!disabled && !disableAnimation) {
          // Spring-based scale feedback — settles naturally like a physical
          // press. When reduced motion is on, the spring is critically
          // damped so the scale change is effectively instant.
          scale.value = withSpring(scaleValue, spring.press);
        }
        if (typeof activeOpacity === 'number') {
          opacity.value = withTiming(activeOpacity, {
            duration: isEnabled ? Motion.duration.fast : 0,
          });
        }
        if (!disabled) {
          triggerHapticFeedback();
        }
        if (onPressIn) {
          onPressIn(event);
        }
      }}
      onPressOut={(event) => {
        if (!disableAnimation) {
          scale.value = withSpring(1, spring.press);
        }
        if (typeof activeOpacity === 'number') {
          opacity.value = withTiming(1, {
            duration: isEnabled ? Motion.duration.fast : 0,
          });
        }
        if (onPressOut) {
          onPressOut(event);
        }
      }}
      onPress={disabled ? undefined : onPress}
      onLongPress={disabled ? undefined : (event) => {
        // Compound long-press haptic — heavy impact communicates the
        // reveal/peek moment (per AGENTS.md §13 haptic level).
        HapticPatterns.longPress();
        if (onLongPress) onLongPress(event);
      }}
      {...rest}
    >
      {children}
    </AnimatedNativePressable>
  );
}