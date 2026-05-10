import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import Reanimated, { FadeIn } from 'react-native-reanimated';
import { Colors } from '../constants/colors';
import { Typography } from '../constants/typography';
import { MessageStatusIndicator, MessageStatus } from './MessageStatusIndicator';
import { useReducedMotion } from '../hooks/useReducedMotion';

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
}: ChatMessageItemProps) {
  const isMe = message.sender === 'me';
  const reducedMotionEnabled = useReducedMotion();

  // Entry animation - subtle fade only (not annoying)
  const enteringAnimation = reducedMotionEnabled
    ? undefined
    : FadeIn.duration(150);

  return (
    <Reanimated.View
      entering={enteringAnimation}
      style={[styles.container, isMe && styles.containerRight]}
    >
      {/* Avatar for group chats */}
      {!isMe && isGroup && message.senderLabel && (
        <View style={styles.avatarPlaceholder}>
          <Text style={styles.avatarInitial}>
            {message.senderLabel.charAt(0).toUpperCase()}
          </Text>
        </View>
      )}

      <View style={styles.bubbleContainer}>
        {/* Sender name for group chats */}
        {!isMe && isGroup && message.senderLabel && (
          <Text style={styles.senderName}>{message.senderLabel}</Text>
        )}

        {/* Message bubble */}
        <View
          style={[
            styles.bubble,
            isMe ? styles.bubbleMe : styles.bubbleThem,
          ]}
        >
          <Text
            style={[
              styles.messageText,
              isMe && styles.messageTextMe,
            ]}
          >
            {message.text}
          </Text>
        </View>

        {/* Status indicator for outgoing messages */}
        {isMe && (
          <View style={styles.statusContainer}>
            <MessageStatusIndicator
              status={message.status || 'sent'}
              timestamp={message.timestamp}
              size="sm"
            />
          </View>
        )}

        {/* Timestamp for incoming messages */}
        {!isMe && message.timestamp && (
          <Text style={styles.incomingTimestamp}>{message.timestamp}</Text>
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
      <Text style={styles.dateText}>{date}</Text>
      <View style={styles.dateLine} />
    </Reanimated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    marginVertical: 4,
    paddingHorizontal: 12,
    alignItems: 'flex-end',
  },
  containerRight: {
    justifyContent: 'flex-end',
  },

  // Avatar
  avatarPlaceholder: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  avatarInitial: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
  },

  // Bubble container
  bubbleContainer: {
    maxWidth: MAX_BUBBLE_WIDTH,
  },

  // Sender name (group chats)
  senderName: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.brand,
    marginBottom: 2,
    marginLeft: 4,
  },

  // Message bubble
  bubble: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxWidth: MAX_BUBBLE_WIDTH,
  },
  bubbleMe: {
    backgroundColor: Colors.brand,
    borderBottomRightRadius: 4,
  },
  bubbleThem: {
    backgroundColor: Colors.surface,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },

  // Message text
  messageText: {
    fontSize: 16,
    lineHeight: 22,
    color: Colors.textPrimary,
    fontFamily: Typography.family.regular,
  },
  messageTextMe: {
    color: '#FFFFFF', // White text on brand background
  },

  // Status
  statusContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 2,
    marginRight: 4,
  },

  // Incoming timestamp
  incomingTimestamp: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
    marginLeft: 4,
  },

  // Date separator
  dateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 16,
    paddingHorizontal: 20,
  },
  dateLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.border,
  },
  dateText: {
    fontSize: 12,
    fontWeight: '500',
    color: Colors.textMuted,
    marginHorizontal: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
