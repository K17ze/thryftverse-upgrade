/**
 * TransitionPreviewRail — horizontal scrollable rail of transition previews.
 *
 * Each item is a 64pt-wide cell showing the preset's icon and name. Selecting
 * a preset fires a light haptic and calls `onSelect`. The selected item gets a
 * 2pt brand border (Stroke.emphasis — selection grammar per designTokens).
 *
 * When `fromThumbnailUri` / `toThumbnailUri` are provided, the cell renders a
 * tiny two-frame thumbnail strip above the icon to preview the transition's
 * direction; otherwise the icon alone communicates the style.
 *
 * Design references:
 *   - AGENTS.md §11: selecting a preset performs a real action via onSelect.
 *   - designTokens Stroke.emphasis (2pt) for selection borders only.
 *   - useHaptic `selection` for the tap acknowledgement.
 */

import React from 'react';
import { View, StyleSheet, ScrollView, Pressable, Image, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { TransitionPreset } from './TransitionTypes';
import { useAppTheme } from '../../../theme/ThemeContext';
import { useHaptic } from '../../../hooks/useHaptic';
import { Space, Radius, Stroke, FontFamily, FontSize, LetterSpacing } from '../../../theme/designTokens';

export interface TransitionPreviewRailProps {
  presets: TransitionPreset[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  fromThumbnailUri?: string;
  toThumbnailUri?: string;
}

const CELL_WIDTH = 64;
const THUMB_HEIGHT = 36;

export function TransitionPreviewRail({
  presets,
  selectedId,
  onSelect,
  fromThumbnailUri,
  toThumbnailUri,
}: TransitionPreviewRailProps) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const hasThumbs = Boolean(fromThumbnailUri || toThumbnailUri);

  const handleSelect = (id: string) => {
    haptic.selection();
    onSelect(id);
  };

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.content}
      accessibilityRole="list"
      accessibilityLabel="Transition presets"
    >
      {presets.map((preset) => {
        const selected = preset.id === selectedId;
        return (
          <Pressable
            key={preset.id}
            onPress={() => handleSelect(preset.id)}
            accessibilityRole="button"
            accessibilityLabel={`${preset.name} transition${selected ? ', selected' : ''}`}
            accessibilityHint={`Apply the ${preset.name} transition to this frame boundary`}
            style={[
              styles.cell,
              {
                width: CELL_WIDTH,
                borderColor: selected ? colors.brand : 'transparent',
                backgroundColor: selected ? colors.brandSubtle : colors.surface,
              },
            ]}
          >
            {hasThumbs && (
              <View style={styles.thumbRow}>
                <View
                  style={[
                    styles.thumb,
                    { backgroundColor: colors.surfaceAlt, borderColor: colors.borderSubtle },
                  ]}
                >
                  {fromThumbnailUri ? (
                    <Image source={{ uri: fromThumbnailUri }} style={styles.thumbImage} />
                  ) : null}
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={10}
                  color={colors.textMuted}
                  style={styles.thumbArrow}
                />
                <View
                  style={[
                    styles.thumb,
                    { backgroundColor: colors.surfaceAlt, borderColor: colors.borderSubtle },
                  ]}
                >
                  {toThumbnailUri ? (
                    <Image source={{ uri: toThumbnailUri }} style={styles.thumbImage} />
                  ) : null}
                </View>
              </View>
            )}
            <Ionicons
              name={preset.icon}
              size={22}
              color={selected ? colors.brand : colors.textPrimary}
            />
            <Text
              style={[
                styles.name,
                {
                  color: selected ? colors.brand : colors.textSecondary,
                },
              ]}
              numberOfLines={1}
            >
              {preset.name}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: Space.sm,
    gap: Space.sm,
    alignItems: 'center',
    paddingVertical: Space.xs,
  },
  cell: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.md,
    borderWidth: Stroke.emphasis,
    paddingVertical: Space.xs,
    paddingHorizontal: Space.xxs,
    minHeight: 64,
  },
  thumbRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Space.xs,
    height: THUMB_HEIGHT,
  },
  thumb: {
    width: 18,
    height: THUMB_HEIGHT,
    borderRadius: Radius.sm,
    borderWidth: Stroke.hairline,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  thumbImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  thumbArrow: {
    marginHorizontal: 1,
  },
  name: {
    marginTop: Space.xxs,
    fontFamily: FontFamily.medium,
    fontSize: FontSize.caption,
    letterSpacing: LetterSpacing.normal,
  },
});
