import React from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, {
  withTiming,
  withSpring,
  type EntryExitAnimationFunction,
} from 'react-native-reanimated';
import { Space, Radius, Type, TypeStyles, Typography, Stroke } from '../../theme/designTokens';
import { Motion } from '../../theme/motionTokens';
import { useAppTheme } from '../../theme/ThemeContext';
import { useMotionConfig } from '../../hooks/useMotionConfig';
import { CachedImage } from '../CachedImage';
import { VoiceMessageBubble } from './VoiceMessageBubble';

interface Reaction {
  emoji: string;
  count: number;
  reactedByMe: boolean;
}

interface ReplyInfo {
  senderName: string;
  text: string;
}

interface MessageBubbleProps {
  text?: string;
  isMe: boolean;
  senderLabel?: string;
  timestamp?: string;
  status?: 'sending' | 'sent' | 'failed' | 'draft';
  readStatus?: 'sending' | 'sent' | 'delivered' | 'read';
  reactions?: Reaction[];
  mediaUri?: string;
  mediaType?: 'image' | 'video';
  uploadStatus?: 'uploading' | 'failed' | 'sent';
  voiceDurationMs?: number;
  voiceWaveform?: number[];
  replyTo?: ReplyInfo | null;
  isFirstInCluster?: boolean;
  isLastInCluster?: boolean;
  showAvatar?: boolean;
  /** When true, the bubble fades in + scales up on mount (new messages only).
   *  Historical messages pass `false` so they do not re-animate on scroll or
   *  initial load (AGENTS.md §16). */
  isNew?: boolean;
  /** When true, shows a "Translated" badge above the message text */
  isTranslated?: boolean;
  /** When true, renders a subtle AI visual distinction (neutral icon, tinted bubble, AI badge). */
  isAgent?: boolean;
  /** Ionicon name for the agent avatar glyph — used when isAgent is true. */
  agentAvatar?: string;
  /** When true, renders the message as an unconfirmed agent draft with a
   *  muted bubble, a "Draft" label, and a "Send" confirmation action. */
  isDraft?: boolean;
  onLongPress?: () => void;
  onReactionPress?: () => void;
  onRetry?: () => void;
  onMediaPress?: () => void;
  onReplyPress?: () => void;
  /** Called when the user confirms an agent draft. */
  onConfirmDraft?: () => void;
  /** Called when the user taps a failed agent draft to retry the send. */
  onRetryDraft?: () => void;
}

