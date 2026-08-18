import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Conversation } from '../../domain';
import { Space, Typography, Type, Radius } from '../../theme/designTokens';
import { useAppTheme } from '../../theme/ThemeContext';
import { AnimatedPressable } from '../AnimatedPressable';
import { CachedImage } from '../CachedImage';
import { formatActivityTimestamp } from '../../utils/dateFormat';

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
  const { colors } = useAppTheme();
  const identity = resolveIdentity(conversation, currentUserId);
  const actionColor = destructive ? colors.danger : colors.textPrimary;

  return (
    <View style={[styles.row, !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderSubtle }]}>
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
          <View style={[styles.avatarFallback, { backgroundColor: colors.surfaceAlt }]}>
            <Ionicons
              name={identity.isGroup ? 'people-outline' : 'person-outline'}
              size={20}
              color={colors.textSecondary}
            />
          </View>
        )}

        <View style={styles.copy}>
          <View style={styles.titleRow}>
            <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>
              {identity.title}
            </Text>
            <Text style={[styles.time, { color: colors.textMuted }]} numberOfLines={1}>
              {formatActivityTimestamp(conversation.lastMessageTime)}
            </Text>
          </View>
          <Text style={[styles.preview, { color: colors.textMuted }]} numberOfLines={1}>
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
            color={secondaryDestructive ? colors.danger : colors.textPrimary}
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
  main: {
    minWidth: 0,
    flex: 1,
    minHeight: 74,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: Radius.full,
  },
  avatarFallback: {
    width: 46,
    height: 46,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
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
    gap: Space.sm,
  },
  title: {
    minWidth: 0,
    flex: 1,
    fontFamily: Typography.family.semibold,
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
  },
  time: {
    flexShrink: 0,
    fontFamily: Typography.family.regular,
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    letterSpacing: Type.meta.letterSpacing,
  },
  preview: {
    fontFamily: Typography.family.regular,
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
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
