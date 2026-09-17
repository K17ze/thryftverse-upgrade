/**
 * usePosterLayerSheetOps — layer sheet operations for the Poster
 * composer.
 *
 * Extracted from PosterComposerScreen (pure extraction — no behavioral
 * change). Owns the transition handler (page transitionId via
 * commitDocument), the keyframe add/update/remove handlers over the
 * selected layer, and the selected media layer's speed-curve derivation.
 */
import { useCallback, useMemo } from 'react';

import type {
  CreatorDocument,
  CreatorLayer,
  CreatorPage,
} from '../../core/projectStore/composition';
import type { Keyframe } from '../keyframes/KeyframeTypes';
import type { SpeedCurve } from '../speedcurves/SpeedCurveTypes';
import { DEFAULT_SPEED_CURVE } from '../speedcurves/SpeedCurveTypes';
import { makeStableId } from '../../../utils/createStableId';
import type { useHaptic } from '../../../hooks/useHaptic';

// ── Types ────────────────────────────────────────────────────────────

/**
 * The haptic engine returned by useHaptic.
 */
type Haptic = ReturnType<typeof useHaptic>;

/**
 * The mutation signature from CreatorContext.updateLayer (history-pushing).
 */
type UpdateLayerFn = (
  id: string,
  updates: Partial<CreatorLayer>,
  label?: string,
) => void;

export interface UsePosterLayerSheetOpsInput {
  /** The composition document. */
  document: CreatorDocument;
  /** The active page being edited. */
  page: CreatorPage | undefined;
  /** The active page index (from CreatorContext). */
  activePageIndex: number;
  /** The currently selected layer (keyframes/speed curve are scoped to it). */
  selectedLayer: CreatorLayer | null;
  /** Merges a partial layer update (from CreatorContext). */
  updateLayer: UpdateLayerFn;
  /** Commits a full document update (from CreatorContext). */
  commitDocument: (doc: CreatorDocument, label: string) => void;
  /** Haptic engine. */
  haptic: Haptic;
}

// ── Hook ─────────────────────────────────────────────────────────────

export function usePosterLayerSheetOps({
  document,
  page,
  activePageIndex,
  selectedLayer,
  updateLayer,
  commitDocument,
  haptic,
}: UsePosterLayerSheetOpsInput) {
  // ── Transition handler — opens the transition preview rail for the ──
  // current page. Selecting a transition stores its preset id on the
  // page's `transitionId` field.
  const currentTransitionId = page?.transitionId ?? null;
  const handleTransitionSelect = useCallback((presetId: string) => {
    const newPages = [...document.pages];
    newPages[activePageIndex] = {
      ...newPages[activePageIndex],
      transitionId: presetId,
    };
    commitDocument(
      { ...document, pages: newPages, updatedAt: new Date().toISOString() },
      'Apply transition',
    );
    haptic.selection();
  }, [activePageIndex, document, commitDocument, haptic]);

  // ── Keyframe handlers ─────────────────────────────────────────────
  // Keyframes are stored on the layer's `keyframes` array. The editor
  // calls onAdd/onUpdate/onRemove to mutate the keyframe set.
  const selectedLayerKeyframes: Keyframe[] = (selectedLayer as { keyframes?: Keyframe[] })?.keyframes ?? [];

  const handleAddKeyframe = useCallback((kf: Omit<Keyframe, 'id'>) => {
    if (!selectedLayer) return;
    const newKf: Keyframe = { ...kf, id: makeStableId('kf') };
    const existing = (selectedLayer as { keyframes?: Keyframe[] }).keyframes ?? [];
    updateLayer(selectedLayer.id, {
      ...selectedLayer,
      keyframes: [...existing, newKf],
    } as Partial<CreatorLayer>, 'Add keyframe');
    haptic.light();
  }, [selectedLayer, updateLayer, haptic]);

  const handleUpdateKeyframe = useCallback((id: string, updates: Partial<Keyframe>) => {
    if (!selectedLayer) return;
    const existing = (selectedLayer as { keyframes?: Keyframe[] }).keyframes ?? [];
    const newKeyframes = existing.map((k) => k.id === id ? { ...k, ...updates } : k);
    updateLayer(selectedLayer.id, {
      ...selectedLayer,
      keyframes: newKeyframes,
    } as Partial<CreatorLayer>, 'Update keyframe');
  }, [selectedLayer, updateLayer]);

  const handleRemoveKeyframe = useCallback((id: string) => {
    if (!selectedLayer) return;
    const existing = (selectedLayer as { keyframes?: Keyframe[] }).keyframes ?? [];
    const newKeyframes = existing.filter((k) => k.id !== id);
    updateLayer(selectedLayer.id, {
      ...selectedLayer,
      keyframes: newKeyframes.length > 0 ? newKeyframes : undefined,
    } as Partial<CreatorLayer>, 'Remove keyframe');
    haptic.light();
  }, [selectedLayer, updateLayer, haptic]);

  // ── Speed curve handler — opens the speed curve editor for the ─────
  // selected media layer. The curve is stored on the media layer's
  // `speedCurve` field. When the user clears the curve (back to
  // constant), the field is removed.
  const selectedMediaSpeedCurve: SpeedCurve | null = useMemo(() => {
    if (selectedLayer?.type !== 'media') return null;
    return selectedLayer.payload.speedCurve ?? DEFAULT_SPEED_CURVE;
  }, [selectedLayer]);

  return {
    currentTransitionId,
    handleTransitionSelect,
    selectedLayerKeyframes,
    handleAddKeyframe,
    handleUpdateKeyframe,
    handleRemoveKeyframe,
    selectedMediaSpeedCurve,
  };
}

export type PosterLayerSheetOps = ReturnType<typeof usePosterLayerSheetOps>;
