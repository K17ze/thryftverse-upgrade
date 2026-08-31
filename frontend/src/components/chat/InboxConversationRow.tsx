import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  cancelAnimation } from 'react-native-reanimated';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { useMotionConfig } from '../../hooks/useMotionConfig';
import { Motion } from '../../theme/motionTokens';
import { Space, Radius, TypeStyles, Typography, Stroke } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { CachedImage } from '../CachedImage';
import { AnimatedPressable } from '../AnimatedPressable';
import { useAppTranslation } from '../../i18n/useAppTranslation';

export interface InboxConversationRowProps {
  displayTitle: string;
  lastMessage: string;
  lastMessageTime: string;
  unread: boolean;
  unreadCount?: number;
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
  /**
   * TestID for Maestro/automation semantic selectors. When provided,
   * passes through to the underlying Pressable so Maestro flows can
   * tapOn by id instead of brittle coordinate taps (P0.6).
   */
  testID?: string;
}

// ── TypingDots — iMessage-style animated three-dot typing indicator ──
// Three dots that pulse in sequence, creating a compact visual cue that
// someone is typing. Replaces the text "typing..." which reads as
// prototype-grade. Respects reduced motion (static dots, no animation).
function TypingDots({ color, size = 5 }: { color: string; size?: number }) {
  const { isEnabled } = useMotionConfig();
  const dot1 = useSharedValue(0.3);
  const dot2 = useSharedValue(0.3);
  const dot3 = useSharedValue(0.3);

  React.useEffect(() => {
    if (!isEnabled) return;
    const config = { duration: 600 };
    dot1.value = withRepeat(
      withSequence(withTiming(1, { duration: 200 }), withTiming(0.3, config)),
      -1, false,
    );
    const t2 = setTimeout(() => {
      dot2.value = withRepeat(
        withSequence(withTiming(1, { duration: 200 }), withTiming(0.3, config)),
        -1, false,
      );
    }, 200);
    const t3 = setTimeout(() => {
      dot3.value = withRepeat(
        withSequence(withTiming(1, { duration: 200 }), withTiming(0.3, config)),
        -1, false,
      );
    }, 400);
    return () => { clearTimeout(t2); clearTimeout(t3); };
  }, [isEnabled, dot1, dot2, dot3]);

  const s1 = useAnimatedStyle(() => ({ opacity: dot1.value }));
  const s2 = useAnimatedStyle(() => ({ opacity: dot2.value }));
  const s3 = useAnimatedStyle(() => ({ opacity: dot3.value }));

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
      <Reanimated.View style={[{ width: size, height: size, borderRadius: size, backgroundColor: color }, s1]} />
      <Reanimated.View style={[{ width: size, height: size, borderRadius: size, backgroundColor: color }, s2]} />
      <Reanimated.View style={[{ width: size, height: size, borderRadius: size, backgroundColor: color }, s3]} />
    </View>
  );
}

function InboxConversationRowBase({
  displayTitle,
  lastMessage,
  lastMessageTime,
  unread,
  unreadCount,
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
  testID }: InboxConversationRowProps) {
  const { colors } = useAppTheme();
  const { t } = useAppTranslation('messaging');
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
        withTiming(0.4, { duration: Motion.duration.slower }),
        withTiming(1, { duration: Motion.duration.slower }),
      ),
      -1,
      false,
    );

    return () => {
      cancelAnimation(typingOpacity);
    };
  }, [isTyping, isEnabled, typingOpacity]);

  const typingAnimStyle = useAnimatedStyle(() => ({
    opacity: typingOpacity.value }));

  const accessibilityParts: string[] = [
    displayTitle,
    isTyping ? 'typing...' : lastMessage,
    lastMessageTime,
  ];
  if (unread) accessibilityParts.push('unread');
  if (isMuted) accessibilityParts.push('muted');
  if (isPinned) accessibilityParts.push('pinned');
  if (isGroup && memberCount) accessibilityParts.push(t('conversation.memberCount', { count: memberCount }));

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
      testID={testID}
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
                {t('conversation.memberCount', { count: memberCount })}
              </Text>
            )}
            {draftText ? (
              <Text style={styles.draftLabel} numberOfLines={1}>
                Draft
              </Text>
            ) : null}
            {isTyping ? (
              <View style={styles.typingDotsWrap}>
                <TypingDots color={colors.brand} />
              </View>
            ) : (
              <Text
                style={[
                  styles.preview,
                  unread && styles.previewUnread,
                ]}
                numberOfLines={2}
              >
                {draftText ?? lastMessage}
              </Text>
            )}
            {unread && !draftText ? (
              unreadCount && unreadCount > 1 ? (
                <View style={styles.unreadBadge}>
                  <Text style={styles.unreadBadgeText}>
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </Text>
                </View>
              ) : (
                <View style={styles.unreadIndicator} />
              )
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
    minHeight: 76 },
  rowUnread: {},
  avatarWrap: {
    position: 'relative' },
  body: {
    flex: 1,
    justifyContent: 'center',
    gap: Space.xs + 1 },
  topLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center' },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 1,
    flex: 1,
    minWidth: 0 },
  // Name: Type.bodyStrong — clear, readable, emphasis on identity
  name: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypeStyles.body.fontFamily,
    color: colors.textPrimary,
    letterSpacing: TypographyV2.bodyStrong.letterSpacing,
    lineHeight: TypographyV2.bodyStrong.lineHeight },
  nameUnread: {
    fontFamily: TypeStyles.bodyEmphasis.fontFamily },
  metaIcon: {
    marginLeft: 1 },
  // Timestamp: Type.caption — quiet metadata, tabular-nums for stable layout
  time: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypeStyles.body.fontFamily,
    color: colors.textMuted,
    paddingLeft: Space.xs,
    letterSpacing: TypographyV2.meta.letterSpacing,
    fontVariant: ['tabular-nums'] as ['tabular-nums'] },
  timeUnread: {
    fontFamily: TypeStyles.bodyEmphasis.fontFamily,
    color: colors.textPrimary },
  bottomLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 1 },
  memberCount: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypeStyles.bodyEmphasis.fontFamily,
    color: colors.textMuted },
  draftLabel: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypeStyles.bodyEmphasis.fontFamily,
    color: colors.brand },
  // Snippet: Type.body — readable, not cramped
  preview: {
    flex: 1,
    fontSize: TypographyV2.body.size,
    fontFamily: TypeStyles.body.fontFamily,
    color: colors.textSecondary,
    lineHeight: TypographyV2.body.lineHeight,
    letterSpacing: TypographyV2.body.letterSpacing },
  typingPreview: {
    color: colors.brand,
    fontFamily: TypeStyles.bodyEmphasis.fontFamily },
  typingDotsWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    height: TypographyV2.body.lineHeight },
  previewUnread: {
    color: colors.textPrimary,
    fontFamily: TypeStyles.bodyEmphasis.fontFamily },
  // Unread indicator — refined dot for single unread
  unreadIndicator: {
    width: 8,
    height: 8,
    borderRadius: Radius.full,
    backgroundColor: colors.brand,
    marginLeft: 2 },
  // Unread count badge — for multiple unread messages (WhatsApp/iMessage style)
  unreadBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: Radius.full,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
    marginLeft: 2 },
  unreadBadgeText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: Typography.family.semibold,
    color: colors.textInverse,
    lineHeight: 12 },
  // Commerce thumbnail — clean, rounded, right-side context
  itemThumb: {
    width: 28,
    height: 28,
    borderRadius: Radius.sm + 1,
    backgroundColor: colors.surfaceAlt } });
