import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { CreatorDocument } from '../../core/projectStore/composition';

export interface UseDocumentOpsOptions {
  setDocumentState: Dispatch<SetStateAction<CreatorDocument>>;
  pushHistory: (doc: CreatorDocument, label: string) => void;
  setIsDirty: Dispatch<SetStateAction<boolean>>;
}

export interface UseDocumentOps {
  updateMetadata: (updates: Partial<CreatorDocument['metadata']>) => void;
  /** No-history metadata write for session state that should persist into
      drafts but must not pollute undo (e.g. playheadMs). */
  updateMetadataLive: (updates: Partial<CreatorDocument['metadata']>) => void;
  updateCanvas: (updates: Partial<CreatorDocument['canvas']>) => void;
}

/** Document-level mutations: metadata and canvas settings. */
export function useDocumentOps({
  setDocumentState,
  pushHistory,
  setIsDirty,
}: UseDocumentOpsOptions): UseDocumentOps {
  const updateMetadata = useCallback((updates: Partial<CreatorDocument['metadata']>) => {
    setDocumentState((prev) => {
      const doc = { ...prev, metadata: { ...prev.metadata, ...updates }, updatedAt: new Date().toISOString() };
      pushHistory(doc, 'Update settings');
      setIsDirty(true);
      return doc;
    });
  }, [pushHistory, setDocumentState, setIsDirty]);

  // No-history metadata write — same merge as updateMetadata but skips the
  // undo stack. For session state (playhead position) that must persist
  // into drafts via autosave/saveDraft without polluting undo.
  const updateMetadataLive = useCallback((updates: Partial<CreatorDocument['metadata']>) => {
    setDocumentState((prev) => {
      const doc = { ...prev, metadata: { ...prev.metadata, ...updates }, updatedAt: new Date().toISOString() };
      setIsDirty(true);
      return doc;
    });
  }, [setDocumentState, setIsDirty]);

  const updateCanvas = useCallback((updates: Partial<CreatorDocument['canvas']>) => {
    setDocumentState((prev) => {
      const doc = { ...prev, canvas: { ...prev.canvas, ...updates }, updatedAt: new Date().toISOString() };
      pushHistory(doc, 'Update canvas');
      setIsDirty(true);
      return doc;
    });
  }, [pushHistory, setDocumentState, setIsDirty]);

  return { updateMetadata, updateMetadataLive, updateCanvas };
}
