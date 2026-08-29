import React from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, {
  withTiming,
  withSpring,
  type EntryExitAnimationFunction,
} from 'react-native-reanimated';
import { Space, Radius, Type, TypeStyles, Typography, Stroke, AspectRatio } from '../../theme/designTokens';
import { Motion } from '../../theme/motionTokens';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { useMotionConfig } from '../../hooks/useMotionConfig';
import { CachedImage } from '../CachedImage';
import { VoiceMessageBubble } from './VoiceMessageBubble';
import { VoiceTranscriptionPanel } from './VoiceTranscriptionPanel';

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
  id: string;
  conversationId: string;
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
  voiceContainer?: 'm4a' | 'ogg' | 'webm' | 'mp4';
  voiceCodec?: 'aac' | 'opus' | 'mp3';
  voiceModerationState?: 'pending' | 'allowed' | 'limited' | 'blocked';
  replyTo?: ReplyInfo | null;
  isFirstInCluster?: boolean;
  isLastInCluster?: boolean;
  showAvatar?: boolean;
  /** When true, the bubble fades in + scales up on mount (new messages only).
   *  Historical messages pass `false` so they do not re-animate on scroll or
   *  initial load (AGENTS.md §16). */
  isNew?: boolean;
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
  id,
  conversationId,
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
  voiceContainer,
  voiceCodec,
  voiceModerationState,
  replyTo,
  isFirstInCluster = true,
  isLastInCluster = true,
  showAvatar = false,
  isNew = false,
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
              opacity: withTiming(1, { duration: Motion.duration.normal }),
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
      ? colors.brandSubtle
      : colors.surfaceAlt;
  const bubbleText = isMe ? colors.textInverse : colors.textPrimary;
  const metaColor = isMe ? colors.scrimTextTertiary : colors.textMuted;
  const bubbleBorder = undefined;

  const isStandalone = isFirstInCluster && isLastInCluster;
  const isTop = isFirstInCluster && !isLastInCluster;
  const isBottom = !isFirstInCluster && isLastInCluster;

  // WhatsApp 2026 style: fully-rounded 20px bubbles with asymmetric tail radius
  const meRadius = isStandalone
    ? { borderTopRightRadius: Radius.chat, borderBottomRightRadius: Radius.sm }
    : isTop
    ? { borderTopRightRadius: Radius.chat, borderBottomRightRadius: Radius.chat }
    : isBottom
    ? { borderTopRightRadius: Radius.sm, borderBottomRightRadius: Radius.sm }
    : { borderTopRightRadius: Radius.sm, borderBottomRightRadius: Radius.chat };

  const themRadius = isStandalone
    ? { borderTopLeftRadius: Radius.chat, borderBottomLeftRadius: Radius.sm }
    : isTop
    ? { borderTopLeftRadius: Radius.chat, borderBottomLeftRadius: Radius.chat }
    : isBottom
    ? { borderTopLeftRadius: Radius.sm, borderBottomLeftRadius: Radius.sm }
    : { borderTopLeftRadius: Radius.sm, borderBottomLeftRadius: Radius.chat };

  // Media radius — WhatsApp 2026: no visible frame, media IS the bubble
  const mediaRadius = isStandalone
    ? isMe
      ? { borderTopLeftRadius: Radius.chat, borderTopRightRadius: Radius.chat, borderBottomLeftRadius: Radius.chat, borderBottomRightRadius: Radius.sm }
      : { borderTopLeftRadius: Radius.chat, borderTopRightRadius: Radius.chat, borderBottomLeftRadius: Radius.sm, borderBottomRightRadius: Radius.chat }
    : { borderTopLeftRadius: Radius.chat, borderTopRightRadius: Radius.chat, borderBottomLeftRadius: Radius.chat, borderBottomRightRadius: Radius.chat };

  return (
    <Reanimated.View style={[styles.row, isMe && styles.rowRight]} entering={bubbleEntering}>
      {showAvatar && !isMe ? (
        isAgent ? (
          <View style={[styles.agentAvatar, { backgroundColor: colors.brandSubtle, borderColor: colors.borderSubtle }]}>
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
              <View style={[styles.aiChip, { backgroundColor: colors.brandSubtle, borderColor: colors.borderSubtle }]}>
                <Ionicons name="cube-outline" size={9} color={colors.brand} />
                <Text style={[styles.aiChipText, { color: colors.brand }]}>AI</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        <Pressable
          onLongPress={onLongPress}
          delayLongPress={350}
          accessibilityLabel="Message"
          style={({ pressed }) => [
            styles.bubble,
            isMe ? styles.bubbleMe : isAgent ? styles.bubbleAgent : styles.bubbleThem,
            isMedia ? [styles.bubbleMedia, mediaRadius] : (isMe ? meRadius : themRadius),
            { opacity: pressed ? 0.88 : 1 },
            hasFailed && styles.bubbleFailed,
            isDraft && styles.bubbleDraft,
            !!bubbleBorder && { borderColor: bubbleBorder },
          ]}
        accessibilityRole="button"
        >
          {replyTo ? (
            <Pressable onPress={onReplyPress} style={[styles.replyBlock, { borderLeftColor: isMe ? colors.scrimTextTertiary : colors.border }]} accessibilityRole="button">
              <Text style={[styles.replyName, { color: metaColor }]}>
                {replyTo.senderName}
              </Text>
              <Text style={[styles.replyText, { color: metaColor }]} numberOfLines={2}>
                {replyTo.text}
              </Text>
            </Pressable>
          ) : null}

          {mediaUri ? (
            <Pressable onPress={onMediaPress} style={styles.mediaWrap} accessibilityRole="button" accessibilityLabel="Media Press">
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
            <>
              <VoiceMessageBubble
                messageId={id}
                conversationId={conversationId}
                durationMs={voiceDurationMs}
                isMe={isMe}
                waveform={voiceWaveform}
                container={voiceContainer}
                codec={voiceCodec}
                moderationState={voiceModerationState}
              />
              <VoiceTranscriptionPanel
                conversationId={conversationId}
                messageId={id}
              />
            </>
          ) : null}

          {text ? (
            <>
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
          <Pressable onPress={onRetry} style={styles.retryBadge} accessibilityRole="button">
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
          <Pressable onPress={onReactionPress} style={[styles.reactions, isMe && styles.reactionsRight]} accessibilityRole="button">
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

const createStyles = (colors: ThemeColors) => StyleSheet.create({
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
    maxWidth: '75%',
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
  },
  bubbleThem: {
    backgroundColor: colors.surfaceAlt,
    alignSelf: 'flex-start',
  },
  bubbleFailed: {
    backgroundColor: colors.dangerSubtle,
    borderWidth: Stroke.standard,
    borderColor: colors.dangerBorder,
  },
  bubbleDraft: {
    backgroundColor: `${colors.surfaceAlt}80`,
    borderWidth: Stroke.standard,
    borderColor: colors.borderSubtle,
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
    backgroundColor: colors.brandSubtle,
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
    aspectRatio: AspectRatio.portrait,
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
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
  },
  uploadOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.overlay,
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
    backgroundColor: colors.dangerSubtle,
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
    backgroundColor: colors.brandSubtle,
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