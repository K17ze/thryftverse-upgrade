import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Space, Radius, Type, TypeStyles } from '../../theme/designTokens';
import { useAppTheme } from '../../theme/ThemeContext';
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
  status?: 'sending' | 'sent' | 'failed';
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
  /** When true, shows a "Translated" badge above the message text */
  isTranslated?: boolean;
  /** When true, renders a subtle AI visual distinction (sparkles icon, tinted bubble, AI badge). */
  isAgent?: boolean;
  /** Ionicon name for the agent avatar glyph — used when isAgent is true. */
  agentAvatar?: string;
  onLongPress?: () => void;
  onReactionPress?: () => void;
  onRetry?: () => void;
  onMediaPress?: () => void;
  onReplyPress?: () => void;
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
  isTranslated = false,
  isAgent = false,
  agentAvatar,
  onLongPress,
  onReactionPress,
  onRetry,
  onMediaPress,
  onReplyPress,
}: MessageBubbleProps) {
  const { colors, isDark } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const hasFailed = status === 'failed' || uploadStatus === 'failed';
  const isUploading = uploadStatus === 'uploading' || status === 'sending';

  const bubbleBg = isMe
    ? colors.brand
    : isAgent
      ? `${colors.brand}${isDark ? '15' : '0D'}`
      : colors.surfaceAlt;
  const bubbleText = isMe ? colors.textInverse : colors.textPrimary;
  const metaColor = isMe ? `${colors.textInverse}CC` : colors.textMuted;

  const isStandalone = isFirstInCluster && isLastInCluster;
  const isTop = isFirstInCluster && !isLastInCluster;
  const isBottom = !isFirstInCluster && isLastInCluster;
  const isMiddle = !isFirstInCluster && !isLastInCluster;

  const meRadius = isStandalone
    ? { borderTopRightRadius: Radius.lg, borderBottomRightRadius: Radius.lg }
    : isTop
    ? { borderTopRightRadius: Radius.sm, borderBottomRightRadius: Radius.lg }
    : isBottom
    ? { borderTopRightRadius: Radius.lg, borderBottomRightRadius: Radius.sm }
    : { borderTopRightRadius: Radius.sm, borderBottomRightRadius: Radius.sm };

  const themRadius = isStandalone
    ? { borderTopLeftRadius: Radius.lg, borderBottomLeftRadius: Radius.lg }
    : isTop
    ? { borderTopLeftRadius: Radius.sm, borderBottomLeftRadius: Radius.lg }
    : isBottom
    ? { borderTopLeftRadius: Radius.lg, borderBottomLeftRadius: Radius.sm }
    : { borderTopLeftRadius: Radius.sm, borderBottomLeftRadius: Radius.sm };

  return (
    <View style={[styles.row, isMe && styles.rowRight]}>
      {showAvatar && !isMe ? (
        isAgent ? (
          <View style={[styles.agentAvatar, { backgroundColor: `${colors.brand}14` }]}>
            <Ionicons
              name={(agentAvatar ?? 'sparkles') as keyof typeof Ionicons.glyphMap}
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
              <View style={[styles.aiChip, { backgroundColor: `${colors.brand}14` }]}>
                <Ionicons name="sparkles" size={8} color={colors.brand} />
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
            isMe ? styles.bubbleMe : styles.bubbleThem,
            isMe ? meRadius : themRadius,
            { opacity: pressed ? 0.9 : 1 },
            hasFailed && styles.bubbleFailed,
          ]}
        >
          {replyTo ? (
            <Pressable onPress={onReplyPress} style={[styles.replyBlock, { borderLeftColor: isMe ? `${colors.textInverse}40` : colors.border }]}>
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
                style={styles.mediaImage}
                contentFit="cover"
              />
              {mediaType === 'video' ? (
                <View style={styles.videoBadge}>
                  <Ionicons name="play" size={14} color={colors.textInverse} />
                </View>
              ) : null}
              {isUploading ? (
                <View style={styles.uploadOverlay}>
                  <Ionicons name="cloud-upload-outline" size={20} color={colors.textInverse} />
                  <Text style={styles.uploadText}>Sending...</Text>
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
                  <Ionicons name="language" size={9} color={metaColor} />
                  <Text style={[styles.translatedLabel, { color: metaColor }]}>Translated</Text>
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
                  <Ionicons name="time-outline" size={14} color={metaColor} />
                ) : hasFailed ? (
                  <Ionicons name="alert-circle" size={14} color={isMe ? colors.textInverse : colors.danger} />
                ) : readStatus ? (
                  <Ionicons
                    name={readStatus === 'sent' ? 'checkmark' : 'checkmark-done'}
                    size={14}
                    color={readStatus === 'read' ? colors.brand : metaColor}
                    accessibilityLabel={
                      readStatus === 'read'
                        ? 'Message read'
                        : readStatus === 'delivered'
                          ? 'Message delivered'
                          : 'Message sent'
                    }
                  />
                ) : (
                  <Ionicons name="checkmark" size={14} color={metaColor} accessibilityLabel="Message sent" />
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

        {reactions && reactions.length > 0 ? (
          <Pressable onPress={onReactionPress} style={[styles.reactions, isMe && styles.reactionsRight]}>
            {reactions.slice(0, 3).map((r, i) => (
              <View key={i} style={[styles.reactionChip, r.reactedByMe && styles.reactionChipActive]}>
                <Text style={styles.reactionEmoji}>{r.emoji}</Text>
                {r.count > 1 ? <Text style={styles.reactionCount}>{r.count}</Text> : null}
              </View>
            ))}
          </Pressable>
        ) : null}
      </View>
    </View>
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
  },
  avatarText: {
    fontSize: Type.meta.size,
    fontFamily: TypeStyles.title.fontFamily,
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
    fontFamily: TypeStyles.bodyEmphasis.fontFamily,
    color: colors.brand,
  },
  aiChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: Radius.full,
  },
  aiChipText: {
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: TypeStyles.bodyEmphasis.fontFamily,
    letterSpacing: Type.metaElevated.letterSpacing,
  },
  bubble: {
    paddingHorizontal: Space.sm + 2,
    paddingVertical: Space.sm,
    gap: 3,
  },
  bubbleMe: {
    backgroundColor: colors.brand,
    alignSelf: 'flex-end',
  },
  bubbleThem: {
    backgroundColor: colors.surfaceAlt,
    alignSelf: 'flex-start',
  },
  bubbleFailed: {
    backgroundColor: `${colors.danger}15`,
  },
  replyBlock: {
    borderLeftWidth: 3,
    paddingLeft: Space.sm,
    marginBottom: Space.xs,
    gap: 2,
  },
  replyName: {
    fontSize: Type.caption.size,
    fontFamily: TypeStyles.bodyEmphasis.fontFamily,
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
    fontFamily: TypeStyles.metadata.fontFamily,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 3,
    marginTop: 1,
  },
  metaRowMe: {
    opacity: 0.7,
  },
  timestamp: {
    fontSize: Type.meta.size,
    fontFamily: TypeStyles.body.fontFamily,
  },
  statusWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  mediaWrap: {
    borderRadius: Radius.md,
    overflow: 'hidden',
    backgroundColor: colors.surfaceAlt,
  },
  mediaImage: {
    width: '100%',
    minWidth: 200,
    maxWidth: 280,
    aspectRatio: 1.15,
    borderRadius: Radius.md,
  },
  videoBadge: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginTop: -14,
    marginLeft: -14,
    width: 28,
    height: 28,
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
    borderRadius: Radius.md,
    gap: Space.xs,
  },
  uploadText: {
    color: colors.textInverse,
    fontSize: Type.caption.size,
    fontFamily: TypeStyles.bodyEmphasis.fontFamily,
  },
  retryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: Space.xs,
    marginLeft: Space.xs,
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs,
    borderRadius: Radius.md,
    backgroundColor: `${colors.danger}14`,
    alignSelf: 'flex-start',
  },
  retryText: {
    fontSize: Type.meta.size,
    fontFamily: TypeStyles.bodyEmphasis.fontFamily,
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
    borderRadius: Radius.lg,
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs,
    minHeight: 28,
  },
  reactionChipActive: {
    backgroundColor: `${colors.brand}15`,
  },
  reactionEmoji: {
    fontSize: Type.captionElevated.size,
  },
  reactionCount: {
    fontSize: Type.meta.size,
    fontFamily: TypeStyles.bodyEmphasis.fontFamily,
    color: colors.textSecondary,
  },
});