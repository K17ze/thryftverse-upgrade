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
  const haptic = useHaptic();
  const { colors } = useAppTheme();
  const reducedMotion = useReducedMotion();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  const triggerReply = React.useCallback(() => {
    onReply?.();
    haptic.light();
  }, [onReply, haptic]);

  const triggerActions = React.useCallback(() => {
    onActions?.();
    haptic.light();
  }, [onActions, haptic]);

  const gesture = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .onUpdate((event) => {
      const { translationX } = event;

      if (!isMe && translationX > 0) {
        // Swipe right to reply to others' messages
        translateX.value = Math.min(translationX, replyThreshold + 20);
      } else if (isMe && translationX < 0) {
        // Swipe left for actions on my messages
        translateX.value = Math.max(translationX, -(replyThreshold + 20));
      }
    })
    .onEnd((event) => {
      const { translationX } = event;

      if (!isMe && translationX > replyThreshold) {
        runOnJS(triggerReply)();
      } else if (isMe && translationX < -replyThreshold) {
        runOnJS(triggerActions)();
      }

      // Snap back to original position with timing
      translateX.value = withTiming(0, { duration: reducedMotion ? 0 : 200, easing: Easing.out(Easing.cubic) });
    });

  const foregroundStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const backgroundIconOpacity = useAnimatedStyle(() => {
    const inputRange = isMe
      ? [-100, -replyThreshold, 0]
      : [0, replyThreshold, 100];
    const outputRange = isMe ? [1, 0.5, 0] : [0, 0.5, 1];

    return {
      opacity: interpolate(
        translateX.value,
        inputRange,
        outputRange,
        Extrapolation.CLAMP
      ),
    };
  });

  return (
    <GestureDetector gesture={gesture}>
      <View style={styles.container}>
        {/* Background Layer with Icons */}
        <View style={[
          styles.backgroundLayer,
          isMe ? styles.backgroundLeft : styles.backgroundRight,
        ]}>
          <Reanimated.View style={[styles.actionIconWrap, backgroundIconOpacity]}>
            <View style={styles.actionIcon}>
              <Ionicons
                name={isMe ? 'ellipsis-horizontal' : 'arrow-undo'}
                size={24}
                color={colors.textInverse}
              />
            </View>
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

const createStyles = (colors: ReturnType<typeof useAppTheme>['colors']) => StyleSheet.create({
  container: {
    position: 'relative',
  },
  backgroundLayer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 100,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backgroundLeft: {
    left: 0,
    backgroundColor: colors.borderSubtle,
    borderTopLeftRadius: Radius.lg,
    borderBottomLeftRadius: Radius.lg,
  },
  backgroundRight: {
    right: 0,
    backgroundColor: colors.brandSubtle,
    borderTopRightRadius: Radius.lg,
    borderBottomRightRadius: Radius.lg,
  },
  actionIconWrap: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionIcon: {
    width: 44,
    height: 44,
    borderRadius: Radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  messageContainer: {
    backgroundColor: 'transparent',
  },
});