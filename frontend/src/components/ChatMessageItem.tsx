import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import Reanimated, { FadeIn } from 'react-native-reanimated';
import { Colors } from '../constants/colors';
import { Space, Radius, Type } from '../theme/designTokens';
import { MessageStatusIndicator, MessageStatus } from './MessageStatusIndicator';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { CachedImage } from './CachedImage';
import { Typography } from '../constants/typography';
import { Meta, Caption, Body } from './ui/Text';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const MAX_BUBBLE_WIDTH = SCREEN_WIDTH * 0.75;

export interface ChatMessage {
  id: string;
  text: string;
  sender: 'me' | 'them';
  senderLabel?: string;
  timestamp?: string;
  status?: MessageStatus;
  type?: 'text' | 'offer' | 'offer_declined' | 'purchase_status' | 'system';
}

interface ChatMessageItemProps {
  message: ChatMessage;
  isGroup?: boolean;
  showAvatar?: boolean;
  avatarUrl?: string;
}

export function ChatMessageItem({
  message,
  isGroup = false,
  showAvatar = false,
  avatarUrl,
}: ChatMessageItemProps) {
  const isMe = message.sender === 'me';
  const reducedMotionEnabled = useReducedMotion();

  const enteringAnimation = reducedMotionEnabled
    ? undefined
    : FadeIn.duration(150);

  const renderAvatar = () => {
    if (isMe || !isGroup || !message.senderLabel) return null;

    if (showAvatar && avatarUrl) {
      return (
        <CachedImage
          uri={avatarUrl}
          style={styles.avatarImage}
          containerStyle={styles.avatarPlaceholder}
          contentFit="cover"
        />
      );
    }

    return (
      <View style={styles.avatarPlaceholder}>
        <Text style={styles.avatarInitial}>
          {message.senderLabel.charAt(0).toUpperCase()}
        </Text>
      </View>
    );
  };

  return (
    <Reanimated.View
      entering={enteringAnimation}
      style={[styles.container, isMe && styles.containerRight]}
    >
      {renderAvatar()}

      <View style={styles.bubbleContainer}>
        {!isMe && isGroup && message.senderLabel && (
          <Meta color={Colors.brand} style={styles.senderName}>
            {message.senderLabel}
          </Meta>
        )}

        <View
          style={[
            styles.bubble,
            isMe ? styles.bubbleMe : styles.bubbleThem,
          ]}
        >
          <Body color={isMe ? Colors.textInverse : Colors.textPrimary}>
            {message.text}
          </Body>
        </View>

        {isMe && (
          <View style={styles.statusContainer}>
            <MessageStatusIndicator
              status={message.status || 'sent'}
              timestamp={message.timestamp}
              size="sm"
            />
          </View>
        )}

        {!isMe && message.timestamp && (
          <Caption color={Colors.textMuted} style={styles.incomingTimestamp}>
            {message.timestamp}
          </Caption>
        )}
      </View>
    </Reanimated.View>
  );
}

// Date separator component
interface DateSeparatorProps {
  date: string;
}

export function DateSeparator({ date }: DateSeparatorProps) {
  const reducedMotionEnabled = useReducedMotion();

  return (
    <Reanimated.View
      entering={reducedMotionEnabled ? undefined : FadeIn.duration(300)}
      style={styles.dateContainer}
    >
      <View style={styles.dateLine} />
      <Caption color={Colors.textMuted} style={styles.dateText}>{date}</Caption>
      <View style={styles.dateLine} />
    </Reanimated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    marginVertical: Space.xs,
    paddingHorizontal: Space.md - 4,
    alignItems: 'flex-end',
  },
  containerRight: {
    justifyContent: 'flex-end',
  },

  avatarPlaceholder: {
    width: 28,
    height: 28,
    borderRadius: Radius.full,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Space.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  avatarImage: {
    width: 28,
    height: 28,
    borderRadius: Radius.full,
  },
  avatarInitial: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.semibold,
    color: Colors.textSecondary,
  },

  bubbleContainer: {
    maxWidth: MAX_BUBBLE_WIDTH,
  },

  senderName: {
    marginBottom: 2,
    marginLeft: Space.xs,
  },

  bubble: {
    borderRadius: Radius.xl,
    paddingHorizontal: Space.md - 2,
    paddingVertical: Space.sm + 2,
    maxWidth: MAX_BUBBLE_WIDTH,
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

  dateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: Space.md,
    paddingHorizontal: Space.lg - 4,
  },
  dateLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.border,
  },
  dateText: {
    marginHorizontal: Space.sm + 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