function MessageBubbleBase({
  text,
  isMe,
  senderLabel,
  timestamp,
  status,
  readStatus,
  reactions,
  mediaUri,
  mediaType,
  uploadStatus,
  voiceDurationMs,
  voiceWaveform,
  replyTo,
  isFirstInCluster = true,
  isLastInCluster = true,
  showAvatar = false,
  isNew = false,
  isTranslated = false,
  isAgent = false,
  agentAvatar,
  isDraft = false,
  onConfirmDraft,
  onRetryDraft,
  onLongPress,
  onReactionPress,
  onRetry,
  onMediaPress,
  onReplyPress,
}: MessageBubbleProps) {
  const { colors, isDark } = useAppTheme();
  const { isEnabled: motionEnabled, spring } = useMotionConfig();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  // Bubble enter animation — fade in + scale-up (spring, 250ms).
  // Only applied to genuinely new messages; historical messages pass
  // isNew=false so they never re-animate on scroll or initial mount
  // (AGENTS.md §16, WhatsApp 2026 bubble animation).
  const bubbleEntering: EntryExitAnimationFunction | undefined =
    motionEnabled && isNew
      ? () => {
          'worklet';
          return {
            animations: {
              opacity: withTiming(1, { duration: Motion.duration.slow }),
              transform: [{ scale: withSpring(1, spring.settle) }],
            },
            initialValues: {
              opacity: 0,
              transform: [{ scale: 0.92 }],
            },
          };
        }
      : undefined;

  // Reaction badge pop-in — spring-scale (0.8 → 1.0, 200ms).
  // Matches iMessage tapback pop. Respects reduced-motion (no animation).
  const reactionEntering: EntryExitAnimationFunction | undefined = motionEnabled
    ? () => {
        'worklet';
        return {
          animations: {
            transform: [{ scale: withSpring(1, spring.tap) }],
          },
          initialValues: {
            transform: [{ scale: 0.8 }],
          },
        };
      }
    : undefined;
  const hasFailed = status === 'failed' || uploadStatus === 'failed';
  const isUploading = uploadStatus === 'uploading' || status === 'sending';
  const isMedia = !!mediaUri;

  const bubbleBg = isMe
    ? colors.brand
    : isAgent
      ? `${colors.brand}0D`
      : colors.surfaceAlt;
  const bubbleText = isMe ? colors.textInverse : colors.textPrimary;
  const metaColor = isMe ? `${colors.textInverse}80` : colors.textMuted;
  const bubbleBorder = isAgent && !isMe ? `${colors.brand}26` : undefined;

  const isStandalone = isFirstInCluster && isLastInCluster;
  const isTop = isFirstInCluster && !isLastInCluster;
  const isBottom = !isFirstInCluster && isLastInCluster;

  // WhatsApp 2026 style: softer, rounder bubbles with asymmetric tail radius
  const meRadius = isStandalone
    ? { borderTopRightRadius: Radius.lg, borderBottomRightRadius: Radius.sm }
    : isTop
    ? { borderTopRightRadius: Radius.lg, borderBottomRightRadius: Radius.lg }
    : isBottom
    ? { borderTopRightRadius: Radius.sm, borderBottomRightRadius: Radius.sm }
    : { borderTopRightRadius: Radius.sm, borderBottomRightRadius: Radius.lg };

  const themRadius = isStandalone
    ? { borderTopLeftRadius: Radius.lg, borderBottomLeftRadius: Radius.sm }
    : isTop
    ? { borderTopLeftRadius: Radius.lg, borderBottomLeftRadius: Radius.lg }
    : isBottom
    ? { borderTopLeftRadius: Radius.sm, borderBottomLeftRadius: Radius.sm }
    : { borderTopLeftRadius: Radius.sm, borderBottomLeftRadius: Radius.lg };

  // Media radius — WhatsApp 2026: no visible frame, media IS the bubble
  const mediaRadius = isStandalone
    ? isMe
      ? { borderTopLeftRadius: Radius.lg, borderTopRightRadius: Radius.lg, borderBottomLeftRadius: Radius.lg, borderBottomRightRadius: Radius.sm }
      : { borderTopLeftRadius: Radius.lg, borderTopRightRadius: Radius.lg, borderBottomLeftRadius: Radius.sm, borderBottomRightRadius: Radius.lg }
    : { borderTopLeftRadius: Radius.lg, borderTopRightRadius: Radius.lg, borderBottomLeftRadius: Radius.lg, borderBottomRightRadius: Radius.lg };

  return (
    <Reanimated.View style={[styles.row, isMe && styles.rowRight]} entering={bubbleEntering}>
      {showAvatar && !isMe ? (
        isAgent ? (
          <View style={[styles.agentAvatar, { backgroundColor: `${colors.brand}12`, borderColor: `${colors.brand}26` }]}>
            <Ionicons
              name={(agentAvatar ?? 'cube-outline') as keyof typeof Ionicons.glyphMap}
              size={14}
              color={colors.brand}
            />
          </View>
        ) : (
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{(senderLabel ?? '?')[0].toUpperCase()}</Text>
          </View>
        )
      ) : (
        <View style={styles.avatarSpacer} />
      )}

      <View style={styles.bubbleColumn}>
        {senderLabel && !isMe && isFirstInCluster ? (
          <View style={styles.senderLabelRow}>
            <Text style={styles.senderName}>{senderLabel}</Text>
            {isAgent ? (
              <View style={[styles.aiChip, { backgroundColor: `${colors.brand}12`, borderColor: `${colors.brand}26` }]}>
                <Ionicons name="cube-outline" size={9} color={colors.brand} />
                <Text style={[styles.aiChipText, { color: colors.brand }]}>AI</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        <Pressable
          onLongPress={onLongPress}
          delayLongPress={350}
          style={({ pressed }) => [
            styles.bubble,
            isMe ? styles.bubbleMe : isAgent ? styles.bubbleAgent : styles.bubbleThem,
            isMedia ? [styles.bubbleMedia, mediaRadius] : (isMe ? meRadius : themRadius),
            { opacity: pressed ? 0.88 : 1 },
            hasFailed && styles.bubbleFailed,
            isDraft && styles.bubbleDraft,
            !!bubbleBorder && { borderColor: bubbleBorder },
          ]}
        >
          {replyTo ? (
            <Pressable onPress={onReplyPress} style={[styles.replyBlock, { borderLeftColor: isMe ? `${colors.textInverse}30` : colors.border }]}>
              <Text style={[styles.replyName, { color: metaColor }]}>
                {replyTo.senderName}
              </Text>
              <Text style={[styles.replyText, { color: metaColor }]} numberOfLines={2}>
                {replyTo.text}
              </Text>
            </Pressable>
          ) : null}

          {mediaUri ? (
            <Pressable onPress={onMediaPress} style={styles.mediaWrap}>
              <CachedImage
                uri={mediaUri}
                style={[styles.mediaImage, mediaRadius]}
                contentFit="cover"
              />
              {mediaType === 'video' ? (
                <View style={styles.videoBadge}>
                  <Ionicons name="play" size={16} color={colors.textInverse} />
                </View>
              ) : null}
              {isUploading ? (
                <View style={styles.uploadOverlay}>
                  <View style={styles.uploadProgressBar}>
                    <ActivityIndicator size="small" color={colors.textInverse} />
                  </View>
                  <Text style={styles.uploadText}>Sending…</Text>
                </View>
              ) : null}
            </Pressable>
          ) : null}

          {voiceDurationMs != null ? (
            <VoiceMessageBubble
              durationMs={voiceDurationMs}
              isMe={isMe}
              waveform={voiceWaveform}
            />
          ) : null}

          {text ? (
            <>
              {isTranslated ? (
                <View style={styles.translatedBadge}>
                  <Ionicons name="language" size={10} color={metaColor} />
                  <Text style={[styles.translatedLabel, { color: metaColor }]}>Translated</Text>
                </View>
              ) : null}
              {isDraft ? (
                <View style={styles.draftBadge}>
                  <Ionicons name="create-outline" size={10} color={colors.textMuted} />
                  <Text style={[styles.draftLabel, { color: colors.textMuted }]}>Draft</Text>
                </View>
              ) : null}
              <Text style={[styles.messageText, { color: bubbleText }]}>{text}</Text>
            </>
          ) : null}

          <View style={[styles.metaRow, isMe && styles.metaRowMe]}>
            {timestamp ? <Text style={[styles.timestamp, { color: metaColor }]}>{timestamp}</Text> : null}
            {isMe && (readStatus || status) ? (
              <View style={styles.statusWrap}>
                {isUploading || readStatus === 'sending' ? (
                  <Ionicons name="time-outline" size={12} color={metaColor} />
                ) : hasFailed ? (
                  <Ionicons name="alert-circle" size={12} color={isMe ? colors.textInverse : colors.danger} />
                ) : readStatus ? (
                  <Ionicons
                    name={readStatus === 'sent' ? 'checkmark' : 'checkmark-done'}
                    size={13}
                    color={readStatus === 'read' ? (isMe ? colors.textInverse : colors.brand) : metaColor}
                    accessibilityLabel={
                      readStatus === 'read'
                        ? 'Message read'
                        : readStatus === 'delivered'
                          ? 'Message delivered'
                          : 'Message sent'
                    }
                  />
                ) : (
                  <Ionicons name="checkmark" size={13} color={metaColor} accessibilityLabel="Message sent" />
                )}
              </View>
            ) : null}
          </View>
        </Pressable>

        {hasFailed && onRetry ? (
          <Pressable onPress={onRetry} style={styles.retryBadge}>
            <Ionicons name="refresh" size={11} color={colors.danger} />
            <Text style={styles.retryText}>Tap to retry</Text>
          </Pressable>
        ) : null}

        {isAgent && status === 'failed' && onRetryDraft ? (
          <Pressable
            onPress={onRetryDraft}
            style={({ pressed }) => [
              styles.retryBadge,
              { opacity: pressed ? 0.7 : 1 },
            ]}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Retry sending agent draft"
          >
            <Ionicons name="refresh" size={11} color={colors.danger} />
            <Text style={styles.retryText}>Tap to retry</Text>
          </Pressable>
        ) : null}

        {isDraft && onConfirmDraft ? (
          <Pressable
            onPress={onConfirmDraft}
            style={({ pressed }) => [
              styles.draftConfirmBadge,
              { opacity: pressed ? 0.7 : 1 },
            ]}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Send agent draft"
          >
            <Ionicons name="send" size={11} color={colors.brand} />
            <Text style={[styles.draftConfirmText, { color: colors.brand }]}>Send</Text>
          </Pressable>
        ) : null}

        {reactions && reactions.length > 0 ? (
          <Pressable onPress={onReactionPress} style={[styles.reactions, isMe && styles.reactionsRight]}>
            {reactions.slice(0, 3).map((r, i) => (
              <Reanimated.View key={i} entering={reactionEntering} style={[styles.reactionChip, r.reactedByMe && styles.reactionChipActive]}>
                <Text style={styles.reactionEmoji}>{r.emoji}</Text>
                {r.count > 1 ? <Text style={styles.reactionCount}>{r.count}</Text> : null}
              </Reanimated.View>
            ))}
          </Pressable>
        ) : null}
      </View>
    </Reanimated.View>
  );
}

export const MessageBubble = React.memo(MessageBubbleBase);

const createStyles = (colors: any) => StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Space.sm,
    paddingHorizontal: Space.md,
  },
  rowRight: {
    flexDirection: 'row-reverse',
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: Radius.full,
    backgroundColor: colors.surfaceAlt,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Space.xs,
  },
  agentAvatar: {
    width: 28,
    height: 28,
    borderRadius: Radius.full,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Space.xs,
    borderWidth: StyleSheet.hairlineWidth,
  },
  avatarText: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.semibold,
    color: colors.textPrimary,
  },
  avatarSpacer: {
    width: 28,
  },
  bubbleColumn: {
    maxWidth: '78%',
    gap: 3,
  },
  senderLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    marginBottom: 2,
    marginLeft: Space.xs,
  },
  senderName: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
    color: colors.textSecondary,
  },
  aiChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: Radius.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
  aiChipText: {
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.label.letterSpacing,
  },
  bubble: {
    paddingHorizontal: Space.sm + 2,
    paddingVertical: Space.sm - 1,
    gap: 2,
  },
  bubbleMedia: {
    padding: 0,
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  bubbleMe: {
    backgroundColor: colors.brand,
    alignSelf: 'flex-end',
  },
  bubbleAgent: {
    alignSelf: 'flex-start',
    borderWidth: StyleSheet.hairlineWidth,
  },
  bubbleThem: {
    backgroundColor: colors.surfaceAlt,
    alignSelf: 'flex-start',
  },
  bubbleFailed: {
    backgroundColor: `${colors.danger}12`,
    borderWidth: 1,
    borderColor: `${colors.danger}30`,
  },
  bubbleDraft: {
    backgroundColor: `${colors.surfaceAlt}80`,
    borderWidth: 1,
    borderColor: `${colors.border}80`,
    borderStyle: 'dashed',
  },
  draftBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginBottom: Space.xs,
  },
  draftLabel: {
    fontSize: Type.meta.size - 2,
    fontFamily: Typography.family.medium,
    letterSpacing: Type.label.letterSpacing,
  },
  draftConfirmBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: Space.xs,
    marginLeft: Space.xs,
    paddingHorizontal: Space.sm - 1,
    paddingVertical: Space.xs,
    borderRadius: Radius.full,
    backgroundColor: `${colors.brand}12`,
    alignSelf: 'flex-start',
    minHeight: 32,
  },
  draftConfirmText: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.semibold,
  },
  replyBlock: {
    borderLeftWidth: 2,
    paddingLeft: Space.sm - 1,
    marginBottom: Space.xs,
    gap: 1,
  },
  replyName: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
  },
  replyText: {
    fontSize: Type.caption.size,
    fontFamily: TypeStyles.body.fontFamily,
    lineHeight: Type.caption.lineHeight,
  },
  messageText: {
    fontSize: Type.body.size,
    fontFamily: TypeStyles.body.fontFamily,
    lineHeight: Type.body.lineHeight + 2,
    letterSpacing: Type.body.letterSpacing,
  },
  translatedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginBottom: Space.xs,
  },
  translatedLabel: {
    fontSize: Type.meta.size - 2,
    fontFamily: Typography.family.medium,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
    marginTop: 2,
    minHeight: 14,
  },
  metaRowMe: {
    opacity: 0.7,
  },
  timestamp: {
    fontSize: Type.meta.size - 1,
    fontFamily: TypeStyles.body.fontFamily,
  },
  statusWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  mediaWrap: {
    backgroundColor: 'transparent',
    position: 'relative',
  },
  mediaImage: {
    width: '100%',
    minWidth: 200,
    maxWidth: 280,
    aspectRatio: 1.1,
  },
  videoBadge: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginTop: -16,
    marginLeft: -16,
    width: 32,
    height: 32,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  uploadOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Space.xs,
  },
  uploadProgressBar: {
    marginBottom: 2,
  },
  uploadText: {
    color: colors.textInverse,
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
  },
  retryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: Space.xs,
    marginLeft: Space.xs,
    paddingHorizontal: Space.sm - 1,
    paddingVertical: Space.xs,
    borderRadius: Radius.full,
    backgroundColor: `${colors.danger}10`,
    alignSelf: 'flex-start',
  },
  retryText: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.semibold,
    color: colors.danger,
  },
  reactions: {
    flexDirection: 'row',
    gap: 4,
    marginTop: 1,
    marginLeft: Space.xs,
  },
  reactionsRight: {
    marginLeft: 0,
    marginRight: Space.xs,
    alignSelf: 'flex-end',
  },
  reactionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.surface,
    borderRadius: Radius.full,
    paddingHorizontal: Space.sm - 1,
    paddingVertical: Space.xs,
    minHeight: 26,
  },
  reactionChipActive: {
    backgroundColor: `${colors.brand}12`,
  },
  reactionEmoji: {
    fontSize: Type.caption.size,
  },
  reactionCount: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.semibold,
    color: colors.textSecondary,
  },
});