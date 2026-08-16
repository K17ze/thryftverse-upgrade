/**
 * LayoutPreviewRail — a horizontal scrollable rail of layout preview
 * thumbnails for the Look composer.
 *
 * Each item shows a LayoutPreviewRenderer plus a name label. Tap commits
 * to a layout (onSelect); long-press triggers a temporary preview
 * (onPreview) that reverts on release (onPreviewEnd).
 *
 * Per AGENTS.md §4: authored composition, clear hierarchy, restraint.
 * Per AGENTS.md §13/§18: light haptic on select, suppressed under reduced
 * motion.
 */
import React, { useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { Space, FontSize, FontFamily } from '../../../theme/designTokens';
import { useAppTheme } from '../../../theme/ThemeContext';
import { useHaptic } from '../../../hooks/useHaptic';
import { useReducedMotion } from '../../../hooks/useReducedMotion';
import { LayoutPreviewRenderer } from './LayoutPreviewRenderer';
import type { LayoutId, LayoutPreview } from './layoutTypes';

export interface LayoutPreviewRailProps {
  assetUris: string[];
  layouts: LayoutPreview[];
  selectedId: LayoutId | null;
  onSelect: (id: LayoutId) => void;
  /** Temporary preview on long-press (no commit). */
  onPreview?: (id: LayoutId) => void;
  /** Revert a temporary preview on long-press release. */
  onPreviewEnd?: () => void;
}

/**
 * Horizontal rail of layout previews. Press commits; long-press previews.
 */
export function LayoutPreviewRail({
  assetUris,
  layouts,
  selectedId,
  onSelect,
  onPreview,
  onPreviewEnd,
}: LayoutPreviewRailProps) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const reducedMotion = useReducedMotion();

  const handleSelect = useCallback(
    (id: LayoutId) => {
      if (!reducedMotion) haptic.light();
      onSelect(id);
    },
    [haptic, onSelect, reducedMotion],
  );

  const handleLongPress = useCallback(
    (id: LayoutId) => {
      onPreview?.(id);
    },
    [onPreview],
  );

  const handlePressOut = useCallback(() => {
    onPreviewEnd?.();
  }, [onPreviewEnd]);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.content}
      style={styles.container}
    >
      {layouts.map((layout) => {
        const isSelected = layout.id === selectedId;
        return (
          <Pressable
            key={layout.id}
            onPress={() => handleSelect(layout.id)}
            onLongPress={() => handleLongPress(layout.id)}
            onPressOut={handlePressOut}
            style={styles.item}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            accessibilityLabel={`${layout.name} layout`}
          >
            <LayoutPreviewRenderer
              assetUris={assetUris}
              layout={layout}
              selected={isSelected}
            />
            <Text
              style={[
                styles.label,
                { color: colors.textMuted, fontFamily: FontFamily.regular },
              ]}
              numberOfLines={1}
            >
              {layout.name}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 0,
  },
  content: {
    paddingHorizontal: Space.md,
    gap: Space.sm,
    alignItems: 'flex-start',
  },
  item: {
    alignItems: 'center',
  },
  label: {
    fontSize: FontSize.micro,
    lineHeight: FontSize.micro + 4,
    textAlign: 'center',
    marginTop: 4,
  },
});
