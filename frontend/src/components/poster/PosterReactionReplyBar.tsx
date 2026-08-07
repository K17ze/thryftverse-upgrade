import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import Reanimated, {
  useSharedValue,
  withSpring,
  withTiming,
  useAnimatedStyle,
  Easing as ReEasing,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Space, Radius, Type, Typography, Control } from '../../theme/designTokens';
import { Motion } from '../../theme/motionTokens';
import { useAppTheme } from '../../theme/ThemeContext';
import { useHaptic } from '../../hooks/useHaptic';
import { AnimatedPressable } from '../AnimatedPressable';
import { LiquidGlassBackdrop } from '../LiquidGlassBackdrop';
import type { PosterReactionType } from '../../services/postersApi';

// Spring config for reaction tray entrance
const SPRING_CONFIG = Motion.spring.entrance;

// Character limit for reply input
const REPLY_MAX_LENGTH = 500;
const REPLY_COUNTER_THRESHOLD = 400;

/**
 * Native emoji reaction glyphs.
 *
 * Benchmark (Instagram/Snapchat 2026): quick reactions use real emoji, not
 * outline icons. ThryftVerse's commerce-native reactions map to emoji that
 * communicate the commerce-aware intent (want = shopping bag, style = sparkles).
 */
const REACTIONS: Array<{ type: PosterReactionType; glyph: string; label: string }> = [
  { type: 'love', glyph: '❤️', label: 'Love' },
  { type: 'fire', glyph: '🔥', label: 'Fire' },
  { type: 'style', glyph: '✨', label: 'Style' },
  { type: 'want', glyph: '🛍️', label: 'Want' },
  { type: 'wow', glyph: '😮', label: 'Wow' },
  { type: 'laugh', glyph: '😂', label: 'Laugh' },
];

// Quick reply suggestions — Instagram pattern: tappable chips above the input
// for fast engagement. Commerce-aware suggestions.
const QUICK_REPLIES: Array<{ emoji: string; text: string }> = [
  { emoji: '❤️', text: 'Love this!' },
  { emoji: '🔥', text: 'Fire!' },
  { emoji: '✨', text: 'Amazing!' },
  { emoji: '🛍️', text: 'Link?' },
  { emoji: '👀', text: 'Want this' },
];

interface PosterReactionReplyBarProps {
  allowReactions: boolean;
  allowReplies: boolean;
  viewerReaction: string | null;
  onReaction: (reaction: PosterReactionType) => void;
  onRemoveReaction: () => void;
  onReply: (text: string) => void;
  isOwner: boolean;
  onShowActivity?: () => void;
  /** Unique viewer count for the active story — shown in the owner's activity CTA. */
  viewerCount?: number;
  /** Share callback — opens the system share sheet or in-app share target. */
  onShare?: () => void;
}

