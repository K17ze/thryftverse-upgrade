import React from 'react';
import {
  View,
  StyleSheet,
  ViewStyle,
  Pressable,
} from 'react-native';
import Reanimated, {
  FadeIn,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  Easing,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Colors } from '../../constants/colors';
import { Space, Radius } from '../../theme/designTokens';
import { Body, Meta, Caption } from '../ui/Text';
import { MessageReactionsSummary, EmojiReaction } from './EmojiReactionsBar';
import { MessageStatusIndicator, MessageStatus } from '../MessageStatusIndicator';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { GlassSurface } from '../ui/GlassSurface';
import { Video, ResizeMode } from '../compat/Video';
import { AnimatedPressable } from '../AnimatedPressable';

interface MessageBubbleProps {
  text: string;
  isMe: boolean;
  senderLabel?: string;
  timestamp?: string;
  status?: MessageStatus;
  style?: ViewStyle;
  onLongPress?: () => void;
  onReactionPress?: () => void;
  replyTo?: { senderName: string; text: string } | null;
  reactions?: EmojiReaction[];
  mediaUri?: string;
  mediaType?: 'image' | 'video';
  uploadStatus?: 'uploading' | 'failed' | 'sent';
  onRetry?: () => void;
  isFirstInCluster?: boolean;
  isLastInCluster?: boolean;
  showAvatar?: boolean;
  avatarUri?: string;
  enteringDelay?: number;
  isRecent?: boolean;
}

