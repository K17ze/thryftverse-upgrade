import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { CreatorDocument, CreatorLayer, CreatorPage } from '../../core/projectStore/composition';
import { updateLayerInPage } from '../../core/projectStore/composition';
import { CreatorAnalytics } from '../../shared/creatorAnalytics';
import { reflowOverlayTimeRanges } from '../../poster/timeline/TimelineDocOps';
import { createStableId, makeStableId } from '../../../utils/createStableId';
import { MAX_PAGES } from './constants';

export interface UsePageOpsOptions {
  document: CreatorDocument;
  setDocumentState: Dispatch<SetStateAction<CreatorDocument>>;
  pushHistory: (doc: CreatorDocument, label: string) => void;
  setIsDirty: Dispatch<SetStateAction<boolean>>;
  setActivePageIndex: Dispatch<SetStateAction<number>>;
  setSelectedLayerId: Dispatch<SetStateAction<string | null>>;
}

export interface UsePageOps {
  addPage: () => void;
  duplicatePage: (index: number) => void;
  removePage: (index: number) => void;
  reorderPages: (fromIndex: number, toIndex: number) => void;
  updatePageDuration: (index: number, durationMs: number) => void;
  /** Insert a pre-built page at a specific index. */
  insertPage: (page: CreatorPage, index: number) => void;
  /** Update a layer on a specific page, bypassing activePageIndex. */
  updateLayerOnPage: (pageIndex: number, layerId: string, updates: Partial<CreatorLayer>, label?: string) => void;
}

/** Page-level mutations: add/duplicate/remove/reorder plus per-page writes. */
export function usePageOps({
  document,
  setDocumentState,
  pushHistory,
  setIsDirty,
  setActivePageIndex,
  setSelectedLayerId,
}: UsePageOpsOptions): UsePageOps {
  const addPage = useCallback(() => {
    setDocumentState((prev) => {
      if (prev.pages.length >= MAX_PAGES) return prev;
      const doc = {
        ...prev,
        pages: [...prev.pages, { id: `page_${Date.now()}`, layers: [] }],
        updatedAt: new Date().toISOString(),
      };
      pushHistory(doc, 'Add page');
      setIsDirty(true);
      return doc;
    });
    setActivePageIndex((prev) => prev + 1);
    setSelectedLayerId(null);
    CreatorAnalytics.pageAdd(document.type, document.pages.length + 1);
  }, [pushHistory, document.type, document.pages.length, setDocumentState, setIsDirty, setActivePageIndex, setSelectedLayerId]);

  const duplicatePage = useCallback((index: number) => {
    setDocumentState((prev) => {
      if (prev.pages.length >= MAX_PAGES) return prev;
      const sourcePage = prev.pages[index];
      if (!sourcePage) return prev;
      const clonedLayers = sourcePage.layers.map((l) => ({
        ...l,
        id: `${l.id}_clone_${createStableId()}`,
      }));
      const newPage: CreatorPage = {
        id: makeStableId('page'),
        layers: clonedLayers,
        durationMs: sourcePage.durationMs,
      };
      const newPages = [...prev.pages];
      newPages.splice(index + 1, 0, newPage);
      const doc = { ...prev, pages: newPages, updatedAt: new Date().toISOString() };
      pushHistory(doc, 'Duplicate page');
      setIsDirty(true);
      return doc;
    });
    setActivePageIndex(index + 1);
    setSelectedLayerId(null);
  }, [pushHistory, setDocumentState, setIsDirty, setActivePageIndex, setSelectedLayerId]);

  const reorderPages = useCallback((fromIndex: number, toIndex: number) => {
    setDocumentState((prev) => {
      if (fromIndex === toIndex || fromIndex < 0 || fromIndex >= prev.pages.length || toIndex < 0 || toIndex >= prev.pages.length) return prev;
      const newPages = [...prev.pages];
      const [moved] = newPages.splice(fromIndex, 1);
      newPages.splice(toIndex, 0, moved);
      // Reorder shifts every moved page's absolute timeline window — reflow
      // stored overlay timeRanges so they track their page's new position.
      const doc = {
        ...reflowOverlayTimeRanges(prev, { ...prev, pages: newPages }),
        updatedAt: new Date().toISOString(),
      };
      pushHistory(doc, 'Reorder pages');
      setIsDirty(true);
      return doc;
    });
    setActivePageIndex(toIndex);
    setSelectedLayerId(null);
  }, [pushHistory, setDocumentState, setIsDirty, setActivePageIndex, setSelectedLayerId]);

  const updatePageDuration = useCallback((index: number, durationMs: number) => {
    setDocumentState((prev) => {
      const newPages = [...prev.pages];
      if (!newPages[index]) return prev;
      newPages[index] = { ...newPages[index], durationMs };
      const doc = { ...prev, pages: newPages, updatedAt: new Date().toISOString() };
      pushHistory(doc, 'Update duration');
      setIsDirty(true);
      return doc;
    });
  }, [pushHistory, setDocumentState, setIsDirty]);

  // Insert a pre-built page at a specific index. Used by split to create
  // a new page for the second half of a split clip, so the projector
  // (which renders one media layer per page) can render both halves.
  const insertPage = useCallback((page: CreatorPage, index: number) => {
    setDocumentState((prev) => {
      if (prev.pages.length >= MAX_PAGES) return prev;
      const clampedIndex = Math.max(0, Math.min(index, prev.pages.length));
      const newPages = [...prev.pages];
      newPages.splice(clampedIndex, 0, page);
      const doc = { ...prev, pages: newPages, updatedAt: new Date().toISOString() };
      pushHistory(doc, 'Insert page');
      setIsDirty(true);
      return doc;
    });
  }, [pushHistory, setDocumentState, setIsDirty]);

  // Update a layer on a specific page, bypassing activePageIndex. Used by
  // timeline operations (split, trim, speed, volume) that target clips on
  // non-active pages. Without this, edits silently target the wrong page.
  const updateLayerOnPage = useCallback((
    pageIndex: number,
    layerId: string,
    updates: Partial<CreatorLayer>,
    label?: string,
  ) => {
    setDocumentState((prev) => {
      const doc = updateLayerInPage(prev, pageIndex, layerId, updates);
      pushHistory(doc, label ?? 'Update layer on page');
      setIsDirty(true);
      return doc;
    });
  }, [pushHistory, setDocumentState, setIsDirty]);

  const removePage = useCallback((index: number) => {
    setDocumentState((prev) => {
      if (prev.pages.length <= 1) return prev;
      const doc = {
        ...prev,
        pages: prev.pages.filter((_, i) => i !== index),
        updatedAt: new Date().toISOString(),
      };
      pushHistory(doc, 'Remove page');
      setIsDirty(true);
      return doc;
    });
    setActivePageIndex((prev) => Math.max(0, prev > index ? prev - 1 : prev === index ? Math.max(0, index - 1) : prev));
    setSelectedLayerId(null);
  }, [pushHistory, setDocumentState, setIsDirty, setActivePageIndex, setSelectedLayerId]);

  return {
    addPage,
    duplicatePage,
    removePage,
    reorderPages,
    updatePageDuration,
    insertPage,
    updateLayerOnPage,
  };
}
