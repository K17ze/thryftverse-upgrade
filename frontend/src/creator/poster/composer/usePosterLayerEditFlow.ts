/**
 * usePosterLayerEditFlow — edit-layer / asset-picker flow for the Poster
 * composer.
 *
 * Extracted from PosterComposerScreen (pure extraction — no behavioral
 * change). Owns the picker mode / editing-layer state, the memoized
 * picker close + add-layer callbacks, and the gated Edit handler that
 * routes each interactive sticker type to its dedicated picker in edit
 * mode via LAYER_TYPE_TO_PICKER_MODE.
 */
import { useCallback, useState } from 'react';

import type { CreatorLayer } from '../../core/projectStore/composition';
import type { AssetPickerMode } from '../../surfaces/CreatorAssetPicker';
import { LAYER_TYPE_TO_PICKER_MODE } from '../../shared/layerEditModes';
import { buildReplacedMediaLayer } from './replaceMediaLayer';

// ── Types ────────────────────────────────────────────────────────────

/**
 * The mutation signature from CreatorContext.updateLayer (history-pushing).
 */
type UpdateLayerFn = (
  id: string,
  updates: Partial<CreatorLayer>,
  label?: string,
) => void;

export interface UsePosterLayerEditFlowInput {
  /** Updates a layer (history-pushing). From CreatorContext. */
  updateLayer: UpdateLayerFn;
  /** Adds a layer. From CreatorContext. */
  addLayer: (layer: CreatorLayer) => void;
  /** Enters in-place text editing for a text layer id. */
  setEditingTextLayerId: (id: string | null) => void;
}

// ── Hook ─────────────────────────────────────────────────────────────

export function usePosterLayerEditFlow({
  updateLayer,
  addLayer,
  setEditingTextLayerId,
}: UsePosterLayerEditFlowInput) {
  const [pickerMode, setPickerMode] = useState<AssetPickerMode | null>(null);
  const [editingLayer, setEditingLayer] = useState<CreatorLayer | null>(null);

  // Memoized asset picker callbacks (audit item-29 §5.5). These were
  // inline arrows in the JSX, creating new function references on every
  // render and causing CreatorAssetPicker to re-render even when nothing
  // relevant changed. Memoizing them keeps the picker stable.
  const handlePickerClose = useCallback(() => {
    setPickerMode(null);
    setEditingLayer(null);
  }, []);

  const handlePickerAddLayer = useCallback((layer: CreatorLayer) => {
    if (editingLayer) {
      if (editingLayer.type === 'media' && layer.type === 'media') {
        updateLayer(editingLayer.id, buildReplacedMediaLayer(editingLayer, layer), 'Replace clip media');
      } else {
        // Sticker edit — swap the payload, keep the authored placement.
        // The picker returns a fresh layer at default transform; replacing
        // wholesale would reset the user's position/scale/rotation/z-order/
        // timeRange every time they edit a sticker's content.
        updateLayer(editingLayer.id, {
          ...layer,
          id: editingLayer.id,
          x: editingLayer.x,
          y: editingLayer.y,
          width: editingLayer.width,
          height: editingLayer.height,
          scale: editingLayer.scale,
          rotation: editingLayer.rotation,
          zIndex: editingLayer.zIndex,
          hidden: editingLayer.hidden,
          locked: editingLayer.locked,
          manuallyPositioned: editingLayer.manuallyPositioned,
          timeRange: editingLayer.timeRange,
          keyframes: editingLayer.keyframes,
        }, 'Edit layer');
      }
    } else {
      addLayer(layer);
    }
  }, [editingLayer, updateLayer, addLayer]);

  const handleEditLayer = useCallback((layer: CreatorLayer) => {
    if (layer.type === 'text') {
      // In-place text editing — no modal sheet (Snapchat/Instagram pattern)
      setEditingTextLayerId(layer.id);
      return;
    }
    // Route each interactive sticker type to its dedicated picker in edit
    // mode. Types without an editor (decorative, gif, music, adjustment,
    // look) never reach here — the rail only shows Edit when a mapping
    // exists.
    const mode = LAYER_TYPE_TO_PICKER_MODE[layer.type];
    if (!mode) return;
    setEditingLayer(layer);
    setPickerMode(mode);
  }, [setEditingTextLayerId]);

  return {
    pickerMode,
    setPickerMode,
    editingLayer,
    setEditingLayer,
    handlePickerClose,
    handlePickerAddLayer,
    handleEditLayer,
  };
}

export type PosterLayerEditFlow = ReturnType<typeof usePosterLayerEditFlow>;
