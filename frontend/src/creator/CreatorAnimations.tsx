/**
 * CreatorAnimations — shared animated primitives for the creator studio.
 *
 * PressScale: wraps any Pressable with spring-based press feedback (scale 0.97–0.98).
 * SheetContainer: animated bottom-sheet wrapper with slide-up spring, backdrop fade,
 *   16px top corner radius, and 32px grabber handle.
 *
 * Motion specs follow AGENTS.md §17:
 *   - 160–220ms for transitions
 *   - spring only where spatial continuity benefits
 *   - no bounce, no continuous pulsing (except empty-state icon)
 *   - reduced-motion fallback: instant
 */
import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Pressable, PressableProps, ViewStyle, Dimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Space, Radius } from '../theme/designTokens';
import { Motion } from '../theme/motionTokens';
import { useAppTheme } from '../theme/ThemeContext';

// ── Timing presets ─────────────────────────────────────────────────
const TIMING_SNAP = { duration: Motion.duration.fast, easing: Easing.out(Easing.cubic) };
const TIMING_SHEET = { duration: Motion.duration.slow, easing: Easing.out(Easing.cubic) };

// ── PressScale ─────────────────────────────────────────────────────
// Wraps a Pressable with spring-based scale-on-press feedback.
// iconOnly → scale 0.97, text → scale 0.98, opacity 0.7

interface PressScaleProps extends Omit<PressableProps, 'style'> {
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
  scale?: number; // override default scale
  accessibilityLabel: string;
  accessibilityRole?: 'button' | 'image' | 'link';
  disabled?: boolean;
}

export function PressScale({
  children,
  style,
  scale,
  accessibilityLabel,
  accessibilityRole = 'button',
  disabled,
  onPressIn,
  onPressOut,
  ...rest
}: PressScaleProps) {
  const reduceMotion = useReducedMotion();
  const pressedSV = useSharedValue(0);
  const defaultScale = scale ?? 0.97;

  const animatedStyle = useAnimatedStyle(() => {
    if (reduceMotion) {
      return { transform: [{ scale: 1 }], opacity: pressedSV.value > 0 ? 0.7 : 1 };
    }
    return {
      transform: [{ scale: 1 - (1 - defaultScale) * pressedSV.value }],
      opacity: 1 - 0.3 * pressedSV.value,
    };
  });

  return (
    <Pressable
      {...rest}
      disabled={disabled}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityRole}
      onPressIn={(e) => {
        pressedSV.value = withTiming(1, TIMING_SNAP);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        pressedSV.value = withTiming(0, TIMING_SNAP);
        onPressOut?.(e);
      }}
    >
      <Reanimated.View style={[animatedStyle, style]}>
        {children}
      </Reanimated.View>
    </Pressable>
  );
}

// ── SheetContainer ─────────────────────────────────────────────────
// Animated bottom sheet with:
//   - 16px top corner radius
//   - 32px grabber handle
//   - slide-up spring (damping 28, stiffness 380)
//   - backdrop fade (160ms)
//   - reduced-motion: instant

interface SheetContainerProps {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  maxHeight?: number; // fraction of screen, default 0.85
}

export function SheetContainer({
  visible,
  onClose,
  children,
  maxHeight = 0.85,
}: SheetContainerProps) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const translateY = useSharedValue(1000);
  const backdropOpacity = useSharedValue(0);
  const mountedRef = useRef(false);
  const sheetHeightRef = useRef(Dimensions.get('window').height * maxHeight);
  const isDismissingRef = useRef(false);

  useEffect(() => {
    if (visible) {
      mountedRef.current = true;
      isDismissingRef.current = false;
      if (reduceMotion) {
        translateY.value = 0;
        backdropOpacity.value = 1;
      } else {
        translateY.value = withTiming(0, TIMING_SHEET);
        backdropOpacity.value = withTiming(1, { duration: 160, easing: Easing.out(Easing.ease) });
      }
    } else if (mountedRef.current) {
      if (reduceMotion) {
        translateY.value = 1000;
        backdropOpacity.value = 0;
      } else {
        translateY.value = withTiming(1000, { duration: 180, easing: Easing.in(Easing.ease) });
        backdropOpacity.value = withTiming(0, { duration: 160 });
      }
    }
  }, [visible, reduceMotion, translateY, backdropOpacity]);

  // ── Swipe-down-to-dismiss ──────────────────────────────────────────
  // The sheet follows the finger (translateY) during the pan. On release,
  // if the user has dragged past a threshold (100pt or 25% of sheet height),
  // the sheet dismisses via onClose(). Otherwise it springs back to 0.
  // Reduced motion: instant dismiss on any downward swipe.
  const DISMISS_THRESHOLD = Math.max(100, sheetHeightRef.current * 0.25);

  const panGesture = Gesture.Pan()
    .activeOffsetY(10)
    .onUpdate((e) => {
      // Only follow downward drags; clamp at 0 so the sheet can't be
      // dragged up beyond its resting position.
      translateY.value = Math.max(0, e.translationY);
    })
    .onEnd((e) => {
      if (isDismissingRef.current) return;
      const dragged = e.translationY;
      if (dragged > DISMISS_THRESHOLD) {
        isDismissingRef.current = true;
        if (reduceMotion) {
          translateY.value = 1000;
          backdropOpacity.value = 0;
          runOnJS(onClose)();
        } else {
          translateY.value = withTiming(1000, { duration: 180, easing: Easing.in(Easing.ease) });
          backdropOpacity.value = withTiming(0, { duration: 160 });
          // Fire onClose after the dismiss animation completes.
          setTimeout(() => {
            runOnJS(onClose)();
          }, 200);
        }
      } else {
        // Spring back to rest.
        translateY.value = reduceMotion
          ? withTiming(0, { duration: 0 })
          : withSpring(0, Motion.spring.glide);
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  if (!visible && !mountedRef.current) return null;

  return (
    <View style={[StyleSheet.absoluteFill, sheetStyles.layer]} pointerEvents={visible ? 'auto' : 'none'}>
      {/* Backdrop */}
      <Reanimated.View style={[StyleSheet.absoluteFill, backdropStyle, { backgroundColor: colors.overlay }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} accessibilityLabel="Close sheet" accessibilityHint="Dismisses the sheet" accessibilityRole="button" />
      </Reanimated.View>

      {/* Sheet — swipe-down-to-dismiss via GestureDetector */}
      <GestureDetector gesture={panGesture}>
        <Reanimated.View
          style={[
            sheetStyles.sheet,
            {
              backgroundColor: colors.surface,
              borderTopLeftRadius: Radius.xl,
              borderTopRightRadius: Radius.xl,
              maxHeight: `${maxHeight * 100}%`,
              paddingBottom: Math.max(insets.bottom, Space.lg),
            },
            sheetStyle,
          ]}
          onLayout={(e) => {
            sheetHeightRef.current = e.nativeEvent.layout.height;
          }}
        >
          {/* Grabber handle — primary gesture anchor (whole sheet is pannable) */}
          <View style={sheetStyles.handleContainer}>
            <View style={[sheetStyles.handle, { backgroundColor: colors.borderSubtle }]} />
          </View>
          {children}
        </Reanimated.View>
      </GestureDetector>
    </View>
  );
}

const sheetStyles = StyleSheet.create({
  layer: {
    zIndex: 300,
    elevation: 24,
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingTop: Space.xs,
  },
  handleContainer: {
    alignItems: 'center',
    paddingVertical: Space.xs,
  },
  handle: {
    width: 32,
    height: 4,
    borderRadius: Radius.sm,
  },
});
