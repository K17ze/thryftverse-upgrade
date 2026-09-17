import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { CreatorDocument, CreatorLayer } from '../../core/projectStore/composition';
import {
  addLayerToPage,
  updateLayerInPage,
  removeLayerFromPage,
  reorderLayerZ,
  duplicateLayerInPage,
} from '../../core/projectStore/composition';
import { CreatorAnalytics } from '../../shared/creatorAnalytics';

export interface UseLayerOpsOptions {
  document: CreatorDocument;
  activePageIndex: number;
  setDocumentState: Dispatch<SetStateAction<CreatorDocument>>;
  pushHistory: (doc: CreatorDocument, label: string) => void;
  setIsDirty: Dispatch<SetStateAction<boolean>>;
  setSelectedLayerId: Dispatch<SetStateAction<string | null>>;
}

export interface UseLayerOps {
  addLayer: (layer: CreatorLayer) => void;
  updateLayer: (id: string, updates: Partial<CreatorLayer>, label?: string) => void;
  /** Live (no-history) layer update — mutates document state without pushing
      to the undo/redo stack. */
  updateLayerLive: (id: string, updates: Partial<CreatorLayer>) => void;
  commitLayerTransform: (id: string, updates: Partial<CreatorLayer>, label: string, isAutoLayout?: boolean) => void;
  removeLayer: (id: string) => void;
  duplicateLayer: (id: string) => void;
  reorderLayer: (id: string, direction: 'front' | 'forward' | 'backward' | 'back') => void;
  toggleLayerLock: (id: string) => void;
  toggleLayerVisibility: (id: string) => void;
  alignLayerToCenter: (layerId: string) => void;
  alignLayerToHorizontalCenter: (layerId: string) => void;
  alignLayerToVerticalCenter: (layerId: string) => void;
}

