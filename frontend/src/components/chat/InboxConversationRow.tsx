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
import type { CommerceStatusTone } from '../../utils/conversationClassification';

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
  /** Server-projected listing thumbnail (context.listing.imageUrl). Shown
   *  as a 40×40 commerce context thumbnail on the right of the row. */
  contextThumbUri?: string | null;
  /** Compact commerce status label (e.g. "Offer pending", "Paid"). */
  commerceStatusLabel?: string | null;
  /** Visual tone for the commerce status badge. */
  commerceStatusTone?: CommerceStatusTone;
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
  contextThumbUri,
  commerceStatusLabel,
  commerceStatusTone = 'neutral',
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

  // Commerce context thumbnail — prefer the server projection, fall back to
  // the legacy listing lookup. Shown whenever commerce context exists.
  const commerceThumbUri = contextThumbUri ?? (itemId ? itemThumbUri ?? null : null);
  const showCommerceThumb = !!commerceThumbUri;

  const toneColors: Record<CommerceStatusTone, { bg: string; fg: string }> = {
    brand: { bg: colors.brandSubtle, fg: colors.brand },
    success: { bg: colors.successSubtle, fg: colors.success },
    warning: { bg: colors.warningSubtle, fg: colors.warning },
    neutral: { bg: colors.surfaceAlt, fg: colors.textSecondary },
  };
  const tone = toneColors[commerceStatusTone] ?? toneColors.neutral;

  const accessibilityParts: string[] = [
    displayTitle,
    isTyping ? 'typing...' : lastMessage,
    lastMessageTime,
  ];
  if (unread) accessibilityParts.push('unread');
  if (isMuted) accessibilityParts.push('muted');
  if (isPinned) accessibilityParts.push('pinned');
  if (isGroup && memberCount) accessibilityParts.push(t('conversation.memberCount', { count: memberCount }));
  if (commerceStatusLabel) accessibilityParts.push(commerceStatusLabel);

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
                <Ionicons name="pin" size={11} color={colors.textMuted} style={styles.metaIcon} />
              )}
              {isMuted && (
                <Ionicons name="volume-mute" size={11} color={colors.textMuted} style={styles.metaIcon} />
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
                numberOfLines={1}
              >
                {draftText ?? lastMessage}
              </Text>
            )}
            {commerceStatusLabel ? (
              <View style={[styles.commerceBadge, { backgroundColor: tone.bg }]}>
                <Text style={[styles.commerceBadgeText, { color: tone.fg }]} numberOfLines={1}>
                  {commerceStatusLabel}
                </Text>
              </View>
            ) : null}
            {unread && !draftText ? (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadBadgeText}>
                  {unreadCount && unreadCount > 1 ? (unreadCount > 99 ? '99+' : unreadCount) : ''}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
        {showCommerceThumb && commerceThumbUri ? (
          <CachedImage
            uri={commerceThumbUri}
            style={styles.itemThumb}
            contentFit="cover"
          />
        ) : null}
      </View>
    </AnimatedPressable>
  );
}

export const InboxConversationRow = React.memo(InboxConversationRowBase);

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Space.sm,
    paddingHorizontal: Space.md,
    gap: Space.sm,
    minHeight: 68 },
  rowUnread: {},
  avatarWrap: {
    position: 'relative' },
  body: {
    flex: 1,
    justifyContent: 'center',
    gap: 2 },
  topLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center' },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
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
    gap: Space.xs },
  memberCount: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypeStyles.bodyEmphasis.fontFamily,
    color: colors.textMuted },
  draftLabel: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypeStyles.bodyEmphasis.fontFamily,
    color: colors.brand },
  // Snippet: Type.body — readable, not cramped. Single line for density.
  preview: {
    flex: 1,
    fontSize: TypographyV2.meta.size,
    fontFamily: TypeStyles.body.fontFamily,
    color: colors.textSecondary,
    lineHeight: TypographyV2.meta.lineHeight,
    letterSpacing: TypographyV2.meta.letterSpacing },
  typingPreview: {
    color: colors.brand,
    fontFamily: TypeStyles.bodyEmphasis.fontFamily },
  typingDotsWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    height: TypographyV2.meta.lineHeight },
  previewUnread: {
    color: colors.textPrimary,
    fontFamily: TypeStyles.bodyEmphasis.fontFamily },
  // Compact commerce status badge — quiet tinted pill, no chrome.
  commerceBadge: {
    borderRadius: Radius.sm,
    paddingHorizontal: Space.xs + 1,
    paddingVertical: 1,
    maxWidth: 120 },
  commerceBadgeText: {
    fontSize: TypographyV2.meta.size - 1,
    fontFamily: Typography.family.semibold,
    letterSpacing: TypographyV2.meta.letterSpacing },
  // Unread count badge — compact pill, single unread shows empty dot-width.
  unreadBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: Radius.full,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5 },
  unreadBadgeText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: Typography.family.semibold,
    color: colors.textInverse,
    lineHeight: 12 },
  // Commerce thumbnail — 40×40 listing context, rounded media edge.
  itemThumb: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    backgroundColor: colors.surfaceAlt } });
