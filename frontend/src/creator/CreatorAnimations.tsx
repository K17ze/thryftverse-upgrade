/**
 * CreatorAnimations — shared animated primitives for the creator studio.
 *
 * PressScale: wraps any Pressable with spring-based press feedback (scale 0.97–0.98).
 * SheetContainer: animated bottom-sheet wrapper with slide-up timing entrance,
 *   velocity-aware swipe-to-dismiss, backdrop fade, 24px top corner radius,
 *   solid elevated surface + 1pt hairline, and an optional title + Done header.
 *
 * Motion specs follow AGENTS.md §17:
 *   - 160–220ms for transitions
 *   - spring only where spatial continuity benefits
 *   - no bounce, no continuous pulsing (except empty-state icon)
 *   - reduced-motion fallback: instant
 */
import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Pressable, PressableProps, ViewStyle, useWindowDimensions, Text } from 'react-native';
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
import { TypographyV2 } from '../theme/typography.v2';
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
  accessibilityRole?: 'button' | 'image' | 'link' | 'menuitem';
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
//   - 24px top corner radius (Radius.xxl)
//   - 36x5 grabber handle in a 44pt accessible target
//   - slide-up entrance (220ms ease-out, no spring bounce)
//   - velocity-aware swipe-to-dismiss (off-screen target = window height)
//   - backdrop fade (180ms)
//   - solid surfaceElevated background + 1pt top hairline (no glass/blur)
//   - optional title + Done header
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
  /** Optional title shown in a header row with a Done button. When omitted,
   *  no header is rendered (the caller provides its own header/content). */
  title?: string;
  /** Accessibility hint for the Done button. Defaults to "Closes this panel". */
  doneHint?: string;
}

export function SheetContainer({
  visible,
  onClose,
  children,
  maxHeight,
  compact = false,
  title,
  doneHint = 'Closes this panel',
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
        // Sheet entrance — 220ms ease-out timing, no spring bounce.
        translateY.value = withTiming(0, { duration: Motion.duration.slow, easing: Motion.easing.entrance });
        backdropOpacity.value = withTiming(1, { duration: Motion.duration.normal, easing: Motion.easing.entrance });
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
  // the decision to dismiss vs snap back is velocity-aware: a fast downward
  // flick dismisses even below the distance threshold, and a slow drag must
  // cross the threshold. The off-screen target is the full window height so
  // the sheet fully exits regardless of its own height. Reduced motion:
  // instant dismiss on any downward swipe.
  const DISMISS_THRESHOLD = Math.max(100, sheetHeightRef.current * 0.25);
  const DISMISS_VELOCITY = 500;
  const offScreenTarget = windowHeight;

  const panGesture = Gesture.Pan()
    .activeOffsetY(10)
    .onUpdate((e) => {
      // Only follow downward drags; clamp at 0 so the sheet can't be
      // dragged up beyond its resting position.
      translateY.value = Math.max(0, e.translationY);
    })
    .onEnd((e) => {
      if (isDismissingRef.current) return;
      const shouldDismiss = e.translationY > DISMISS_THRESHOLD || e.velocityY > DISMISS_VELOCITY;
      if (shouldDismiss) {
        isDismissingRef.current = true;
        if (reduceMotion) {
          translateY.value = offScreenTarget;
          backdropOpacity.value = 0;
          runOnJS(onClose)();
        } else {
          translateY.value = withTiming(offScreenTarget, { duration: Motion.duration.slow, easing: Easing.in(Easing.ease) });
          backdropOpacity.value = withTiming(0, { duration: Motion.duration.normal });
          // Fire onClose after the dismiss animation completes.
          setTimeout(() => {
            runOnJS(onClose)();
          }, 280);
        }
      } else {
        // Settle back to rest — 200ms ease-out, no spring overshoot.
        translateY.value = reduceMotion
          ? withTiming(0, { duration: 0 })
          : withTiming(0, { duration: Motion.duration.normal, easing: Motion.easing.entrance });
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
          Solid elevated surface with a 1pt top hairline. No glass/blur —
          per AGENTS.md §4, glass effects are an AI tell on content chrome. */}
      <GestureDetector gesture={panGesture}>
        <Reanimated.View
          style={[
            sheetStyles.sheet,
            {
              borderTopLeftRadius: Radius.xxl,
              borderTopRightRadius: Radius.xxl,
              maxHeight: `${effectiveMaxHeight * 100}%`,
              paddingBottom: Math.max(insets.bottom, Space.lg),
              overflow: 'hidden',
              backgroundColor: colors.surfaceElevated,
            },
            sheetStyle,
          ]}
          onLayout={(e) => {
            sheetHeightRef.current = e.nativeEvent.layout.height;
          }}
        >
          {/* 1pt top hairline — gives the solid sheet edge definition */}
          <View style={[sheetStyles.hairlineTop, { backgroundColor: colors.border }]} />
          {/* Grabber handle — primary gesture anchor (whole sheet is pannable).
              Wrapped in a 44pt accessible target per AGENTS.md §4. */}
          <View
            style={sheetStyles.handleContainer}
            accessibilityRole="adjustable"
            accessibilityLabel="Drag down to close"
          >
            <View style={[sheetStyles.handle, { backgroundColor: colors.textMuted }]} />
          </View>
          {/* Optional title + Done header (used by GlassSheet and any
              caller that passes the `title` prop). */}
          {title && (
            <View style={[sheetStyles.header, { borderBottomColor: colors.border }]}>
              <Text style={[sheetStyles.title, { color: colors.textPrimary }]}>{title}</Text>
              <PressScale
                onPress={onClose}
                style={sheetStyles.doneBtn}
                accessibilityLabel="Done"
                accessibilityHint={doneHint}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Text style={[sheetStyles.doneText, { color: colors.brand }]}>Done</Text>
              </PressScale>
            </View>
          )}
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
    justifyContent: 'center',
    minWidth: 44,
    minHeight: 44,
    paddingVertical: Space.xs,
  },
  handle: {
    width: 36,
    height: 5,
    borderRadius: 2.5,
    opacity: 0.3,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: {
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    fontSize: TypographyV2.bodyStrong.size,
  },
  doneBtn: {
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  doneText: {
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    fontSize: TypographyV2.body.size,
  },
});
