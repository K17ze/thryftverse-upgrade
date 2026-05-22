import React from 'react';
import { View, StyleSheet, ViewStyle, Pressable } from 'react-native';
import Reanimated, { FadeIn } from 'react-native-reanimated';
import { Colors } from '../../constants/colors';
import { Space, Radius } from '../../theme/designTokens';
import { Body, Meta, Caption } from '../ui/Text';
import { MessageReactionsSummary, EmojiReaction } from './EmojiReactionsBar';
import { MentionHighlight } from './MentionHighlight';
import { MessageStatusIndicator, MessageStatus } from '../MessageStatusIndicator';
import { useReducedMotion } from '../../hooks/useReducedMotion';

interface MessageBubbleProps {
  text: string;
  isMe: boolean;
  senderLabel?: string;
  timestamp?: string;
  status?: MessageStatus;
  style?: ViewStyle;
  onLongPress?: () => void;
  reactions?: EmojiReaction[];
}

export function MessageBubble({
  text,
  isMe,
  senderLabel,
  timestamp,
  status,
  style,
  onLongPress,
  reactions,
}: MessageBubbleProps) {
  const reducedMotionEnabled = useReducedMotion();

  const bubble = (
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
            <MentionHighlight
              text={text}
              color={isMe ? Colors.textInverse : Colors.brand}
            />
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

        {reactions && reactions.length > 0 ? (
          <MessageReactionsSummary
            reactions={reactions}
            style={isMe ? styles.reactionsMe : styles.reactionsThem}
          />
        ) : null}
      </View>
    </Reanimated.View>
  );

  if (onLongPress) {
    return (
      <Pressable onLongPress={onLongPress}>
        {bubble}
      </Pressable>
    );
  }

  return bubble;
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
  reactionsMe: {
    alignSelf: 'flex-end',
    marginRight: Space.xs,
  },
  reactionsThem: {
    alignSelf: 'flex-start',
    marginLeft: Space.xs,
  },
});
