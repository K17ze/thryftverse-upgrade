import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import Reanimated, { FadeIn } from 'react-native-reanimated';
import { Colors } from '../../constants/colors';
import { Space, Radius } from '../../theme/designTokens';
import { Body, Meta, Caption } from '../ui/Text';
import { MessageStatusIndicator, MessageStatus } from '../MessageStatusIndicator';
import { useReducedMotion } from '../../hooks/useReducedMotion';

interface MessageBubbleProps {
  text: string;
  isMe: boolean;
  senderLabel?: string;
  timestamp?: string;
  status?: MessageStatus;
  style?: ViewStyle;
}

export function MessageBubble({
  text,
  isMe,
  senderLabel,
  timestamp,
  status,
  style,
}: MessageBubbleProps) {
  const reducedMotionEnabled = useReducedMotion();

  return (
    <Reanimated.View
      entering={reducedMotionEnabled ? undefined : FadeIn.duration(150)}
      style={[styles.container, isMe && styles.containerRight, style]}
    >
      <View style={styles.bubbleContainer}>
        {!isMe && senderLabel ? (
          <Meta color={Colors.brand} style={styles.senderLabel}>
            {senderLabel}
          </Meta>
        ) : null}

        <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
          <Body color={isMe ? Colors.textInverse : Colors.textPrimary}>
            {text}
          </Body>
        </View>

        {isMe && status ? (
          <View style={styles.statusContainer}>
            <MessageStatusIndicator status={status} timestamp={timestamp} size="sm" />
          </View>
        ) : null}

        {!isMe && timestamp ? (
          <Caption color={Colors.textMuted} style={styles.incomingTimestamp}>
            {timestamp}
          </Caption>
        ) : null}
      </View>
    </Reanimated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    marginVertical: Space.xs,
    paddingHorizontal: Space.md,
    alignItems: 'flex-end',
  },
  containerRight: {
    justifyContent: 'flex-end',
  },
  bubbleContainer: {
    maxWidth: '80%',
  },
  senderLabel: {
    marginBottom: 2,
    marginLeft: Space.xs,
  },
  bubble: {
    borderRadius: Radius.xl,
    paddingHorizontal: Space.md - 2,
    paddingVertical: Space.sm + 2,
  },
  bubbleMe: {
    backgroundColor: Colors.brand,
    borderBottomRightRadius: Space.xs,
  },
  bubbleThem: {
    backgroundColor: Colors.surface,
    borderBottomLeftRadius: Space.xs,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  statusContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 2,
    marginRight: Space.xs,
  },
  incomingTimestamp: {
    marginTop: 2,
    marginLeft: Space.xs,
  },
});
