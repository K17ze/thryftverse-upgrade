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
import { View, StyleSheet, Pressable, PressableProps, ViewStyle, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { BlurView } from 'expo-blur';
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
import { Space, EditorRadius, EditorMaterial } from '../theme/designTokens';
import { Motion } from '../theme/motionTokens';
import { useAppTheme } from '../theme/ThemeContext';

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
      return { transform: [{ scale: 1 }] };
    }
    return {
      transform: [{ scale: 1 - (1 - defaultScale) * pressedSV.value }],
    };
  });

  return (
    <Pressable
      {...rest}
      disabled={disabled}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityRole}
      onPressIn={(e) => {
        pressedSV.value = withSpring(1, Motion.spring.tap);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        pressedSV.value = withSpring(0, Motion.spring.tap);
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
  /**
   * Compact mode (Snapchat/Instagram-style sticker tray):
   *   - shorter sheet (42% of screen height)
   *   - no dimming backdrop (canvas stays visible while browsing)
   *   - swipe-to-dismiss preserved
   * Default false keeps the existing full-sheet + backdrop behaviour.
   */
  compact?: boolean;
}

export function SheetContainer({
  visible,
  onClose,
  children,
  maxHeight,
  compact = false,
}: SheetContainerProps) {
  const effectiveMaxHeight = maxHeight ?? (compact ? 0.42 : 0.85);
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const { height: windowHeight } = useWindowDimensions();
  const translateY = useSharedValue(1000);
  const backdropOpacity = useSharedValue(0);
  const mountedRef = useRef(false);
  // Live window height (not module-level Dimensions.get) so the initial
  // estimate responds to rotation/multi-window before onLayout fires.
  const sheetHeightRef = useRef(windowHeight * effectiveMaxHeight);
  const isDismissingRef = useRef(false);

  // Keep the initial estimate in sync with window changes until onLayout
  // provides the measured sheet height.
  useEffect(() => {
    sheetHeightRef.current = windowHeight * effectiveMaxHeight;
  }, [windowHeight, effectiveMaxHeight]);

  useEffect(() => {
    if (visible) {
      mountedRef.current = true;
      isDismissingRef.current = false;
      if (reduceMotion) {
        translateY.value = 0;
        backdropOpacity.value = 1;
      } else {
        // Flagship sheet spring — physics-based settle, zero float.
        translateY.value = withSpring(0, Motion.spring.sheetFlagship);
        backdropOpacity.value = withTiming(1, { duration: Motion.duration.normal, easing: Easing.out(Easing.ease) });
      }
    } else if (mountedRef.current) {
      if (reduceMotion) {
        translateY.value = 1000;
        backdropOpacity.value = 0;
      } else {
        // Exit: timing-based slide down (ease-in accelerates away).
        translateY.value = withTiming(1000, { duration: Motion.duration.slow, easing: Easing.in(Easing.ease) });
        backdropOpacity.value = withTiming(0, { duration: Motion.duration.normal });
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
          translateY.value = withTiming(1000, { duration: Motion.duration.slow, easing: Easing.in(Easing.ease) });
          backdropOpacity.value = withTiming(0, { duration: Motion.duration.normal });
          // Fire onClose after the dismiss animation completes.
          setTimeout(() => {
            runOnJS(onClose)();
          }, 280);
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
    <View style={[StyleSheet.absoluteFill, sheetStyles.layer]} pointerEvents={compact ? 'box-none' : (visible ? 'auto' : 'none')}>
      {/* Backdrop — dimming scrim (skipped in compact mode so the canvas
          stays visible and interactive while browsing). */}
      {!compact && (
        <Reanimated.View style={[StyleSheet.absoluteFill, backdropStyle, { backgroundColor: colors.overlay }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} accessibilityLabel="Close sheet" accessibilityHint="Dismisses the sheet" accessibilityRole="button" />
        </Reanimated.View>
      )}

      {/* Sheet — swipe-down-to-dismiss via GestureDetector.
          Glass material: BlurView provides the translucent backdrop blur,
          the overlay color adds legibility/depth, and the hairline gives
          the glass edge definition. This matches the 2026 flagship editor
          sheet grammar (IG/Snapchat translucent dark sheets over media). */}
      <GestureDetector gesture={panGesture}>
        <Reanimated.View
          style={[
            sheetStyles.sheet,
            {
              borderTopLeftRadius: EditorRadius.sheet,
              borderTopRightRadius: EditorRadius.sheet,
              maxHeight: `${effectiveMaxHeight * 100}%`,
              paddingBottom: Math.max(insets.bottom, Space.lg),
              overflow: 'hidden',
            },
            sheetStyle,
          ]}
          onLayout={(e) => {
            sheetHeightRef.current = e.nativeEvent.layout.height;
          }}
        >
          {/* Glass blur layer */}
          <BlurView
            intensity={EditorMaterial.sheet.blurIntensity}
            tint={EditorMaterial.sheet.tint}
            style={[StyleSheet.absoluteFill, { borderTopLeftRadius: EditorRadius.sheet, borderTopRightRadius: EditorRadius.sheet }]}
          />
          {/* Overlay tint for legibility */}
          <View style={[StyleSheet.absoluteFill, { backgroundColor: EditorMaterial.sheet.overlay, borderTopLeftRadius: EditorRadius.sheet, borderTopRightRadius: EditorRadius.sheet }]} />
          {/* Hairline top edge */}
          <View style={[sheetStyles.hairlineTop, { backgroundColor: EditorMaterial.sheet.hairline }]} />
          {/* Grabber handle — primary gesture anchor (whole sheet is pannable) */}
          <View style={sheetStyles.handleContainer}>
            <View style={[sheetStyles.handle, { backgroundColor: 'rgba(255,255,255,0.30)' }]} />
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
  hairlineTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
  },
  handleContainer: {
    alignItems: 'center',
    paddingVertical: Space.xs,
  },
  handle: {
    width: 36,
    height: 5,
    borderRadius: 2.5,
  },
});
