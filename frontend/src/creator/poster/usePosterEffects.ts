/**
 * usePosterEffects — Effects system hook for the Poster composer.
 *
 * Extracted from PosterComposerScreen to separate the effects subsystem
 * (filter selection, manual adjustments, auto-adjust, live filter preview
 * revert, and the swipe-to-filter HUD animation) from the screen's
 * rendering orchestration.
 *
 * The hook is self-contained: it accepts the selected layer, the current
 * page (for the swipe-to-filter media fallback), the active bottom surface
 * (to drive the live-preview revert effect), the `updateLayer` mutation
 * (history-pushing) and `updateLayerLive` mutation (no-history, for live
 * previews) from CreatorContext, and the haptic engine. It returns all
 * derived effect state plus handlers. The screen consumes these values
 * to render the effects bottom sheet and the filter HUD pill.
 *
 * Pattern follows useLookEffects.ts.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import type { CreatorLayer, CreatorPage, EffectNode } from '../composition';
import type { AdjustNode } from '../tools/effects';
import {
  FILTER_PRESETS,
  computeAutoAdjust,
  isAutoAdjustNode,
} from '../tools/effects';
import type { useHaptic } from '../../hooks/useHaptic';

// ── Types ────────────────────────────────────────────────────────────

/**
 * The media layer extracted from the selected layer, or null when the
 * selection is not a media layer.
 */
type MediaLayer = Extract<CreatorLayer, { type: 'media' }>;

/**
 * The mutation signature from CreatorContext.updateLayer (history-pushing).
 */
type UpdateLayerFn = (
  id: string,
  updates: Partial<CreatorLayer>,
  label?: string,
) => void;

/**
 * The mutation signature from CreatorContext.updateLayerLive (no-history).
 * Used for live filter previews that must not spam the undo stack.
 */
type UpdateLayerLiveFn = (
  id: string,
  updates: Partial<CreatorLayer>,
) => void;

/**
 * The haptic engine returned by useHaptic.
 */
type Haptic = ReturnType<typeof useHaptic>;

/**
 * The active bottom surface. The hook only acts on the 'effects' state
 * (sheet open/close) to drive the live-preview revert effect.
 */
type BottomSurface = 'tools' | 'timeline' | 'effects' | null;

// ── Hook ─────────────────────────────────────────────────────────────

