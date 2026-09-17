/**
 * DrawingEmojiPanel — emoji-brush configuration panel for the drawing
 * workspace (Snapchat emoji-brush parity).
 *
 * Extracted from DrawingWorkspace.tsx (pure extraction, zero behavior change):
 * category tabs with a spring-animated underline, the emoji grid, and the
 * stamp size / spacing sliders.
 */
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View } from 'react-native';
import Reanimated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useReducedMotion } from '../../../hooks/useReducedMotion';
import { useHaptic } from '../../../hooks/useHaptic';
import {
  Space,
  Radius,
  FontFamily,
  Control,
  Stroke as StrokeToken,
  IconGrammar } from '../../../theme/designTokens';
import { TypographyV2 } from '../../../theme/typography.v2';
import { Motion, REDUCED_SPRING } from '../../../theme/motionTokens';
import { useAppTheme, type ThemeColors } from '../../../theme/ThemeContext';
import { PressScale } from '../../shared/CreatorAnimations';
import { CreatorSlider } from '../../controls';
import type { EmojiBrushConfig } from './DrawingTypes';

// ── Emoji picker catalog (Snapchat emoji-brush parity) ────────────────────
interface EmojiCategory {
  id: string;
  name: string;
  emojis: string[];
}

const EMOJI_CATEGORIES: EmojiCategory[] = [
  {
    id: 'faces',
    name: 'Faces',
    emojis: ['😀', '😍', '🥰', '😎', '🤩', '😂', '🥳', '😭', '🤔', '😴', '🤯', '😱'] },
  {
    id: 'hearts',
    name: 'Hearts',
    emojis: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '💔', '❣️', '💕', '💖'] },
  {
    id: 'hands',
    name: 'Hands',
    emojis: ['👍', '👎', '👏', '🙌', '🤝', '✌️', '🤞', '🤟', '👋', '🤙', '👌', '💪'] },
  {
    id: 'animals',
    name: 'Animals',
    emojis: ['🐶', '🐱', '🦄', '🦋', '🐝', '🦋', '🐢', '🦊', '🐼', '🦁', '🐯', '🐸'] },
  {
    id: 'food',
    name: 'Food',
    emojis: ['🍕', '🍔', '🍟', '🌮', '🍣', '🍩', '🍦', '🍓', '🍉', '🥑', '🌶️', '🍿'] },
  {
    id: 'symbols',
    name: 'Symbols',
    emojis: ['🔥', '✨', '⭐', '💯', '🎉', '👑', '💎', '🚀', '🌈', '☀️', '❄️', '⚡'] },
];

const EMOJI_MIN_SIZE = 16;
const EMOJI_MAX_SIZE = 80;
const EMOJI_MIN_SPACING = 8;
const EMOJI_MAX_SPACING = 80;

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────
export interface DrawingEmojiPanelProps {
  emojiBrush: EmojiBrushConfig;
  setEmojiBrush: React.Dispatch<React.SetStateAction<EmojiBrushConfig>>;
}

