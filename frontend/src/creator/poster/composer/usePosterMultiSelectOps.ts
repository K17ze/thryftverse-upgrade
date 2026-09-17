/**
 * usePosterMultiSelectOps — multi-select mode ops for the Poster composer.
 *
 * Extracted from PosterComposerScreen (pure extraction — no behavioral
 * change). Owns the exit/delete handlers, the auto-exit effects (empty
 * selection, page change), and the shared useMultiSelect wiring (group
 * drag snapshot/commit, overlap cycle, bulk z-order, bounding-box align).
 */
import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from 'react';

import type { CreatorLayer, CreatorPage } from '../../core/projectStore/composition';
import { useMultiSelect } from '../../shared/useMultiSelect';
import type { useHaptic } from '../../../hooks/useHaptic';

// ── Types ────────────────────────────────────────────────────────────

/**
 * The haptic engine returned by useHaptic.
 */
type Haptic = ReturnType<typeof useHaptic>;

export interface UsePosterMultiSelectOpsInput {
  /** The active page (multi-select ops are page-scoped). */
  page: CreatorPage | undefined;
  /** The active page index (page changes drop multi-select). */
  activePageIndex: number;
  /** Selected layer ids (from CreatorContext). */
  selectedLayerIds: string[];
  /** Whether multi-select mode is active. */
  multiSelectMode: boolean;
  /** Setter for multi-select mode. */
  setMultiSelectMode: Dispatch<SetStateAction<boolean>>;
  /** Bulk selection setter (from CreatorContext). */
  selectLayers: (ids: string[] | null) => void;
  /** Single-layer selection (from CreatorContext). */
  selectLayer: (id: string | null) => void;
  /** Toggles a layer in the multi-selection (from CreatorContext). */
  toggleLayerInSelection: (layerId: string) => void;
  /** Commits a multi-layer transform (from CreatorContext). */
  commitMultiLayerTransform: (
    updates: Array<{ id: string; updates: Partial<CreatorLayer> }>,
    label: string,
  ) => void;
  /** Bulk z-order ops (from CreatorContext). */
  bringSelectedToFront: () => void;
  sendSelectedToBack: () => void;
  /** Deletes all selected layers (from CreatorContext). */
  deleteMultiSelected: () => void;
  /** Haptic engine. */
  haptic: Haptic;
}

// ── Hook ─────────────────────────────────────────────────────────────

export function usePosterMultiSelectOps({
  page,
  activePageIndex,
  selectedLayerIds,
  multiSelectMode,
  setMultiSelectMode,
  selectLayers,
  selectLayer,
  toggleLayerInSelection,
  commitMultiLayerTransform,
  bringSelectedToFront,
  sendSelectedToBack,
  deleteMultiSelected,
  haptic,
}: UsePosterMultiSelectOpsInput) {
  // ── Multi-select mode ─────────────────────────────────────────────
  // Defined early so the keyboard/back handlers below can exit it.
  const exitMultiSelect = useCallback(() => {
    setMultiSelectMode(false);
    selectLayers(null);
    haptic.light();
  }, [setMultiSelectMode, selectLayers, haptic]);

  const handleMultiDelete = useCallback(() => {
    haptic.medium();
    haptic.warning();
    deleteMultiSelected();
    setMultiSelectMode(false);
  }, [deleteMultiSelected, haptic, setMultiSelectMode]);

  // Auto-exit multi-select mode when all layers are toggled off.
  useEffect(() => {
    if (multiSelectMode && selectedLayerIds.length === 0) {
      setMultiSelectMode(false);
    }
  }, [multiSelectMode, selectedLayerIds.length, setMultiSelectMode]);

  // Multi-select is page-scoped — selection ids reference the active page's
  // layers. Leaving the frame (swipe, segment tap, timeline clip tap, frame
  // tray) must drop the mode so bulk ops can't act on stale ids.
  const prevPageIndexRef = useRef(activePageIndex);
  useEffect(() => {
    if (prevPageIndexRef.current !== activePageIndex) {
      prevPageIndexRef.current = activePageIndex;
      if (multiSelectMode) {
        setMultiSelectMode(false);
        selectLayers(null);
      }
    }
  }, [activePageIndex, multiSelectMode, selectLayers, setMultiSelectMode]);

  // Multi-select operations — shared with the Look composer (group drag
  // snapshot/commit, overlap cycle, bulk z-order, bounding-box align).
  const {
    handleMultiDragStart,
    handleMultiDragCommit,
    handleOverlapCycle,
    handleMultiFront,
    handleMultiBack,
    handleMultiAlign,
  } = useMultiSelect(
    page,
    selectedLayerIds,
    multiSelectMode,
    {
      commitMultiLayerTransform,
      bringSelectedToFront,
      sendSelectedToBack,
      toggleLayerInSelection,
      selectLayer,
    },
    haptic,
  );

  return {
    exitMultiSelect,
    handleMultiDelete,
    handleMultiDragStart,
    handleMultiDragCommit,
    handleOverlapCycle,
    handleMultiFront,
    handleMultiBack,
    handleMultiAlign,
  };
}

export type PosterMultiSelectOps = ReturnType<typeof usePosterMultiSelectOps>;
