/**
 * useLookSelectionHandlers — canvas press / layer press / undo-redo
 * handlers + selection-change side effects for the Look composer.
 *
 * Extracted from LookComposerScreen — pure relocation, no changes.
 */

import { useCallback, useEffect, useRef } from 'react';
import { Keyboard } from 'react-native';
import type { CreatorContextValue } from '../../studio/CreatorContext';
import type { LookComposerStateResult } from './useLookComposerState';
import type { HapticApi } from './useLookMultiSelectActions';

export function useLookSelectionHandlers({
  cs,
  creator,
  haptic,
  exitMultiSelect,
}: {
  cs: LookComposerStateResult;
  creator: CreatorContextValue;
  haptic: HapticApi;
  exitMultiSelect: () => void;
}) {
  const { multiSelectMode, setMultiSelectMode, setBottomSurface } = cs;
  const {
    selectLayer,
    selectedLayerId,
    selectedLayerIds,
    toggleLayerInSelection,
    canUndo,
    canRedo,
    undo,
    redo,
  } = creator;

  const handleCanvasPress = useCallback(() => {
    Keyboard.dismiss();
    if (multiSelectMode) {
      exitMultiSelect();
      return;
    }
    selectLayer(null);
    haptic.light();
  }, [multiSelectMode, exitMultiSelect, selectLayer, haptic]);

  // Auto-exit multi-select mode when all layers are toggled off.
  useEffect(() => {
    if (multiSelectMode && selectedLayerIds.length === 0) {
      setMultiSelectMode(false);
    }
  }, [multiSelectMode, selectedLayerIds.length, setMultiSelectMode]);

  // ── Reset bottom surface to 'tools' when the selection changes ──
  // When the user selects or deselects a layer, any open bottom surface
  // (items / layout / effects) closes so the ContextToolRail can adapt to
  // the new selection context. This ensures only one surface is visible
  // and the rail always reflects the current selection state.
  const prevSelectionRef = useRef<string | null>(selectedLayerId);
  useEffect(() => {
    if (prevSelectionRef.current !== selectedLayerId) {
      prevSelectionRef.current = selectedLayerId;
      setBottomSurface('tools');
    }
  }, [selectedLayerId, setBottomSurface]);

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

  const handleUndo = useCallback(() => {
    if (!canUndo) return;
    haptic.light();
    undo();
  }, [canUndo, undo, haptic]);

  const handleRedo = useCallback(() => {
    if (!canRedo) return;
    haptic.light();
    redo();
  }, [canRedo, redo, haptic]);

  return { handleCanvasPress, handleLayerPress, handleUndo, handleRedo };
}
