import { useCallback, useState } from 'react';
import { LayoutAnimation, Platform, UIManager } from 'react-native';
import { useHaptic } from '../useHaptic';
import { useReducedMotion } from '../useReducedMotion';

// Enable LayoutAnimation for selection-mode transitions on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/**
 * Owns bulk-selection state for the inventory list: selection-mode entry/exit
 * (with the LayoutAnimation transition), per-row toggle, and the selected id set.
 */
export function useInventorySelection() {
  const haptic = useHaptic();
  const reducedMotion = useReducedMotion();

  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const enterSelectionMode = useCallback((itemId: string) => {
    haptic.medium();
    if (!reducedMotion) {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }
    setSelectionMode(true);
    setSelectedIds(new Set([itemId]));
  }, [haptic, reducedMotion]);

  const toggleSelection = useCallback((itemId: string) => {
    haptic.selection();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }, [haptic]);

  const exitSelectionMode = useCallback(() => {
    haptic.light();
    if (!reducedMotion) {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }
    setSelectionMode(false);
    setSelectedIds(new Set());
  }, [haptic, reducedMotion]);

  return {
    selectionMode,
    selectedIds,
    enterSelectionMode,
    toggleSelection,
    exitSelectionMode,
  };
}
