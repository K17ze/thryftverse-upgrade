import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { Space, Radius, Type, TypeStyles, Typography } from '../../theme/designTokens';
import { CachedImage } from '../CachedImage';
import { AnimatedPressable } from '../AnimatedPressable';

export interface InboxConversationRowProps {
  displayTitle: string;
  lastMessage: string;
  lastMessageTime: string;
  unread: boolean;
  isPinned: boolean;
  isMuted: boolean;
  isGroup: boolean;
  memberCount?: number;
  draftText?: string;
  itemId?: string;
  itemThumbUri?: string | null;
  avatarElement: React.ReactNode;
  onPress: () => void;
  accessibilityHint?: string;
}

export function InboxConversationRow({
  displayTitle,
  lastMessage,
  lastMessageTime,
  unread,
  isPinned,
  isMuted,
  isGroup,
  memberCount,
  draftText,
  itemId,
  itemThumbUri,
  avatarElement,
  onPress,
  accessibilityHint,
}: InboxConversationRowProps) {
  const accessibilityParts: string[] = [
    displayTitle,
    lastMessage,
    lastMessageTime,
  ];
  if (unread) accessibilityParts.push('unread');
  if (isMuted) accessibilityParts.push('muted');
  if (isPinned) accessibilityParts.push('pinned');
  if (isGroup && memberCount) accessibilityParts.push(`${memberCount} members`);

  return (
    <AnimatedPressable
      onPress={onPress}
      activeOpacity={0.85}
      scaleValue={0.98}
      hapticFeedback="light"
      accessibilityLabel={accessibilityParts.join(', ')}
      accessibilityRole="button"
      accessibilityHint={accessibilityHint ?? 'Opens the conversation thread'}
    >
      <View style={styles.row}>
        <View style={styles.avatarWrap}>{avatarElement}</View>
        <View style={styles.body}>
          <View style={styles.topLine}>
            <View style={styles.nameRow}>
              <Text
                style={[styles.name, unread && styles.nameUnread]}
                numberOfLines={1}
              >
                {displayTitle}
              </Text>
              {isPinned && (
                <Ionicons name="pin" size={11} color={Colors.textMuted} style={styles.metaIcon} />
              )}
              {isMuted && (
                <Ionicons name="volume-mute" size={11} color={Colors.textMuted} style={styles.metaIcon} />
              )}
            </View>
            <Text
              style={[styles.time, unread && styles.timeUnread]}
              numberOfLines={1}
            >
              {lastMessageTime}
            </Text>
          </View>
          <View style={styles.bottomLine}>
            {isGroup && memberCount != null && (
              <Text style={styles.memberCount} numberOfLines={1}>
                {memberCount} members
              </Text>
            )}
            {draftText ? (
              <Text style={styles.draftLabel} numberOfLines={1}>
                Draft
              </Text>
            ) : null}
            <Text
              style={[
                styles.preview,
                unread && styles.previewUnread,
                !draftText && isGroup && memberCount != null && styles.previewWithMemberPrefix,
              ]}
              numberOfLines={1}
            >
              {draftText ?? lastMessage}
            </Text>
            {unread && !draftText ? (
              <View style={styles.unreadDot} />
            ) : null}
            {!unread && itemId && itemThumbUri ? (
              <CachedImage
                uri={itemThumbUri}
                style={styles.itemThumb}
                contentFit="cover"
              />
            ) : null}
          </View>
        </View>
      </View>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 12,
    paddingHorizontal: Space.md,
    gap: Space.sm + 2,
  },
  avatarWrap: {
    position: 'relative',
  },
  body: {
    flex: 1,
    justifyContent: 'center',
    gap: 3,
  },
  topLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontSize: Type.body.size,
    fontFamily: TypeStyles.body.fontFamily,
    color: Colors.textPrimary,
    letterSpacing: Type.body.letterSpacing,
  },
  nameUnread: {
    fontFamily: TypeStyles.bodyEmphasis.fontFamily,
  },
  metaIcon: {
    marginLeft: 1,
  },
  time: {
    fontSize: Type.meta.size,
    fontFamily: TypeStyles.body.fontFamily,
    color: Colors.textMuted,
    paddingLeft: Space.xs,
  },
  timeUnread: {
    fontFamily: TypeStyles.bodyEmphasis.fontFamily,
    color: Colors.textPrimary,
  },
  bottomLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  memberCount: {
    fontSize: Type.meta.size,
    fontFamily: TypeStyles.bodyEmphasis.fontFamily,
    color: Colors.textMuted,
  },
  draftLabel: {
    fontSize: Type.meta.size,
    fontFamily: TypeStyles.bodyEmphasis.fontFamily,
    color: Colors.brand,
  },
  preview: {
    flex: 1,
    fontSize: Type.caption.size,
    fontFamily: TypeStyles.body.fontFamily,
    color: Colors.textSecondary,
    lineHeight: Type.caption.lineHeight,
  },
  previewUnread: {
    color: Colors.textPrimary,
    fontFamily: TypeStyles.bodyEmphasis.fontFamily,
  },
  previewWithMemberPrefix: {},
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.brand,
    marginLeft: 2,
  },
  itemThumb: {
    width: 24,
    height: 24,
    borderRadius: Radius.sm,
    backgroundColor: Colors.surfaceAlt,
  },
});
