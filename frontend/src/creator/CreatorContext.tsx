import React, { createContext, useContext, useState, useCallback, useRef, useEffect, useMemo } from 'react';
import type { CreatorDocument, CreatorLayer, CreatorPage } from './composition';
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
import { CreatorAnalytics } from './creatorAnalytics';
import { getTemplateById } from './templates';
import { createStableId } from '../utils/createStableId';

export interface CreatorContextValue {
  document: CreatorDocument;
  activePageIndex: number;
  selectedLayerId: string | null;
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string | null;
  redoLabel: string | null;
  isDirty: boolean;
  autosaveStatus: 'idle' | 'saving' | 'saved' | 'failed';
  isLoadingDraft: boolean;

  setDocument: (doc: CreatorDocument) => void;
  setActivePageIndex: (index: number) => void;
  selectLayer: (id: string | null) => void;

  addLayer: (layer: CreatorLayer) => void;
  updateLayer: (id: string, updates: Partial<CreatorLayer>) => void;
  commitLayerTransform: (id: string, updates: Partial<CreatorLayer>, label: string) => void;
  removeLayer: (id: string) => void;
  duplicateLayer: (id: string) => void;
  reorderLayer: (id: string, direction: 'front' | 'forward' | 'backward' | 'back') => void;
  toggleLayerLock: (id: string) => void;
  toggleLayerVisibility: (id: string) => void;

  updateMetadata: (updates: Partial<CreatorDocument['metadata']>) => void;
  updateCanvas: (updates: Partial<CreatorDocument['canvas']>) => void;
  addPage: () => void;
  duplicatePage: (index: number) => void;
  removePage: (index: number) => void;
  reorderPages: (fromIndex: number, toIndex: number) => void;
  updatePageDuration: (index: number, durationMs: number) => void;

  undo: () => void;
  redo: () => void;
  retryAutosave: () => void;

  saveDraft: () => Promise<void>;
  loadDraft: (id: string) => Promise<boolean>;
}

const CreatorContext = createContext<CreatorContextValue | null>(null);

const AUTOSAVE_INTERVAL_MS = 5000;
const MAX_PAGES = 10;

export interface CreatorProviderProps {
  children: React.ReactNode;
  initialType: 'look' | 'poster';
  draftId?: string;
  templateId?: string;
  sourceDocumentId?: string;
}

