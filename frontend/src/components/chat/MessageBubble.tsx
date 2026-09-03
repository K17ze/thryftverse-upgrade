import React from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, {
  withTiming,
  withSpring,
  type EntryExitAnimationFunction } from 'react-native-reanimated';
import { Space, Radius, TypeStyles, Stroke, AspectRatio, FontFamily } from '../../theme/designTokens';
import { colorForId } from '../../utils/avatarColor';
import { TypographyV2 } from '../../theme/typography.v2';
import { Motion } from '../../theme/motionTokens';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { useMotionConfig } from '../../hooks/useMotionConfig';
import { CachedImage } from '../CachedImage';
import { VoiceMessageBubble } from './VoiceMessageBubble';
import { VoiceTranscriptionPanel } from './VoiceTranscriptionPanel';
import { useMessageTranslation } from '../../hooks/useMessageTranslation';
import { useAppTranslation } from '../../i18n/useAppTranslation';
import { getI18nLocale } from '../../i18n/i18n';
import { useSettingsPreferences } from '../../context/SettingsPreferencesContext';

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
  mediaType?: 'image' | 'video' | 'document';
  uploadStatus?: 'uploading' | 'failed' | 'sent';
  documentUri?: string;
  documentName?: string;
  documentMimeType?: string;
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
  documentUri,
  documentName,
  documentMimeType,
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
  onReplyPress }: MessageBubbleProps) {
  const { colors } = useAppTheme();
  const { isEnabled: motionEnabled, spring } = useMotionConfig();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const { t } = useAppTranslation('messaging');
  const { autoTranslateMessages } = useSettingsPreferences();

  // AI-powered message translation (WhatsApp/Instagram pattern)
  // Shows a "Translate" link for messages in a foreign language
  const userLocale = getI18nLocale();
  const {
    translatedText,
    isLoading: isTranslating,
    isTranslated,
    isForeignLanguage,
    error: translationError,
    translate,
    revert,
    retry,
  } = useMessageTranslation({
    messageId: id,
    text,
    userLocale,
    autoTranslate: autoTranslateMessages,
  });

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
              transform: [{ scale: withSpring(1, spring.settle) }] },
            initialValues: {
              opacity: 0,
              transform: [{ scale: 0.92 }] } };
        }
      : undefined;

  // Reaction badge pop-in — spring-scale (0.8 → 1.0, 200ms).
  // Matches iMessage tapback pop. Respects reduced-motion (no animation).
  const reactionEntering: EntryExitAnimationFunction | undefined = motionEnabled
    ? () => {
        'worklet';
        return {
          animations: {
            transform: [{ scale: withSpring(1, spring.tap) }] },
          initialValues: {
            transform: [{ scale: 0.8 }] } };
      }
    : undefined;
  const hasFailed = status === 'failed' || uploadStatus === 'failed';
  const isUploading = uploadStatus === 'uploading' || status === 'sending';
  const isMedia = !!mediaUri;

  const bubbleText = isMe ? colors.textInverse : colors.textPrimary;
  const metaColor = isMe ? colors.scrimTextTertiary : colors.textMuted;

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

  const senderColor = React.useMemo(() => {
    if (isAgent) return colors.brand;
    return colorForId(senderLabel || 'member');
  }, [isAgent, senderLabel, colors.brand]);

  return (
    <Reanimated.View style={[styles.row, isMe && styles.rowRight]} entering={bubbleEntering}>
      {showAvatar && !isMe ? (
        isAgent ? (
          <View style={[styles.agentAvatar, { backgroundColor: colors.brandSubtle, borderColor: colors.borderSubtle }]}>
            <Ionicons
              name={(agentAvatar ?? 'bulb-outline') as keyof typeof Ionicons.glyphMap}
              size={14}
              color={colors.brand}
            />
          </View>
        ) : (
          <View style={[styles.avatar, { backgroundColor: senderColor }]}>
            <Text style={styles.avatarText}>{(senderLabel ?? '?')[0].toUpperCase()}</Text>
          </View>
        )
      ) : (
        <View style={styles.avatarSpacer} />
      )}

      <View style={styles.bubbleColumn}>
        {senderLabel && !isMe && isFirstInCluster ? (
          <View style={styles.senderLabelRow}>
            <Text style={[styles.senderName, { color: senderColor }]}>{senderLabel}</Text>
            {isAgent ? (
              <View style={[styles.aiChip, { backgroundColor: colors.brandSubtle, borderColor: colors.borderSubtle }]}>
                <Ionicons name="bulb-outline" size={10} color={colors.brand} />
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
                </View>
              ) : null}
            </Pressable>
          ) : null}

          {documentUri ? (
            <Pressable
              onPress={() => {
                if (documentUri.startsWith('http')) {
                  Linking.openURL(documentUri).catch(() => {});
                }
              }}
              style={[styles.documentWrap, { backgroundColor: isMe ? 'rgba(255,255,255,0.12)' : colors.surfaceAlt }]}
              accessibilityRole="button"
              accessibilityLabel={`Document: ${documentName ?? 'file'}`}
            >
              <View style={[styles.documentIconWrap, { backgroundColor: isMe ? 'rgba(255,255,255,0.15)' : colors.brandSubtle }]}>
                <Ionicons
                  name={
                    documentMimeType?.includes('pdf') ? 'document-text-outline'
                    : documentMimeType?.includes('zip') || documentMimeType?.includes('compressed') ? 'archive-outline'
                    : 'document-outline'
                  }
                  size={24}
                  color={isMe ? colors.textInverse : colors.brand}
                />
              </View>
              <View style={styles.documentInfo}>
                <Text style={[styles.documentName, { color: bubbleText }]} numberOfLines={2}>
                  {documentName ?? 'File'}
                </Text>
                {documentMimeType ? (
                  <Text style={[styles.documentMeta, { color: metaColor }]} numberOfLines={1}>
                    {documentMimeType}
                  </Text>
                ) : null}
              </View>
              <Ionicons name="download-outline" size={18} color={isMe ? colors.textInverse : colors.textMuted} />
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
              <Text style={[styles.messageText, { color: bubbleText }]}>{text}</Text>

              {/* AI translation — WhatsApp/Telegram inline pattern: one
                  subtle link, no meta chrome. */}
              {isForeignLanguage && !isMe && !isDraft ? (
                <View style={styles.translationRow}>
                  {isTranslated && translatedText ? (
                    <>
                      <Text style={[styles.translatedText, { color: bubbleText }]}>
                        {translatedText}
                      </Text>
                      <Pressable
                        onPress={revert}
                        hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
                        accessibilityRole="button"
                        accessibilityLabel={t('messaging.translation.showOriginal')}
                      >
                        <Text style={[styles.translationLink, { color: metaColor }]}>
                          {t('messaging.translation.showOriginal')}
                        </Text>
                      </Pressable>
                    </>
                  ) : isTranslating ? (
                    <View style={styles.translationLoadingRow}>
                      <ActivityIndicator size={10} color={metaColor} />
                      <Text style={[styles.translationLink, { color: metaColor }]}>
                        {t('messaging.translation.translating')}
                      </Text>
                    </View>
                  ) : translationError ? (
                    <Pressable
                      onPress={retry}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      accessibilityRole="button"
                      accessibilityLabel={t('messaging.translation.translate')}
                    >
                      <Text style={[styles.translationLink, { color: metaColor }]}>
                        {t('messaging.translation.translationFailed')} · {t('messaging.translation.translate')}
                      </Text>
                    </Pressable>
                  ) : (
                    <Pressable
                      onPress={translate}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      accessibilityRole="button"
                      accessibilityLabel={t('messaging.translation.translate')}
                    >
                      <Text style={[styles.translationLink, { color: metaColor }]}>
                        {t('messaging.translation.translate')}
                      </Text>
                    </Pressable>
                  )}
                </View>
              ) : null}
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
          <Pressable onPress={onRetry} style={styles.retryBadge} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button" accessibilityLabel="Retry sending message">
            <Ionicons name="refresh" size={14} color={colors.danger} />
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
            <Ionicons name="refresh" size={14} color={colors.danger} />
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
            <Ionicons name="send" size={14} color={colors.brand} />
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
    paddingHorizontal: Space.md },
  rowRight: {
    flexDirection: 'row-reverse' },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: Radius.full,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Space.xs,
    borderWidth: 1.5,
    borderColor: colors.background },
  agentAvatar: {
    width: 28,
    height: 28,
    borderRadius: Radius.full,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Space.xs,
    borderWidth: StyleSheet.hairlineWidth },
  avatarText: {
    fontSize: 12,
    fontFamily: FontFamily.bold,
    color: '#FFFFFF' },
  avatarSpacer: {
    width: 28 },
  bubbleColumn: {
    maxWidth: '75%',
    gap: 3 },
  senderLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    marginBottom: 2,
    marginLeft: Space.xs },
  senderName: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.bold },
  aiChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: Radius.full,
    borderWidth: StyleSheet.hairlineWidth },
  bubble: {
    paddingHorizontal: Space.sm + 2,
    paddingVertical: Space.sm - 1,
    gap: 2 },
  bubbleMedia: {
    padding: 0,
    overflow: 'hidden',
    backgroundColor: 'transparent' },
  bubbleMe: {
    backgroundColor: colors.brand,
    alignSelf: 'flex-end' },
  bubbleAgent: {
    alignSelf: 'flex-start' },
  bubbleThem: {
    backgroundColor: colors.surfaceAlt,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: colors.borderSubtle },
  bubbleFailed: {
    backgroundColor: colors.dangerSubtle,
    borderWidth: Stroke.standard,
    borderColor: colors.dangerBorder },
  bubbleDraft: {
    backgroundColor: `${colors.surfaceAlt}80`,
    borderWidth: Stroke.standard,
    borderColor: colors.borderSubtle },
  draftConfirmBadge: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Space.xs,
    marginLeft: Space.xs,
    width: 32,
    height: 32,
    borderRadius: Radius.full,
    backgroundColor: colors.brandSubtle,
    alignSelf: 'flex-start' },
  replyBlock: {
    borderLeftWidth: 2,
    paddingLeft: Space.sm - 1,
    marginBottom: Space.xs,
    gap: 1 },
  replyName: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily },
  replyText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypeStyles.body.fontFamily,
    lineHeight: TypographyV2.meta.lineHeight },
  messageText: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypeStyles.body.fontFamily,
    lineHeight: TypographyV2.body.lineHeight + 2,
    letterSpacing: TypographyV2.body.letterSpacing },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
    marginTop: 2,
    minHeight: 14 },
  metaRowMe: {
    opacity: 0.7 },
  timestamp: {
    fontSize: TypographyV2.meta.size - 1,
    fontFamily: TypeStyles.body.fontFamily },
  statusWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2 },
  mediaWrap: {
    backgroundColor: 'transparent',
    position: 'relative' },
  mediaImage: {
    width: '100%',
    minWidth: 200,
    maxWidth: 280,
    aspectRatio: AspectRatio.portrait },
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
    alignItems: 'center' },
  uploadOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Space.xs },
  uploadProgressBar: {
    marginBottom: 0 },
  retryBadge: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Space.xs,
    marginLeft: Space.xs,
    width: 32,
    height: 32,
    borderRadius: Radius.full,
    backgroundColor: colors.dangerSubtle,
    alignSelf: 'flex-start' },
  reactions: {
    flexDirection: 'row',
    gap: 4,
    marginTop: 1,
    marginLeft: Space.xs },
  reactionsRight: {
    marginLeft: 0,
    marginRight: Space.xs,
    alignSelf: 'flex-end' },
  reactionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.surface,
    borderRadius: Radius.full,
    paddingHorizontal: Space.sm - 1,
    paddingVertical: Space.xs,
    minHeight: 26 },
  reactionChipActive: {
    backgroundColor: colors.brandSubtle },
  reactionEmoji: {
    fontSize: TypographyV2.meta.size },
  reactionCount: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textSecondary },
  // ── AI translation UI ────────────────────────────────────────────
  translationRow: {
    marginTop: Space.xs,
    gap: 3,
  },
  translationLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  translatedText: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypeStyles.body.fontFamily,
    lineHeight: TypographyV2.body.lineHeight + 1,
    letterSpacing: TypographyV2.body.letterSpacing,
    fontStyle: 'italic',
  },
  translationLink: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.label.letterSpacing,
    textDecorationLine: 'underline',
  },
  // ── Document attachment ───────────────────────────────────────────
  documentWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    borderRadius: Radius.md,
    padding: Space.sm,
    marginBottom: Space.xs },
  documentIconWrap: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center' },
  documentInfo: {
    flex: 1,
    gap: 2 },
  documentName: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    lineHeight: TypographyV2.body.lineHeight },
  documentMeta: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily },
});