export function usePosterEffects(
  selectedLayer: CreatorLayer | null,
  page: CreatorPage | null,
  bottomSurface: BottomSurface,
  updateLayer: UpdateLayerFn,
  updateLayerLive: UpdateLayerLiveFn,
  haptic: Haptic,
) {
  // ── Derived media layer & effect state ────────────────────────────
  const selectedMediaLayer: MediaLayer | null =
    selectedLayer?.type === 'media' ? selectedLayer : null;
  const effectsSourceUri = selectedMediaLayer?.payload.mediaUri ?? '';
  const currentEffects: EffectNode[] = selectedMediaLayer?.payload.effects ?? [];

  // ── Selected filter ID (from the effect stack) ────────────────────
  const selectedFilterId = useMemo(() => {
    const filterNode = currentEffects.find((n) => n.type === 'filter');
    return filterNode?.type === 'filter' ? filterNode.id : null;
  }, [currentEffects]);

  // ── Live filter preview (Snapchat/Instagram pattern) ─────────────────
  // While the user scrolls the effect rail, the centred filter is applied to
  // the full canvas as a TRANSIENT preview (no history entry) via
  // updateLayerLive. Tapping a thumbnail commits via handleEffectFilterSelect
  // (history entry) and clears the preview. When the effects sheet closes
  // without a commit, the preview is reverted to the last committed filter.
  // `committedFilterIdRef` captures the filter id that lives in the history
  // stack the moment the sheet opens — before any preview mutation — so we
  // can restore it on close.
  const committedFilterIdRef = useRef<string | null>(null);

  // Capture the committed filter id when the effects sheet opens; revert any
  // uncommitted preview when it closes.
  useEffect(() => {
    if (bottomSurface === 'effects') {
      // No preview has mutated the layer yet, so selectedFilterId is the
      // committed (history) value.
      committedFilterIdRef.current = selectedFilterId;
    } else {
      // Sheet closed — restore the committed filter on the layer (no history
      // entry) if a different filter was applied during the session.
      const committedId = committedFilterIdRef.current;
      if (committedId !== null && committedId !== selectedFilterId && selectedMediaLayer) {
        const revertedEffects: EffectNode[] = [
          ...currentEffects.filter((n) => n.type !== 'filter'),
          ...(committedId
            ? [{ type: 'filter' as const, id: committedId, amount: 1 }]
            : []),
        ];
        updateLayerLive(selectedMediaLayer.id, {
          type: 'media',
          payload: { ...selectedMediaLayer.payload, effects: revertedEffects },
        });
      }
      committedFilterIdRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bottomSurface]);

  // ── Current manual adjustments ────────────────────────────────────
  const currentAdjustments = useMemo<Partial<Omit<AdjustNode, 'type'>>>(() => {
    const adjustNode = currentEffects.find((n) => n.type === 'adjust');
    if (adjustNode?.type !== 'adjust') return {};
    const { type: _t, ...rest } = adjustNode;
    return rest;
  }, [currentEffects]);

  // ── Filter select handler ─────────────────────────────────────────
  const handleEffectFilterSelect = useCallback((presetId: string) => {
    if (!selectedMediaLayer) return;
    const newEffects: EffectNode[] = [
      ...currentEffects.filter((n) => n.type !== 'filter'),
      { type: 'filter', id: presetId, amount: 1 },
    ];
    updateLayer(selectedMediaLayer.id, {
      type: 'media',
      payload: { ...selectedMediaLayer.payload, effects: newEffects },
    }, 'Apply filter');
    // Record the new committed filter so a subsequent panel close does not
    // revert it.
    committedFilterIdRef.current = presetId;
  }, [selectedMediaLayer, currentEffects, updateLayer]);

  // ── Adjust change handler ────────────────────────────────────────
  const handleEffectAdjustChange = useCallback((parameter: string, value: number) => {
    if (!selectedMediaLayer) return;
    const existingAdjust = currentEffects.find((n) => n.type === 'adjust');
    const base = existingAdjust?.type === 'adjust'
      ? { ...existingAdjust }
      : { type: 'adjust' as const };
    (base as Record<string, unknown>)[parameter] = value;
    const newAdjust = base as Extract<EffectNode, { type: 'adjust' }>;
    const newEffects: EffectNode[] = [
      ...currentEffects.filter((n) => n.type !== 'adjust'),
      newAdjust,
    ];
    updateLayer(selectedMediaLayer.id, {
      type: 'media',
      payload: { ...selectedMediaLayer.payload, effects: newEffects },
    });
  }, [selectedMediaLayer, currentEffects, updateLayer]);

  // ── Reset adjustments handler ─────────────────────────────────────
  const handleEffectReset = useCallback(() => {
    if (!selectedMediaLayer) return;
    const newEffects = currentEffects.filter((n) => n.type !== 'adjust');
    updateLayer(selectedMediaLayer.id, {
      type: 'media',
      payload: { ...selectedMediaLayer.payload, effects: newEffects },
    }, 'Reset adjustments');
  }, [selectedMediaLayer, currentEffects, updateLayer]);

  // ── Auto-adjust (one-tap color correction) ────────────────────────
  // Toggles the conservative auto-adjust preset on the selected media
  // layer. If the existing adjust node was produced by computeAutoAdjust,
  // tapping removes it; otherwise the auto preset replaces any manual
  // adjust node (Instagram Edits August 2026 parity).
  const autoAdjustActive = useMemo(() => {
    const adjust = currentEffects.find((n) => n.type === 'adjust');
    return adjust ? isAutoAdjustNode(adjust) : false;
  }, [currentEffects]);

  const handleAutoAdjust = useCallback(async () => {
    if (!selectedMediaLayer) return;
    const existing = currentEffects.find((n) => n.type === 'adjust');
    if (existing && isAutoAdjustNode(existing)) {
      const newEffects = currentEffects.filter((n) => n.type !== 'adjust');
      updateLayer(selectedMediaLayer.id, {
        type: 'media',
        payload: { ...selectedMediaLayer.payload, effects: newEffects },
      }, 'Remove auto-adjust');
      return;
    }
    const autoNode = await computeAutoAdjust(effectsSourceUri);
    const newEffects: EffectNode[] = [
      ...currentEffects.filter((n) => n.type !== 'adjust'),
      autoNode,
    ];
    updateLayer(selectedMediaLayer.id, {
      type: 'media',
      payload: { ...selectedMediaLayer.payload, effects: newEffects },
    }, 'Apply auto-adjust');
  }, [selectedMediaLayer, currentEffects, updateLayer, effectsSourceUri]);

  // ── Filter HUD (swipe-to-filter indicator) ─────────────────────────
  // Animated pill shown when the user swipes horizontally on a single-frame
  // poster to cycle live Skia filters (Instagram/Snapchat parity).
  const [filterHudName, setFilterHudName] = useState<string | null>(null);
  const filterHudOpacitySV = useSharedValue(0);
  const filterHudScaleSV = useSharedValue(0.85);
  const filterHudTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const filterHudAnimatedStyle = useAnimatedStyle(() => ({
    opacity: filterHudOpacitySV.value,
    transform: [{ scale: filterHudScaleSV.value }],
  }));

  // ── Swipe-to-filter (single-frame story/poster) ───────────────────
  // Cycles through FILTER_PRESETS on horizontal swipe when there is only one
  // frame. Applies the filter to the selected media layer (or the first media
  // layer on the page when nothing is selected) and animates the HUD pill.
  const cycleFilter = useCallback((direction: 'next' | 'prev') => {
    const targetMedia = (selectedLayer?.type === 'media' ? selectedLayer : page?.layers?.find((l) => l.type === 'media')) ?? null;
    if (!targetMedia || targetMedia.type !== 'media') return;
    const layerEffects: EffectNode[] = targetMedia.payload.effects ?? [];
    const currentFilterNode = layerEffects.find((n) => n.type === 'filter');
    const currentFilterId = currentFilterNode?.type === 'filter' ? currentFilterNode.id : 'original';
    let idx = FILTER_PRESETS.findIndex((p) => p.id === currentFilterId);
    if (idx < 0) idx = 0;
    const nextIdx = direction === 'next'
      ? (idx + 1) % FILTER_PRESETS.length
      : (idx - 1 + FILTER_PRESETS.length) % FILTER_PRESETS.length;
    const nextPreset = FILTER_PRESETS[nextIdx];
    const newEffects: EffectNode[] = [
      ...layerEffects.filter((n) => n.type !== 'filter'),
      ...(nextPreset.id !== 'original' ? [{ type: 'filter' as const, id: nextPreset.id, amount: 1 }] : []),
    ];
    updateLayer(targetMedia.id, {
      type: 'media',
      payload: { ...targetMedia.payload, effects: newEffects },
    }, 'Apply filter');
    haptic.selection();
    setFilterHudName(nextPreset.name.toUpperCase());
    filterHudOpacitySV.value = withTiming(1, { duration: 150 });
    filterHudScaleSV.value = withTiming(1, { duration: 180 });
    if (filterHudTimeoutRef.current) clearTimeout(filterHudTimeoutRef.current);
    filterHudTimeoutRef.current = setTimeout(() => {
      filterHudOpacitySV.value = withTiming(0, { duration: 320 });
      filterHudScaleSV.value = withTiming(0.9, { duration: 320 });
    }, 900);
  }, [selectedLayer, page, updateLayer, haptic, filterHudOpacitySV, filterHudScaleSV]);

  return {
    selectedMediaLayer,
    effectsSourceUri,
    currentEffects,
    selectedFilterId,
    currentAdjustments,
    autoAdjustActive,
    handleEffectFilterSelect,
    handleEffectAdjustChange,
    handleEffectReset,
    handleAutoAdjust,
    filterHudName,
    filterHudAnimatedStyle,
    cycleFilter,
  };
}
