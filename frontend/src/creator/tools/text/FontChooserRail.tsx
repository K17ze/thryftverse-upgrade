/**
 * FontChooserRail — horizontal rail of font presets.
 *
 * Extracted from CreatorAssetPicker's TextPicker style selector (spec
 * 07_MEDIA_TOOLCHAIN). Each item renders the user's ACTUAL text in the
 * preset font so the user can preview their content in each typeface
 * before committing.
 *
 * Visual spec:
 *   - Horizontal ScrollView
 *   - Each item: 64pt wide, centered text
 *   - Selected: 2pt brand border (Stroke.emphasis)
 *   - Light haptic on select
 */
import React, { useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { Space, Radius, Stroke } from '../../../theme/designTokens';
import { TypographyV2 } from '../../../theme/typography.v2';
import { useAppTheme, type ThemeColors } from '../../../theme/ThemeContext';
import { useHaptic } from '../../../hooks/useHaptic';
import { resolveFontPreviewStyle, type FontArchetype } from './FontRegistry';

export interface FontChooserRailProps {
  /** The user's current text. Rendered in each font. Falls back to "Aa" when empty. */
  text: string;
  fonts: FontArchetype[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

const ITEM_WIDTH = 64;
const ITEM_HEIGHT = 72;

export function FontChooserRail({
  text,
  fonts,
  selectedId,
  onSelect }: FontChooserRailProps) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const styles = useRailStyles(colors);

  const handleSelect = useCallback(
    (id: string) => {
      haptic.selection();
      onSelect(id);
    },
    [haptic, onSelect],
  );

  const displayText = text.trim().length > 0 ? text.trim() : 'Aa';

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.content}
      accessibilityRole="list"
      accessibilityLabel="Font chooser"
    >
      {fonts.map((font) => {
        const isSelected = selectedId === font.id;
        const previewStyle = resolveFontPreviewStyle(font.id, TypographyV2.body.size);
        // Clamp long text so the 64pt cell stays legible.
        const cellText =
          displayText.length > 6 ? `${displayText.slice(0, 6)}…` : displayText;
        return (
          <Pressable
            key={font.id}
            onPress={() => handleSelect(font.id)}
            style={[
              styles.item,
              isSelected && styles.itemSelected,
            ]}
            accessibilityLabel={`Font ${font.name}`}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
          >
            <Text
              style={[
                styles.itemText,
                { color: colors.textPrimary, fontFamily: previewStyle.fontFamily },
                isSelected && { color: colors.brand },
              ]}
              numberOfLines={1}
            >
              {cellText}
            </Text>
            <Text
              style={[
                styles.itemLabel,
                { color: isSelected ? colors.brand : colors.textMuted },
              ]}
              numberOfLines={1}
            >
              {font.name}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function useRailStyles(colors: ThemeColors) {
  return React.useMemo(
    () =>
      StyleSheet.create({
        content: {
          paddingHorizontal: Space.md,
          paddingVertical: Space.sm,
          gap: Space.sm },
        item: {
          width: ITEM_WIDTH,
          height: ITEM_HEIGHT,
          borderRadius: Radius.md,
          borderWidth: Stroke.standard,
          borderColor: colors.borderSubtle,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: Space.xs },
        itemSelected: {
          borderWidth: Stroke.emphasis,
          borderColor: colors.brand },
        itemText: {
          fontSize: TypographyV2.body.size,
          textAlign: 'center' },
        itemLabel: {
          fontSize: TypographyV2.meta.size,
          marginTop: Space.xxs,
          letterSpacing: 0.15 } }),
    [colors],
  );
}
