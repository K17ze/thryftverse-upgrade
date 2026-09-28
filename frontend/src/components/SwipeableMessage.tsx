import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolate,
  Extrapolation,
  runOnJS,
  Easing,
} from 'react-native-reanimated';
import { useAppTheme } from '../theme/ThemeContext';
import { Radius } from '../theme/designTokens';
import { useHaptic } from '../hooks/useHaptic';
import { useReducedMotion } from '../hooks/useReducedMotion';

/**
 * The swipe-right reply gesture has no visible affordance, so the same
 * action is offered to screen readers through this context: a descendant
 * MessageBubble turns it into a labelled `reply` accessibility action
 * (iOS rotor / TalkBack actions menu) that invokes the identical
 * callback — preserving the quoted-message context the gesture carries.
 * `null` when no reply swipe is offered for this row.
 */
export const SwipeReplyContext = React.createContext<(() => void) | null>(null);

interface SwipeableMessageProps {
  children: React.ReactNode;
  isMe: boolean;
  onReply?: () => void;
  onActions?: () => void;
  replyThreshold?: number;
}

export function SwipeableMessage({
  children,
  isMe,
  onReply,
  onActions,
  replyThreshold = 80,
}: SwipeableMessageProps) {
  const translateX = useSharedValue(0);
  const hasTriggeredHaptic = useSharedValue(false);
  const haptic = useHaptic();
  const { colors } = useAppTheme();
  const reducedMotion = useReducedMotion();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  const isSwipeEnabled = (isMe && !!onActions) || (!isMe && !!onReply);

  const triggerReply = React.useCallback(() => {
    onReply?.();
  }, [onReply]);

  const triggerActions = React.useCallback(() => {
    onActions?.();
  }, [onActions]);

  // Screen-reader equivalent of the swipe: reply is only offered on the
  // leading edge (other people's messages). For my own messages the swipe
  // opens the same actions menu the bubble already exposes as a
  // `longpress` action, so no second identical action is needed.
  const replyAction = !isMe && onReply ? triggerReply : null;

  // Single deliberate haptic: it fires once when the finger crosses the
  // commit threshold (same convention as SwipeableRow's selection haptic),
  // telling the user the swipe will act on release. Firing a second haptic
  // when the action runs would double-signal one gesture; the action's own
  // visible outcome (reply preview / actions sheet) is the confirmation.
  const triggerThresholdHaptic = React.useCallback(() => {
    haptic.selection();
  }, [haptic]);

  const panGesture = React.useMemo(() => {
    const gesture = Gesture.Pan()
      .enabled(isSwipeEnabled)
      .activeOffsetX(isMe ? [-10, 0] : [0, 10])
      .failOffsetY([-12, 12])
      .onUpdate((event) => {
        const { translationX } = event;

        if (!isMe && translationX > 0) {
          // Swipe right to reply to others' messages
          if (translationX > replyThreshold) {
            translateX.value = replyThreshold + (translationX - replyThreshold) * 0.3;
          } else {
            translateX.value = translationX;
          }

          if (translateX.value >= replyThreshold && !hasTriggeredHaptic.value) {
            hasTriggeredHaptic.value = true;
            runOnJS(triggerThresholdHaptic)();
          } else if (translateX.value < replyThreshold && hasTriggeredHaptic.value) {
            hasTriggeredHaptic.value = false;
          }
        } else if (isMe && translationX < 0) {
          // Swipe left for actions on my messages
          if (translationX < -replyThreshold) {
            translateX.value = -replyThreshold + (translationX + replyThreshold) * 0.3;
          } else {
            translateX.value = translationX;
          }

          if (translateX.value <= -replyThreshold && !hasTriggeredHaptic.value) {
            hasTriggeredHaptic.value = true;
            runOnJS(triggerThresholdHaptic)();
          } else if (translateX.value > -replyThreshold && hasTriggeredHaptic.value) {
            hasTriggeredHaptic.value = false;
          }
        }
      })
      .onEnd((event) => {
        // Commit only. The reset lives in onFinalize below so every
        // termination path — end, fail, cancel, or an interrupted gesture —
        // returns the row to rest instead of keeping a stale translation.
        const { translationX } = event;

        if (!isMe && translationX >= replyThreshold) {
          runOnJS(triggerReply)();
        } else if (isMe && translationX <= -replyThreshold) {
          runOnJS(triggerActions)();
        }
      });

    // onFinalize is the single unconditional cleanup point (RNGH ≥2.x):
    // it runs after end, fail, cancel and interruption alike, so the row
    // always returns to rest. Optional call — minimal gesture test doubles
    // may not stub every lifecycle callback.
    gesture.onFinalize?.(() => {
      hasTriggeredHaptic.value = false;
      translateX.value = withTiming(0, {
        duration: reducedMotion ? 0 : 200,
        easing: Easing.out(Easing.cubic),
      });
    });

    return gesture;
  }, [isSwipeEnabled, isMe, replyThreshold, reducedMotion, triggerReply, triggerActions, triggerThresholdHaptic]);

  const foregroundStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const actionIndicatorStyle = useAnimatedStyle(() => {
    const absX = Math.abs(translateX.value);
    const opacity = interpolate(
      absX,
      [0, 12, replyThreshold],
      [0, 0.4, 1],
      Extrapolation.CLAMP
    );
    const scale = interpolate(
      absX,
      [0, 12, replyThreshold],
      [0.6, 0.8, 1],
      Extrapolation.CLAMP
    );

    return {
      opacity,
      transform: [{ scale }],
    };
  });

  return (
    <GestureDetector gesture={panGesture}>
      <View style={styles.container}>
        {/* Background Action Indicator — zero static background, completely transparent when idle */}
        <View
          pointerEvents="none"
          style={[
            styles.actionTrack,
            isMe ? styles.actionTrackRight : styles.actionTrackLeft,
          ]}
        >
          <Reanimated.View style={[styles.actionBadge, actionIndicatorStyle]}>
            <Ionicons
              name={isMe ? 'ellipsis-horizontal' : 'arrow-undo'}
              size={18}
              color={isMe ? colors.textSecondary : colors.brand}
            />
          </Reanimated.View>
        </View>

        {/* Foreground Message */}
        <Reanimated.View style={[styles.messageContainer, foregroundStyle]}>
          <SwipeReplyContext.Provider value={replyAction}>
            {children}
          </SwipeReplyContext.Provider>
        </Reanimated.View>
      </View>
    </GestureDetector>
  );
}

const createStyles = (colors: ReturnType<typeof useAppTheme>['colors']) =>
  StyleSheet.create({
    container: {
      position: 'relative',
      backgroundColor: 'transparent',
    },
    actionTrack: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      justifyContent: 'center',
      alignItems: 'center',
      width: 44,
      backgroundColor: 'transparent',
    },
    actionTrackLeft: {
      left: 12,
    },
    actionTrackRight: {
      right: 12,
    },
    actionBadge: {
      width: 36,
      height: 36,
      borderRadius: Radius.full,
      backgroundColor: colors.surfaceElevated,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderSubtle,
      justifyContent: 'center',
      alignItems: 'center',
    },
    messageContainer: {
      backgroundColor: 'transparent',
    },
  });