/**
 * EffectPreviewRail — a horizontal scrollable rail of native effect preview
 * thumbnails for the creator effect picker.
 *
 * Each item shows an EffectPreviewThumb (real Skia-rendered thumbnail with
 * the filter applied) plus a name label. Tap commits to a filter (onSelect).
 * Below the rail, when a preset is selected, an intensity slider appears
 * (0..1 — interpolates between identity and the full effect). Press-and-hold
 * on the rail area shows the original (before/after trust interaction,
 * spec 07 §5).
 *
 * Per AGENTS.md §4: authored composition, clear hierarchy, restraint.
 * Per AGENTS.md §13/§18: light haptic on select, suppressed under reduced
 * motion, 44pt touch targets, accessibility labels.
 * Per spec 07 §3: selected state unambiguous, low-res Skia previews.
 */
import React, { useCallback, useMemo, useState } from 'react';
import {
  StyleSheet,
  ScrollView,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import {
  Space,
} from '../../../theme/designTokens';
import { useHaptic } from '../../../hooks/useHaptic';
import { useReducedMotion } from '../../../hooks/useReducedMotion';
import { CreatorSlider } from '../../controls/CreatorSlider';
import { EffectPreviewThumb } from './EffectPreviewThumb';
import type { EffectPreset } from './EffectTypes';

export interface EffectPreviewRailProps {
  sourceUri: string;
  presets: EffectPreset[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Current intensity 0..1 (null = use preset default). */
  intensity?: number | null;
  /** Called when the intensity slider changes (live, during drag). */
  onIntensityChange?: (value: number) => void;
  /** Called when the intensity slider is released (commit to history). */
  onIntensityCommit?: (value: number) => void;
}

/**
 * Horizontal rail of effect preview thumbnails + intensity slider.
 * Press commits a selection. Press-and-hold on a thumbnail shows the original.
 */
export function EffectPreviewRail({
  sourceUri,
  presets,
  selectedId,
  onSelect,
  intensity,
  onIntensityChange,
  onIntensityCommit,
}: EffectPreviewRailProps) {
  const haptic = useHaptic();
  const reducedMotion = useReducedMotion();
  const [showOriginal, setShowOriginal] = useState(false);

  const handleSelect = useCallback(
    (id: string) => {
      if (!reducedMotion) haptic.light();
      onSelect(id);
    },
    [haptic, onSelect, reducedMotion],
  );

  // ── Before/after: long-press shows original ───────────────────────────
  // Press-and-hold on the rail area bypasses the graph (shows original).
  // Release restores. Spec 07 §5: high-value trust interaction.
  const longPress = useMemo(
    () =>
      Gesture.LongPress()
        .minDuration(300)
        .onBegin(() => {
          runOnJS(setShowOriginal)(true);
          runOnJS(haptic.medium)();
        })
        .onFinalize(() => {
          runOnJS(setShowOriginal)(false);
        }),
    [haptic],
  );

  const selectedPreset = useMemo(
    () => presets.find((p) => p.id === selectedId) ?? null,
    [presets, selectedId],
  );

  const currentIntensity = intensity ?? selectedPreset?.intensity ?? 1;

  return (
    <View style={styles.container}>
      <GestureDetector gesture={longPress}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.content}
          style={styles.scroll}
          accessibilityLabel="Filter presets"
          accessibilityHint="Swipe horizontally to browse filters. Press and hold to compare with original."
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
                intensity={currentIntensity}
                showOriginal={showOriginal}
                size={56}
                showName={isSelected}
              />
            );
          })}
        </ScrollView>
      </GestureDetector>

      {/* ── Intensity slider (below rail, only when a preset is selected) ── */}
      {selectedPreset && selectedPreset.id !== 'original' && onIntensityChange && (
        <View style={styles.sliderWrap}>
          <CreatorSlider
            value={currentIntensity}
            min={0}
            max={1}
            step={0.01}
            onValueChange={onIntensityChange}
            onCommit={onIntensityCommit ?? (() => {})}
            accessibilityLabel="Filter intensity"
            hapticAtNeutral
          />
        </View>
      )}
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flexGrow: 0,
    backgroundColor: 'transparent',
  },
  scroll: {
    flexGrow: 0,
    backgroundColor: 'transparent',
  },
  content: {
    paddingHorizontal: Space.md,
    gap: Space.xs,
    alignItems: 'flex-start',
  },
  sliderWrap: {
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
  },
});
