/**
 * LayoutPreviewRail — horizontal scrollable rail of layout preview thumbnails.
 * Tap commits to a layout; long-press triggers a temporary preview.
 */
import React, { useCallback } from 'react';
import { StyleSheet, Pressable, ScrollView } from 'react-native';
import { Space } from '../../../theme/designTokens';
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
    gap: 4,
    alignItems: 'flex-start',
  },
  item: {
    alignItems: 'center',
  },
});
