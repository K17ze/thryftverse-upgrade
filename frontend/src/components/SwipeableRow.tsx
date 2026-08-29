import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  PanResponder,
  type PanResponderGestureState,
  type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS } from 'react-native-reanimated';

import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { useHaptic } from '../hooks/useHaptic';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useMotionConfig } from '../hooks/useMotionConfig';
import { Space, FontFamily, Control } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';

/**
 * A single swipe action revealed behind a SwipeableRow.
 * - `leftAction` is pinned to the leading edge and revealed by swiping right.
 * - `rightAction` is pinned to the trailing edge and revealed by swiping left.
 */
export interface SwipeAction {
  /** Ionicons outline glyph name. */
  icon: string;
  /** Short label announced to accessibility and shown under the glyph. */
  label: string;
  onPress: () => void;
  /** Optional accent fill. Defaults to a semantic token from the theme. */
  color?: string;
}

export interface SwipeableRowProps {
  children: React.ReactNode;
  /** Action revealed on the leading edge (swipe right). */
  leftAction?: SwipeAction;
  /** Action revealed on the trailing edge (swipe left). */
  rightAction?: SwipeAction;
  /** Fired on a long-press dwell. */
  onLongPress?: () => void;
  /** Horizontal distance (px) required to trigger an action. Default 80. */
  swipeThreshold?: number;
  /** Describes the row itself to assistive technology. */
  accessibilityLabel: string;
  /** Optional hint describing what activating the row does. */
  accessibilityHint?: string;
  /** Optional press handler for the row body (tap). */
  onPress?: () => void;
  style?: ViewStyle;
}

const DEFAULT_THRESHOLD = 80;
const LONG_PRESS_DELAY = 400;
// Maximum visual over-drag travel so the content stays connected to the edge.
const MAX_TRAVEL = 96;

/**
 * SwipeableRow — a reusable swipe-to-reveal row with compound gesture
 * haptics and Reanimated-driven translation.
 *
 * Design (AGENTS.md §4 / §13):
 * - The row content lives in a Reanimated.View that translates horizontally
 *   following the user's finger.
 * - Behind the content, coloured action panels (icon + label) are revealed.
 * - When the swipe crosses the threshold, a selection haptic fires once to
 *   mark the commitment point; on release past threshold the action runs.
 * - The row auto-animates back to centre on release or after an action fires.
 * - Haptics and motion are suppressed / collapsed when Reduce Motion is on.
 * - Full accessibility: the row is a button with a label, and the swipe
 *   actions are announced as labelled buttons.
 */
