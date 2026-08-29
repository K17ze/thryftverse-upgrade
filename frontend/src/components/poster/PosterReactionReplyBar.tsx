import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ScrollView,
  ActivityIndicator,
  AccessibilityInfo,
  Platform } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Reanimated, {
  useSharedValue,
  withSpring,
  withTiming,
  withDelay,
  useAnimatedStyle,
  useAnimatedReaction,
  Easing as ReEasing,
  runOnJS,
  type SharedValue } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Space, Radius, Typography, Control, Elevation } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { Motion } from '../../theme/motionTokens';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { useHaptic } from '../../hooks/useHaptic';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useMotionConfig } from '../../hooks/useMotionConfig';
import { AnimatedPressable } from '../AnimatedPressable';
import { LiquidGlassBackdrop } from '../LiquidGlassBackdrop';
import type { PosterReactionType } from '../../services/postersApi';

/** Spring config shape returned by useMotionConfig().spring.* */
type SpringConfig = { damping: number; stiffness: number; mass: number };

// Character limit for reply input
const REPLY_MAX_LENGTH = 500;
const REPLY_COUNTER_THRESHOLD = 400;

/**
 * Native emoji reaction glyphs.
 *
 * Quick reactions use real emoji, not outline icons. ThryftVerse's
 * commerce-native reactions map to emoji that communicate the
 * commerce-aware intent (want = shopping bag, style = sparkles).
 */
const REACTIONS: Array<{ type: PosterReactionType; glyph: string; label: string }> = [
  { type: 'love', glyph: '❤️', label: 'Love' },
  { type: 'fire', glyph: '🔥', label: 'Fire' },
  { type: 'style', glyph: '✨', label: 'Style' },
  { type: 'want', glyph: '🛍️', label: 'Want' },
  { type: 'wow', glyph: '😮', label: 'Wow' },
  { type: 'laugh', glyph: '😂', label: 'Laugh' },
];

