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
  cancelAnimation,
} from 'react-native-reanimated';
import { useHaptic } from '../hooks/useHaptic';
import { useMotionConfig } from '../hooks/useMotionConfig';
import { hapticForScale, triggerHaptic } from '../utils/haptics';
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
const DEFAULT_HIT_SLOP = { top: 12, bottom: 12, left: 12, right: 12 };

/**
 * AnimatedPressable — the canonical pressable surface for ThryftVerse.
 *
 * Every tap feels native via:
 *   - spring-based scale feedback (0.97–0.985 per AGENTS §17, §27.9)
 *   - slight opacity response on press
 *   - haptic grammar gated by platform + reduced-motion (useHaptic)
 *   - 44pt hit target via default hitSlop
 *   - accessibility role/label/state
 *
 * Reduced motion: the spring is critically damped (settles instantly) and the
 * opacity timing collapses to 0ms, so the press still communicates state
 * change without visible travel (AGENTS §17, §27.2).
 */
export function AnimatedPressable({
  children,
  onPress,
  onLongPress,
  onPressIn,
  onPressOut,
  style,
  scaleValue = 0.98,
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
  const { spring, duration, isEnabled } = useMotionConfig();
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  // Cancel any in-flight animations on unmount. Without this, Reanimated's
  // worklet thread can try to synchronously update UI props on a view that
  // has already been unmounted (e.g. a FlashList item recycled away during
  // scroll). This causes RetryableMountingLayerException on Android Fabric.
  // Cancelling the animations stops the worklet from queuing prop updates
  // for a dead view tag.
  React.useEffect(() => {
    return () => {
      cancelAnimation(scale);
      cancelAnimation(opacity);
    };
  }, [scale, opacity]);

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

  // Press feedback timing: opacity uses the touch duration (80ms) so the
  // highlight arrives within the 100ms feedback budget (AGENTS §27.2).
  // Under reduced motion this collapses to 0ms via `duration.touch`.
  const pressOpacityMs = isEnabled ? duration.touch : 0;

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
          opacity.value = withTiming(activeOpacity, { duration: pressOpacityMs });
        }
        // Haptic moved to onPress — firing on press-in triggers haptics
        // on aborted scroll gestures (AGENTS.md P1-UI-2 fix).
        if (onPressIn) {
          onPressIn(event);
        }
      }}
      onPressOut={(event) => {
        if (!disableAnimation) {
          scale.value = withSpring(1, spring.press);
        }
        if (typeof activeOpacity === 'number') {
          opacity.value = withTiming(1, { duration: pressOpacityMs });
        }
        if (onPressOut) {
          onPressOut(event);
        }
      }}
      onPress={disabled ? undefined : (event) => {
        // Haptic fires on activation, not press-in, so aborted scroll
        // gestures don't trigger spurious haptics (AGENTS.md P1-UI-2).
        triggerHapticFeedback();
        if (onPress) onPress(event);
      }}
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