export function PosterReactionReplyBar({
  allowReactions,
  allowReplies,
  viewerReaction,
  onReaction,
  onRemoveReaction,
  onReply,
  isOwner,
  onShowActivity,
  viewerCount,
  onShare,
}: PosterReactionReplyBarProps) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const [replyText, setReplyText] = useState('');
  const [showReactions, setShowReactions] = useState(false);
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [isSending, setIsSending] = useState(false);

  // Reanimated shared values for reaction tray entry
  const trayScaleSV = useSharedValue(0);
  const trayOpacitySV = useSharedValue(0);

  const handleSendReply = useCallback(async () => {
    const trimmed = replyText.trim();
    if (!trimmed || isSending) return;
    setIsSending(true);
    try {
      onReply(trimmed);
      setReplyText('');
      setShowQuickReplies(false);
    } finally {
      setIsSending(false);
    }
  }, [replyText, isSending, onReply]);

  const toggleReactions = useCallback(() => {
    if (!showReactions) {
      haptic.selection();
      setShowReactions(true);
      // Spring in — Reanimated with spring config
      trayScaleSV.value = withSpring(1, SPRING_CONFIG);
      trayOpacitySV.value = withTiming(1, { duration: 150, easing: ReEasing.out(ReEasing.ease) });
    } else {
      // Fade out then hide — use setTimeout to hide after the animation completes
      trayOpacitySV.value = withTiming(0, { duration: 120 });
      setTimeout(() => {
        setShowReactions(false);
        trayScaleSV.value = 0;
      }, 130);
    }
  }, [showReactions, trayScaleSV, trayOpacitySV, haptic]);

  const handleQuickReply = (text: string) => {
    onReply(text);
    setShowQuickReplies(false);
  };

  const trayAnimatedStyle = useAnimatedStyle(() => ({
    opacity: trayOpacitySV.value,
    transform: [{ scale: trayScaleSV.value }],
  }));

  const showCounter = replyText.length > REPLY_COUNTER_THRESHOLD;

  // ── Owner view ───────────────────────────────────────────────────────
  // Instagram pattern: owner sees viewer count + "View activity" CTA,
  // plus share. No reply bar (owners don't reply to their own story).
  if (isOwner) {
    return (
      <View style={styles.container}>
        <View style={styles.ownerRow}>
          {onShowActivity && (
            <AnimatedPressable
              style={styles.activityBtn}
              onPress={onShowActivity}
              scaleValue={0.97}
              activeOpacity={0.85}
              hapticFeedback="light"
              accessibilityRole="button"
              accessibilityLabel={`View story activity${viewerCount != null ? `, ${viewerCount} viewer${viewerCount !== 1 ? 's' : ''}` : ''}`}
              accessibilityHint="Views story activity and insights"
            >
              <Ionicons name="eye-outline" size={Control.iconCompact} color="#fff" />
              <Text style={styles.activityBtnText}>
                {viewerCount != null ? `${viewerCount} viewer${viewerCount !== 1 ? 's' : ''}` : 'Activity'}
              </Text>
            </AnimatedPressable>
          )}
          {onShare && (
            <AnimatedPressable
              style={styles.iconBtn}
              onPress={onShare}
              scaleValue={0.97}
              activeOpacity={0.85}
              hapticFeedback="light"
              accessibilityRole="button"
              accessibilityLabel="Share story"
              accessibilityHint="Opens share sheet"
            >
              <Ionicons name="share-outline" size={Control.icon} color="#fff" />
            </AnimatedPressable>
          )}
        </View>
      </View>
    );
  }

  // ── Viewer view ──────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      {/* Floating emoji tray — no container, no card-on-card.
          Emoji sit directly on the media surface, matching Instagram's
          floating quick-reaction pattern. Animated with spring on entry. */}
      {showReactions && allowReactions && (
        <Reanimated.View
          style={[styles.reactionTray, trayAnimatedStyle]}
        >
          {/* Frosted glass pill behind the floating emoji — true
              glassmorphism (Liquid Glass on iOS 26, BlurView fallback
              elsewhere) so the tray reads as frosted glass floating
              over the media, not a flat shadowed row. */}
          <LiquidGlassBackdrop
            intensity={35}
            tint="light"
            absoluteFill
            style={styles.reactionTrayGlass}
          />
          {REACTIONS.map((r) => (
            <AnimatedPressable
              key={r.type}
              onPress={() => {
                if (viewerReaction === r.type) {
                  onRemoveReaction();
                } else {
                  onReaction(r.type);
                }
                setShowReactions(false);
              }}
              style={[
                styles.reactionBtn,
                viewerReaction === r.type && styles.reactionActive,
              ]}
              scaleValue={0.97}
              activeOpacity={0.85}
              hapticFeedback="light"
              accessibilityLabel={`${r.label} reaction`}
              accessibilityRole="button"
              accessibilityHint="Toggle this reaction on the story"
            >
              <Text style={styles.reactionGlyph}>{r.glyph}</Text>
            </AnimatedPressable>
          ))}
        </Reanimated.View>
      )}

      {/* Quick reply suggestion chips — Instagram pattern.
          Horizontal scroll of tappable chips above the input for fast engagement. */}
      {showQuickReplies && allowReplies && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.quickRepliesRow}
          contentContainerStyle={styles.quickRepliesContent}
        >
          {QUICK_REPLIES.map((qr) => (
            <AnimatedPressable
              key={qr.text}
              onPress={() => handleQuickReply(qr.text)}
              style={styles.quickReplyChip}
              scaleValue={0.97}
              activeOpacity={0.85}
              hapticFeedback="light"
              accessibilityLabel={`Quick reply: ${qr.text}`}
              accessibilityRole="button"
              accessibilityHint="Send this quick reply"
            >
              <Text style={styles.quickReplyEmoji}>{qr.emoji}</Text>
              <Text style={styles.quickReplyText}>{qr.text}</Text>
            </AnimatedPressable>
          ))}
        </ScrollView>
      )}

      <View style={styles.inputRow}>
        {allowReactions && (
          <AnimatedPressable
            onPress={toggleReactions}
            style={styles.iconBtn}
            scaleValue={0.97}
            activeOpacity={0.85}
            hapticFeedback="light"
            accessibilityLabel="Show reactions"
            accessibilityRole="button"
            accessibilityHint="Opens quick reaction options"
          >
            <Text style={styles.iconEmoji}>{viewerReaction ? REACTIONS.find((r) => r.type === viewerReaction)?.glyph ?? '😊' : '😊'}</Text>
          </AnimatedPressable>
        )}

        {allowReplies && (
          <View style={styles.replyInputWrap}>
            {/* True frosted-glass pill (Liquid Glass on iOS 26, BlurView
                fallback elsewhere) replacing the flat semi-transparent
                fill. The hairline border remains for glass-edge depth. */}
            <LiquidGlassBackdrop
              intensity={40}
              tint="light"
              absoluteFill
              style={styles.replyInputGlass}
            />
            <TextInput
              style={styles.replyInput}
              placeholder="Send message"
              placeholderTextColor="rgba(255,255,255,0.55)"
              value={replyText}
              onChangeText={(text) => {
                setReplyText(text);
                setShowQuickReplies(text.length === 0);
              }}
              onFocus={() => setShowQuickReplies(replyText.length === 0)}
              onBlur={() => setShowQuickReplies(false)}
              maxLength={REPLY_MAX_LENGTH}
              returnKeyType="send"
              onSubmitEditing={handleSendReply}
              editable={!isSending}
              accessibilityLabel="Reply to story"
            />
            {showCounter && (
              <Text
                style={[
                  styles.replyCounter,
                  replyText.length >= REPLY_MAX_LENGTH && styles.replyCounterLimit,
                ]}
              >
                {replyText.length}/{REPLY_MAX_LENGTH}
              </Text>
            )}
          </View>
        )}

        {/* Send button — shows loading state while sending */}
        {allowReplies && replyText.trim().length > 0 && (
          <AnimatedPressable
            onPress={handleSendReply}
            disabled={isSending}
            style={[styles.sendBtn, isSending && styles.sendBtnSending]}
            scaleValue={0.97}
            activeOpacity={0.85}
            hapticFeedback="light"
            accessibilityLabel={isSending ? 'Sending reply' : 'Send reply'}
            accessibilityRole="button"
            accessibilityState={{ busy: isSending }}
            accessibilityHint="Sends your reply"
          >
            {isSending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="send" size={Control.iconCompact} color="#fff" />
            )}
          </AnimatedPressable>
        )}

        {/* Share — secondary action, restrained.
            Only show when there is no active reply text to avoid crowding. */}
        {!replyText.trim() && onShare && (
          <AnimatedPressable
            style={styles.iconBtn}
            onPress={onShare}
            scaleValue={0.97}
            activeOpacity={0.85}
            hapticFeedback="light"
            accessibilityRole="button"
            accessibilityLabel="Share story"
            accessibilityHint="Opens share sheet"
          >
            <Ionicons name="share-outline" size={Control.icon} color="#fff" />
          </AnimatedPressable>
        )}
      </View>
    </View>
  );
}

