import React, { createContext, useContext, useState, useCallback, useRef, useEffect, useMemo } from 'react';
import type { CreatorDocument, CreatorLayer } from './composition';
import {
  createEmptyDocument,
  addLayerToPage,
  updateLayerInPage,
  removeLayerFromPage,
  reorderLayerZ,
  duplicateLayerInPage,
} from './composition';
import { HistoryStack } from './history';
import { CreatorDraftService } from './drafts';

export interface CreatorContextValue {
  document: CreatorDocument;
  activePageIndex: number;
  selectedLayerId: string | null;
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string | null;
  redoLabel: string | null;
  isDirty: boolean;

  setDocument: (doc: CreatorDocument) => void;
  setActivePageIndex: (index: number) => void;
  selectLayer: (id: string | null) => void;

  addLayer: (layer: CreatorLayer) => void;
  updateLayer: (id: string, updates: Partial<CreatorLayer>) => void;
  removeLayer: (id: string) => void;
  duplicateLayer: (id: string) => void;
  reorderLayer: (id: string, direction: 'front' | 'forward' | 'backward' | 'back') => void;

  updateMetadata: (updates: Partial<CreatorDocument['metadata']>) => void;
  updateCanvas: (updates: Partial<CreatorDocument['canvas']>) => void;
  addPage: () => void;
  removePage: (index: number) => void;

  undo: () => void;
  redo: () => void;

  saveDraft: () => Promise<void>;
  loadDraft: (id: string) => Promise<boolean>;
}

const CreatorContext = createContext<CreatorContextValue | null>(null);

const AUTOSAVE_INTERVAL_MS = 5000;
const MAX_PAGES = 10;

