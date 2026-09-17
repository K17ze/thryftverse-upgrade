/**
 * usePosterTimeline — Timeline editing state & handlers hook for the
 * Poster composer.
 *
 * Extracted from PosterComposerScreen to separate the timeline editing
 * logic (clip/overlay derivation, timeline operation routing, speed curve
 * editing, transition tap navigation, and selection coherence) from the
 * screen's rendering orchestration.
 *
 * The hook owns:
 *   - `timelineClips` / `clipPageIndices` — the page→clip projection that
 *     maps pages with video media to PosterClip objects, tracking which
 *     page each clip originated from so transition icons can resolve the
 *     source page's transitionId.
 *   - `clipTransitionIds` — the transition preset IDs for each clip
 *     boundary (page-level transitions only).
 *   - `timelineOverlays` — the clip-anchored overlay resolution (W7-4):
 *     timed overlay layers (text, stickers, product, music, drawing)
 *     mapped to OverlayLayer objects with absolute time ranges. Overlays
 *     with a `clipId` anchor follow their owning clip on reorder.
 *   - `timelineTotalDurationMs` — sum of all clip durations (speed-adjusted).
 *   - `selectedClip` — the PosterClip matching the transient selectedClipId.
 *   - `timelineState` — the combined TimelineState snapshot (clips +
 *     overlays + playhead + total duration + isPlaying).
 *   - `handleTimelineOperation` — the single switch-based router that
 *     routes timeline operations (seek, play, pause, trim, speed, volume,
 *     split, duplicate, delete, replace, moveOverlay, reorder) to the
 *     document model via CreatorContext mutations. The clip-mutating ops
 *     are delegated to useClipOps and the track-level ops (moveOverlay,
 *     reorder) plus transition-tap navigation to useTrackOps — the lock
 *     guard and dispatch stay here.
 *   - `handleSpeedCurveChange` — commits a variable speed curve to the
 *     selected media layer (lives in useClipOps).
 *   - `handleTimelineTransitionTap` — navigates to the source page of a
 *     clip boundary and opens the transition drawer (lives in useTrackOps).
 *   - Selection coherence effect — validates selectedClipId against the
 *     current timeline clips and resets to null if the clip was deleted.
 *
 * `selectedClipId` / `setSelectedClipId` and `selectedOverlayId` /
 * `setSelectedOverlayId` are shared transient state — they are passed as
 * inputs (owned by the screen) so they remain a single source of truth
 * shared with usePosterTopBarActions and usePosterFrameNavigation.
 *
 * Pattern follows usePosterSession.ts, usePosterEffects.ts, and
 * usePosterPlayback.ts.
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';

import type { CreatorDocument, CreatorLayer } from '../core/projectStore/composition';
import type { useHaptic } from '../../hooks/useHaptic';
import type { ToastType } from '../../context/ToastContext';
import type { PlaybackClock, PlaybackState } from '../core/playback';
import type { AssetPickerMode } from '../surfaces/CreatorAssetPicker';
import type {
  PosterClip,
  OverlayLayer,
  TimelineState,
  TimelineOperation,
} from './timeline';
import type { SpeedCurve } from './speedcurves/SpeedCurveTypes';
import type { ActiveSheet } from './useActiveSheet';
import { projectTimeline } from '../core/playback';
import { useClipOps } from './useClipOps';
import { useTrackOps } from './useTrackOps';

// ── Types ────────────────────────────────────────────────────────────

/**
 * The haptic engine returned by useHaptic.
 */
type Haptic = ReturnType<typeof useHaptic>;

/**
 * The toast `show` function signature from ToastContext.
 */
type ShowToast = (message: string, type?: ToastType) => void;

/**
 * The mutation signature from CreatorContext.updateLayer (history-pushing).
 */
type UpdateLayerFn = (
  id: string,
  updates: Partial<CreatorLayer>,
  label?: string,
) => void;

/**
 * The commit signature from CreatorContext.commitDocument (history-pushing).
 */
type CommitDocumentFn = (doc: CreatorDocument, label: string) => void;

