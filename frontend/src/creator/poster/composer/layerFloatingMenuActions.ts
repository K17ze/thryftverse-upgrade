/**
 * layerFloatingMenuActions — pure builder for the Poster composer's
 * floating layer context menu.
 *
 * Extracted from PosterComposerScreen's `floatingMenuActions` memo (pure
 * extraction — no behavioral change). Compact action bubble above the
 * selected layer — z-order, duplicate, lock, delete without opening the
 * Layers sheet. Same grammar as the Look composer.
 */
import type { CreatorLayer } from '../../core/projectStore/composition';
import type { LayerFloatingMenuAction } from '../../surfaces/LayerFloatingMenu';
import type { useHaptic } from '../../../hooks/useHaptic';

// ── Types ────────────────────────────────────────────────────────────

/**
 * The haptic engine returned by useHaptic.
 */
type Haptic = ReturnType<typeof useHaptic>;

export interface LayerFloatingMenuActionsInput {
  /** The selected layer id (menu is hidden when null — returns []). */
  selectedLayerId: string | null;
  /** The selected layer (for lock state). */
  selectedLayer: CreatorLayer | null;
  /** Z-order reorder from CreatorContext. */
  reorderLayer: (id: string, direction: 'front' | 'forward' | 'backward' | 'back') => void;
  /** Duplicate from CreatorContext. */
  duplicateLayer: (id: string) => void;
  /** Lock toggle from CreatorContext. */
  toggleLayerLock: (id: string) => void;
  /** Delete from CreatorContext. */
  removeLayer: (id: string) => void;
  /** Haptic engine for action feedback. */
  haptic: Haptic;
}

/**
 * Builds the floating-menu action list for the selected layer. Returns []
 * when nothing is selected so the menu stays hidden.
 */
export function buildLayerFloatingMenuActions({
  selectedLayerId,
  selectedLayer,
  reorderLayer,
  duplicateLayer,
  toggleLayerLock,
  removeLayer,
  haptic,
}: LayerFloatingMenuActionsInput): LayerFloatingMenuAction[] {
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
      onPress: () => { toggleLayerLock(selectedLayerId); haptic.light(); },
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
}