// Quick reply suggestions — tappable chips above the input
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
  /** Save/bookmark callback — toggles saved state for the story. */
  onSave?: () => void;
  /** Whether the story is currently saved by the viewer. */
  isSaved?: boolean;
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
  onSave,
  isSaved }: PosterReactionReplyBarProps) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const reducedMotion = useReducedMotion();
  const { spring, isEnabled } = useMotionConfig();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const [replyText, setReplyText] = useState('');
  const [showReactions, setShowReactions] = useState(false);
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isInputFocused, setIsInputFocused] = useState(false);

  // Reanimated shared values for reaction tray entry
  const trayScaleSV = useSharedValue(0);
  const trayOpacitySV = useSharedValue(0);

  // Spring entrance for the entire bar
  const barEntranceY = useSharedValue(reducedMotion ? 0 : 20);
  const barEntranceOpacity = useSharedValue(reducedMotion ? 1 : 0);

  // Drag-to-select: track horizontal pan position for the reaction tray
  const dragX = useSharedValue(0);
  const dragSelectedIndex = useSharedValue(-1);
  const reactionLayoutX = useRef(0);

  React.useEffect(() => {
    if (!reducedMotion) {
      barEntranceY.value = withSpring(0, spring.entrance as SpringConfig);
      barEntranceOpacity.value = withTiming(1, { duration: Motion.duration.normal });
    }
  }, [reducedMotion, spring, barEntranceY, barEntranceOpacity]);

  const barEntranceStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: barEntranceY.value }],
    opacity: barEntranceOpacity.value }));

  const handleSendReply = useCallback(async () => {
    const trimmed = replyText.trim();
    if (!trimmed || isSending) return;
    setIsSending(true);
    try {
      onReply(trimmed);
      haptic.success();
      AccessibilityInfo.announceForAccessibility('Reply sent');
      setReplyText('');
      setShowQuickReplies(false);
    } finally {
      setIsSending(false);
    }
  }, [replyText, isSending, onReply, haptic]);

  const toggleReactions = useCallback(() => {
    if (!showReactions) {
      haptic.selection();
      setShowReactions(true);
      // Spring in — Reanimated with spring config
      trayScaleSV.value = withSpring(1, spring.entrance as SpringConfig);
      trayOpacitySV.value = withTiming(1, { duration: Motion.duration.fast, easing: ReEasing.out(ReEasing.ease) });
    } else {
      // Fade out then hide — use setTimeout to hide after the animation completes
      trayOpacitySV.value = withTiming(0, { duration: Motion.duration.fast });
      setTimeout(() => {
        setShowReactions(false);
        trayScaleSV.value = 0;
      }, 130);
    }
  }, [showReactions, trayScaleSV, trayOpacitySV, haptic, spring]);

  const handleQuickReply = (text: string) => {
    haptic.selection();
    AccessibilityInfo.announceForAccessibility('Quick reply sent');
    onReply(text);
    setShowQuickReplies(false);
  };

  const handleReactionSelect = useCallback((r: typeof REACTIONS[number]) => {
    if (viewerReaction === r.type) {
      onRemoveReaction();
      AccessibilityInfo.announceForAccessibility(`${r.label} reaction removed`);
    } else {
      onReaction(r.type);
      AccessibilityInfo.announceForAccessibility(`${r.label} reaction sent`);
    }
    setShowReactions(false);
  }, [viewerReaction, onReaction, onRemoveReaction]);

  const trayAnimatedStyle = useAnimatedStyle(() => ({
    opacity: trayOpacitySV.value,
    transform: [{ scale: trayScaleSV.value }] }));

  // ── Drag-to-select gesture ───────────────────────────────────────────
  // Pan horizontally over the reaction tray to scrub through reactions.
  // The selected reaction follows the drag with a spring, and haptic fires
  // when the selection crosses to a new reaction.
  const dragGesture = React.useMemo(() => {
    if (!isEnabled) return null;
    return Gesture.Pan()
      .activateAfterLongPress(50)
      .onUpdate((e) => {
        'worklet';
        dragX.value = e.translationX;
        // Calculate which reaction the drag is over
        const reactionWidth = Control.hit;
        const startX = reactionLayoutX.current;
        const idx = Math.max(0, Math.min(REACTIONS.length - 1, Math.floor((e.absoluteX - startX) / reactionWidth)));
        if (idx !== dragSelectedIndex.value) {
          dragSelectedIndex.value = idx;
          runOnJS(haptic.selection)();
        }
      })
      .onEnd(() => {
        'worklet';
        const idx = dragSelectedIndex.value;
        dragX.value = withSpring(0, spring.tap as SpringConfig);
        if (idx >= 0 && idx < REACTIONS.length) {
          const r = REACTIONS[idx];
          runOnJS(handleReactionSelect)(r);
        }
        dragSelectedIndex.value = -1;
      });
  }, [isEnabled, dragX, dragSelectedIndex, haptic, spring, handleReactionSelect]);

  const showCounter = replyText.length > REPLY_COUNTER_THRESHOLD;

  // ── Owner view ───────────────────────────────────────────────────────
  // Owner sees viewer count + "View activity" CTA,
  // plus share. No reply bar (owners don't reply to their own story).
  if (isOwner) {
    return (
      <Reanimated.View style={[styles.container, barEntranceStyle]}>
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
              <Ionicons name="eye-outline" size={Control.iconCompact} color={colors.scrimTextPrimary} />
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
              <Ionicons name="share-outline" size={Control.icon} color={colors.scrimTextPrimary} />
            </AnimatedPressable>
          )}
        </View>
      </Reanimated.View>
    );
  }

  // ── Viewer view ──────────────────────────────────────────────────────
  return (
    <Reanimated.View style={[styles.container, barEntranceStyle]}>
      {/* Floating emoji tray — no container, no card-on-card.
          Emoji sit directly on the media surface, matching Instagram's
          floating quick-reaction pattern. Animated with spring on entry.
          Supports drag-to-select: pan horizontally to scrub through reactions
          with spring follow and haptic on selection change. */}
      {showReactions && allowReactions && (
        <GestureDetector gesture={dragGesture ?? Gesture.Pan().enabled(false)}>
          <Reanimated.View
            style={[styles.reactionTray, trayAnimatedStyle]}
            onLayout={(e) => {
              reactionLayoutX.current = e.nativeEvent.layout.x;
            }}
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
            {REACTIONS.map((r, i) => (
              <ReactionButton
                key={r.type}
                reaction={r}
                index={i}
                isActive={viewerReaction === r.type}
                dragSelectedIndex={dragSelectedIndex}
                springConfig={spring.press as SpringConfig}
                reducedMotion={reducedMotion}
                onPress={() => handleReactionSelect(r)}
              />
            ))}
          </Reanimated.View>
        </GestureDetector>
      )}

      {/* Quick reply suggestion chips.
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
            scaleValue={0.88}
            activeOpacity={0.8}
            hapticFeedback="light"
            accessibilityLabel="Show reactions"
            accessibilityRole="button"
            accessibilityHint="Opens quick reaction options"
          >
            <Text style={styles.iconEmoji}>{viewerReaction ? REACTIONS.find((r) => r.type === viewerReaction)?.glyph ?? '😊' : '😊'}</Text>
          </AnimatedPressable>
        )}

        {allowReplies && (
          <View style={[styles.replyInputWrap, isInputFocused && styles.replyInputWrapFocused]}>
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
              placeholderTextColor={colors.scrimTextSecondary}
              value={replyText}
              onChangeText={(text) => {
                setReplyText(text);
                setShowQuickReplies(text.length === 0);
              }}
              onFocus={() => {
                setShowQuickReplies(replyText.length === 0);
                setIsInputFocused(true);
              }}
              onBlur={() => {
                setShowQuickReplies(false);
                setIsInputFocused(false);
              }}
              maxLength={REPLY_MAX_LENGTH}
              returnKeyType="send"
              onSubmitEditing={handleSendReply}
              editable={!isSending}
              accessibilityLabel="Reply to story"
              accessibilityHint="Type a reply and press send"
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
              <ActivityIndicator size="small" color={colors.scrimTextPrimary} />
            ) : (
              <Ionicons name="send" size={Control.icon} color={colors.scrimTextPrimary} />
            )}
          </AnimatedPressable>
        )}

        {/* Save — bookmark the story for later viewing (Instagram pattern).
            Only show when there is no active reply text to avoid crowding. */}
        {!replyText.trim() && onSave && (
          <AnimatedPressable
            style={styles.iconBtn}
            onPress={onSave}
            scaleValue={0.97}
            activeOpacity={0.85}
            hapticFeedback="light"
            accessibilityRole="button"
            accessibilityLabel={isSaved ? 'Remove from saved' : 'Save story'}
            accessibilityHint="Bookmarks this story for later viewing"
            accessibilityState={{ selected: !!isSaved }}
          >
            <Ionicons name={isSaved ? 'bookmark' : 'bookmark-outline'} size={Control.icon} color={colors.scrimTextPrimary} />
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
            <Ionicons name="share-outline" size={Control.icon} color={colors.scrimTextPrimary} />
          </AnimatedPressable>
        )}
      </View>
    </Reanimated.View>
  );
}