/** Layer CRUD mutations committed through the history stack. */
export function useLayerOps({
  document,
  activePageIndex,
  setDocumentState,
  pushHistory,
  setIsDirty,
  setSelectedLayerId,
}: UseLayerOpsOptions): UseLayerOps {
  const addLayer = useCallback((layer: CreatorLayer) => {
    // One media layer per page on poster documents — the timeline
    // projector and export bake only the FIRST media layer, so a second
    // would render on canvas as an invisible ghost the timeline never
    // shows (and bleeds audio while decoding). Reject at write time.
    if (layer.type === 'media' && document.type === 'poster'
      && (document.pages[activePageIndex]?.layers.some((l) => l.type === 'media') ?? false)) {
      return;
    }
    setDocumentState((prev) => {
      const doc = addLayerToPage(prev, activePageIndex, layer);
      pushHistory(doc, `Add ${layer.type} layer`);
      setIsDirty(true);
      return doc;
    });
    setSelectedLayerId(layer.id);
    CreatorAnalytics.layerAdd(document.type, layer.type);
  }, [activePageIndex, pushHistory, document.type, document.pages, setDocumentState, setIsDirty, setSelectedLayerId]);

  const updateLayer = useCallback((id: string, updates: Partial<CreatorLayer>, label?: string) => {
    setDocumentState((prev) => {
      const doc = updateLayerInPage(prev, activePageIndex, id, updates);
      doc.updatedAt = new Date().toISOString();
      // Coalesce rapid updates with the same label into one history entry
      // This prevents history spam when updateLayer is called in rapid succession
      pushHistory(doc, label ?? 'Update layer');
      setIsDirty(true);
      return doc;
    });
    CreatorAnalytics.layerTransform(document.type, updates.type ?? 'update');
  }, [activePageIndex, pushHistory, document.type, setDocumentState, setIsDirty]);

  // Live (no-history) layer update. Mutates the document state so the canvas
  // reflects the change immediately, but does NOT push to the undo/redo stack.
  // Used for transient previews (live filter preview during effect-rail
  // scroll). The caller must commit via updateLayer (with a history label) or
  // revert by writing the previous value back through this same method.
  const updateLayerLive = useCallback((id: string, updates: Partial<CreatorLayer>) => {
    setDocumentState((prev) => {
      const doc = updateLayerInPage(prev, activePageIndex, id, updates);
      doc.updatedAt = new Date().toISOString();
      return doc;
    });
  }, [activePageIndex, setDocumentState]);

  const commitLayerTransform = useCallback((id: string, updates: Partial<CreatorLayer>, label: string, isAutoLayout?: boolean) => {
    // Per §8.3: auto-layout NEVER silently moves a manually positioned
    // object. When a user manually edits a layer (isAutoLayout is not
    // true), mark it as manuallyPositioned so future auto-layout passes
    // skip it. Auto-layout calls pass isAutoLayout: true to avoid
    // setting the flag (the layer remains auto-arrangeable until the
    // user manually touches it).
    const finalUpdates = isAutoLayout
      ? updates
      : { ...updates, manuallyPositioned: true };
    setDocumentState((prev) => {
      const doc = updateLayerInPage(prev, activePageIndex, id, finalUpdates);
      doc.updatedAt = new Date().toISOString();
      pushHistory(doc, label);
      setIsDirty(true);
      return doc;
    });
    CreatorAnalytics.layerTransform(document.type, updates.type ?? 'transform');
  }, [activePageIndex, pushHistory, document.type, setDocumentState, setIsDirty]);

  const removeLayer = useCallback((id: string) => {
    const layerType = document.pages[activePageIndex]?.layers.find((l) => l.id === id)?.type ?? 'unknown';
    setDocumentState((prev) => {
      const doc = removeLayerFromPage(prev, activePageIndex, id);
      pushHistory(doc, 'Remove layer');
      setIsDirty(true);
      return doc;
    });
    setSelectedLayerId(null);
    CreatorAnalytics.layerRemove(document.type, layerType);
  }, [activePageIndex, pushHistory, document.type, document.pages, setDocumentState, setIsDirty, setSelectedLayerId]);

  const duplicateLayer = useCallback((id: string) => {
    const layerType = document.pages[activePageIndex]?.layers.find((l) => l.id === id)?.type ?? 'unknown';
    setDocumentState((prev) => {
      const doc = duplicateLayerInPage(prev, activePageIndex, id);
      pushHistory(doc, 'Duplicate layer');
      setIsDirty(true);
      return doc;
    });
    CreatorAnalytics.layerDuplicate(document.type, layerType);
  }, [activePageIndex, pushHistory, document.type, document.pages, setDocumentState, setIsDirty]);

  const reorderLayer = useCallback((id: string, direction: 'front' | 'forward' | 'backward' | 'back') => {
    setDocumentState((prev) => {
      const doc = reorderLayerZ(prev, activePageIndex, id, direction);
      pushHistory(doc, `Move ${direction}`);
      setIsDirty(true);
      return doc;
    });
    CreatorAnalytics.layerReorder(document.type, direction);
  }, [activePageIndex, pushHistory, document.type, setDocumentState, setIsDirty]);

  const toggleLayerLock = useCallback((id: string) => {
    setDocumentState((prev) => {
      const layer = prev.pages[activePageIndex]?.layers.find((l) => l.id === id);
      if (!layer) return prev;
      const doc = updateLayerInPage(prev, activePageIndex, id, { locked: !layer.locked });
      pushHistory(doc, layer.locked ? 'Unlock layer' : 'Lock layer');
      setIsDirty(true);
      return doc;
    });
  }, [activePageIndex, pushHistory, setDocumentState, setIsDirty]);

  const toggleLayerVisibility = useCallback((id: string) => {
    setDocumentState((prev) => {
      const layer = prev.pages[activePageIndex]?.layers.find((l) => l.id === id);
      if (!layer) return prev;
      const doc = updateLayerInPage(prev, activePageIndex, id, { hidden: !layer.hidden });
      pushHistory(doc, layer.hidden ? 'Show layer' : 'Hide layer');
      setIsDirty(true);
      return doc;
    });
  }, [activePageIndex, pushHistory, setDocumentState, setIsDirty]);

  // ─── Alignment Tools ─────────────────────────────────────────────────────
  const alignLayerToCenter = useCallback((layerId: string) => {
    updateLayer(layerId, { x: 0.5, y: 0.5 });
  }, [updateLayer]);

  const alignLayerToHorizontalCenter = useCallback((layerId: string) => {
    updateLayer(layerId, { x: 0.5 });
  }, [updateLayer]);

  const alignLayerToVerticalCenter = useCallback((layerId: string) => {
    updateLayer(layerId, { y: 0.5 });
  }, [updateLayer]);

  return {
    addLayer,
    updateLayer,
    updateLayerLive,
    commitLayerTransform,
    removeLayer,
    duplicateLayer,
    reorderLayer,
    toggleLayerLock,
    toggleLayerVisibility,
    alignLayerToCenter,
    alignLayerToHorizontalCenter,
    alignLayerToVerticalCenter,
  };
}
