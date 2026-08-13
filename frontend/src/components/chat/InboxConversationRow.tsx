import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  cancelAnimation,
} from 'react-native-reanimated';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { useMotionConfig } from '../../hooks/useMotionConfig';
import { Space, Radius, Type, TypeStyles, Typography, Stroke } from '../../theme/designTokens';
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
  isTyping?: boolean;
  onPress: () => void;
  onLongPress?: () => void;
  accessibilityHint?: string;
}

function InboxConversationRowBase({
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
  isTyping,
  onPress,
  onLongPress,
  accessibilityHint,
}: InboxConversationRowProps) {
  const { colors } = useAppTheme();
  const { isEnabled } = useMotionConfig();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  const typingOpacity = useSharedValue(1);

  React.useEffect(() => {
    if (!isTyping || !isEnabled) {
      typingOpacity.value = 1;
      return;
    }

    typingOpacity.value = withRepeat(
      withSequence(
        withTiming(0.4, { duration: 700 }),
        withTiming(1, { duration: 700 }),
      ),
      -1,
      false,
    );

    return () => {
      cancelAnimation(typingOpacity);
    };
  }, [isTyping, isEnabled, typingOpacity]);

  const typingAnimStyle = useAnimatedStyle(() => ({
    opacity: typingOpacity.value,
  }));

  const accessibilityParts: string[] = [
    displayTitle,
    isTyping ? 'typing...' : lastMessage,
    lastMessageTime,
  ];
  if (unread) accessibilityParts.push('unread');
  if (isMuted) accessibilityParts.push('muted');
  if (isPinned) accessibilityParts.push('pinned');
  if (isGroup && memberCount) accessibilityParts.push(`${memberCount} members`);

  return (
    <AnimatedPressable
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.85}
      scaleValue={0.98}
      hapticFeedback="light"
      accessibilityLabel={accessibilityParts.join(', ')}
      accessibilityRole="button"
      accessibilityHint={accessibilityHint ?? 'Opens the conversation thread. Long press for quick actions'}
    >
      <View style={[styles.row, unread && styles.rowUnread]}>
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
                <Ionicons name="pin" size={12} color={colors.textMuted} style={styles.metaIcon} />
              )}
              {isMuted && (
                <Ionicons name="volume-mute" size={12} color={colors.textMuted} style={styles.metaIcon} />
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
            {isTyping ? (
              <Reanimated.Text
                style={[styles.preview, styles.typingPreview, typingAnimStyle]}
                numberOfLines={1}
              >
                typing...
              </Reanimated.Text>
            ) : (
              <Text
                style={[
                  styles.preview,
                  unread && styles.previewUnread,
                ]}
                numberOfLines={1}
              >
                {draftText ?? lastMessage}
              </Text>
            )}
            {unread && !draftText ? (
              <View style={styles.unreadIndicator} />
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

export const InboxConversationRow = React.memo(InboxConversationRowBase);

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Space.sm + 2,
    paddingHorizontal: Space.md,
    gap: Space.sm + 2,
    minHeight: 68,
  },
  rowUnread: {},
  avatarWrap: {
    position: 'relative',
  },
  body: {
    flex: 1,
    justifyContent: 'center',
    gap: Space.xs + 1,
  },
  topLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 1,
    flex: 1,
    minWidth: 0,
  },
  // Name: Type.bodyEmphasis — clear, readable, emphasis on identity
  name: {
    fontSize: Type.bodyEmphasis.size,
    fontFamily: TypeStyles.body.fontFamily,
    color: colors.textPrimary,
    letterSpacing: Type.bodyEmphasis.letterSpacing,
    lineHeight: Type.bodyEmphasis.lineHeight,
  },
  nameUnread: {
    fontFamily: TypeStyles.bodyEmphasis.fontFamily,
  },
  metaIcon: {
    marginLeft: 1,
  },
  // Timestamp: Type.caption — quiet metadata
  time: {
    fontSize: Type.caption.size,
    fontFamily: TypeStyles.body.fontFamily,
    color: colors.textMuted,
    paddingLeft: Space.xs,
    letterSpacing: Type.caption.letterSpacing,
  },
  timeUnread: {
    fontFamily: TypeStyles.bodyEmphasis.fontFamily,
    color: colors.textPrimary,
  },
  bottomLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 1,
  },
  memberCount: {
    fontSize: Type.caption.size,
    fontFamily: TypeStyles.bodyEmphasis.fontFamily,
    color: colors.textMuted,
  },
  draftLabel: {
    fontSize: Type.caption.size,
    fontFamily: TypeStyles.bodyEmphasis.fontFamily,
    color: colors.brand,
  },
  // Snippet: Type.body — readable, not cramped
  preview: {
    flex: 1,
    fontSize: Type.body.size,
    fontFamily: TypeStyles.body.fontFamily,
    color: colors.textSecondary,
    lineHeight: Type.body.lineHeight,
    letterSpacing: Type.body.letterSpacing,
  },
  typingPreview: {
    color: colors.brand,
    fontFamily: TypeStyles.bodyEmphasis.fontFamily,
  },
  previewUnread: {
    color: colors.textPrimary,
    fontFamily: TypeStyles.bodyEmphasis.fontFamily,
  },
  // Unread indicator — refined dot, not a large badge
  unreadIndicator: {
    width: 8,
    height: 8,
    borderRadius: Radius.full,
    backgroundColor: colors.brand,
    marginLeft: 2,
  },
  // Commerce thumbnail — clean, rounded, right-side context
  itemThumb: {
    width: 28,
    height: 28,
    borderRadius: Radius.sm + 1,
    backgroundColor: colors.surfaceAlt,
  },
});
