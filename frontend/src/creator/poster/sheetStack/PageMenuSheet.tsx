/**
 * PageMenuSheet — the frame-options sheet branch of PosterSheetStack
 * (duration + duplicate + reorder + delete). Extracted verbatim from
 * PosterSheetStack.tsx.
 */
import React from 'react';
import { PageMenu } from '../../studio/PageMenu';
import type { CreatorDocument } from '../../core/projectStore/composition';

interface PageMenuSheetProps {
  pageMenuIndex: number | null;
  pageCount: number;
  document: CreatorDocument;
  setPageMenuIndex: (v: number | null) => void;
  updatePageDuration: (pageIndex: number, ms: number) => void;
  duplicatePage: (pageIndex: number) => void;
  removePage: (pageIndex: number) => void;
  reorderPages: (from: number, to: number) => void;
  setActivePageIndex: (index: number) => void;
}

export function PageMenuSheet({
  pageMenuIndex,
  pageCount,
  document,
  setPageMenuIndex,
  updatePageDuration,
  duplicatePage,
  removePage,
  reorderPages,
  setActivePageIndex }: PageMenuSheetProps) {
  return (
    <>
      {/* Frame options sheet (duration + duplicate + reorder + delete) */}
      {pageMenuIndex !== null && (
        <PageMenu
          pageIndex={pageMenuIndex}
          pageCount={pageCount}
          currentDuration={document.pages[pageMenuIndex]?.durationMs ?? 5000}
          onClose={() => setPageMenuIndex(null)}
          onSetDuration={(ms) => { updatePageDuration(pageMenuIndex, ms); }}
          onDuplicate={() => { duplicatePage(pageMenuIndex); setPageMenuIndex(null); }}
          onDelete={() => { removePage(pageMenuIndex); setPageMenuIndex(null); }}
          onMoveLeft={() => { if (pageMenuIndex > 0) { reorderPages(pageMenuIndex, pageMenuIndex - 1); setActivePageIndex(pageMenuIndex - 1); } setPageMenuIndex(null); }}
          onMoveRight={() => { if (pageMenuIndex < pageCount - 1) { reorderPages(pageMenuIndex, pageMenuIndex + 1); setActivePageIndex(pageMenuIndex + 1); } setPageMenuIndex(null); }}
        />
      )}
    </>
  );
}
