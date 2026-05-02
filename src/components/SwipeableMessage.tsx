import React, { useRef, useCallback } from 'react';
import {
  View,
  StyleSheet,
  Animated,
  PanResponder,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';

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
  const translateX = useRef(new Animated.Value(0)).current;
  const isSwiping = useRef(false);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dx) > 10;
      },
      onPanResponderMove: (_, gestureState) => {
        const { dx } = gestureState;
        
        // Only allow swipe in specific directions based on sender
        // Reply swipe: Right for others' messages, Left for my messages
        if (!isMe && dx > 0) {
          // Swipe right to reply to others' messages
          translateX.setValue(Math.min(dx, replyThreshold + 20));
        } else if (isMe && dx < 0) {
          // Swipe left for actions on my messages
          translateX.setValue(Math.max(dx, -(replyThreshold + 20)));
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        const { dx } = gestureState;
        
        if (!isMe && dx > replyThreshold) {
          // Trigger reply
          onReply?.();
        } else if (isMe && dx < -replyThreshold) {
          // Trigger actions
          onActions?.();
        }
        
        // Spring back to original position
        Animated.spring(translateX, {
          toValue: 0,
          useNativeDriver: true,
          friction: 8,
          tension: 40,
        }).start();
      },
    })
  ).current;

  const backgroundIconOpacity = translateX.interpolate({
    inputRange: isMe ? [-100, -replyThreshold, 0] : [0, replyThreshold, 100],
    outputRange: isMe ? [1, 0.5, 0] : [0, 0.5, 1],
    extrapolate: 'clamp',
  });

  return (
    <View style={styles.container}>
      {/* Background Layer with Icons */}
      <View style={[
        styles.backgroundLayer,
        isMe ? styles.backgroundLeft : styles.backgroundRight,
      ]}>
        <Animated.View style={{ opacity: backgroundIconOpacity }}>
          <View style={styles.actionIcon}>
            <Ionicons
              name={isMe ? 'ellipsis-horizontal' : 'arrow-undo'}
              size={24}
              color="#FFFFFF"
            />
          </View>
        </Animated.View>
      </View>

      {/* Foreground Message */}
      <Animated.View
        style={[
          styles.messageContainer,
          { transform: [{ translateX }] },
        ]}
        {...panResponder.panHandlers}
      >
        {children}
      </Animated.View>
    </View>
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
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
  },
  backgroundRight: {
    right: 0,
    backgroundColor: `${Colors.brand}30`,
    borderTopRightRadius: 16,
    borderBottomRightRadius: 16,
  },
  actionIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  messageContainer: {
    backgroundColor: 'transparent',
  },
});
