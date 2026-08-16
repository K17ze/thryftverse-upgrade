/**
 * EffectPreviewRail — a horizontal scrollable rail of effect preview
 * thumbnails for the creator effect picker.
 *
 * Each item shows an EffectPreviewThumb (real-media thumbnail with the
 * filter applied) plus a name label. Tap commits to a filter (onSelect).
 *
 * Per AGENTS.md §4: authored composition, clear hierarchy, restraint.
 * Per AGENTS.md §13/§18: light haptic on select, suppressed under reduced
 * motion.
 */
import React, { useCallback } from 'react';
import { StyleSheet, ScrollView } from 'react-native';
import { Space } from '../../../theme/designTokens';
import { useHaptic } from '../../../hooks/useHaptic';
import { useReducedMotion } from '../../../hooks/useReducedMotion';
import { EffectPreviewThumb } from './EffectPreviewThumb';
import type { EffectPreset } from './EffectTypes';

export interface EffectPreviewRailProps {
  sourceUri: string;
  presets: EffectPreset[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

/**
 * Horizontal rail of effect preview thumbnails. Press commits a selection.
 */
export function EffectPreviewRail({
  sourceUri,
  presets,
  selectedId,
  onSelect,
}: EffectPreviewRailProps) {
  const haptic = useHaptic();
  const reducedMotion = useReducedMotion();

  const handleSelect = useCallback(
    (id: string) => {
      if (!reducedMotion) haptic.light();
      onSelect(id);
    },
    [haptic, onSelect, reducedMotion],
  );

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.content}
      style={styles.container}
    >
      {presets.map((preset) => {
        const isSelected = preset.id === selectedId;
        return (
          <EffectPreviewThumb
            key={preset.id}
            sourceUri={sourceUri}
            preset={preset}
            selected={isSelected}
            onPress={() => handleSelect(preset.id)}
          />
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
});
