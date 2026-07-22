/**
 * CreatorAnimations — shared animated primitives for the creator studio.
 *
 * PressScale: wraps any Pressable with spring-based press feedback (scale 0.96–0.97).
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
import { View, StyleSheet, Pressable, PressableProps, ViewStyle } from 'react-native';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Space, Radius } from '../theme/designTokens';
import { useAppTheme } from '../theme/ThemeContext';

// ── Spring presets ─────────────────────────────────────────────────
const SPRING_SNAP = { damping: 25, stiffness: 400, mass: 1 };
const SPRING_SHEET = { damping: 28, stiffness: 380, mass: 1 };

// ── PressScale ─────────────────────────────────────────────────────
// Wraps a Pressable with spring-based scale-on-press feedback.
// iconOnly → scale 0.96, text → scale 0.97, opacity 0.7

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
  const defaultScale = scale ?? 0.96;

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
        pressedSV.value = withSpring(1, SPRING_SNAP);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        pressedSV.value = withSpring(0, SPRING_SNAP);
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

  useEffect(() => {
    if (visible) {
      mountedRef.current = true;
      if (reduceMotion) {
        translateY.value = 0;
        backdropOpacity.value = 1;
      } else {
        translateY.value = withSpring(0, SPRING_SHEET);
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
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close sheet" accessibilityRole="button" />
      </Reanimated.View>

      {/* Sheet */}
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
      >
        {/* Grabber handle */}
        <View style={sheetStyles.handleContainer}>
          <View style={[sheetStyles.handle, { backgroundColor: colors.borderSubtle }]} />
        </View>
        {children}
      </Reanimated.View>
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
    borderRadius: 2,
  },
});
