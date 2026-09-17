/**
 * useLookObjectActions — object action handlers (context toolbar) for the
 * Look composer.
 *
 * Extracted from LookComposerScreen — pure relocation, no changes.
 */

import { useCallback } from 'react';
import type { CreatorLayer } from '../../core/projectStore/composition';
import { LAYER_TYPE_TO_PICKER_MODE } from '../../shared/layerEditModes';
import type { CreatorContextValue } from '../../studio/CreatorContext';
import type { LookComposerStateResult } from './useLookComposerState';
import type { HapticApi } from './useLookMultiSelectActions';

export function useLookObjectActions({
  cs,
  creator,
  haptic,
}: {
  cs: LookComposerStateResult;
  creator: CreatorContextValue;
  haptic: HapticApi;
}) {
  const { setEditingLayer, setPickerMode, canvasLayoutRef } = cs;
  const { removeLayer, duplicateLayer, reorderLayer, addLookProduct } = creator;

  // ── Object action handlers (context toolbar) ─────────────────────────
  const handleDeleteLayer = useCallback((id: string) => {
    haptic.medium();
    removeLayer(id);
  }, [removeLayer, haptic]);

  const handleDuplicateLayer = useCallback((id: string) => {
    haptic.light();
    duplicateLayer(id);
  }, [duplicateLayer, haptic]);

  const handleReorderLayer = useCallback((id: string, direction: 'forward' | 'backward') => {
    haptic.light();
    reorderLayer(id, direction);
  }, [reorderLayer, haptic]);

  const handleEditLayer = useCallback((layer: CreatorLayer) => {
    const mode = layer.type === 'text' ? 'text' : LAYER_TYPE_TO_PICKER_MODE[layer.type];
    if (!mode) return;
    setEditingLayer(layer);
    setPickerMode(mode);
  }, [setEditingLayer, setPickerMode]);

  // Replace media — opens the asset picker to swap the photo
  const handleReplaceMedia = useCallback((layer: CreatorLayer) => {
    setEditingLayer(layer);
    setPickerMode('media');
  }, [setEditingLayer, setPickerMode]);

  // Link/change item — opens the product picker to link a marketplace listing
  const handleLinkItem = useCallback((layer: CreatorLayer) => {
    setEditingLayer(layer);
    setPickerMode('product');
  }, [setEditingLayer, setPickerMode]);

  // ── Source tray: add item from closet/listings/search ──
  // Tapping an item in the items drawer adds it as a product tag layer
  // via addLookProduct. The tray stays open so the user can add multiple
  // items in quick succession.
  const handleSourceTrayAddItem = useCallback((item: {
    listingId: string;
    snapshotTitle: string;
    snapshotImageUrl?: string;
    snapshotPriceGbp?: number;
  }) => {
    addLookProduct({
      listingId: item.listingId,
      snapshotTitle: item.snapshotTitle,
      snapshotImageUrl: item.snapshotImageUrl,
      snapshotPriceGbp: item.snapshotPriceGbp });
  }, [addLookProduct]);

  // ── Source tray: drag-to-canvas product drop ──
  // When the user drags a product from the source tray and releases over
  // the canvas, the product is placed at the drop position (normalized to
  // 0–1 canvas coordinates). Falls back to center placement if the canvas
  // layout hasn't been measured yet.
  const handleDropProduct = useCallback((item: {
    listingId: string;
    snapshotTitle: string;
    snapshotImageUrl?: string;
    snapshotPriceGbp?: number;
  }, dropPosition: { x: number; y: number }) => {
    const layout = canvasLayoutRef.current;
    let x = 0.5;
    let y = 0.5;
    if (layout && layout.width > 0 && layout.height > 0) {
      x = Math.max(0, Math.min(1, (dropPosition.x - layout.x) / layout.width));
      y = Math.max(0, Math.min(1, (dropPosition.y - layout.y) / layout.height));
    }
    addLookProduct({
      listingId: item.listingId,
      snapshotTitle: item.snapshotTitle,
      snapshotImageUrl: item.snapshotImageUrl,
      snapshotPriceGbp: item.snapshotPriceGbp,
      x,
      y });
    haptic.light();
  }, [addLookProduct, haptic, canvasLayoutRef]);

  return {
    handleDeleteLayer,
    handleDuplicateLayer,
    handleReorderLayer,
    handleEditLayer,
    handleReplaceMedia,
    handleLinkItem,
    handleSourceTrayAddItem,
    handleDropProduct,
  };
}