/**
 * Individual reaction button with spring scale on press and drag-follow.
 * When the drag-to-select gesture is active, the button under the drag
 * finger scales up with a spring for visual feedback.
 */
function ReactionButton({
  reaction,
  index,
  isActive,
  dragSelectedIndex,
  springConfig,
  reducedMotion,
  onPress }: {
  reaction: { type: PosterReactionType; glyph: string; label: string };
  index: number;
  isActive: boolean;
  dragSelectedIndex: SharedValue<number>;
  springConfig: SpringConfig;
  reducedMotion: boolean;
  onPress: () => void;
}) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  // Spring scale — grows when this button is the drag-selected one
  const scaleSV = useSharedValue(1);

  // React to drag-selected index changes
  useAnimatedReaction(
    () => dragSelectedIndex.value === index,
    (isSelected, wasSelected) => {
      if (isSelected !== wasSelected) {
        if (isSelected) {
          scaleSV.value = withSpring(1.3, springConfig);
        } else {
          scaleSV.value = withSpring(1, springConfig);
        }
      }
    },
    [index, springConfig]
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scaleSV.value }] }));

  return (
    <AnimatedPressable
      onPress={onPress}
      style={[
        styles.reactionBtn,
        isActive && styles.reactionActive,
      ]}
      scaleValue={0.82}
      activeOpacity={0.7}
      hapticFeedback="light"
      accessibilityLabel={`${reaction.label} reaction`}
      accessibilityRole="button"
      accessibilityHint="Toggle this reaction on the story"
    >
      <Reanimated.View style={animatedStyle}>
        <Text style={styles.reactionGlyph}>{reaction.glyph}</Text>
      </Reanimated.View>
    </AnimatedPressable>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      paddingHorizontal: Space.md,
      paddingBottom: Space.sm,
      gap: Space.sm },
    // Floating reaction tray — frosted glass pill containing the emoji.
    // Liquid Glass / BlurView supplies the blur; the pill shape + shadow
    // give the tray depth over any media surface.
    reactionTray: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      alignItems: 'center',
      gap: Space.xs,
      paddingVertical: Space.xs,
      paddingHorizontal: Space.sm,
      borderRadius: Radius.full,
      overflow: 'hidden',
      alignSelf: 'flex-end',
      ...Elevation.modal },
    // Glass background layer for the reaction tray.
    reactionTrayGlass: {
      borderRadius: Radius.full,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.glassBorder },
    // Reaction emoji button — 44pt hit target with a 26pt glyph.
    // The visible glyph is smaller than the hit area so the emoji
    // reads as floating, not boxed (per §4 icon grammar).
    reactionBtn: {
      width: Control.hit,
      height: Control.hit,
      borderRadius: Radius.full,
      justifyContent: 'center',
      alignItems: 'center' },
    reactionActive: {
      backgroundColor: colors.glassBorder },
    // 26pt emoji — within Instagram's 24-28pt band, evenly spaced.
    reactionGlyph: {
      fontSize: TypographyV2.display.size,
      lineHeight: TypographyV2.display.lineHeight,
      textAlign: 'center' },
    // ── Quick reply chips ─────────────────────────────────────────────
    quickRepliesRow: {
      maxHeight: 36 },
    quickRepliesContent: {
      gap: Space.xs,
      paddingHorizontal: Space.xs },
    quickReplyChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingHorizontal: Space.sm + 2,
      height: 32,
      borderRadius: Radius.full,
      backgroundColor: colors.glassBg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.glassBorder },
    quickReplyEmoji: {
      fontSize: TypographyV2.body.size },
    quickReplyText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.scrimTextPrimary },
    inputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm },
    iconBtn: {
      width: Control.hit,
      height: Control.hit,
      borderRadius: Radius.full,
      justifyContent: 'center',
      alignItems: 'center' },
    // Reaction toggle glyph — deliberately smaller (24pt) than the
    // tray emoji so the reply input remains the primary element and
    // the reaction toggle reads as a secondary control.
    iconEmoji: {
      fontSize: 24,
      lineHeight: 28,
      textAlign: 'center' },
    // Reply input wrapper — frosted glass pill.
    // The blur is supplied by LiquidGlassBackdrop; the hairline border
    // remains to define the glass edge against any media.
    replyInputWrap: {
      flex: 1,
      position: 'relative',
      height: Control.hit,
      borderRadius: Radius.full,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.glassBorder,
      overflow: 'hidden' },
    // Focus state — 2pt white at 0.3 opacity per §4 stroke grammar
    // (2pt reserved for focus/selection). The subtle highlight makes
    // the active input boundary unmistakable without shouting.
    replyInputWrapFocused: {
      borderColor: colors.glassBorder,
      borderWidth: 2 },
    // Glass background layer for the reply input pill. The blur is
    // supplied by LiquidGlassBackdrop; the underlying fill is a subtle
    // rgba(255,255,255,0.08) so the pill reads cleanly even when the
    // blur fallback renders a flat tint.
    replyInputGlass: {
      borderRadius: Radius.full,
      backgroundColor: colors.glassBg },
    replyInput: {
      height: Control.hit,
      maxHeight: 80,
      borderRadius: Radius.full,
      paddingHorizontal: Space.md,
      paddingVertical: 0,
      color: colors.scrimTextPrimary,
      fontFamily: Typography.family.regular,
      fontSize: TypographyV2.bodyStrong.size },
    replyCounter: {
      position: 'absolute',
      bottom: 2,
      right: Space.sm,
      fontSize: 11,
      fontFamily: Typography.family.regular,
      color: colors.scrimTextSecondary,
      fontVariant: ['tabular-nums'] },
    replyCounterLimit: {
      color: 'rgba(255,120,120,0.85)' },
    // Send button — a white paper-plane glyph on a
    // transparent 44pt hit target (no filled circle). The icon is the
    // affordance; the brand accent is reserved for the icon tint so the
    // control stays restrained and the reply input remains primary.
    sendBtn: {
      width: Control.hit,
      height: Control.hit,
      borderRadius: Radius.full,
      justifyContent: 'center',
      alignItems: 'center' },
    sendBtnSending: {
      opacity: 0.6 },
    // Owner row — hairline separator from the reply area for visual separation
    ownerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.glassBorder },
    activityBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs + 2,
      borderRadius: Radius.full,
      paddingHorizontal: Space.sm,
      paddingVertical: Space.sm,
      flex: 1,
      minHeight: Control.hit },
    activityBtnText: {
      color: colors.scrimTextPrimary,
      fontFamily: Typography.family.semibold,
      fontSize: TypographyV2.body.size } });
}