export function SwipeableRow({
  children,
  leftAction,
  rightAction,
  onLongPress,
  swipeThreshold = DEFAULT_THRESHOLD,
  accessibilityLabel,
  accessibilityHint,
  onPress,
  style }: SwipeableRowProps) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const reducedMotion = useReducedMotion();
  const { spring, isEnabled } = useMotionConfig();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  const translateX = useSharedValue(0);
  // 1 = threshold crossed (left), 2 = threshold crossed (right); 0 = idle.
  // Tracked on the UI thread so the animated style can react without JS hops.
  const crossedState = useSharedValue(0);

  // Refs hold the latest values for the PanResponder (created once).
  const thresholdRef = React.useRef(swipeThreshold);
  const reducedMotionRef = React.useRef(reducedMotion);
  const leftActionRef = React.useRef(leftAction);
  const rightActionRef = React.useRef(rightAction);
  const onLongPressRef = React.useRef(onLongPress);
  const onPressRef = React.useRef(onPress);

  React.useEffect(() => {
    thresholdRef.current = swipeThreshold;
    reducedMotionRef.current = reducedMotion;
    leftActionRef.current = leftAction;
    rightActionRef.current = rightAction;
    onLongPressRef.current = onLongPress;
    onPressRef.current = onPress;
  }, [swipeThreshold, reducedMotion, leftAction, rightAction, onLongPress, onPress]);

  const crossedRef = React.useRef(false);
  const longPressFiredRef = React.useRef(false);
  const longPressTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const movedRef = React.useRef(false);
  // When the row owns tap/long-press it claims the responder on touch start;
  // otherwise it only claims on horizontal move so an inner Pressable can keep
  // handling taps and long-presses (coexistence with nested pressables).
  const ownsTapGesturesRef = React.useRef(!!(onPress || onLongPress));

  React.useEffect(() => {
    ownsTapGesturesRef.current = !!(onPress || onLongPress);
  }, [onPress, onLongPress]);

  const clearLongPressTimer = React.useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const snapBack = React.useCallback(() => {
    if (reducedMotionRef.current) {
      translateX.value = withTiming(0, { duration: 0 });
    } else {
      translateX.value = withSpring(0, spring.press);
    }
    crossedState.value = 0;
  }, [translateX, crossedState, spring.press]);

  const fireHaptic = React.useCallback(() => {
    if (reducedMotionRef.current) return;
    haptic.selection();
  }, [haptic]);

  const triggerLeft = React.useCallback(() => {
    leftActionRef.current?.onPress?.();
    snapBack();
  }, [snapBack]);

  const triggerRight = React.useCallback(() => {
    rightActionRef.current?.onPress?.();
    snapBack();
  }, [snapBack]);

  const panResponder = React.useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => ownsTapGesturesRef.current,
        onMoveShouldSetPanResponder: (_e, g: PanResponderGestureState) =>
          Math.abs(g.dx) > 6 && Math.abs(g.dx) > Math.abs(g.dy),
        onPanResponderGrant: () => {
          crossedRef.current = false;
          longPressFiredRef.current = false;
          movedRef.current = false;
          if (onLongPressRef.current) {
            clearLongPressTimer();
            longPressTimerRef.current = setTimeout(() => {
              if (!movedRef.current) {
                longPressFiredRef.current = true;
                if (!reducedMotionRef.current) {
                  haptic.patterns.longPress();
                }
                onLongPressRef.current?.();
              }
            }, LONG_PRESS_DELAY);
          }
        },
        onPanResponderMove: (_e, g: PanResponderGestureState) => {
          if (Math.abs(g.dx) > 8 || Math.abs(g.dy) > 8) {
            movedRef.current = true;
            clearLongPressTimer();
          }
          // Only horizontal gestures drive the row; vertical drift is ignored
          // so the list can still scroll naturally.
          if (Math.abs(g.dy) > Math.abs(g.dx) && Math.abs(g.dx) < 16) {
            return;
          }
          const thr = thresholdRef.current;
          // Clamp travel so the content never detaches from the revealed panel.
          const raw = g.dx;
          const clamped =
            raw > 0
              ? rightActionRef.current
                ? Math.min(raw, MAX_TRAVEL)
                : Math.min(raw, thr * 0.4)
              : leftActionRef.current
                ? Math.max(raw, -MAX_TRAVEL)
                : Math.max(raw, -thr * 0.4);
          translateX.value = clamped;

          const crossed = clamped <= -thr || clamped >= thr;
          if (crossed && !crossedRef.current) {
            crossedRef.current = true;
            crossedState.value = clamped < 0 ? 1 : 2;
            runOnJS(fireHaptic)();
          } else if (!crossed && crossedRef.current) {
            crossedRef.current = false;
            crossedState.value = 0;
          }
        },
        onPanResponderRelease: (_e, g: PanResponderGestureState) => {
          clearLongPressTimer();
          if (longPressFiredRef.current) {
            snapBack();
            return;
          }
          // Treat as a tap if there was negligible movement and an onPress is set.
          if (!movedRef.current && onPressRef.current) {
            runOnJS(onPressRef.current)();
            snapBack();
            return;
          }
          const thr = thresholdRef.current;
          if (crossedRef.current) {
            if (g.dx <= -thr && rightActionRef.current) {
              runOnJS(triggerRight)();
              return;
            }
            if (g.dx >= thr && leftActionRef.current) {
              runOnJS(triggerLeft)();
              return;
            }
          }
          snapBack();
        },
        onPanResponderTerminate: () => {
          clearLongPressTimer();
          snapBack();
        } }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clearLongPressTimer, snapBack, fireHaptic, triggerLeft, triggerRight, haptic]
  );

  React.useEffect(() => {
    return () => clearLongPressTimer();
  }, [clearLongPressTimer]);

  const contentStyle = useAnimatedStyle(() => {
    'worklet';
    return {
      transform: [{ translateX: translateX.value }] };
  });

  // The revealed action panels brighten as the user approaches the threshold.
  const leftPanelStyle = useAnimatedStyle(() => {
    'worklet';
    const progress = isEnabled
      ? Math.max(0, Math.min(1, translateX.value / thresholdRef.current))
      : 1;
    return { opacity: progress };
  });

  const rightPanelStyle = useAnimatedStyle(() => {
    'worklet';
    const progress = isEnabled
      ? Math.max(0, Math.min(1, -translateX.value / thresholdRef.current))
      : 1;
    return { opacity: progress };
  });

  const hasLeft = !!leftAction;
  const hasRight = !!rightAction;

  // Accessibility: expose the swipe actions as labelled buttons in addition to
  // the row itself. VoiceOver users get the row label + hint, plus the
  // available swipe actions are described.
  const actionDescriptions = React.useMemo(() => {
    const parts: string[] = [];
    if (leftAction) parts.push(`Swipe right to ${leftAction.label}`);
    if (rightAction) parts.push(`Swipe left to ${rightAction.label}`);
    return parts.join('. ');
  }, [leftAction, rightAction]);

  return (
    <View
      style={[styles.container, style]}
      accessible
      accessibilityRole={onPress || onLongPress ? 'button' : undefined}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={
        accessibilityHint
          ? `${accessibilityHint}. ${actionDescriptions}`
          : actionDescriptions || undefined
      }
    >
      {/* Revealed action panels (behind the content) */}
      {hasLeft && leftAction && (
        <Reanimated.View
          style={[
            styles.actionPanel,
            styles.leftPanel,
            { backgroundColor: leftAction.color ?? colors.brand },
            leftPanelStyle,
          ]}
          pointerEvents="none"
        >
          <View style={styles.actionContent}>
            <Ionicons name={leftAction.icon as any} size={Control.icon} color={colors.textInverse} />
            <Text style={styles.actionLabel} numberOfLines={1}>
              {leftAction.label}
            </Text>
          </View>
        </Reanimated.View>
      )}
      {hasRight && rightAction && (
        <Reanimated.View
          style={[
            styles.actionPanel,
            styles.rightPanel,
            { backgroundColor: rightAction.color ?? colors.danger },
            rightPanelStyle,
          ]}
          pointerEvents="none"
        >
          <View style={styles.actionContent}>
            <Ionicons name={rightAction.icon as any} size={Control.icon} color={colors.textInverse} />
            <Text style={styles.actionLabel} numberOfLines={1}>
              {rightAction.label}
            </Text>
          </View>
        </Reanimated.View>
      )}

      {/* Swipeable content layer */}
      <Reanimated.View
        style={[styles.content, contentStyle]}
        {...panResponder.panHandlers}
      >
        {children}
      </Reanimated.View>
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      position: 'relative',
      overflow: 'hidden',
      backgroundColor: colors.surface },
    content: {
      backgroundColor: colors.background,
      zIndex: 1 },
    actionPanel: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      width: '100%',
      justifyContent: 'center' },
    leftPanel: {
      left: 0,
      alignItems: 'flex-start',
      paddingLeft: Space.lg },
    rightPanel: {
      right: 0,
      alignItems: 'flex-end',
      paddingRight: Space.lg },
    actionContent: {
      alignItems: 'center',
      gap: Space.xs },
    actionLabel: {
      fontSize: TypographyV2.meta.size,
      fontFamily: FontFamily.semibold,
      color: colors.textInverse,
      letterSpacing: 0.1 } });
