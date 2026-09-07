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
    haptic.light();
  }, [onReply, haptic]);

  const triggerActions = React.useCallback(() => {
    onActions?.();
    haptic.light();
  }, [onActions, haptic]);

  const triggerThresholdHaptic = React.useCallback(() => {
    haptic.light();
  }, [haptic]);

  const panGesture = React.useMemo(() => {
    return Gesture.Pan()
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
        const { translationX } = event;

        if (!isMe && translationX >= replyThreshold) {
          runOnJS(triggerReply)();
        } else if (isMe && translationX <= -replyThreshold) {
          runOnJS(triggerActions)();
        }

        hasTriggeredHaptic.value = false;
        translateX.value = withTiming(0, {
          duration: reducedMotion ? 0 : 200,
          easing: Easing.out(Easing.cubic),
        });
      });
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
          {children}
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