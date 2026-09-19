/**
 * useMoodboardSelection — selection state for the moodboard canvas.
 *
 * Single-select (tap) and multi-select (long-press) modes. Multi-select
 * auto-exits once the selection set becomes empty; pressing the canvas
 * background clears the current selection.
 */
import { useCallback, useEffect, useState } from 'react';

import { useHaptic } from '../../hooks/useHaptic';

export function useMoodboardSelection() {
  const haptic = useHaptic();

  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());

  const handleSelect = useCallback(
    (id: string) => {
      haptic.selection();
      if (multiSelectMode) {
        setSelectedItemIds((prev) => {
          const next = new Set(prev);
          if (next.has(id)) {
            next.delete(id);
          } else {
            next.add(id);
          }
          return next;
        });
      } else {
        setSelectedItemId((prev) => (prev === id ? null : id));
      }
    },
    [haptic, multiSelectMode],
  );

  const handleLongPress = useCallback(
    (id: string) => {
      haptic.heavy();
      setSelectedItemId(null);
      setMultiSelectMode(true);
      setSelectedItemIds(new Set([id]));
    },
    [haptic],
  );

  // Exit multi-select mode once the selection set becomes empty.
  useEffect(() => {
    if (multiSelectMode && selectedItemIds.size === 0) {
      setMultiSelectMode(false);
    }
  }, [multiSelectMode, selectedItemIds]);

  const handleCancelMultiSelect = useCallback(() => {
    haptic.light();
    setMultiSelectMode(false);
    setSelectedItemIds(new Set());
  }, [haptic]);

  const handleCanvasBackgroundPress = useCallback(() => {
    if (multiSelectMode) {
      setMultiSelectMode(false);
      setSelectedItemIds(new Set());
    } else {
      setSelectedItemId(null);
    }
  }, [multiSelectMode]);

  return {
    selectedItemId,
    setSelectedItemId,
    multiSelectMode,
    setMultiSelectMode,
    selectedItemIds,
    setSelectedItemIds,
    handleSelect,
    handleLongPress,
    handleCancelMultiSelect,
    handleCanvasBackgroundPress };
}