export function CreatorProvider({ children, initialType }: { children: React.ReactNode; initialType: 'look' | 'poster' }) {
  const initialDoc = useMemo(() => createEmptyDocument(initialType), [initialType]);
  const [document, setDocumentState] = useState<CreatorDocument>(initialDoc);
  const [activePageIndex, setActivePageIndex] = useState(0);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [undoLabel, setUndoLabel] = useState<string | null>(null);
  const [redoLabel, setRedoLabel] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  const historyRef = useRef(new HistoryStack(initialDoc));
  const lastSavedDocRef = useRef(JSON.stringify(initialDoc));
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const syncHistoryButtons = useCallback(() => {
    const h = historyRef.current;
    setCanUndo(h.canUndo());
    setCanRedo(h.canRedo());
    setUndoLabel(h.getUndoLabel());
    setRedoLabel(h.getRedoLabel());
  }, []);

  const commit = useCallback((doc: CreatorDocument, label: string) => {
    historyRef.current.push(doc, label);
    setDocumentState(doc);
    setIsDirty(true);
    syncHistoryButtons();
  }, [syncHistoryButtons]);

  const setDocument = useCallback((doc: CreatorDocument) => {
    historyRef.current.reset(doc);
    setDocumentState(doc);
    setSelectedLayerId(null);
    setActivePageIndex(0);
    setIsDirty(false);
    lastSavedDocRef.current = JSON.stringify(doc);
    syncHistoryButtons();
  }, [syncHistoryButtons]);

  const selectLayer = useCallback((id: string | null) => {
    setSelectedLayerId(id);
  }, []);

  const addLayer = useCallback((layer: CreatorLayer) => {
    setDocumentState((prev) => {
      const doc = addLayerToPage(prev, activePageIndex, layer);
      historyRef.current.push(doc, `Add ${layer.type} layer`);
      setIsDirty(true);
      syncHistoryButtons();
      return doc;
    });
    setSelectedLayerId(layer.id);
  }, [activePageIndex, syncHistoryButtons]);

  const updateLayer = useCallback((id: string, updates: Partial<CreatorLayer>) => {
    setDocumentState((prev) => {
      const doc = updateLayerInPage(prev, activePageIndex, id, updates);
      return doc;
    });
  }, [activePageIndex]);

  const commitLayerUpdate = useCallback((id: string, updates: Partial<CreatorLayer>, label: string) => {
    setDocumentState((prev) => {
      const doc = updateLayerInPage(prev, activePageIndex, id, updates);
      historyRef.current.push(doc, label);
      setIsDirty(true);
      syncHistoryButtons();
      return doc;
    });
  }, [activePageIndex, syncHistoryButtons]);

  const removeLayer = useCallback((id: string) => {
    setDocumentState((prev) => {
      const doc = removeLayerFromPage(prev, activePageIndex, id);
      historyRef.current.push(doc, 'Remove layer');
      setIsDirty(true);
      syncHistoryButtons();
      return doc;
    });
    setSelectedLayerId(null);
  }, [activePageIndex, syncHistoryButtons]);

  const duplicateLayer = useCallback((id: string) => {
    setDocumentState((prev) => {
      const doc = duplicateLayerInPage(prev, activePageIndex, id);
      historyRef.current.push(doc, 'Duplicate layer');
      setIsDirty(true);
      syncHistoryButtons();
      return doc;
    });
  }, [activePageIndex, syncHistoryButtons]);

  const reorderLayer = useCallback((id: string, direction: 'front' | 'forward' | 'backward' | 'back') => {
    setDocumentState((prev) => {
      const doc = reorderLayerZ(prev, activePageIndex, id, direction);
      historyRef.current.push(doc, `Move ${direction}`);
      setIsDirty(true);
      syncHistoryButtons();
      return doc;
    });
  }, [activePageIndex, syncHistoryButtons]);

  const updateMetadata = useCallback((updates: Partial<CreatorDocument['metadata']>) => {
    setDocumentState((prev) => {
      const doc = { ...prev, metadata: { ...prev.metadata, ...updates }, updatedAt: new Date().toISOString() };
      historyRef.current.push(doc, 'Update settings');
      setIsDirty(true);
      syncHistoryButtons();
      return doc;
    });
  }, [syncHistoryButtons]);

  const updateCanvas = useCallback((updates: Partial<CreatorDocument['canvas']>) => {
    setDocumentState((prev) => {
      const doc = { ...prev, canvas: { ...prev.canvas, ...updates }, updatedAt: new Date().toISOString() };
      historyRef.current.push(doc, 'Update canvas');
      setIsDirty(true);
      syncHistoryButtons();
      return doc;
    });
  }, [syncHistoryButtons]);

  const addPage = useCallback(() => {
    setDocumentState((prev) => {
      if (prev.pages.length >= MAX_PAGES) return prev;
      const doc = {
        ...prev,
        pages: [...prev.pages, { id: `page_${Date.now()}`, layers: [] }],
        updatedAt: new Date().toISOString(),
      };
      historyRef.current.push(doc, 'Add page');
      setIsDirty(true);
      syncHistoryButtons();
      return doc;
    });
    setActivePageIndex((prev) => prev + 1);
    setSelectedLayerId(null);
  }, [syncHistoryButtons]);

  const removePage = useCallback((index: number) => {
    setDocumentState((prev) => {
      if (prev.pages.length <= 1) return prev;
      const doc = {
        ...prev,
        pages: prev.pages.filter((_, i) => i !== index),
        updatedAt: new Date().toISOString(),
      };
      historyRef.current.push(doc, 'Remove page');
      setIsDirty(true);
      syncHistoryButtons();
      return doc;
    });
    setActivePageIndex((prev) => Math.max(0, prev > index ? prev - 1 : prev === index ? Math.max(0, index - 1) : prev));
    setSelectedLayerId(null);
  }, [syncHistoryButtons]);

  const undo = useCallback(() => {
    const doc = historyRef.current.undo();
    if (doc) {
      setDocumentState(doc);
      setSelectedLayerId(null);
      syncHistoryButtons();
    }
  }, [syncHistoryButtons]);

  const redo = useCallback(() => {
    const doc = historyRef.current.redo();
    if (doc) {
      setDocumentState(doc);
      setSelectedLayerId(null);
      syncHistoryButtons();
    }
  }, [syncHistoryButtons]);

  const saveDraft = useCallback(async () => {
    await CreatorDraftService.saveDraft(document);
    lastSavedDocRef.current = JSON.stringify(document);
    setIsDirty(false);
  }, [document]);

  const loadDraft = useCallback(async (id: string): Promise<boolean> => {
    const doc = await CreatorDraftService.loadDraft(id);
    if (doc) {
      setDocument(doc);
      return true;
    }
    return false;
  }, [setDocument]);

  // Autosave
  useEffect(() => {
    if (!isDirty) return;
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(async () => {
      const current = historyRef.current.current();
      const currentStr = JSON.stringify(current);
      if (currentStr !== lastSavedDocRef.current) {
        try {
          await CreatorDraftService.saveDraft(current);
          lastSavedDocRef.current = currentStr;
          setIsDirty(false);
        } catch {
          // silently fail — autosave must not crash the editor
        }
      }
    }, AUTOSAVE_INTERVAL_MS);
    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
  }, [document, isDirty]);

  const value: CreatorContextValue = {
    document,
    activePageIndex,
    selectedLayerId,
    canUndo,
    canRedo,
    undoLabel,
    redoLabel,
    isDirty,
    setDocument,
    setActivePageIndex,
    selectLayer,
    addLayer,
    updateLayer,
    removeLayer,
    duplicateLayer,
    reorderLayer,
    updateMetadata,
    updateCanvas,
    addPage,
    removePage,
    undo,
    redo,
    saveDraft,
    loadDraft,
  };

  return <CreatorContext.Provider value={value}>{children}</CreatorContext.Provider>;
}

export function useCreator(): CreatorContextValue {
  const ctx = useContext(CreatorContext);
  if (!ctx) throw new Error('useCreator must be used within CreatorProvider');
  return ctx;
}
