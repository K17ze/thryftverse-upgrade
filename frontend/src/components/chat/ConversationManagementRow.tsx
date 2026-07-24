import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Conversation } from '../../data/mockData';
import { Colors } from '../../constants/colors';
import { Space, Typography } from '../../theme/designTokens';
import { AnimatedPressable } from '../AnimatedPressable';
import { CachedImage } from '../CachedImage';

function resolveIdentity(conversation: Conversation, currentUserId?: string) {
  if (conversation.type === 'group') {
    return {
      title: conversation.title?.trim() || 'Group conversation',
      avatar: conversation.avatar || null,
      isGroup: true,
    };
  }

  const participant = conversation.participantProfiles?.find(
    (profile) => profile.id !== currentUserId && profile.id !== 'me'
  );

  return {
    title:
      participant?.displayName?.trim() ||
      participant?.username?.trim() ||
      'Conversation',
    avatar: participant?.avatar || conversation.avatar || null,
    isGroup: false,
  };
}

function formatActivity(value?: string) {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;

  const now = new Date();
  if (parsed.toDateString() === now.toDateString()) {
    return parsed.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  return parsed.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
  });
}

export function ConversationManagementRow({
  conversation,
  currentUserId,
  onOpen,
  actionIcon,
  actionLabel,
  onAction,
  destructive,
  secondaryActionIcon,
  secondaryActionLabel,
  onSecondaryAction,
  secondaryDestructive,
  isLast,
}: {
  conversation: Conversation;
  currentUserId?: string;
  onOpen: () => void;
  actionIcon: keyof typeof Ionicons.glyphMap;
  actionLabel: string;
  onAction: () => void;
  destructive?: boolean;
  secondaryActionIcon?: keyof typeof Ionicons.glyphMap;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  secondaryDestructive?: boolean;
  isLast?: boolean;
}) {
  const identity = resolveIdentity(conversation, currentUserId);
  const actionColor = destructive ? Colors.danger : Colors.textPrimary;

  return (
    <View style={[styles.row, !isLast && styles.divider]}>
      <AnimatedPressable
        style={styles.main}
        onPress={onOpen}
        activeOpacity={0.7}
        scaleValue={0.99}
        accessibilityRole="button"
        accessibilityLabel={`Open ${identity.title}`}
      >
        {identity.avatar ? (
          <CachedImage
            uri={identity.avatar}
            style={styles.avatar}
            containerStyle={styles.avatar}
            contentFit="cover"
          />
        ) : (
          <View style={styles.avatarFallback}>
            <Ionicons
              name={identity.isGroup ? 'people-outline' : 'person-outline'}
              size={20}
              color={Colors.textSecondary}
            />
          </View>
        )}

        <View style={styles.copy}>
          <View style={styles.titleRow}>
            <Text style={styles.title} numberOfLines={1}>
              {identity.title}
            </Text>
            <Text style={styles.time} numberOfLines={1}>
              {formatActivity(conversation.lastMessageTime)}
            </Text>
          </View>
          <Text style={styles.preview} numberOfLines={1}>
            {conversation.lastMessage?.trim() || 'No messages yet'}
          </Text>
        </View>
      </AnimatedPressable>

      <AnimatedPressable
        style={styles.action}
        onPress={onAction}
        activeOpacity={0.65}
        scaleValue={0.94}
        hapticFeedback={destructive ? 'medium' : 'light'}
        accessibilityRole="button"
        accessibilityLabel={`${actionLabel} ${identity.title}`}
      >
        <Ionicons name={actionIcon} size={20} color={actionColor} />
      </AnimatedPressable>
      {secondaryActionIcon && secondaryActionLabel && onSecondaryAction ? (
        <AnimatedPressable
          style={styles.secondaryAction}
          onPress={onSecondaryAction}
          activeOpacity={0.65}
          scaleValue={0.94}
          hapticFeedback={secondaryDestructive ? 'medium' : 'light'}
          accessibilityRole="button"
          accessibilityLabel={`${secondaryActionLabel} ${identity.title}`}
        >
          <Ionicons
            name={secondaryActionIcon}
            size={19}
            color={secondaryDestructive ? Colors.danger : Colors.textPrimary}
          />
        </AnimatedPressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 74,
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: Space.md,
  },
  divider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  main: {
    minWidth: 0,
    flex: 1,
    minHeight: 74,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
  },
  avatarFallback: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceAlt,
  },
  copy: {
    minWidth: 0,
    flex: 1,
    gap: 3,
  },
  titleRow: {
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    minWidth: 0,
    flex: 1,
    color: Colors.textPrimary,
    fontFamily: Typography.family.semibold,
    fontSize: 14,
  },
  time: {
    flexShrink: 0,
    color: Colors.textMuted,
    fontFamily: Typography.family.regular,
    fontSize: 11,
  },
  preview: {
    color: Colors.textMuted,
    fontFamily: Typography.family.regular,
    fontSize: 12,
  },
  action: {
    width: 52,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryAction: {
    width: 44,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
