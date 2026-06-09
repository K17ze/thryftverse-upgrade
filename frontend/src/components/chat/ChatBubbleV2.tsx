import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { Space, Radius, Type , Typography  } from '../../theme/designTokens';
import { CachedImage } from '../CachedImage';

interface Reaction {
  emoji: string;
  count: number;
  reactedByMe: boolean;
}

interface ReplyInfo {
  senderName: string;
  text: string;
}

interface ChatBubbleV2Props {
  text?: string;
  isMe: boolean;
  senderLabel?: string;
  timestamp: string;
  status?: 'sending' | 'sent' | 'failed';
  reactions?: Reaction[];
  mediaUri?: string;
  mediaType?: 'image' | 'video';
  uploadStatus?: 'uploading' | 'failed' | 'sent';
  replyTo?: ReplyInfo | null;
  isFirstInCluster?: boolean;
  isLastInCluster?: boolean;
  showAvatar?: boolean;
  onLongPress?: () => void;
  onReactionPress?: () => void;
  onRetry?: () => void;
}

export function ChatBubbleV2({
  text,
  isMe,
  senderLabel,
  timestamp,
  status,
  reactions,
  mediaUri,
  mediaType,
  uploadStatus,
  replyTo,
  isFirstInCluster = true,
  isLastInCluster = true,
  showAvatar = false,
  onLongPress,
  onReactionPress,
  onRetry,
}: ChatBubbleV2Props) {
  const bgColor = isMe ? Colors.brand : Colors.surfaceAlt;
  const textColor = isMe ? Colors.textInverse : Colors.textPrimary;
  const metaColor = isMe ? Colors.textInverse : Colors.textMuted;
  const replyBorderColor = isMe ? Colors.textInverse : Colors.border;

  const hasFailed = status === 'failed' || uploadStatus === 'failed';
  const isUploading = uploadStatus === 'uploading' || status === 'sending';

  return (
    <View style={[styles.row, isMe && styles.rowRight]}>
      {showAvatar && !isMe ? (
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{(senderLabel ?? '?')[0].toUpperCase()}</Text>
        </View>
      ) : (
        <View style={styles.avatarSpacer} />
      )}

      <Pressable
        onLongPress={onLongPress}
        delayLongPress={350}
        style={({ pressed }) => [
          styles.bubble,
          { backgroundColor: bgColor, opacity: pressed ? 0.9 : 1 },
        ]}
      >
        {senderLabel && !isMe && isFirstInCluster ? (
          <Text style={[styles.senderName, { color: Colors.brand }]}>{senderLabel}</Text>
        ) : null}

        {replyTo ? (
          <View style={[styles.replyBlock, { borderLeftColor: replyBorderColor }]}>
            <Text style={[styles.replyName, { color: metaColor }]}>
              {replyTo.senderName}
            </Text>
            <Text style={[styles.replyText, { color: metaColor }]} numberOfLines={2}>
              {replyTo.text}
            </Text>
          </View>
        ) : null}

        {mediaUri ? (
          <View style={styles.mediaWrap}>
            <CachedImage uri={mediaUri} style={styles.mediaImage} contentFit="cover" />
            {mediaType === 'video' ? (
              <View style={styles.videoBadge}>
                <Ionicons name="play" size={16} color={Colors.textInverse} />
              </View>
            ) : null}
            {isUploading ? (
              <View style={styles.uploadOverlay}>
                <Text style={styles.uploadText}>Sending...</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {text ? (
          <Text style={[styles.messageText, { color: textColor }]}>{text}</Text>
        ) : null}

        <View style={[styles.metaRow, isMe && styles.metaRowMe]}>
          <Text style={[styles.timestamp, { color: metaColor }]}>{timestamp}</Text>
          {isMe && status ? (
            <View style={styles.statusWrap}>
              {isUploading ? (
                <Ionicons name="time-outline" size={12} color={metaColor} />
              ) : hasFailed ? (
                <Ionicons name="alert-circle" size={12} color={Colors.danger} />
              ) : (
                <Ionicons name="checkmark" size={12} color={metaColor} />
              )}
            </View>
          ) : null}
        </View>

        {hasFailed && onRetry ? (
          <Pressable onPress={onRetry} style={styles.retryBadge}>
            <Ionicons name="refresh" size={12} color={Colors.danger} />
            <Text style={styles.retryText}>Tap to retry</Text>
          </Pressable>
        ) : null}
      </Pressable>

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
  );
}

const styles = StyleSheet.create({
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
    backgroundColor: Colors.surfaceAlt,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  avatarText: {
    fontSize: 12,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
  },
  avatarSpacer: {
    width: 28,
  },
  bubble: {
    maxWidth: '72%',
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm + 2,
    gap: 4,
    borderRadius: Radius.lg,
  },
  senderName: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
    marginBottom: 2,
  },
  replyBlock: {
    borderLeftWidth: 3,
    paddingLeft: Space.sm,
    marginBottom: 2,
    gap: 2,
  },
  replyName: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
  },
  replyText: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    lineHeight: Type.caption.lineHeight,
  },
  messageText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
    lineHeight: Type.body.lineHeight + 2,
    letterSpacing: Type.body.letterSpacing,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
    marginTop: 2,
  },
  metaRowMe: {
    opacity: 0.7,
  },
  timestamp: {
    fontSize: 10,
    fontFamily: Typography.family.regular,
  },
  statusWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  mediaWrap: {
    borderRadius: Radius.md,
    overflow: 'hidden',
    backgroundColor: Colors.surfaceAlt,
    minHeight: 120,
  },
  mediaImage: {
    width: 220,
    height: 160,
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
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  uploadOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: Radius.md,
  },
  uploadText: {
    color: Colors.textInverse,
    fontSize: Type.caption.size,
    fontFamily: Typography.family.medium,
  },
  retryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
    alignSelf: 'flex-start',
  },
  retryText: {
    fontSize: 11,
    fontFamily: Typography.family.medium,
    color: Colors.danger,
  },
  reactions: {
    flexDirection: 'row',
    gap: 4,
    marginTop: 2,
    marginLeft: 36,
  },
  reactionsRight: {
    marginLeft: 0,
    marginRight: 36,
    alignSelf: 'flex-end',
  },
  reactionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: Colors.surfaceAlt,
    borderRadius: Radius.lg,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  reactionChipActive: {
    borderColor: Colors.brand,
    backgroundColor: `${Colors.brand}20`,
  },
  reactionEmoji: {
    fontSize: 13,
  },
  reactionCount: {
    fontSize: 11,
    fontFamily: Typography.family.medium,
    color: Colors.textSecondary,
  },
});