export function MessageBubble({
  text,
  isMe,
  senderLabel,
  timestamp,
  status,
  style,
  onLongPress,
  onReactionPress,
  replyTo,
  reactions,
  mediaUri,
  mediaType,
  uploadStatus,
  onRetry,
  isFirstInCluster = true,
  isLastInCluster = true,
  showAvatar = false,
  avatarUri,
  enteringDelay = 0,
  isRecent = true,
}: MessageBubbleProps) {
  const reducedMotionEnabled = useReducedMotion();
  const hasMedia = !!mediaUri && !!mediaType;
  const isUploading = uploadStatus === 'uploading';
  const isFailed = status === 'failed' || uploadStatus === 'failed';
  const isSending = status === 'sending' || uploadStatus === 'uploading';

  // Entry animation: opacity 0, translateY 6, scale 0.98 → normal
  const enterProgress = useSharedValue(0);
  React.useEffect(() => {
    enterProgress.value = withDelay(
      enteringDelay,
      withTiming(1, { duration: 200, easing: Easing.out(Easing.cubic) })
    );
  }, []);

  // Sending state: opacity 0.6, scale 0.98
  const sendingProgress = useSharedValue(0);
  React.useEffect(() => {
    sendingProgress.value = withTiming(isSending ? 1 : 0, { duration: 180 });
  }, [isSending]);

  // Failed shake (200ms)
  const shake = useSharedValue(0);
  React.useEffect(() => {
    if (isFailed && !reducedMotionEnabled) {
      shake.value = withSequence(
        withTiming(-5, { duration: 40 }),
        withTiming(5, { duration: 40 }),
        withTiming(-5, { duration: 40 }),
        withTiming(5, { duration: 40 }),
        withTiming(0, { duration: 40 })
      );
    } else {
      shake.value = 0;
    }
  }, [isFailed]);

  // Media shimmer overlay
  const shimmerX = useSharedValue(-120);
  React.useEffect(() => {
    if (isUploading && hasMedia) {
      shimmerX.value = withRepeat(
        withTiming(300, { duration: 1400, easing: Easing.inOut(Easing.quad) }),
        -1,
        true
      );
    } else {
      shimmerX.value = -120;
    }
  }, [isUploading, hasMedia]);

  // Media success scale pop (1.02 → 1)
  const mediaPop = useSharedValue(1);
  const wasUploadingRef = React.useRef(isUploading);
  React.useEffect(() => {
    if (wasUploadingRef.current && !isUploading && !isFailed && hasMedia) {
      mediaPop.value = withSequence(
        withTiming(1.02, { duration: 120 }),
        withSpring(1, { damping: 14, stiffness: 300 })
      );
    }
    wasUploadingRef.current = isUploading;
  }, [isUploading, isFailed, hasMedia]);

  const animatedBubbleStyle = useAnimatedStyle(() => {
    const attentionOpacity = isFailed || isRecent ? 1 : 0.92;
    return {
      opacity: attentionOpacity * (1 - 0.4 * sendingProgress.value) * enterProgress.value,
      transform: [
        { translateX: (isMe ? 10 : -10) * (1 - enterProgress.value) + shake.value },
        { translateY: 6 * (1 - enterProgress.value) },
        { scale: (0.98 + 0.02 * enterProgress.value) * (1 - 0.02 * sendingProgress.value) },
      ],
    };
  });

  const shimmerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shimmerX.value }],
  }));

  const mediaPopStyle = useAnimatedStyle(() => ({
    transform: [{ scale: mediaPop.value }],
  }));

  const renderMedia = () => {
    if (!hasMedia) return null;

    const mediaContent =
      mediaType === 'video' ? (
        <Video
          source={{ uri: mediaUri }}
          style={styles.media}
          resizeMode={ResizeMode.COVER}
          shouldPlay={false}
          isMuted
          useNativeControls
        />
      ) : (
        <Image
          source={{ uri: mediaUri }}
          style={styles.media}
          contentFit="cover"
          transition={200}
        />
      );

    return (
      <Reanimated.View style={[styles.mediaWrap, isMe ? styles.mediaWrapMe : styles.mediaWrapThem, mediaPopStyle]}>
        {mediaContent}
        {isUploading && (
          <View style={[styles.mediaOverlay, styles.mediaOverlayUploading]}>
            <Reanimated.View style={[styles.shimmerTrack, shimmerStyle]}>
              <View style={styles.shimmerBar} />
            </Reanimated.View>
          </View>
        )}
        {isFailed && (
          <View style={[styles.mediaOverlay, styles.mediaOverlayFailed]}>
            <AnimatedPressable
              onPress={onRetry}
              activeOpacity={0.7}
              scaleValue={0.9}
              hapticFeedback="light"
              accessibilityLabel="Retry upload"
            >
              <View style={styles.retryBtn}>
                <Ionicons name="refresh" size={18} color={Colors.textInverse} />
              </View>
            </AnimatedPressable>
            <Caption color={Colors.textInverse} style={styles.retryLabel}>Tap to retry</Caption>
          </View>
        )}
      </Reanimated.View>
    );
  };

  const tailRadiusMe = isLastInCluster ? Radius.sm : Radius.xl;
  const tailRadiusThem = isLastInCluster ? Radius.sm : Radius.xl;
  const topRadius = isFirstInCluster ? Radius.xl : Radius.lg;

  const bubble = (
    <Reanimated.View
      style={[styles.container, isMe && styles.containerRight, animatedBubbleStyle, style]}
    >
      {/* Avatar — only on first message of incoming cluster */}
      {showAvatar ? (
        <View style={styles.avatarCol}>
          {avatarUri ? (
            <Image source={{ uri: avatarUri }} style={styles.avatar} contentFit="cover" transition={200} />
          ) : (
            <View style={styles.avatarFallback}>
              <Ionicons name="person" size={14} color={Colors.textMuted} />
            </View>
          )}
        </View>
      ) : !isMe ? <View style={styles.avatarSpacer} /> : null}

      <View style={styles.bubbleContainer}>
        {!isMe && isFirstInCluster && senderLabel ? (
          <Meta color={Colors.textMuted} style={styles.senderLabel}>
            {senderLabel}
          </Meta>
        ) : null}

        {replyTo ? (
          <View style={[styles.replyIndicator, isMe && styles.replyIndicatorMe]}>
            <View style={styles.replyBar} />
            <View style={styles.replyContent}>
              <Meta color={isMe ? Colors.textInverse : Colors.brand}>{replyTo.senderName}</Meta>
              <Caption color={isMe ? `${Colors.textInverse}99` : Colors.textSecondary} numberOfLines={1}>
                {replyTo.text}
              </Caption>
            </View>
          </View>
        ) : null}

        <View style={styles.bubbleWrap}>
          {hasMedia ? (
            renderMedia()
          ) : isMe ? (
            <View style={[styles.bubble, styles.bubbleMe, isFailed && styles.bubbleFailedMe, { borderBottomRightRadius: tailRadiusMe, borderTopRightRadius: topRadius }]}>
              <Body color={isFailed ? Colors.danger : Colors.textInverse}>
                {text}
              </Body>
            </View>
          ) : (
            <View style={[styles.bubble, styles.bubbleThem, { borderBottomLeftRadius: tailRadiusThem, borderTopLeftRadius: topRadius }]}>
              <Body color={Colors.textPrimary}>
                {text}
              </Body>
            </View>
          )}

          {/* Bubble tail */}
          {!hasMedia && isLastInCluster && (
            isMe ? (
              <View style={styles.tailMe} />
            ) : (
              <View style={styles.tailThem} />
            )
          )}
        </View>

        {hasMedia && text ? (
          <View style={[styles.captionWrap, isMe && styles.captionWrapMe]}>
            <Caption color={isMe ? `${Colors.textInverse}cc` : Colors.textSecondary}>{text}</Caption>
          </View>
        ) : null}

        {isMe && status ? (
          <Reanimated.View
            key={status}
            entering={reducedMotionEnabled || status === 'sending' ? undefined : FadeIn.duration(200)}
            style={styles.statusContainer}
          >
            <MessageStatusIndicator status={status} timestamp={timestamp} size="sm" />
          </Reanimated.View>
        ) : null}

        {!isMe && timestamp ? (
          <Caption color={Colors.textMuted} style={styles.incomingTimestamp}>
            {timestamp}
          </Caption>
        ) : null}

        {reactions && reactions.length > 0 ? (
          <MessageReactionsSummary
            reactions={reactions}
            style={isMe ? styles.reactionsMe : styles.reactionsThem}
            onPress={onReactionPress}
          />
        ) : null}
      </View>
    </Reanimated.View>
  );

  if (onLongPress) {
    return (
      <Pressable onLongPress={onLongPress}>
        {bubble}
      </Pressable>
    );
  }

  return bubble;
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  containerRight: {
    justifyContent: 'flex-end',
    paddingRight: Space.md,
  },
  avatarCol: {
    width: 28,
    marginRight: Space.xs + 2,
    marginLeft: Space.md,
    marginBottom: 2,
  },
  avatarSpacer: {
    width: 28,
    marginRight: Space.xs + 2,
    marginLeft: Space.md,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: Radius.full,
  },
  avatarFallback: {
    width: 28,
    height: 28,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceAlt,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bubbleContainer: {
    maxWidth: '72%',
  },
  senderLabel: {
    marginBottom: 2,
    marginLeft: Space.xs + 2,
  },
  bubble: {
    borderRadius: Radius.xl,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm + 6,
  },
  bubbleMe: {
    backgroundColor: Colors.brand,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.14,
    shadowRadius: 10,
    elevation: 3,
  },
  bubbleThem: {
    backgroundColor: Colors.surfaceAlt,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 2,
  },
  statusContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 2,
    marginRight: Space.xs,
  },
  incomingTimestamp: {
    marginTop: 2,
    marginLeft: Space.xs + 2,
  },
  reactionsMe: {
    alignSelf: 'flex-end',
    marginRight: Space.xs,
    marginTop: -Space.xs - 2,
  },
  reactionsThem: {
    alignSelf: 'flex-start',
    marginLeft: Space.xs,
    marginTop: -Space.xs - 2,
  },
  bubbleWrap: {
    position: 'relative',
  },
  tailMe: {
    position: 'absolute',
    right: -6,
    bottom: 4,
    width: 0,
    height: 0,
    borderTopWidth: 6,
    borderBottomWidth: 6,
    borderLeftWidth: 8,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: Colors.brand,
  },
  tailThem: {
    position: 'absolute',
    left: -6,
    bottom: 4,
    width: 0,
    height: 0,
    borderTopWidth: 6,
    borderBottomWidth: 6,
    borderRightWidth: 8,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderRightColor: Colors.surfaceAlt,
  },
  replyIndicator: {
    flexDirection: 'row',
    marginBottom: Space.xs,
    marginLeft: Space.xs,
  },
  replyIndicatorMe: {
    marginLeft: 0,
    marginRight: Space.xs,
    alignSelf: 'flex-end',
  },
  replyBar: {
    width: 3,
    alignSelf: 'stretch',
    backgroundColor: Colors.brand,
    borderRadius: 2,
    marginRight: Space.xs,
  },
  replyContent: {
    flex: 1,
    justifyContent: 'center',
    gap: 2,
  },
  media: {
    width: '100%',
    height: 240,
    borderRadius: Radius.md,
  },
  mediaWrap: {
    borderRadius: Radius.lg,
    overflow: 'hidden',
    backgroundColor: Colors.surfaceAlt,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  mediaWrapMe: {
    alignSelf: 'flex-end',
  },
  mediaWrapThem: {
    alignSelf: 'flex-start',
  },
  mediaOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Space.xs,
  },
  mediaOverlayUploading: {
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  mediaOverlayFailed: {
    backgroundColor: 'rgba(255, 77, 77, 0.35)',
  },
  shimmerTrack: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    overflow: 'hidden',
  },
  shimmerBar: {
    width: 80,
    height: '100%',
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  bubbleFailedMe: {
    backgroundColor: 'rgba(255, 77, 77, 0.18)',
  },
  retryBtn: {
    width: 44,
    height: 44,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  retryLabel: {
    fontSize: 12,
  },
  captionWrap: {
    marginTop: Space.xs,
    marginLeft: Space.xs,
  },
  captionWrapMe: {
    marginLeft: 0,
    marginRight: Space.xs,
    alignSelf: 'flex-end',
  },
});
