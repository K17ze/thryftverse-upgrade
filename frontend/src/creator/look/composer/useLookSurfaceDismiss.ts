/**
 * useLookSurfaceDismiss — shared back-button priority cascade for the
 * Look composer.
 *
 * Extracted from LookComposerScreen — pure relocation, no changes.
 * Single source of truth for the "close topmost surface" priority order
 * used by BOTH the hardware back button (useFocusEffect) and the keyboard
 * Escape handler.
 */

import { useCallback, useEffect } from 'react';
import { BackHandler } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { CreatorContextValue } from '../../studio/CreatorContext';
import type { LookComposerStateResult } from './useLookComposerState';

export function useLookSurfaceDismiss({
  cs,
  creator,
  exitMultiSelect,
  handleMultiDelete,
  handleBack,
}: {
  cs: LookComposerStateResult;
  creator: CreatorContextValue;
  exitMultiSelect: () => void;
  handleMultiDelete: () => void;
  handleBack: () => void;
}) {
  const {
    state,
    dispatch,
    editingTextLayerId,
    setEditingTextLayerId,
    bottomSurface,
    setBottomSurface,
    cropTarget,
    setCropTarget,
    cutoutTarget,
    setCutoutTarget,
    cutoutPreviewTarget,
    setCutoutPreviewTarget,
    showTextColorPicker,
    setShowTextColorPicker,
    pickerMode,
    setPickerMode,
    setEditingLayer,
    multiSelectMode,
  } = cs;
  const {
    selectedLayerId,
    selectLayer,
    selectedLayerIds,
    canUndo,
    canRedo,
    undo,
    redo,
    removeLayer,
  } = creator;

  // ── Shared back-button priority cascade ──────────────────────────────
  // Single source of truth for the "close topmost surface" priority order
  // used by BOTH the hardware back button (useFocusEffect) and the keyboard
  // Escape handler. Returns true if a surface was closed (caller should
  // swallow the back press); false if nothing remains to close (caller
  // should let the system back / navigation proceed).
  const closeTopmostSurface = useCallback((): boolean => {
    if (editingTextLayerId) { setEditingTextLayerId(null); return true; }
    if (state.mode.type !== 'idle') { dispatch({ type: 'BACK' }); return true; }
    if (bottomSurface !== 'tools') { setBottomSurface('tools'); return true; }
    if (cropTarget) { setCropTarget(null); return true; }
    if (cutoutTarget) { setCutoutTarget(null); return true; }
    if (cutoutPreviewTarget) { setCutoutPreviewTarget(null); return true; }
    if (showTextColorPicker) { setShowTextColorPicker(false); return true; }
    if (state.showSafeZone) { dispatch({ type: 'TOGGLE_SAFE_ZONE' }); return true; }
    if (state.showOverflow) { dispatch({ type: 'TOGGLE_OVERFLOW' }); return true; }
    if (pickerMode) { setPickerMode(null); setEditingLayer(null); return true; }
    if (multiSelectMode) { exitMultiSelect(); return true; }
    if (selectedLayerId) { selectLayer(null); return true; }
    return false;
  }, [editingTextLayerId, setEditingTextLayerId, state, dispatch, bottomSurface, setBottomSurface, cropTarget, setCropTarget, cutoutTarget, setCutoutTarget, cutoutPreviewTarget, setCutoutPreviewTarget, showTextColorPicker, setShowTextColorPicker, pickerMode, setPickerMode, setEditingLayer, multiSelectMode, exitMultiSelect, selectedLayerId, selectLayer]);

  // Keyboard shortcuts (web/tablet only)
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') {
      return;
    }
    const handler = (e: KeyboardEvent) => {
      const isMeta = e.metaKey || e.ctrlKey;
      if (isMeta && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        if (canUndo) undo();
      } else if ((isMeta && e.key === 'z' && e.shiftKey) || (isMeta && e.key === 'y')) {
        e.preventDefault();
        if (canRedo) redo();
      } else if (e.key === 'Escape') {
        if (!closeTopmostSurface()) handleBack();
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && multiSelectMode && selectedLayerIds.length > 0) {
        e.preventDefault();
        handleMultiDelete();
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedLayerId) {
        e.preventDefault();
        removeLayer(selectedLayerId);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [canUndo, canRedo, undo, redo, closeTopmostSurface, handleBack, multiSelectMode, selectedLayerIds, handleMultiDelete, selectedLayerId, removeLayer]);

  // Hardware back button — intercept to close sheets first
  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        return closeTopmostSurface();
      });
      return () => subscription.remove();
    }, [closeTopmostSurface])
  );
}
