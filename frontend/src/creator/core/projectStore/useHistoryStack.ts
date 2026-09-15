import { useState, useCallback, useRef } from 'react';
import type { CreatorDocument } from './composition';
import { HistoryStack } from './history';

export interface UseHistoryStack {
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string | null;
  redoLabel: string | null;
  undo: () => CreatorDocument | null;
  redo: () => CreatorDocument | null;
  push: (doc: CreatorDocument, label: string) => void;
  current: () => CreatorDocument;
  reset: (doc: CreatorDocument) => void;
}

/**
 * Manages the undo/redo history stack for the Creator document.
 *
 * Wraps the `HistoryStack` class (capped at 50 entries with FIFO shift) and
 * mirrors its `canUndo`/`canRedo`/`undoLabel`/`redoLabel` into React state so
 * the UI can react to history changes. The `syncHistoryButtons` logic that
 * previously lived in `CreatorContext` is internal to this hook — callers
 * only need to invoke `push`/`undo`/`redo`/`reset` and read the state flags.
 */
export function useHistoryStack(initialDoc: CreatorDocument): UseHistoryStack {
  const historyRef = useRef(new HistoryStack(initialDoc));
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [undoLabel, setUndoLabel] = useState<string | null>(null);
  const [redoLabel, setRedoLabel] = useState<string | null>(null);

  const syncHistoryButtons = useCallback(() => {
    const h = historyRef.current;
    setCanUndo(h.canUndo());
    setCanRedo(h.canRedo());
    setUndoLabel(h.getUndoLabel());
    setRedoLabel(h.getRedoLabel());
  }, []);

  const push = useCallback((doc: CreatorDocument, label: string) => {
    historyRef.current.push(doc, label);
    syncHistoryButtons();
  }, [syncHistoryButtons]);

  const reset = useCallback((doc: CreatorDocument) => {
    historyRef.current.reset(doc);
    syncHistoryButtons();
  }, [syncHistoryButtons]);

  const undo = useCallback((): CreatorDocument | null => {
    const doc = historyRef.current.undo();
    if (doc) {
      syncHistoryButtons();
    }
    return doc;
  }, [syncHistoryButtons]);

  const redo = useCallback((): CreatorDocument | null => {
    const doc = historyRef.current.redo();
    if (doc) {
      syncHistoryButtons();
    }
    return doc;
  }, [syncHistoryButtons]);

  const current = useCallback((): CreatorDocument => {
    return historyRef.current.current();
  }, []);

  return { canUndo, canRedo, undoLabel, redoLabel, undo, redo, push, current, reset };
}
