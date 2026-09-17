/**
 * useLookFloatingMenu — floating z-order / context menu for the selected
 * layer in the Look composer.
 *
 * Extracted from LookComposerScreen — pure relocation, no changes.
 * Appears above the selected layer's top edge. Provides quick access
 * to z-order, duplicate, lock, and delete without opening the Layers
 * sheet (§3.3 gap: "z-order hidden in a sheet"). Also owns the Instant
 * Cut sheet visibility state (declared adjacent in the original screen).
 */

import { useEffect, useMemo, useState } from 'react';
import { Space } from '../../../theme/designTokens';
import type { CreatorLayer } from '../../core/projectStore/composition';
import type { LayerFloatingMenuAction } from '../../surfaces/LayerFloatingMenu';
import type { CreatorContextValue } from '../../studio/CreatorContext';
import type { LookComposerStateResult } from './useLookComposerState';
import type { HapticApi } from './useLookMultiSelectActions';

export function useLookFloatingMenu({
  cs,
  creator,
  selectedLayer,
  canvasWidth,
  canvasHeight,
  haptic,
}: {
  cs: LookComposerStateResult;
  creator: CreatorContextValue;
  selectedLayer: CreatorLayer | null;
  canvasWidth: number;
  canvasHeight: number;
  haptic: HapticApi;
}) {
  const {
    multiSelectMode,
    editingTextLayerId,
    canvasLayoutRef,
  } = cs;
  const {
    selectedLayerId,
    reorderLayer,
    duplicateLayer,
    toggleLayerLock,
    removeLayer,
  } = creator;

  // ── Floating z-order / context menu for the selected layer ─────────
  // Appears above the selected layer's top edge. Provides quick access
  // to z-order, duplicate, lock, and delete without opening the Layers
  // sheet (§3.3 gap: "z-order hidden in a sheet").
  const [floatingMenuVisible, setFloatingMenuVisible] = useState(false);

  // ── Instant Cut sheet (Snapchat Quick Cut equivalent) ──
  // One-tap auto-compose + publish path for the casual majority.
  const [instantCutVisible, setInstantCutVisible] = useState(false);

  // Show the floating menu when a single layer is selected (not in
  // multi-select mode, which has its own bulk actions).
  useEffect(() => {
    setFloatingMenuVisible(!!selectedLayerId && !multiSelectMode && !editingTextLayerId);
  }, [selectedLayerId, multiSelectMode, editingTextLayerId]);

  // Compute the floating menu position from the selected layer's
  // normalized coordinates and the canvas layout.
  const floatingMenuPos = useMemo(() => {
    if (!selectedLayer || !canvasLayoutRef.current) return { x: 0, y: 0 };
    const layout = canvasLayoutRef.current;
    // Layer center in screen coords
    const centerX = layout.x + selectedLayer.x * canvasWidth;
    // Top edge of the layer in screen coords
    const topY = layout.y + (selectedLayer.y - selectedLayer.height * selectedLayer.scale / 2) * canvasHeight;
    return {
      x: centerX,
      y: Math.max(layout.y + Space.sm, topY - 48),
    };
  }, [selectedLayer, canvasWidth, canvasHeight, canvasLayoutRef]);

  const floatingMenuActions = useMemo<LayerFloatingMenuAction[]>(() => {
    if (!selectedLayerId) return [];
    const actions: LayerFloatingMenuAction[] = [
      {
        id: 'front',
        icon: 'arrow-up-circle-outline',
        label: 'Bring to front',
        onPress: () => { reorderLayer(selectedLayerId, 'front'); haptic.light(); },
      },
      {
        id: 'back',
        icon: 'arrow-down-circle-outline',
        label: 'Send to back',
        onPress: () => { reorderLayer(selectedLayerId, 'back'); haptic.light(); },
      },
      {
        id: 'duplicate',
        icon: 'copy-outline',
        label: 'Duplicate',
        onPress: () => { duplicateLayer(selectedLayerId); haptic.light(); },
      },
    ];
    if (selectedLayer?.locked !== undefined) {
      actions.push({
        id: 'lock',
        icon: selectedLayer.locked ? 'lock-open-outline' : 'lock-closed-outline',
        label: selectedLayer.locked ? 'Unlock' : 'Lock',
        onPress: () => { toggleLayerLock?.(selectedLayerId); haptic.light(); },
      });
    }
    actions.push({
      id: 'delete',
      icon: 'trash-outline',
      label: 'Delete',
      onPress: () => { removeLayer(selectedLayerId); haptic.medium(); },
      destructive: true,
    });
    return actions;
  }, [selectedLayerId, selectedLayer, reorderLayer, duplicateLayer, removeLayer, haptic, toggleLayerLock]);

  return {
    floatingMenuVisible,
    floatingMenuPos,
    floatingMenuActions,
    instantCutVisible,
    setInstantCutVisible,
  };
}