export interface UsePosterTimelineInput {
  /** The composition document (for the pages array and layer lookup). */
  document: CreatorDocument;
  /** Updates a layer (history-pushing). From CreatorContext. */
  updateLayer: UpdateLayerFn;
  /** Duplicates a layer. From CreatorContext. */
  duplicateLayer: (id: string) => void;
  /** Removes a layer. From CreatorContext. */
  removeLayer: (id: string) => void;
  /** Reorders pages. From CreatorContext. */
  reorderPages: (fromIndex: number, toIndex: number) => void;
  /** Adds a layer. From CreatorContext. */
  addLayer: (layer: CreatorLayer) => void;
  /** Commits a document snapshot through the history stack. From CreatorContext. */
  commitDocument: CommitDocumentFn;
  /** Haptic engine. */
  haptic: Haptic;
  /** Toast show function. */
  show: ShowToast;
  /** The PlaybackClock instance (from usePosterPlayback). */
  playbackClock: PlaybackClock;
  /** The playback state snapshot (from usePosterPlayback). */
  playbackState: PlaybackState;
  /** The transient selected clip id (shared state, owned by the screen). */
  selectedClipId: string | null;
  /** Setter for the transient selected clip id. */
  setSelectedClipId: (id: string | null) => void;
  /** The transient selected overlay id (shared state, owned by the screen). */
  selectedOverlayId: string | null;
  /** Setter for the transient selected overlay id. */
  setSelectedOverlayId: (id: string | null) => void;
  /** The currently selected layer (for speed curve editing). */
  selectedLayer: CreatorLayer | null;
  /** The active page index (for transition tap navigation). */
  activePageIndex: number;
  /** Resets the selected layer (from CreatorContext.selectLayer). */
  selectLayer: (id: string | null) => void;
  /** Setter for the active page index (from CreatorContext). */
  setActivePageIndex: (index: number) => void;
  /** Opens a sheet (from useActiveSheet). */
  openSheet: (sheet: Exclude<ActiveSheet, null>) => void;
  /** Setter for the editing layer (for the replace operation). */
  setEditingLayer: (layer: CreatorLayer | null) => void;
  /** Setter for the asset picker mode (for the replace operation). */
  setPickerMode: (mode: AssetPickerMode | null) => void;
}

export interface UsePosterTimelineResult {
  /** Pages with video media mapped to PosterClip objects. */
  timelineClips: PosterClip[];
  /** Which page each clip originated from. */
  clipPageIndices: number[];
  /**
   * The canonical timeline projection — clips carry `timelineStartMs`,
   * `durationMs`, and `pageId`, used for playhead→page sync, clip-relative
   * time derivation, and freeze/active-clip resolution on the canvas.
   */
  projectedTimeline: ReturnType<typeof projectTimeline>;
  /** Transition preset IDs for each clip boundary. */
  clipTransitionIds: (string | null)[];
  /** Clip-anchored overlay resolution (timed overlay layers). */
  timelineOverlays: OverlayLayer[];
  /** Sum of all clip durations (speed-adjusted). */
  timelineTotalDurationMs: number;
  /** The PosterClip matching the transient selectedClipId, or null. */
  selectedClip: PosterClip | null;
  /** The combined TimelineState snapshot. */
  timelineState: TimelineState;
  /** Routes timeline operations to the document model. */
  handleTimelineOperation: (op: TimelineOperation) => void;
  /** Commits a variable speed curve to the selected media layer. */
  handleSpeedCurveChange: (nextCurve: SpeedCurve) => void;
  /** Navigates to the source page of a clip boundary and opens transitions. */
  handleTimelineTransitionTap: (boundaryIndex: number) => void;
  /** Toggles `locked` on the media layer owning a clip (any page). */
  toggleClipLock: (clipId: string) => void;
}

// ── Hook ─────────────────────────────────────────────────────────────

