/**
 * usePosterCanvasInteraction — canvas interaction handlers + floating
 * layer menu for the Poster composer.
 *
 * Extracted from PosterComposerScreen (pure extraction — no behavioral
 * change). Owns the canvas/layer press handlers, the selected-layer
 * derivation, and the floating context menu state (visibility effect,
 * anchor position, action list).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Keyboard } from 'react-native';

import { Space } from '../../../theme/designTokens';
import type { CreatorPage } from '../../core/projectStore/composition';
import type { LayerFloatingMenuAction } from '../../surfaces/LayerFloatingMenu';
import type { useHaptic } from '../../../hooks/useHaptic';
import { buildLayerFloatingMenuActions } from './layerFloatingMenuActions';

// ── Types ────────────────────────────────────────────────────────────

/**
 * The haptic engine returned by useHaptic.
 */
type Haptic = ReturnType<typeof useHaptic>;

export interface UsePosterCanvasInteractionInput {
  /** The active page being edited. */
  page: CreatorPage | undefined;
  /** The selected layer id (from CreatorContext). */
  selectedLayerId: string | null;
  /** Whether multi-select mode is active. */
  multiSelectMode: boolean;
  /** In-place text editing target (suppresses the floating menu). */
  editingTextLayerId: string | null;
  /** Authored canvas geometry. */
  canvasWidth: number;
  canvasHeight: number;
  /** Vertical letterbox offset of the authored canvas. */
  canvasVerticalOffset: number;
  /** Exits multi-select mode (from usePosterMultiSelectOps). */
  exitMultiSelect: () => void;
  /** Single-layer selection (from CreatorContext). */
  selectLayer: (id: string | null) => void;
  /** Toggles a layer in the multi-selection (from CreatorContext). */
  toggleLayerInSelection: (layerId: string) => void;
  /** Z-order reorder (from CreatorContext). */
  reorderLayer: (id: string, direction: 'front' | 'forward' | 'backward' | 'back') => void;
  /** Duplicate (from CreatorContext). */
  duplicateLayer: (id: string) => void;
  /** Lock toggle (from CreatorContext). */
  toggleLayerLock: (id: string) => void;
  /** Delete (from CreatorContext). */
  removeLayer: (id: string) => void;
  /** Haptic engine. */
  haptic: Haptic;
}

// ── Hook ─────────────────────────────────────────────────────────────

export function usePosterCanvasInteraction({
  page,
  selectedLayerId,
  multiSelectMode,
  editingTextLayerId,
  canvasWidth,
  canvasHeight,
  canvasVerticalOffset,
  exitMultiSelect,
  selectLayer,
  toggleLayerInSelection,
  reorderLayer,
  duplicateLayer,
  toggleLayerLock,
  removeLayer,
  haptic,
}: UsePosterCanvasInteractionInput) {
  const handleCanvasPress = useCallback(() => {
    Keyboard.dismiss();
    if (multiSelectMode) {
      exitMultiSelect();
      return;
    }
    selectLayer(null);
    haptic.light();
  }, [multiSelectMode, exitMultiSelect, selectLayer, haptic]);

  const handleLayerPress = useCallback((layerId: string) => {
    if (multiSelectMode) {
      // In multi-select mode, tapping a layer toggles it in the selection
      toggleLayerInSelection(layerId);
      haptic.selection();
      return;
    }
    selectLayer(layerId);
    haptic.light();
  }, [multiSelectMode, toggleLayerInSelection, selectLayer, haptic]);

  const selectedLayer = page?.layers.find((l) => l.id === selectedLayerId) ?? null;

  // ── Floating context menu for the selected layer ───────────────────
  // Compact action bubble above the selected layer — z-order, duplicate,
  // lock, delete without opening the Layers sheet. Same grammar as the
  // Look composer; suppressed during multi-select (bulk rail owns ops)
  // and while the inline text editor is open.
  const [floatingMenuVisible, setFloatingMenuVisible] = useState(false);
  useEffect(() => {
    setFloatingMenuVisible(!!selectedLayerId && !multiSelectMode && !editingTextLayerId);
  }, [selectedLayerId, multiSelectMode, editingTextLayerId]);

  // Menu anchors above the layer's top edge in screen coords. The canvas
  // sits at left:0, top:canvasVerticalOffset — no measurement needed.
  const floatingMenuPos = useMemo(() => {
    if (!selectedLayer) return { x: 0, y: 0 };
    return {
      x: selectedLayer.x * canvasWidth,
      y: Math.max(
        canvasVerticalOffset + Space.sm,
        canvasVerticalOffset + (selectedLayer.y - (selectedLayer.height * selectedLayer.scale) / 2) * canvasHeight - 48,
      ),
    };
  }, [selectedLayer, canvasWidth, canvasHeight, canvasVerticalOffset]);

  const floatingMenuActions = useMemo<LayerFloatingMenuAction[]>(() => {
    return buildLayerFloatingMenuActions({
      selectedLayerId,
      selectedLayer,
      reorderLayer,
      duplicateLayer,
      toggleLayerLock,
      removeLayer,
      haptic,
    });
  }, [selectedLayerId, selectedLayer, reorderLayer, duplicateLayer, removeLayer, toggleLayerLock, haptic]);

  return {
    handleCanvasPress,
    handleLayerPress,
    selectedLayer,
    floatingMenuVisible,
    floatingMenuPos,
    floatingMenuActions,
  };
}

export type PosterCanvasInteraction = ReturnType<typeof usePosterCanvasInteraction>;