export function CreatorProvider({ children, initialType, draftId, templateId, sourceDocumentId }: CreatorProviderProps) {
  const initialDoc = useMemo(() => createEmptyDocument(initialType), [initialType]);
  const [document, setDocumentState] = useState<CreatorDocument>(initialDoc);
  const [activePageIndex, setActivePageIndex] = useState(0);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [undoLabel, setUndoLabel] = useState<string | null>(null);
  const [redoLabel, setRedoLabel] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [autosaveStatus, setAutosaveStatus] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  const [isLoadingDraft, setIsLoadingDraft] = useState(false);

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

  useEffect(() => {
    CreatorAnalytics.sessionStart(initialType);
  }, [initialType]);

  // Load draft on mount if draftId is provided
  useEffect(() => {
    if (!draftId) return;
    let cancelled = false;
    setIsLoadingDraft(true);
    CreatorDraftService.loadDraft(draftId).then((doc) => {
      if (cancelled || !doc) return;
      setDocument(doc);
      CreatorAnalytics.draftLoad(doc.type);
    }).catch(() => {
      // Corrupt or missing draft — stay with empty document
    }).finally(() => {
      if (!cancelled) setIsLoadingDraft(false);
    });
    return () => { cancelled = true; };
  }, [draftId, setDocument]);

  // Load template on mount if templateId is provided (and no draftId takes priority)
  useEffect(() => {
    if (!templateId || draftId) return;
    const template = getTemplateById(templateId);
    if (template) {
      const doc = template.build();
      setDocument(doc);
    }
  }, [templateId, draftId, setDocument]);

  // Load source document for remix if sourceDocumentId is provided
  useEffect(() => {
    if (!sourceDocumentId || draftId || templateId) return;
    let cancelled = false;
    setIsLoadingDraft(true);
    CreatorDraftService.loadDraft(sourceDocumentId).then((sourceDoc) => {
      if (cancelled || !sourceDoc) return;
      if (!sourceDoc.metadata.allowRemix) return;
      const remixedDoc: CreatorDocument = {
        ...sourceDoc,
        id: createStableId('doc'),
        metadata: {
          ...sourceDoc.metadata,
          sourceDocumentId: sourceDoc.id,
          sourceCreatorId: sourceDoc.metadata.sourceCreatorId,
          allowRemix: false,
          title: `Remix of ${sourceDoc.metadata.title || 'Untitled'}`,
        },
        updatedAt: new Date().toISOString(),
      };
      setDocument(remixedDoc);
    }).catch(() => {
      // Source not found — stay with empty document
    }).finally(() => {
      if (!cancelled) setIsLoadingDraft(false);
    });
    return () => { cancelled = true; };
  }, [sourceDocumentId, draftId, templateId, setDocument]);

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
    CreatorAnalytics.layerAdd(document.type, layer.type);
  }, [activePageIndex, syncHistoryButtons, document.type]);

  const updateLayer = useCallback((id: string, updates: Partial<CreatorLayer>) => {
    setDocumentState((prev) => {
      const doc = updateLayerInPage(prev, activePageIndex, id, updates);
      return doc;
    });
  }, [activePageIndex]);

  const commitLayerTransform = useCallback((id: string, updates: Partial<CreatorLayer>, label: string) => {
    setDocumentState((prev) => {
      const doc = updateLayerInPage(prev, activePageIndex, id, updates);
      doc.updatedAt = new Date().toISOString();
      historyRef.current.push(doc, label);
      setIsDirty(true);
      syncHistoryButtons();
      return doc;
    });
    CreatorAnalytics.layerTransform(document.type, updates.type ?? 'transform');
  }, [activePageIndex, syncHistoryButtons, document.type]);

  const removeLayer = useCallback((id: string) => {
    const layerType = document.pages[activePageIndex]?.layers.find((l) => l.id === id)?.type ?? 'unknown';
    setDocumentState((prev) => {
      const doc = removeLayerFromPage(prev, activePageIndex, id);
      historyRef.current.push(doc, 'Remove layer');
      setIsDirty(true);
      syncHistoryButtons();
      return doc;
    });
    setSelectedLayerId(null);
    CreatorAnalytics.layerRemove(document.type, layerType);
  }, [activePageIndex, syncHistoryButtons, document.type, document.pages]);

  const duplicateLayer = useCallback((id: string) => {
    const layerType = document.pages[activePageIndex]?.layers.find((l) => l.id === id)?.type ?? 'unknown';
    setDocumentState((prev) => {
      const doc = duplicateLayerInPage(prev, activePageIndex, id);
      historyRef.current.push(doc, 'Duplicate layer');
      setIsDirty(true);
      syncHistoryButtons();
      return doc;
    });
    CreatorAnalytics.layerDuplicate(document.type, layerType);
  }, [activePageIndex, syncHistoryButtons, document.type, document.pages]);

  const reorderLayer = useCallback((id: string, direction: 'front' | 'forward' | 'backward' | 'back') => {
    setDocumentState((prev) => {
      const doc = reorderLayerZ(prev, activePageIndex, id, direction);
      historyRef.current.push(doc, `Move ${direction}`);
      setIsDirty(true);
      syncHistoryButtons();
      return doc;
    });
    CreatorAnalytics.layerReorder(document.type, direction);
  }, [activePageIndex, syncHistoryButtons, document.type]);

  const toggleLayerLock = useCallback((id: string) => {
    setDocumentState((prev) => {
      const layer = prev.pages[activePageIndex]?.layers.find((l) => l.id === id);
      if (!layer) return prev;
      const doc = updateLayerInPage(prev, activePageIndex, id, { locked: !layer.locked });
      historyRef.current.push(doc, layer.locked ? 'Unlock layer' : 'Lock layer');
      setIsDirty(true);
      syncHistoryButtons();
      return doc;
    });
  }, [activePageIndex, syncHistoryButtons]);

  const toggleLayerVisibility = useCallback((id: string) => {
    setDocumentState((prev) => {
      const layer = prev.pages[activePageIndex]?.layers.find((l) => l.id === id);
      if (!layer) return prev;
      const doc = updateLayerInPage(prev, activePageIndex, id, { hidden: !layer.hidden });
      historyRef.current.push(doc, layer.hidden ? 'Show layer' : 'Hide layer');
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
    CreatorAnalytics.pageAdd(document.type, document.pages.length + 1);
  }, [syncHistoryButtons, document.type, document.pages.length]);

  const duplicatePage = useCallback((index: number) => {
    setDocumentState((prev) => {
      if (prev.pages.length >= MAX_PAGES) return prev;
      const sourcePage = prev.pages[index];
      if (!sourcePage) return prev;
      const clonedLayers = sourcePage.layers.map((l) => ({
        ...l,
        id: `${l.id}_clone_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      }));
      const newPage: CreatorPage = {
        id: `page_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        layers: clonedLayers,
        durationMs: sourcePage.durationMs,
      };
      const newPages = [...prev.pages];
      newPages.splice(index + 1, 0, newPage);
      const doc = { ...prev, pages: newPages, updatedAt: new Date().toISOString() };
      historyRef.current.push(doc, 'Duplicate page');
      setIsDirty(true);
      syncHistoryButtons();
      return doc;
    });
    setActivePageIndex(index + 1);
    setSelectedLayerId(null);
  }, [syncHistoryButtons]);

  const reorderPages = useCallback((fromIndex: number, toIndex: number) => {
    setDocumentState((prev) => {
      if (fromIndex === toIndex || fromIndex < 0 || fromIndex >= prev.pages.length || toIndex < 0 || toIndex >= prev.pages.length) return prev;
      const newPages = [...prev.pages];
      const [moved] = newPages.splice(fromIndex, 1);
      newPages.splice(toIndex, 0, moved);
      const doc = { ...prev, pages: newPages, updatedAt: new Date().toISOString() };
      historyRef.current.push(doc, 'Reorder pages');
      setIsDirty(true);
      syncHistoryButtons();
      return doc;
    });
    setActivePageIndex(toIndex);
    setSelectedLayerId(null);
  }, [syncHistoryButtons]);

  const updatePageDuration = useCallback((index: number, durationMs: number) => {
    setDocumentState((prev) => {
      const newPages = [...prev.pages];
      if (!newPages[index]) return prev;
      newPages[index] = { ...newPages[index], durationMs };
      const doc = { ...prev, pages: newPages, updatedAt: new Date().toISOString() };
      historyRef.current.push(doc, 'Update duration');
      setIsDirty(true);
      syncHistoryButtons();
      return doc;
    });
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
      CreatorAnalytics.undo(document.type);
    }
  }, [syncHistoryButtons, document.type]);

  const redo = useCallback(() => {
    const doc = historyRef.current.redo();
    if (doc) {
      setDocumentState(doc);
      setSelectedLayerId(null);
      syncHistoryButtons();
      CreatorAnalytics.redo(document.type);
    }
  }, [syncHistoryButtons, document.type]);

  const saveDraft = useCallback(async () => {
    setAutosaveStatus('saving');
    try {
      await CreatorDraftService.saveDraft(document);
      lastSavedDocRef.current = JSON.stringify(document);
      setIsDirty(false);
      setAutosaveStatus('saved');
      CreatorAnalytics.draftSave(document.type);
    } catch {
      setAutosaveStatus('failed');
    }
  }, [document]);

  const retryAutosave = useCallback(async () => {
    if (!isDirty) return;
    setAutosaveStatus('saving');
    try {
      const current = historyRef.current.current();
      await CreatorDraftService.saveDraft(current);
      lastSavedDocRef.current = JSON.stringify(current);
      setIsDirty(false);
      setAutosaveStatus('saved');
    } catch {
      setAutosaveStatus('failed');
    }
  }, [isDirty]);

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
    setAutosaveStatus('saving');
    autosaveTimerRef.current = setTimeout(async () => {
      const current = historyRef.current.current();
      const currentStr = JSON.stringify(current);
      if (currentStr !== lastSavedDocRef.current) {
        try {
          await CreatorDraftService.saveDraft(current);
          lastSavedDocRef.current = currentStr;
          setIsDirty(false);
          setAutosaveStatus('saved');
        } catch {
          setAutosaveStatus('failed');
        }
      } else {
        setAutosaveStatus('saved');
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
    autosaveStatus,
    isLoadingDraft,
    setDocument,
    setActivePageIndex,
    selectLayer,
    addLayer,
    updateLayer,
    commitLayerTransform,
    removeLayer,
    duplicateLayer,
    reorderLayer,
    toggleLayerLock,
    toggleLayerVisibility,
    updateMetadata,
    updateCanvas,
    addPage,
    duplicatePage,
    removePage,
    reorderPages,
    updatePageDuration,
    undo,
    redo,
    retryAutosave,
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
