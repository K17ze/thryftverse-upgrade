import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { CreatorDocument, CreatorLayer } from '../../core/projectStore/composition';
import { updateLayerInPage } from '../../core/projectStore/composition';

export interface UseMultiSelectOpsOptions {
  selectedLayerIds: string[];
  activePageIndex: number;
  setDocumentState: Dispatch<SetStateAction<CreatorDocument>>;
  pushHistory: (doc: CreatorDocument, label: string) => void;
  setIsDirty: Dispatch<SetStateAction<boolean>>;
  setSelectedLayerId: Dispatch<SetStateAction<string | null>>;
  setSelectedLayerIds: Dispatch<SetStateAction<string[]>>;
  removeLayer: (id: string) => void;
}

export interface UseMultiSelectOps {
  deleteMultiSelected: () => void;
  /** Commit transforms to multiple layers in a single history entry. */
  commitMultiLayerTransform: (updates: Array<{ id: string; updates: Partial<CreatorLayer> }>, label: string) => void;
  /** Live (no-history) position update for multiple layers — used during drag. */
  updateLayersLive: (updates: Array<{ id: string; x?: number; y?: number }>) => void;
  /** Reorder all selected layers to the front (top of z-stack) in one entry. */
  bringSelectedToFront: () => void;
  /** Reorder all selected layers to the back (bottom of z-stack) in one entry. */
  sendSelectedToBack: () => void;
}

/** Multi-select document mutations: bulk delete, bulk transform, bulk z-order. */
export function useMultiSelectOps({
  selectedLayerIds,
  activePageIndex,
  setDocumentState,
  pushHistory,
  setIsDirty,
  setSelectedLayerId,
  setSelectedLayerIds,
  removeLayer,
}: UseMultiSelectOpsOptions): UseMultiSelectOps {
  const deleteMultiSelected = useCallback(() => {
    selectedLayerIds.forEach((id) => removeLayer(id));
    setSelectedLayerIds([]);
    setSelectedLayerId(null);
  }, [selectedLayerIds, removeLayer, setSelectedLayerIds, setSelectedLayerId]);

  // Commit transforms to multiple layers in a single history entry.
  // Used by bulk align, bulk move (drag end), and distribute operations.
  const commitMultiLayerTransform = useCallback((
    updates: Array<{ id: string; updates: Partial<CreatorLayer> }>,
    label: string,
  ) => {
    if (updates.length === 0) return;
    setDocumentState((prev) => {
      let doc = prev;
      for (const { id, updates: layerUpdates } of updates) {
        doc = updateLayerInPage(doc, activePageIndex, id, layerUpdates);
      }
      doc.updatedAt = new Date().toISOString();
      pushHistory(doc, label);
      setIsDirty(true);
      return doc;
    });
  }, [activePageIndex, pushHistory, setDocumentState, setIsDirty]);

  // Live (no-history) position update for multiple layers. Used during
  // multi-select drag so peer layers move together in real-time without
  // spamming the history stack. The final committed state is written via
  // commitMultiLayerTransform on drag end.
  const updateLayersLive = useCallback((
    updates: Array<{ id: string; x?: number; y?: number }>,
  ) => {
    if (updates.length === 0) return;
    setDocumentState((prev) => {
      let doc = prev;
      for (const { id, x, y } of updates) {
        const layerUpdates: Partial<CreatorLayer> = {};
        if (x !== undefined) layerUpdates.x = x;
        if (y !== undefined) layerUpdates.y = y;
        doc = updateLayerInPage(doc, activePageIndex, id, layerUpdates);
      }
      doc.updatedAt = new Date().toISOString();
      return doc;
    });
  }, [activePageIndex, setDocumentState]);

  // Reorder all selected layers to the front (top of z-stack) in one
  // history entry, preserving the relative order of the selected set.
  const bringSelectedToFront = useCallback(() => {
    if (selectedLayerIds.length === 0) return;
    setDocumentState((prev) => {
      const pages = [...prev.pages];
      const page = { ...pages[activePageIndex] };
      const sorted = [...page.layers].sort((a, b) => a.zIndex - b.zIndex);
      const selectedSet = new Set(selectedLayerIds);
      const selected = sorted.filter((l) => selectedSet.has(l.id));
      const unselected = sorted.filter((l) => !selectedSet.has(l.id));
      page.layers = [...unselected, ...selected].map((l, i) => ({ ...l, zIndex: i }));
      pages[activePageIndex] = page;
      const doc = { ...prev, pages, updatedAt: new Date().toISOString() };
      pushHistory(doc, 'Bring to front');
      setIsDirty(true);
      return doc;
    });
  }, [activePageIndex, pushHistory, selectedLayerIds, setDocumentState, setIsDirty]);

  // Reorder all selected layers to the back (bottom of z-stack) in one
  // history entry, preserving the relative order of the selected set.
  const sendSelectedToBack = useCallback(() => {
    if (selectedLayerIds.length === 0) return;
    setDocumentState((prev) => {
      const pages = [...prev.pages];
      const page = { ...pages[activePageIndex] };
      const sorted = [...page.layers].sort((a, b) => a.zIndex - b.zIndex);
      const selectedSet = new Set(selectedLayerIds);
      const selected = sorted.filter((l) => selectedSet.has(l.id));
      const unselected = sorted.filter((l) => !selectedSet.has(l.id));
      page.layers = [...selected, ...unselected].map((l, i) => ({ ...l, zIndex: i }));
      pages[activePageIndex] = page;
      const doc = { ...prev, pages, updatedAt: new Date().toISOString() };
      pushHistory(doc, 'Send to back');
      setIsDirty(true);
      return doc;
    });
  }, [activePageIndex, pushHistory, selectedLayerIds, setDocumentState, setIsDirty]);

  return {
    deleteMultiSelected,
    commitMultiLayerTransform,
    updateLayersLive,
    bringSelectedToFront,
    sendSelectedToBack,
  };
}