export function DrawingEmojiPanel({ emojiBrush, setEmojiBrush }: DrawingEmojiPanelProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const reduceMotion = useReducedMotion();

  const [activeEmojiCategory, setActiveEmojiCategory] = useState<string>('faces');

  // ── Emoji category underline indicator (spring-animated, brand color) ──
  const haptic = useHaptic();
  const emojiTabLayouts = useRef<{ x: number; width: number }[]>([]);
  const emojiUnderlineXSV = useSharedValue(0);
  const emojiUnderlineWSV = useSharedValue(0);
  const emojiSpringCfg = reduceMotion ? REDUCED_SPRING : Motion.spring.indicator;

  const applyEmojiUnderline = useCallback(
    (idx: number) => {
      const lay = emojiTabLayouts.current[idx];
      if (!lay) return;
      if (reduceMotion) {
        emojiUnderlineXSV.value = lay.x;
        emojiUnderlineWSV.value = lay.width;
      } else {
        emojiUnderlineXSV.value = withSpring(lay.x, emojiSpringCfg);
        emojiUnderlineWSV.value = withSpring(lay.width, emojiSpringCfg);
      }
    },
    [reduceMotion, emojiSpringCfg, emojiUnderlineXSV, emojiUnderlineWSV],
  );

  const handleSelectEmojiCategory = useCallback(
    (idx: number, id: string) => {
      haptic.selection();
      setActiveEmojiCategory(id);
      applyEmojiUnderline(idx);
    },
    [haptic, applyEmojiUnderline],
  );

  const emojiUnderlineStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: emojiUnderlineXSV.value }],
    width: emojiUnderlineWSV.value }));

  return (
    <View style={styles.emojiPanel}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.emojiTabsContent}
        style={styles.emojiTabs}
      >
        {EMOJI_CATEGORIES.map((cat, idx) => {
          const active = cat.id === activeEmojiCategory;
          return (
            <PressScale
              key={cat.id}
              accessibilityLabel={`${cat.name} emoji category`}
              accessibilityHint="Shows emojis in this category"
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => handleSelectEmojiCategory(idx, cat.id)}
              onLayout={(e) => {
                emojiTabLayouts.current[idx] = {
                  x: e.nativeEvent.layout.x,
                  width: e.nativeEvent.layout.width };
                if (active) applyEmojiUnderline(idx);
              }}
              style={styles.emojiTab}
            >
              <Text
                style={[styles.emojiTabLabel, active && styles.emojiTabLabelActive]}
                numberOfLines={1}
              >
                {cat.name}
              </Text>
            </PressScale>
          );
        })}
        <Reanimated.View
          style={[styles.emojiTabUnderline, { backgroundColor: colors.brand }, emojiUnderlineStyle]}
          pointerEvents="none"
        />
      </ScrollView>

      <View style={styles.emojiGrid}>
        {(EMOJI_CATEGORIES.find((c) => c.id === activeEmojiCategory) ?? EMOJI_CATEGORIES[0]!).emojis.map(
          (em) => {
            const selected = em === emojiBrush.emoji;
            return (
              <Pressable
                key={em}
                onPress={() => setEmojiBrush((prev) => ({ ...prev, emoji: em }))}
                accessibilityLabel={`Select ${em} emoji`}
                accessibilityHint="Sets this emoji as the stamp"
                accessibilityRole="button"
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                style={[
                  styles.emojiCell,
                  { borderColor: selected ? colors.brand : 'transparent' },
                ]}
              >
                <Text style={styles.emojiCellText}>{em}</Text>
              </Pressable>
            );
          },
        )}
      </View>

      <View style={styles.sizeRow}>
        <Text style={styles.emojiSizePreview}>{emojiBrush.emoji}</Text>
        <CreatorSlider
          value={emojiBrush.size}
          min={EMOJI_MIN_SIZE}
          max={EMOJI_MAX_SIZE}
          step={2}
          onValueChange={(v) => setEmojiBrush((prev) => ({ ...prev, size: v }))}
          onCommit={(v) => setEmojiBrush((prev) => ({ ...prev, size: v }))}
          accessibilityLabel="Emoji stamp size"
          accessibilityHint="Adjusts the emoji stamp size"
        />
      </View>

      <View style={styles.sizeRow}>
        <Ionicons
          name="resize-outline"
          size={IconGrammar.metadata}
          color={colors.textSecondary}
          accessibilityLabel="Spacing"
          accessibilityHint="Marks the stamp spacing slider below"
        />
        <CreatorSlider
          value={emojiBrush.spacing}
          min={EMOJI_MIN_SPACING}
          max={EMOJI_MAX_SPACING}
          step={2}
          onValueChange={(v) => setEmojiBrush((prev) => ({ ...prev, spacing: v }))}
          onCommit={(v) => setEmojiBrush((prev) => ({ ...prev, spacing: v }))}
          accessibilityLabel="Emoji stamp spacing"
          accessibilityHint="Adjusts the space between emoji stamps"
        />
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────
function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    emojiPanel: {
      gap: Space.sm },
    emojiTabs: {
      flexGrow: 0 },
    emojiTabsContent: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.md,
      paddingRight: Space.md,
      position: 'relative' },
    emojiTab: {
      height: Control.hit,
      alignItems: 'center',
      justifyContent: 'center' },
    emojiTabUnderline: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      height: StrokeToken.emphasis,
      borderRadius: StrokeToken.emphasis },
    emojiTabLabel: {
      fontFamily: FontFamily.regular,
      fontSize: TypographyV2.bodyStrong.size,
      lineHeight: TypographyV2.bodyStrong.lineHeight,
      color: colors.textSecondary },
    emojiTabLabelActive: {
      fontFamily: FontFamily.semibold,
      color: colors.textPrimary },
    emojiGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: Space.xs },
    emojiCell: {
      width: Control.hit,
      height: Control.hit,
      borderRadius: Radius.sm,
      borderWidth: StrokeToken.emphasis,
      alignItems: 'center',
      justifyContent: 'center' },
    emojiCellText: {
      fontSize: TypographyV2.hero.size,
      lineHeight: 32 },
    emojiSizePreview: {
      fontSize: TypographyV2.display.size,
      width: Control.chrome,
      textAlign: 'center' },
    sizeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm } });
}
