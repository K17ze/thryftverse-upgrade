import { useCallback, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

export interface UseSelection {
  selectedLayerId: string | null;
  selectedLayerIds: string[];
  setSelectedLayerId: Dispatch<SetStateAction<string | null>>;
  setSelectedLayerIds: Dispatch<SetStateAction<string[]>>;
  selectLayer: (id: string | null) => void;
  /** Replace the entire selection set. null/[] clears selection. */
  selectLayers: (ids: string[] | null) => void;
  /** Add/remove a single layer from the multi-select set. */
  toggleLayerInSelection: (id: string) => void;
  toggleMultiSelect: (layerId: string) => void;
  clearMultiSelect: () => void;
}

/**
 * Selection state for the creator composer.
 *
 * `selectedLayerIds` holds the full multi-select set. `selectedLayerId`
 * (singular) is always kept in sync as the primary (first) element for
 * backward compatibility with single-select consumers.
 */
export function useSelection(): UseSelection {
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [selectedLayerIds, setSelectedLayerIds] = useState<string[]>([]);

  // selectLayer keeps the singular `selectedLayerId` and the multi-select
  // array `selectedLayerIds` in sync. A non-null id selects exactly that
  // layer (single-select); null clears both — including multi-select.
  const selectLayer = useCallback((id: string | null) => {
    setSelectedLayerId(id);
    setSelectedLayerIds(id ? [id] : []);
  }, []);

  // Replace the entire selection set. null/[] clears both states.
  const selectLayers = useCallback((ids: string[] | null) => {
    const arr = ids ?? [];
    setSelectedLayerIds(arr);
    setSelectedLayerId(arr.length > 0 ? arr[0] : null);
  }, []);

  // Add/remove a single layer from the multi-select set. The primary
  // (first) selection becomes the new head of the array.
  const toggleLayerInSelection = useCallback((id: string) => {
    setSelectedLayerIds((prev) => {
      const next = prev.includes(id)
        ? prev.filter((x) => x !== id)
        : [...prev, id];
      setSelectedLayerId(next.length > 0 ? next[0] : null);
      return next;
    });
  }, []);

  // Legacy alias — delegates to toggleLayerInSelection so existing
  // consumers keep working with the synced primary selection.
  const toggleMultiSelect = useCallback((layerId: string) => {
    setSelectedLayerIds((prev) => {
      const next = prev.includes(layerId)
        ? prev.filter((x) => x !== layerId)
        : [...prev, layerId];
      setSelectedLayerId(next.length > 0 ? next[0] : null);
      return next;
    });
  }, []);

  const clearMultiSelect = useCallback(() => {
    setSelectedLayerIds([]);
    setSelectedLayerId(null);
  }, []);

  return {
    selectedLayerId,
    selectedLayerIds,
    setSelectedLayerId,
    setSelectedLayerIds,
    selectLayer,
    selectLayers,
    toggleLayerInSelection,
    toggleMultiSelect,
    clearMultiSelect,
  };
}
