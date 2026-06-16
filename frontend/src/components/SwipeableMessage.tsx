import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  interpolate,
  Extrapolation,
  runOnJS,
} from 'react-native-reanimated';
import { Colors } from '../constants/colors';
import { Radius } from '../theme/designTokens';
import { useHaptic } from '../hooks/useHaptic';

interface SwipeableMessageProps {
  children: React.ReactNode;
  isMe: boolean;
  onReply?: () => void;
  onActions?: () => void;
  replyThreshold?: number;
}

const SWIPE_SPRING = {
  damping: 15,
  stiffness: 150,
};

export function SwipeableMessage({
  children,
  isMe,
  onReply,
  onActions,
  replyThreshold = 80,
}: SwipeableMessageProps) {
  const translateX = useSharedValue(0);
  const haptic = useHaptic();

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

      // Spring back to original position
      translateX.value = withSpring(0, SWIPE_SPRING);
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
                color={Colors.textInverse}
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

const styles = StyleSheet.create({
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
    backgroundColor: `${Colors.textMuted}30`,
    borderTopLeftRadius: Radius.lg,
    borderBottomLeftRadius: Radius.lg,
  },
  backgroundRight: {
    right: 0,
    backgroundColor: `${Colors.brand}30`,
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
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  messageContainer: {
    backgroundColor: 'transparent',
  },
});