/**
 * usePosterFrameNavigation — Page / frame navigation hook for the Poster
 * composer.
 *
 * Extracted from PosterComposerScreen to separate the frame-navigation
 * logic (active page index, page count, multi-frame detection, page-change
 * with transient selection reset) from the screen's rendering orchestration.
 *
 * The hook owns:
 *   - `goToPage` — the canonical page-change handler. On every page change
 *     it resets transient selection (selected layer, clip, overlay) so a
 *     stale selection from the previous frame never leaks across pages.
 *   - `hasMultipleFrames` / `pageCount` — derived from the document's pages
 *     array.
 *   - `canGoToNextPage` / `canGoToPrevPage` — boundary guards for the
 *     frame-swipe gesture and progress segments.
 *
 * `activePageIndex` and `setActivePageIndex` are passed through from
 * CreatorContext (the document model owns the source of truth); this hook
 * wraps them with navigation semantics and selection reset.
 *
 * Pattern follows usePosterSession.ts and usePosterEffects.ts.
 */

import { useCallback } from 'react';

import type { CreatorDocument } from '../composition';
import type { useHaptic } from '../../hooks/useHaptic';

// ── Types ────────────────────────────────────────────────────────────

/**
 * The haptic engine returned by useHaptic.
 */
type Haptic = ReturnType<typeof useHaptic>;

export interface UsePosterFrameNavigationInput {
  /** The composition document (for the pages array). */
  document: CreatorDocument;
  /** The active page index (from CreatorContext). */
  activePageIndex: number;
  /** Setter for the active page index (from CreatorContext). */
  setActivePageIndex: (index: number) => void;
  /** Resets the selected layer (from CreatorContext.selectLayer). */
  selectLayer: (id: string | null) => void;
  /** Resets the selected timeline clip id (transient selection). */
  setSelectedClipId: (id: string | null) => void;
  /** Resets the selected timeline overlay id (transient selection). */
  setSelectedOverlayId: (id: string | null) => void;
  /** Haptic engine. */
  haptic: Haptic;
}

export interface UsePosterFrameNavigationResult {
  /** The active page index (passed through from CreatorContext). */
  activePageIndex: number;
  /** Setter for the active page index (passed through). */
  setActivePageIndex: (index: number) => void;
  /** Canonical page-change handler — resets selection and navigates. */
  goToPage: (index: number) => void;
  /** Whether the document has more than one frame. */
  hasMultipleFrames: boolean;
  /** Total number of pages in the document. */
  pageCount: number;
  /** Whether the user can navigate to the next page. */
  canGoToNextPage: boolean;
  /** Whether the user can navigate to the previous page. */
  canGoToPrevPage: boolean;
}

// ── Hook ─────────────────────────────────────────────────────────────

export function usePosterFrameNavigation({
  document,
  activePageIndex,
  setActivePageIndex,
  selectLayer,
  setSelectedClipId,
  setSelectedOverlayId,
  haptic,
}: UsePosterFrameNavigationInput): UsePosterFrameNavigationResult {
  const pageCount = document.pages.length;
  const hasMultipleFrames = pageCount > 1;
  const canGoToNextPage = activePageIndex < pageCount - 1;
  const canGoToPrevPage = activePageIndex > 0;

  // ── Canonical page-change handler ──────────────────────────────────
  // On every page change, reset transient selection (layer, clip, overlay)
  // so a stale selection from the previous frame never leaks across pages.
  // The early-return guards prevent no-op navigation and redundant haptics.
  const goToPage = useCallback((index: number) => {
    if (index < 0 || index >= pageCount) return;
    if (index === activePageIndex) return;
    selectLayer(null);
    setSelectedClipId(null);
    setSelectedOverlayId(null);
    setActivePageIndex(index);
    haptic.light();
  }, [pageCount, activePageIndex, selectLayer, setSelectedClipId, setSelectedOverlayId, setActivePageIndex, haptic]);

  return {
    activePageIndex,
    setActivePageIndex,
    goToPage,
    hasMultipleFrames,
    pageCount,
    canGoToNextPage,
    canGoToPrevPage,
  };
}
