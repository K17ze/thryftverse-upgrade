import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { CreatorDocument, CreatorLayer, CreatorPage } from '../../core/projectStore/composition';
import { CreatorAnalytics } from '../../shared/creatorAnalytics';
import type { CreatorInitialMedia } from '../../../navigation/types';
import { makeStableId } from '../../../utils/createStableId';
import { MAX_PAGES } from './constants';
import { createMediaLayer } from './mediaBuilders';

export interface UsePosterFramesOptions {
  document: CreatorDocument;
  setDocumentState: Dispatch<SetStateAction<CreatorDocument>>;
  pushHistory: (doc: CreatorDocument, label: string) => void;
  setIsDirty: Dispatch<SetStateAction<boolean>>;
  setActivePageIndex: Dispatch<SetStateAction<number>>;
  setSelectedLayerId: Dispatch<SetStateAction<string | null>>;
  reorderPages: (fromIndex: number, toIndex: number) => void;
}

export interface UsePosterFrames {
  addPosterFrame: (media?: CreatorInitialMedia) => void;
  addPosterFrames: (media: CreatorInitialMedia[]) => void;
  replacePosterFrameMedia: (pageId: string, media: CreatorInitialMedia) => void;
  reorderPosterFrames: (from: number, to: number) => void;
}

// ─── Poster-specific frame methods ────────────────────────────────
// Poster is a sequence of frames (pages). Each frame normally has one
// primary media layer. These methods encode the Story mental model
// (add frames, replace frame media, reorder frames) and are no-ops for
// Look documents (Look is a single-page collage).
export function usePosterFrames({
  document,
  setDocumentState,
  pushHistory,
  setIsDirty,
  setActivePageIndex,
  setSelectedLayerId,
  reorderPages,
}: UsePosterFramesOptions): UsePosterFrames {
  const addPosterFrame = useCallback((media?: CreatorInitialMedia) => {
    if (document.type !== 'poster') return;
    setDocumentState((prev) => {
      if (prev.pages.length >= MAX_PAGES) return prev;
      // If the document has only the initial empty page (from
      // createEmptyDocument), replace it rather than appending.
      const hasOnlyEmptyPage =
        prev.pages.length === 1 && prev.pages[0].layers.length === 0;
      const mediaLayer: CreatorLayer | null = media
        ? createMediaLayer(media, { preserveCaptureMeta: true })
        : null;
      const newPage: CreatorPage = {
        id: makeStableId('page'),
        layers: mediaLayer ? [mediaLayer] : [],
      };
      const doc = {
        ...prev,
        pages: hasOnlyEmptyPage ? [newPage] : [...prev.pages, newPage],
        updatedAt: new Date().toISOString(),
      };
      pushHistory(doc, 'Add frame');
      setIsDirty(true);
      return doc;
    });
    setActivePageIndex((prev) => prev + 1);
    setSelectedLayerId(null);
    CreatorAnalytics.pageAdd('poster', document.pages.length + 1);
  }, [document.type, document.pages.length, pushHistory, setDocumentState, setIsDirty, setActivePageIndex, setSelectedLayerId]);

  const addPosterFrames = useCallback((media: CreatorInitialMedia[]) => {
    if (document.type !== 'poster') return;
    setDocumentState((prev) => {
      // If the document has only the initial empty page (from
      // createEmptyDocument), replace it rather than appending so that
      // selecting N assets produces exactly N pages — not N+1 with a
      // leading empty frame.
      const hasOnlyEmptyPage =
        prev.pages.length === 1 && prev.pages[0].layers.length === 0;
      const basePages = hasOnlyEmptyPage ? [] : prev.pages;
      const remaining = MAX_PAGES - basePages.length;
      if (remaining <= 0) return prev;
      const toAdd = media.slice(0, remaining);
      const newPages: CreatorPage[] = toAdd.map((asset, i) => {
        const mediaLayer = createMediaLayer(asset, { preserveCaptureMeta: true });
        return {
          id: makeStableId(`page_${i}`),
          layers: [mediaLayer],
        };
      });
      const doc = {
        ...prev,
        pages: [...basePages, ...newPages],
        updatedAt: new Date().toISOString(),
      };
      pushHistory(doc, `Add ${newPages.length} frame${newPages.length > 1 ? 's' : ''}`);
      setIsDirty(true);
      return doc;
    });
  }, [document.type, pushHistory, setDocumentState, setIsDirty]);

  const replacePosterFrameMedia = useCallback((pageId: string, media: CreatorInitialMedia) => {
    if (document.type !== 'poster') return;
    setDocumentState((prev) => {
      const pageIndex = prev.pages.findIndex((p) => p.id === pageId);
      if (pageIndex === -1) return prev;
      const pages = [...prev.pages];
      const page = { ...pages[pageIndex] };
      // Find existing media layer or create a new one
      const existingMediaIdx = page.layers.findIndex((l) => l.type === 'media');
      const newMediaLayer = createMediaLayer(media, {
        id: existingMediaIdx >= 0 ? page.layers[existingMediaIdx].id : undefined,
      });
      if (existingMediaIdx >= 0) {
        page.layers = page.layers.map((l, i) => i === existingMediaIdx ? newMediaLayer : l);
      } else {
        page.layers = [newMediaLayer, ...page.layers];
      }
      pages[pageIndex] = page;
      const doc = { ...prev, pages, updatedAt: new Date().toISOString() };
      pushHistory(doc, 'Replace frame media');
      setIsDirty(true);
      return doc;
    });
  }, [document.type, pushHistory, setDocumentState, setIsDirty]);

  const reorderPosterFrames = useCallback((from: number, to: number) => {
    if (document.type !== 'poster') return;
    reorderPages(from, to);
  }, [document.type, reorderPages]);

  return {
    addPosterFrame,
    addPosterFrames,
    replacePosterFrameMedia,
    reorderPosterFrames,
  };
}
