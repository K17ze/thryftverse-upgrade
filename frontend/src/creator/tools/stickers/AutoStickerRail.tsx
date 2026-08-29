/**
 * AutoStickerRail — horizontal rail of media-derived sticker suggestions.
 *
 * Per spec 08_DRAWING_STICKERS_CUTOUT_MASKING and AGENTS.md §11 (Truthful UI):
 *   - Suggestions are labeled "Suggested" — never "AI-generated".
 *   - Suggestions are genuinely derived from the current media palette and
 *     composition (see AutoStickers.ts).
 *   - Tapping a suggestion adds it to the composition via onStickerSelect.
 *   - Refreshes when the media palette or composition changes.
 *
 * Visual design:
 *   - "Suggested" eyebrow label above the rail.
 *   - Horizontal scroll of 44pt touch-target cells.
 *   - Each cell shows the emoji glyph + reason tooltip on accessibility.
 *   - Empty state when no palette is available yet.
 */
import React, { useMemo, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  type ViewStyle,
  type TextStyle } from 'react-native';
import {
  Space,
  Radius,
  FontFamily,
  Control, Stroke} from '../../../theme/designTokens';
import { TypographyV2 } from '../../../theme/typography.v2';
import { useAppTheme, type ThemeColors } from '../../../theme/ThemeContext';
import { PressScale } from '../../CreatorAnimations';
import { useHaptic } from '../../../hooks/useHaptic';
import {
  suggestAutoStickers,
  type AutoStickerInput,
  type ScoredSticker } from './AutoStickers';
import type { StickerDef } from './StickerCategories';

// Re-export AutoStickerInput so consumers can import it from this module
// alongside the AutoStickerRail component.
export type { AutoStickerInput } from './AutoStickers';

// ── Props ─────────────────────────────────────────────────────────────

export interface AutoStickerRailProps {
  /** Input for suggestion generation (palette + document + timestamp). */
  input: AutoStickerInput;
  /** Called when the user taps a suggested sticker. */
  onStickerSelect: (sticker: StickerDef) => void;
}

// ── Component ─────────────────────────────────────────────────────────

export function AutoStickerRail({ input, onStickerSelect }: AutoStickerRailProps) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const suggestions = useMemo<ScoredSticker[]>(
    () => suggestAutoStickers(input),
    [input],
  );

  const handleSelect = useCallback(
    (sticker: StickerDef) => {
      haptic.light();
      onStickerSelect(sticker);
    },
    [haptic, onStickerSelect],
  );

  if (suggestions.length === 0) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyText}>
          Add media to see suggested stickers
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.eyebrow}>Suggested</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.railContent}
        style={styles.rail}
      >
        {suggestions.map((s) => (
          <PressScale
            key={s.sticker.id}
            accessibilityLabel={`Suggested ${s.sticker.name}. ${s.reason}`}
            accessibilityRole="button"
            onPress={() => handleSelect(s.sticker)}
            style={styles.cell}
          >
            <Text style={styles.emoji}>{s.sticker.emoji}</Text>
          </PressScale>
        ))}
      </ScrollView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      gap: Space.xs } as ViewStyle,
    eyebrow: {
      fontFamily: FontFamily.medium,
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      letterSpacing: TypographyV2.meta.letterSpacing,
      color: colors.textSecondary,
      textTransform: 'uppercase' } as TextStyle,
    rail: {
      flexGrow: 0 } as ViewStyle,
    railContent: {
      gap: Space.sm,
      paddingRight: Space.md } as ViewStyle,
    cell: {
      width: Control.hit,
      height: Control.hit,
      borderRadius: Radius.md,
      backgroundColor: colors.surfaceAlt,
      borderWidth: Stroke.standard,
      borderColor: colors.borderSubtle,
      alignItems: 'center',
      justifyContent: 'center' } as ViewStyle,
    emoji: {
      fontSize: 28,
      lineHeight: 32 } as TextStyle,
    emptyState: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: Space.md } as ViewStyle,
    emptyText: {
      fontFamily: FontFamily.regular,
      fontSize: TypographyV2.body.size,
      lineHeight: TypographyV2.body.lineHeight,
      color: colors.textMuted,
      textAlign: 'center' } as TextStyle });
}
