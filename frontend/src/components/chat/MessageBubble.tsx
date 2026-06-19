import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { Space, Radius, Type, TypeStyles, Elevation } from '../../theme/designTokens';
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

interface MessageBubbleProps {
  text?: string;
  isMe: boolean;
  senderLabel?: string;
  timestamp?: string;
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
  onMediaPress?: () => void;
  onReplyPress?: () => void;
}

export function MessageBubble({
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
  onMediaPress,
  onReplyPress,
}: MessageBubbleProps) {
  const hasFailed = status === 'failed' || uploadStatus === 'failed';
  const isUploading = uploadStatus === 'uploading' || status === 'sending';

  const bubbleBg = isMe ? Colors.textPrimary : Colors.surface;
  const bubbleText = isMe ? Colors.background : Colors.textPrimary;
  const metaColor = isMe ? `${Colors.background}99` : Colors.textMuted;

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
    : isMiddle
    ? { borderTopRightRadius: Radius.lg, borderBottomRightRadius: Radius.lg }
    : { borderTopRightRadius: Radius.lg, borderBottomRightRadius: Radius.lg };

  const themRadius = isStandalone
    ? { borderTopLeftRadius: Radius.lg, borderBottomLeftRadius: Radius.lg }
    : isTop
    ? { borderTopLeftRadius: Radius.sm, borderBottomLeftRadius: Radius.lg }
    : isBottom
    ? { borderTopLeftRadius: Radius.lg, borderBottomLeftRadius: Radius.sm }
    : isMiddle
    ? { borderTopLeftRadius: Radius.lg, borderBottomLeftRadius: Radius.lg }
    : { borderTopLeftRadius: Radius.lg, borderBottomLeftRadius: Radius.lg };

  return (
    <View style={[styles.row, isMe && styles.rowRight]}>
      {showAvatar && !isMe ? (
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{(senderLabel ?? '?')[0].toUpperCase()}</Text>
        </View>
      ) : (
        <View style={styles.avatarSpacer} />
      )}

      <View style={styles.bubbleColumn}>
        {senderLabel && !isMe && isFirstInCluster ? (
          <Text style={styles.senderName}>{senderLabel}</Text>
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
            <Pressable onPress={onReplyPress} style={[styles.replyBlock, { borderLeftColor: isMe ? `${Colors.background}40` : Colors.border }]}>
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
                style={[
                  styles.mediaImage,
                  mediaType === 'video' && { width: 200, height: 140 },
                ]}
                contentFit="cover"
              />
              {mediaType === 'video' ? (
                <View style={styles.videoBadge}>
                  <Ionicons name="play" size={14} color={Colors.textInverse} />
                </View>
              ) : null}
              {isUploading ? (
                <View style={styles.uploadOverlay}>
                  <Ionicons name="cloud-upload-outline" size={20} color={Colors.textInverse} />
                  <Text style={styles.uploadText}>Sending...</Text>
                </View>
              ) : null}
            </Pressable>
          ) : null}

          {text ? (
            <Text style={[styles.messageText, { color: bubbleText }]}>{text}</Text>
          ) : null}

          <View style={[styles.metaRow, isMe && styles.metaRowMe]}>
            {timestamp ? <Text style={[styles.timestamp, { color: metaColor }]}>{timestamp}</Text> : null}
            {isMe && status ? (
              <View style={styles.statusWrap}>
                {isUploading ? (
                  <Ionicons name="time-outline" size={10} color={metaColor} />
                ) : hasFailed ? (
                  <Ionicons name="alert-circle" size={10} color={isMe ? Colors.background : Colors.danger} />
                ) : (
                  <Ionicons name="checkmark" size={10} color={metaColor} />
                )}
              </View>
            ) : null}
          </View>
        </Pressable>

        {hasFailed && onRetry ? (
          <Pressable onPress={onRetry} style={styles.retryBadge}>
            <Ionicons name="refresh" size={11} color={Colors.danger} />
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
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  avatarText: {
    fontSize: Type.meta.size,
    fontFamily: TypeStyles.title.fontFamily,
    color: Colors.textPrimary,
  },
  avatarSpacer: {
    width: 28,
  },
  bubbleColumn: {
    maxWidth: '74%',
    gap: 2,
  },
  senderName: {
    fontSize: Type.caption.size,
    fontFamily: TypeStyles.bodyEmphasis.fontFamily,
    color: Colors.brand,
    marginBottom: 2,
    marginLeft: Space.xs,
  },
  bubble: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm + 2,
    gap: 4,
  },
  bubbleMe: {
    backgroundColor: Colors.textPrimary,
    alignSelf: 'flex-end',
  },
  bubbleThem: {
    backgroundColor: Colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    alignSelf: 'flex-start',
    ...Elevation.subtle,
  },
  bubbleFailed: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.danger,
  },
  replyBlock: {
    borderLeftWidth: 2,
    paddingLeft: Space.sm,
    marginBottom: 2,
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
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
    marginTop: 2,
  },
  metaRowMe: {
    opacity: 0.85,
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
    backgroundColor: Colors.surfaceAlt,
  },
  mediaImage: {
    width: 200,
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
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  uploadOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: Radius.md,
    gap: Space.xs,
  },
  uploadText: {
    color: Colors.textInverse,
    fontSize: Type.caption.size,
    fontFamily: TypeStyles.bodyEmphasis.fontFamily,
  },
  retryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
    marginLeft: Space.xs,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  retryText: {
    fontSize: Type.meta.size,
    fontFamily: TypeStyles.bodyEmphasis.fontFamily,
    color: Colors.danger,
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
    gap: 2,
    backgroundColor: Colors.surfaceAlt,
    borderRadius: Radius.lg,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    ...Elevation.subtle,
  },
  reactionChipActive: {
    borderColor: Colors.brand,
    backgroundColor: `${Colors.brand}18`,
  },
  reactionEmoji: {
    fontSize: 13,
  },
  reactionCount: {
    fontSize: Type.meta.size,
    fontFamily: TypeStyles.bodyEmphasis.fontFamily,
    color: Colors.textSecondary,
  },
});