export function usePosterTimeline({
  document,
  removeLayer,
  reorderPages,
  commitDocument,
  haptic,
  show,
  playbackClock,
  playbackState,
  selectedClipId,
  setSelectedClipId,
  selectedLayer,
  activePageIndex,
  selectLayer,
  setActivePageIndex,
  openSheet,
  setEditingLayer,
  setPickerMode,
}: UsePosterTimelineInput): UsePosterTimelineResult {
  // ── Timeline clips + page-index mapping ────────────────────────────
  // The editor timeline is derived from the canonical TimelineProjector —
  // the same projection the playback clock consumes — so clip order,
  // first-media-per-page semantics, speed-curve durations, freeze frames
  // and reverse flags can never drift between the strip and playback.
  // clipPageIndices maps each clip back to its page so transition icons
  // resolve the source page's transitionId.
  const { timelineClips, clipPageIndices, projectedTimeline } = useMemo<{
    timelineClips: PosterClip[];
    clipPageIndices: number[];
    projectedTimeline: ReturnType<typeof projectTimeline>;
  }>(() => {
    const projected = projectTimeline(document);
    const pageIndexById = new Map(
      document.pages.map((p, i) => [p.id, i] as const),
    );
    // Lock state lives on the media layer (canvas enforces it on layer
    // gestures); carry it onto the clip so timeline ops can enforce the
    // same invariant.
    const lockedByLayerId = new Map(
      document.pages.flatMap((p) => p.layers).map((l) => [l.id, l.locked] as const),
    );
    const clips: PosterClip[] = projected.clips.map((pc) => ({
      id: pc.layerId,
      assetId: pc.assetId,
      sourceUri: pc.sourceUri,
      mediaType: pc.mediaType,
      trimStartMs: pc.sourceStartMs,
      trimEndMs: pc.sourceEndMs,
      sourceDurationMs: pc.sourceDurationMs,
      speed: pc.speed,
      speedCurve: pc.speedCurve,
      volume: pc.volume,
      thumbnailUri: pc.thumbnailUri,
      durationMs: pc.durationMs,
      timelineStartMs: pc.timelineStartMs,
      reversed: pc.reversed,
      freezeFrameMs: pc.freezeFrameMs,
      locked: lockedByLayerId.get(pc.layerId) ?? false,
    }));
    const pageIndices = projected.clips.map(
      (pc) => pageIndexById.get(pc.pageId) ?? 0,
    );
    return { timelineClips: clips, clipPageIndices: pageIndices, projectedTimeline: projected };
  }, [document]);

  // ── Selection coherence ────────────────────────────────────────────
  // Validate selectedClipId against the current timeline clips. If the
  // selected clip was deleted, replaced, or otherwise removed from the
  // timeline, reset selection to null so subsequent edits don't target a
  // non-existent clip. This is the safety net for split/replace/delete
  // operations that change clip ids.
  useEffect(() => {
    if (selectedClipId && !timelineClips.some((c) => c.id === selectedClipId)) {
      setSelectedClipId(null);
    }
  }, [selectedClipId, timelineClips, setSelectedClipId]);

  // ── Preview-follows-playhead (CapCut/Edits grammar) ────────────────
  // currentTimeMs only changes via playback-clock ticks or an explicit
  // timeline seek — so whenever it lands inside a different clip, the
  // active page follows. The canvas and every page-scoped mutation then
  // always target what the user sees. The ref gate is essential: doc
  // edits re-run this effect without a playhead move and must not yank
  // the user back to the playhead's page mid-edit.
  const lastSyncTRef = useRef(playbackState.currentTimeMs);
  useEffect(() => {
    const t = playbackState.currentTimeMs;
    if (t === lastSyncTRef.current) return;
    lastSyncTRef.current = t;
    const clip = projectedTimeline.clips.find(
      (c) => t >= c.timelineStartMs && t < c.timelineStartMs + c.durationMs,
    );
    if (!clip) return;
    const pageIndex = document.pages.findIndex((p) => p.id === clip.pageId);
    if (pageIndex >= 0 && pageIndex !== activePageIndex) {
      setActivePageIndex(pageIndex);
    }
  }, [playbackState.currentTimeMs, projectedTimeline, document.pages, activePageIndex, setActivePageIndex]);

  // ── Transition preset IDs for each clip boundary ───────────────────
  // Length = clips.length - 1. Index i is the transition between clip[i]
  // and clip[i+1], sourced from the source page of clip[i]
  // (page.transitionId). null means no transition is set — the timeline
  // renders a subtle "+" icon there. Only page-level transitions (where
  // clip[i+1] is on a later page) are surfaced; within-page clip cuts
  // have no page-level transition.
  const clipTransitionIds = useMemo<(string | null)[]>(() => {
    if (clipPageIndices.length < 2) return [];
    const result: (string | null)[] = [];
    for (let i = 0; i < clipPageIndices.length - 1; i++) {
      const srcPageIdx = clipPageIndices[i];
      const nextPageIdx = clipPageIndices[i + 1];
      if (nextPageIdx > srcPageIdx && srcPageIdx < document.pages.length) {
        result.push(document.pages[srcPageIdx].transitionId ?? null);
      } else {
        result.push(null);
      }
    }
    return result;
  }, [clipPageIndices, document.pages]);

  // ── Timeline overlays (clip-anchored overlay resolution, W7-4) ──────
  // Overlay offsets are rebased onto the canonical projection: clip start
  // positions come from ProjectedClip.timelineStartMs and each page's
  // timeline footprint is its projected clip duration (or the authored
  // page duration for media-less pages) — identical to the accumulation
  // the playback projector performs. Previously the offsets used raw
  // page.durationMs, so overlay positions drifted from playback whenever
  // a clip's speed or speed curve changed its projected duration.
  const timelineOverlays = useMemo<OverlayLayer[]>(() => {
    const overlays: OverlayLayer[] = [];
    // clip-id → projected absolute start/duration, for clipId anchors.
    const clipStartMsById = new Map<string, number>();
    const clipDurationMsById = new Map<string, number>();
    const clipByPageId = new Map<string, number>();
    for (const c of projectedTimeline.clips) {
      clipStartMsById.set(c.layerId, c.timelineStartMs);
      clipDurationMsById.set(c.layerId, c.durationMs);
      clipByPageId.set(c.pageId, c.durationMs);
    }
    // Page start offsets accumulate each page's projected span — matching
    // the projector's cumulative walk so every page (including still-image
    // and media-less pages) occupies the same timeline footprint as in
    // playback.
    const pageStartMsById = new Map<string, number>();
    const pageDurationMsById = new Map<string, number>();
    let acc = 0;
    for (const p of document.pages) {
      pageStartMsById.set(p.id, acc);
      const span = clipByPageId.get(p.id) ?? (p.durationMs ?? 0);
      pageDurationMsById.set(p.id, span);
      acc += span;
    }
    for (const p of document.pages) {
      for (const layer of p.layers) {
        if (layer.type === 'media') continue;
        let overlayType: OverlayLayer['type'] | null = null;
        let label = '';
        if (layer.type === 'text') {
          overlayType = 'text';
          label = layer.payload.text ?? 'Text';
        } else if (layer.type === 'decorative') {
          overlayType = 'sticker';
          label = 'Sticker';
        } else if (layer.type === 'product') {
          overlayType = 'product';
          label = layer.payload.snapshotTitle ?? 'Listing';
        } else if (layer.type === 'music') {
          overlayType = 'music';
          label = layer.payload.trackName ?? 'Music';
        } else if (layer.type === 'draw') {
          overlayType = 'drawing';
          label = 'Drawing';
        }
        if (overlayType) {
          const stored = layer.timeRange;
          // If the overlay has a clipId anchor, resolve its default range
          // against the clip's projected absolute start. This makes the
          // overlay follow the clip on reorder — the clip moves, the
          // overlay moves.
          const anchorClipId = layer.clipId;
          const clipStart = anchorClipId ? clipStartMsById.get(anchorClipId) : undefined;
          if (anchorClipId && clipStart == null) {
            // Orphaned anchor — the clip was deleted, split, or moved to
            // another page. The overlay falls back to page-level timing.
            // Do NOT clear clipId automatically: the user might undo the
            // clip deletion, which would re-anchor the overlay.
            console.warn(
              `[usePosterTimeline] Overlay layer '${layer.id}' has orphaned clipId '${anchorClipId}' — falling back to page-level timing.`,
            );
          }
          const baseOffset = clipStart ?? pageStartMsById.get(p.id) ?? 0;
          const baseDuration = clipStart != null
            ? (clipDurationMsById.get(anchorClipId!) ?? pageDurationMsById.get(p.id) ?? 0)
            : (pageDurationMsById.get(p.id) ?? 0);
          const startMs = stored?.startMs ?? baseOffset;
          const endMs = stored?.endMs ?? (baseOffset + baseDuration);
          overlays.push({
            id: layer.id,
            type: overlayType,
            timeRange: { startMs, endMs },
            label,
          });
        }
      }
    }
    return overlays;
  }, [document.pages, projectedTimeline]);

  // The strip's total duration IS the projected timeline duration — the
  // playhead, strip widths, and playback clock all share one length.
  const timelineTotalDurationMs = projectedTimeline.totalDurationMs;

  // ── Combined TimelineState snapshot ────────────────────────────────
  const timelineState: TimelineState = useMemo(
    () => ({
      clips: timelineClips,
      overlays: timelineOverlays,
      playheadMs: playbackState.currentTimeMs,
      totalDurationMs: timelineTotalDurationMs,
      isPlaying: playbackState.isPlaying,
    }),
    [timelineClips, timelineOverlays, playbackState.currentTimeMs, timelineTotalDurationMs, playbackState.isPlaying],
  );

  const selectedClip = useMemo(
    () => timelineClips.find((c) => c.id === selectedClipId) ?? null,
    [timelineClips, selectedClipId],
  );

  // ── Clip operation handlers (useClipOps) ───────────────────────────
  // Clip-mutating ops resolve the clip's owning page via clipPageIndices
  // and commit through updateLayerInPage + commitDocument. Duration-
  // affecting ops reflow absolute overlay time ranges before commit.
  const {
    handleTrim,
    handleSlip,
    handleSpeed,
    handleVolume,
    handleSplit,
    handleDuplicate,
    handleDelete,
    handleReplace,
    handleSpeedCurveChange,
    toggleClipLock,
  } = useClipOps({
    document,
    timelineClips,
    clipPageIndices,
    playbackState,
    commitDocument,
    removeLayer,
    haptic,
    show,
    activePageIndex,
    setActivePageIndex,
    setSelectedClipId,
    setEditingLayer,
    setPickerMode,
    selectedLayer,
  });

  // ── Track-level handlers (useTrackOps) ─────────────────────────────
  // Overlay moves, clip reorder, and transition-icon tap navigation —
  // ops that act across the timeline track rather than mutating one
  // clip's media layer.
  const {
    handleMoveOverlay,
    handleReorder,
    handleTimelineTransitionTap,
  } = useTrackOps({
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
  });

  // ── Timeline operation handler ─────────────────────────────────────
  // Routes timeline operations to the document model. Clip-mutating ops
  // delegate to useClipOps handlers; track-level ops to useTrackOps.
  const handleTimelineOperation = useCallback(
    (op: TimelineOperation) => {
      // Clip-lock parity (Instagram Edits): a locked clip rejects every
      // mutating op. Canvas gestures already honor `layer.locked`; without
      // this guard the same clip could still be trimmed, split, deleted or
      // reordered through the timeline. Reorder resolves the moved clip via
      // fromIndex; moveOverlay resolves the overlay layer directly.
      const lockTargetIds: (string | undefined)[] =
        'clipId' in op ? [op.clipId] :
        // Reorder displaces both endpoint clips — check both.
        op.type === 'reorder' ? [timelineClips[op.fromIndex]?.id, timelineClips[op.toIndex]?.id] :
        op.type === 'moveOverlay' ? [op.overlayId] : [];
      if (lockTargetIds.length > 0) {
        const targetLocked = lockTargetIds.some((id) =>
          id != null && document.pages.some((p) => p.layers.some((l) => l.id === id && l.locked)));
        if (targetLocked) {
          haptic.error();
          show('Clip is locked', 'info');
          return;
        }
      }
      switch (op.type) {
        case 'seek':
          playbackClock.seek(op.ms);
          break;
        case 'play':
          playbackClock.play();
          haptic.light();
          break;
        case 'pause':
          playbackClock.pause();
          haptic.light();
          break;
        case 'trim':
          handleTrim(op);
          break;
        case 'slip':
          handleSlip(op);
          break;
        case 'speed':
          handleSpeed(op);
          break;
        case 'volume':
          handleVolume(op);
          break;
        case 'split':
          handleSplit(op);
          break;
        case 'duplicate':
          handleDuplicate(op);
          break;
        case 'delete':
          handleDelete(op);
          break;
        case 'replace':
          handleReplace(op);
          break;
        case 'moveOverlay':
          handleMoveOverlay(op);
          break;
        case 'reorder':
          handleReorder(op);
          break;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [timelineClips, document, haptic, show, playbackClock, handleTrim, handleSlip, handleSpeed, handleVolume, handleSplit, handleDuplicate, handleDelete, handleReplace, handleMoveOverlay, handleReorder],
  );

  return {
    timelineClips,
    clipPageIndices,
    projectedTimeline,
    clipTransitionIds,
    timelineOverlays,
    timelineTotalDurationMs,
    selectedClip,
    timelineState,
    handleTimelineOperation,
    handleSpeedCurveChange,
    handleTimelineTransitionTap,
    toggleClipLock,
  };
}
