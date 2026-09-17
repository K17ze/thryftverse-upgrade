/**
 * useTrackOps — track-level timeline handlers for the Poster composer:
 * overlay moves, clip reorder, and transition-icon tap navigation.
 *
 * Extracted from usePosterTimeline (pure move — no behavior change).
 * Unlike useClipOps (which mutates a clip's media layer through
 * page-indexed commits), these handlers act across the timeline track:
 * resolving an overlay's owning page by layer id, mapping clip indices to
 * page indices for reorder, and navigating to a boundary's source page.
 */

import { useCallback } from 'react';

import type { CreatorDocument } from '../core/projectStore/composition';
import { updateLayerInPage } from '../core/projectStore/composition';
import type { useHaptic } from '../../hooks/useHaptic';
import type { PlaybackClock } from '../core/playback';
import type { PosterClip, TimelineOperation } from './timeline';
import type { ActiveSheet } from './useActiveSheet';

// ── Types ────────────────────────────────────────────────────────────

/**
 * The haptic engine returned by useHaptic.
 */
type Haptic = ReturnType<typeof useHaptic>;

/**
 * The commit signature from CreatorContext.commitDocument (history-pushing).
 */
type CommitDocumentFn = (doc: CreatorDocument, label: string) => void;

type MoveOverlayOp = Extract<TimelineOperation, { type: 'moveOverlay' }>;
type ReorderOp = Extract<TimelineOperation, { type: 'reorder' }>;

export interface UseTrackOpsInput {
  /** The composition document (pages array + layer lookup). */
  document: CreatorDocument;
  /** Pages with video media mapped to PosterClip objects. */
  timelineClips: PosterClip[];
  /** Which page each clip originated from. */
  clipPageIndices: number[];
  /** The PlaybackClock instance (playhead coherence after reorder). */
  playbackClock: PlaybackClock;
  /** Commits a document snapshot through the history stack. */
  commitDocument: CommitDocumentFn;
  /** Reorders pages. From CreatorContext. */
  reorderPages: (fromIndex: number, toIndex: number) => void;
  /** Haptic engine. */
  haptic: Haptic;
  /** The active page index (for transition tap navigation). */
  activePageIndex: number;
  /** Resets the selected layer (from CreatorContext.selectLayer). */
  selectLayer: (id: string | null) => void;
  /** Setter for the active page index (from CreatorContext). */
  setActivePageIndex: (index: number) => void;
  /** Opens a sheet (from useActiveSheet). */
  openSheet: (sheet: Exclude<ActiveSheet, null>) => void;
}

export interface UseTrackOpsResult {
  /** Moves an overlay layer's absolute timeRange on its owning page. */
  handleMoveOverlay: (op: MoveOverlayOp) => void;
  /** Reorders a clip's owning page and keeps the playhead coherent. */
  handleReorder: (op: ReorderOp) => void;
  /** Navigates to the source page of a clip boundary and opens transitions. */
  handleTimelineTransitionTap: (boundaryIndex: number) => void;
}

// ── Hook ─────────────────────────────────────────────────────────────

export function useTrackOps({
  document,
  timelineClips,
  clipPageIndices,
  playbackClock,
  commitDocument,
  reorderPages,
  haptic,
  activePageIndex,
  selectLayer,
  setActivePageIndex,
  openSheet,
}: UseTrackOpsInput): UseTrackOpsResult {
  const handleMoveOverlay = useCallback((op: MoveOverlayOp) => {
    // Overlay pills span every page's track — resolve the OWNING
    // page by layer id. updateLayer would write to activePageIndex
    // and silently no-op (while still pushing a phantom history
    // entry) whenever the overlay lives on another page.
    const owningIndex = document.pages.findIndex((p) =>
      p.layers.some((l) => l.id === op.overlayId));
    const layer = owningIndex >= 0
      ? document.pages[owningIndex].layers.find((l) => l.id === op.overlayId)
      : undefined;
    if (!layer) return;
    const moveDoc = updateLayerInPage(document, owningIndex, op.overlayId, {
      timeRange: op.timeRange,
    });
    commitDocument({ ...moveDoc, updatedAt: new Date().toISOString() }, 'Move overlay');
    haptic.light();
  }, [document, commitDocument, haptic]);

  const handleReorder = useCallback((op: ReorderOp) => {
    // Clip indices are timeline positions, not page indices — map
    // each through clipPageIndices so media-less pages (if any)
    // don't shift the target. Reordering a clip moves its owning
    // page to the target clip's owning page position.
    if (op.fromIndex === op.toIndex) return;
    const fromPage = clipPageIndices[op.fromIndex];
    const toPage = clipPageIndices[op.toIndex];
    if (fromPage == null || toPage == null || fromPage === toPage) return;
    reorderPages(fromPage, toPage);
    // Keep the playhead coherent: without a seek it stays at its old
    // absolute ms while the canvas jumps to the moved clip's page.
    const reordered = [...timelineClips];
    const [mv] = reordered.splice(op.fromIndex, 1);
    reordered.splice(op.toIndex, 0, mv);
    const newStart = reordered
      .slice(0, op.toIndex)
      .reduce((acc, c) => acc + c.durationMs, 0);
    playbackClock.seek(newStart);
  }, [clipPageIndices, reorderPages, timelineClips, playbackClock]);

  // ── Transition icon tap (from the timeline clip boundary) ──────────
  // When the user taps a transition icon between two clips in the timeline,
  // navigate to the source page of that boundary and open the transition
  // drawer. This is the progressive-disclosure pattern: the transition is
  // visible as an icon between clips (only when 2+ clips exist) and opens
  // the same drawer as the overflow "Transitions" tool.
  const handleTimelineTransitionTap = useCallback(
    (boundaryIndex: number) => {
      const srcPageIdx = clipPageIndices[boundaryIndex];
      if (srcPageIdx == null) return;
      if (srcPageIdx !== activePageIndex) {
        selectLayer(null);
        setActivePageIndex(srcPageIdx);
      }
      openSheet('transitions');
    },
    [clipPageIndices, activePageIndex, selectLayer, setActivePageIndex, openSheet],
  );

  return {
    handleMoveOverlay,
    handleReorder,
    handleTimelineTransitionTap,
  };
}