function createStyles(colors: any) {
  return StyleSheet.create({
    container: {
      paddingHorizontal: Space.md,
      paddingBottom: Space.sm,
      gap: Space.sm,
    },
    // Floating reaction tray — frosted glass pill containing the emoji.
    // Liquid Glass / BlurView supplies the blur; the pill shape + shadow
    // give the tray depth over any media surface.
    reactionTray: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      alignItems: 'center',
      gap: Space.sm,
      paddingVertical: Space.xs,
      paddingHorizontal: Space.sm,
      borderRadius: Radius.full,
      overflow: 'hidden',
      alignSelf: 'flex-end',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.25,
      shadowRadius: 12,
      elevation: 8,
    },
    // Glass background layer for the reaction tray.
    reactionTrayGlass: {
      borderRadius: Radius.full,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(255,255,255,0.2)',
    },
    reactionBtn: {
      width: 40,
      height: 40,
      borderRadius: Radius.full,
      justifyContent: 'center',
      alignItems: 'center',
    },
    reactionActive: {
      backgroundColor: 'rgba(255,255,255,0.18)',
    },
    reactionGlyph: {
      fontSize: Type.bodyLarge.size + 6,
      lineHeight: 28,
      textAlign: 'center',
    },
    // ── Quick reply chips ─────────────────────────────────────────────
    quickRepliesRow: {
      maxHeight: 36,
    },
    quickRepliesContent: {
      gap: Space.xs,
      paddingHorizontal: Space.xs,
    },
    quickReplyChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingHorizontal: Space.sm + 2,
      height: 32,
      borderRadius: Radius.full,
      backgroundColor: 'rgba(255,255,255,0.15)',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(255,255,255,0.12)',
    },
    quickReplyEmoji: {
      fontSize: Type.body.size,
    },
    quickReplyText: {
      fontSize: Type.captionElevated.size,
      fontFamily: Typography.family.medium,
      color: 'rgba(255,255,255,0.9)',
    },
    inputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
    },
    iconBtn: {
      width: Control.hit,
      height: Control.hit,
      borderRadius: Radius.full,
      justifyContent: 'center',
      alignItems: 'center',
    },
    iconEmoji: {
      fontSize: Type.bodyLarge.size + 6,
      lineHeight: 26,
      textAlign: 'center',
    },
    // Reply input wrapper — frosted glass pill (Instagram pattern).
    // The blur is supplied by LiquidGlassBackdrop; the hairline border
    // remains to define the glass edge against any media.
    replyInputWrap: {
      flex: 1,
      position: 'relative',
      height: Control.hit,
      borderRadius: Radius.full,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(255,255,255,0.25)',
      overflow: 'hidden',
    },
    // Glass background layer for the reply input pill.
    replyInputGlass: {
      borderRadius: Radius.full,
    },
    replyInput: {
      height: Control.hit,
      maxHeight: 80,
      borderRadius: Radius.full,
      paddingHorizontal: Space.md,
      paddingVertical: 0,
      color: 'rgba(255,255,255,0.9)',
      fontFamily: Typography.family.regular,
      fontSize: Type.bodyEmphasis.size,
    },
    replyCounter: {
      position: 'absolute',
      bottom: 2,
      right: Space.sm,
      fontSize: 11,
      fontFamily: Typography.family.regular,
      color: 'rgba(255,255,255,0.5)',
      fontVariant: ['tabular-nums'],
    },
    replyCounterLimit: {
      color: 'rgba(255,120,120,0.85)',
    },
    sendBtn: {
      width: 36,
      height: 36,
      borderRadius: Radius.full,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.brand,
    },
    sendBtnSending: {
      opacity: 0.7,
    },
    // Owner row — hairline separator from the reply area for visual separation
    ownerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: 'rgba(255,255,255,0.08)',
    },
    activityBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs + 2,
      borderRadius: Radius.full,
      paddingHorizontal: Space.sm,
      paddingVertical: Space.sm,
      flex: 1,
      minHeight: Control.hit,
    },
    activityBtnText: {
      color: '#fff',
      fontFamily: Typography.family.semibold,
      fontSize: Type.body.size,
    },
  });
}
