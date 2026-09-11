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
 *     document model via CreatorContext mutations.
 *   - `handleSpeedCurveChange` — commits a variable speed curve to the
 *     selected media layer.
 *   - `handleTimelineTransitionTap` — navigates to the source page of a
 *     clip boundary and opens the transition drawer.
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

import { useCallback, useEffect, useMemo } from 'react';

import type { CreatorDocument, CreatorLayer, CreatorPage } from '../composition';
import { updateLayerInPage } from '../composition';
import type { useHaptic } from '../../hooks/useHaptic';
import type { ToastType } from '../../context/ToastContext';
import type { PlaybackClock, PlaybackState } from '../core/playback';
import type { AssetPickerMode } from '../CreatorAssetPicker';
import type {
  PosterClip,
  OverlayLayer,
  TimelineState,
  TimelineOperation,
} from './timeline';
import type { SpeedCurve } from './speedcurves/SpeedCurveTypes';
import type { ActiveSheet } from './useActiveSheet';
import {
  trimClipStart,
  trimClipEnd,
  setClipSpeed,
  setClipVolume,
  splitClip,
  duplicateClip,
} from './timeline/TimelineOperations';
import { computeTotalDuration } from './timeline';

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
}

// ── Hook ─────────────────────────────────────────────────────────────

export function usePosterTimeline({
  document,
  updateLayer,
  duplicateLayer,
  removeLayer,
  reorderPages,
  addLayer,
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
  // Map pages with video media to PosterClip objects. We also track which
  // page each clip originated from (clipPageIndices) so the transition
  // icons between clips can resolve the source page's transitionId.
  // Both are derived in a single memo to avoid a ref-mutation-in-memo.
  const { timelineClips, clipPageIndices } = useMemo<{
    timelineClips: PosterClip[];
    clipPageIndices: number[];
  }>(() => {
    const clips: PosterClip[] = [];
    const pageIndices: number[] = [];
    for (let pageIdx = 0; pageIdx < document.pages.length; pageIdx++) {
      const p = document.pages[pageIdx];
      for (const layer of p.layers) {
        if (layer.type !== 'media' || layer.payload.mediaType !== 'video') continue;
        const payload = layer.payload;
        const trimStart = payload.trimStartMs ?? 0;
        const trimEnd =
          payload.trimEndMs ??
          payload.videoDurationMs ??
          p.durationMs ??
          5000;
        const rawDuration = Math.max(100, trimEnd - trimStart);
        const speed = payload.speed ?? 1.0;
        const durationMs = rawDuration / speed;
        clips.push({
          id: layer.id,
          assetId: layer.id,
          sourceUri: payload.mediaUri,
          trimStartMs: trimStart,
          trimEndMs: trimEnd,
          speed,
          volume: payload.volume ?? 1.0,
          thumbnailUri: payload.thumbnailUri,
          durationMs,
        });
        pageIndices.push(pageIdx);
      }
    }
    return { timelineClips: clips, clipPageIndices: pageIndices };
  }, [document.pages]);

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
  // Build a clip-id → absolute-start-ms map so clip-anchored overlays
  // can resolve their timeRange relative to their owning clip's start.
  // This makes overlays follow clips on reorder: when a clip moves,
  // its anchored overlays move with it automatically.
  const timelineOverlays = useMemo<OverlayLayer[]>(() => {
    const overlays: OverlayLayer[] = [];
    // Build a clip-id → absolute-start-ms map so clip-anchored overlays
    // can resolve their timeRange relative to their owning clip's start.
    // This makes overlays follow clips on reorder: when a clip moves,
    // its anchored overlays move with it automatically.
    const clipStartMsById = new Map<string, number>();
    let clipOffsetMs = 0;
    for (const p of document.pages) {
      const pageDuration = p.durationMs ?? 5000;
      let hasVideoClip = false;
      for (const layer of p.layers) {
        if (layer.type === 'media' && layer.payload.mediaType === 'video') {
          hasVideoClip = true;
          clipStartMsById.set(layer.id, clipOffsetMs);
          continue;
        }
      }
      if (hasVideoClip) {
        clipOffsetMs += pageDuration;
      }
    }
    // Second pass: collect overlays, resolving clipId anchors.
    clipOffsetMs = 0;
    for (const p of document.pages) {
      const pageDuration = p.durationMs ?? 5000;
      let hasVideoClip = false;
      for (const layer of p.layers) {
        if (layer.type === 'media' && layer.payload.mediaType === 'video') {
          hasVideoClip = true;
          continue;
        }
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
          // If the overlay has a clipId anchor, resolve its timeRange
          // relative to the clip's absolute start. This makes the overlay
          // follow the clip on reorder — the clip moves, the overlay moves.
          const anchorClipId = (layer as { clipId?: string }).clipId;
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
          const baseOffset = clipStart ?? clipOffsetMs;
          const baseDuration = clipStart != null
            ? (timelineClips.find((c) => c.id === anchorClipId)?.durationMs ?? pageDuration)
            : pageDuration;
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
      if (hasVideoClip) {
        clipOffsetMs += pageDuration;
      }
    }
    return overlays;
  }, [document.pages, timelineClips]);

  const timelineTotalDurationMs = useMemo(
    () => computeTotalDuration(timelineClips),
    [timelineClips],
  );

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

  // ── Timeline operation handler ─────────────────────────────────────
  // Routes timeline operations to the document model. For now, trim/speed/
  // volume map to updateLayer on the underlying media layer.
  const handleTimelineOperation = useCallback(
    (op: TimelineOperation) => {
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
        case 'trim': {
          const clip = timelineClips.find((c) => c.id === op.clipId);
          if (!clip) return;
          const layer = document.pages
            .flatMap((p) => p.layers)
            .find((l) => l.id === op.clipId);
          if (!layer || layer.type !== 'media') return;
          // Magnetic snapping: snap trim edges to the playhead position
          // and to adjacent clip boundaries when within 150ms.
          const SNAP_MS = 150;
          const playheadMs = playbackState.currentTimeMs;
          let newTrimStart = op.edge === 'start'
            ? Math.max(0, clip.trimStartMs + op.deltaMs)
            : clip.trimStartMs;
          let newTrimEnd = op.edge === 'end'
            ? Math.max(newTrimStart + 100, clip.trimEndMs + op.deltaMs)
            : clip.trimEndMs;
          // Snap to playhead
          if (op.edge === 'start' && Math.abs(newTrimStart - playheadMs) < SNAP_MS) {
            newTrimStart = playheadMs;
          }
          if (op.edge === 'end' && Math.abs(newTrimEnd - playheadMs) < SNAP_MS) {
            newTrimEnd = playheadMs;
          }
          // Snap to adjacent clip boundaries
          const clipIdx = timelineClips.findIndex((c) => c.id === op.clipId);
          if (op.edge === 'start' && clipIdx > 0) {
            const prevClip = timelineClips[clipIdx - 1];
            const prevEnd = prevClip.trimEndMs ?? 0;
            if (Math.abs(newTrimStart - prevEnd) < SNAP_MS) {
              newTrimStart = prevEnd;
            }
          }
          if (op.edge === 'end' && clipIdx < timelineClips.length - 1) {
            const nextClip = timelineClips[clipIdx + 1];
            const nextStart = nextClip.trimStartMs ?? 0;
            if (Math.abs(newTrimEnd - nextStart) < SNAP_MS) {
              newTrimEnd = nextStart;
            }
          }
          // Route the snapped value through the pure timeline operation so
          // bounds are validated (MIN_TRIM floor, no negative duration) and
          // durationMs is recomputed consistently. The snapped target is
          // converted to a delta — the pure function clamps and validates.
          const snappedDelta = op.edge === 'start'
            ? newTrimStart - clip.trimStartMs
            : newTrimEnd - clip.trimEndMs;
          const trimmedClips = op.edge === 'start'
            ? trimClipStart(timelineClips, op.clipId, snappedDelta)
            : trimClipEnd(timelineClips, op.clipId, snappedDelta);
          const trimmedClip = trimmedClips.find((c) => c.id === op.clipId);
          if (!trimmedClip) break;
          updateLayer(op.clipId, {
            type: 'media',
            payload: {
              ...layer.payload,
              trimStartMs: trimmedClip.trimStartMs,
              trimEndMs: trimmedClip.trimEndMs,
            },
          }, 'Trim clip');
          break;
        }
        case 'speed': {
          const layer = document.pages
            .flatMap((p) => p.layers)
            .find((l) => l.id === op.clipId);
          if (!layer || layer.type !== 'media') return;
          // Route through the pure timeline operation so the speed is
          // clamped to 0.25x–4x and durationMs is recomputed consistently.
          // setClipSpeed also clears any existing speed curve — the clip
          // becomes a constant-speed clip.
          const speedClips = setClipSpeed(timelineClips, op.clipId, op.speed);
          const speedClip = speedClips.find((c) => c.id === op.clipId);
          if (!speedClip) break;
          updateLayer(op.clipId, {
            type: 'media',
            payload: {
              ...layer.payload,
              speed: speedClip.speed,
              speedCurve: undefined,
            },
          }, 'Change speed');
          haptic.light();
          break;
        }
        case 'volume': {
          const layer = document.pages
            .flatMap((p) => p.layers)
            .find((l) => l.id === op.clipId);
          if (!layer || layer.type !== 'media') return;
          // Route through the pure timeline operation so the volume is
          // clamped to 0.0–1.0 before persisting. Volume does not affect
          // the clip's wall-clock duration, so durationMs is untouched.
          const volumeClips = setClipVolume(timelineClips, op.clipId, op.volume);
          const volumeClip = volumeClips.find((c) => c.id === op.clipId);
          if (!volumeClip) break;
          updateLayer(op.clipId, {
            type: 'media',
            payload: { ...layer.payload, volume: volumeClip.volume },
          }, 'Change volume');
          haptic.light();
          break;
        }
        case 'split': {
          // Split the selected clip at the playhead position.
          // This creates two clips from one: the first keeps the original
          // trim range up to the split point, the second starts from the
          // split point to the original trim end.
          const clip = timelineClips.find((c) => c.id === op.clipId);
          if (!clip) return;

          // Find the clip's start position in the timeline (sum of all
          // previous clips' speed-adjusted durations).
          const clipIndex = timelineClips.indexOf(clip);
          let clipStartMs = 0;
          for (let i = 0; i < clipIndex; i++) {
            clipStartMs += timelineClips[i].durationMs;
          }

          // Calculate the offset within this clip (timeline time → source time)
          const offsetInClip = Math.max(0, op.atMs - clipStartMs);
          const splitPoint = clip.trimStartMs + offsetInClip * clip.speed;

          // Clamp the split point to be safely within the trim range
          const minSplit = clip.trimStartMs + 100; // min 100ms on each side
          const maxSplit = clip.trimEndMs - 100;
          if (splitPoint <= minSplit || splitPoint >= maxSplit) {
            haptic.error();
            show("Can't split here", 'info');
            break;
          }

          // Find the original media layer
          const layer = document.pages
            .flatMap((p) => p.layers)
            .find((l) => l.id === op.clipId);
          if (!layer || layer.type !== 'media') return;

          // Route through the pure timeline operation for bounds validation
          // and consistent duration recomputation. splitClip returns a new
          // clips array with the original clip trimmed to the split point and
          // a new clip inserted immediately after with a fresh id.
          const splitClips = splitClip(timelineClips, op.clipId, splitPoint);
          if (splitClips === timelineClips) {
            // No-op — the pure function rejected the split point.
            haptic.error();
            show("Can't split here", 'info');
            break;
          }
          const firstClip = splitClips.find((c) => c.id === op.clipId);
          // The new clip is the one not present in the original array.
          const originalIds = new Set(timelineClips.map((c) => c.id));
          const secondClip = splitClips.find((c) => !originalIds.has(c.id));
          if (!firstClip || !secondClip) break;

          // Find the clip's owning page index so we can target it
          // directly instead of relying on activePageIndex (which may
          // point to a different page). This is the root fix for the
          // P0 finding that split silently targeted the wrong page.
          const owningClipIdx = timelineClips.findIndex((c) => c.id === op.clipId);
          if (owningClipIdx < 0) break;
          const owningPageIndex = clipPageIndices[owningClipIdx];
          if (owningPageIndex == null) break;

          // 1. Trim the original clip's trim end to the split point on
          //    its owning page (not the active page).
          // 2. Create a new page for the second half. The projector only
          //    renders one media layer per page, so adding a second media
          //    layer to the same page would make it invisible in playback.
          //    A new page ensures both halves render correctly and the
          //    timeline clip order matches the page order.
          // 3. Update the original page's duration to match the trimmed
          //    first half so the timeline and playback agree.
          //
          // All three mutations are applied to a single document snapshot
          // and committed through `commitDocument` so the split creates ONE
          // history entry — a single undo restores the pre-split state.
          // The previous implementation called `updateLayerOnPage`,
          // `insertPage` and `updatePageDuration` separately, pushing three
          // history entries and forcing the user to undo three times. We
          // compute the combined document synchronously with the pure
          // composition helpers instead of routing through the context
          // mutators (which each push their own snapshot inside a deferred
          // React state updater — a timing model that makes a
          // suspend/resume transaction on the HistoryStack unsafe).
          const secondLayer: CreatorLayer = {
            ...layer,
            id: secondClip.id,
            zIndex: 0, // reset zIndex — new page, fresh z-stack
            payload: {
              ...layer.payload,
              trimStartMs: secondClip.trimStartMs,
              trimEndMs: secondClip.trimEndMs,
              // Clear the thumbnail so it regenerates for the new clip.
              thumbnailUri: undefined,
            },
          };
          const secondPageDurationMs = Math.max(
            100,
            (secondClip.trimEndMs - secondClip.trimStartMs) / (secondClip.speed ?? 1),
          );
          const newPage: CreatorPage = {
            id: `page_${Date.now()}`,
            layers: [secondLayer],
            durationMs: secondPageDurationMs,
          };
          const firstPageDurationMs = Math.max(
            100,
            (firstClip.trimEndMs - firstClip.trimStartMs) / (firstClip.speed ?? 1),
          );

          // Build the combined document: trim the original clip, update its
          // page duration, then insert the new page after it. Guard the
          // insert with the same MAX_PAGES (10) limit the context enforces
          // so we don't exceed the page budget.
          let splitDoc = updateLayerInPage(document, owningPageIndex, op.clipId, {
            type: 'media',
            payload: { ...layer.payload, trimEndMs: firstClip.trimEndMs },
          });
          {
            const newPages = [...splitDoc.pages];
            if (newPages[owningPageIndex]) {
              newPages[owningPageIndex] = {
                ...newPages[owningPageIndex],
                durationMs: firstPageDurationMs,
              };
            }
            splitDoc = { ...splitDoc, pages: newPages };
          }
          if (splitDoc.pages.length < 10) {
            const newPages = [...splitDoc.pages];
            newPages.splice(owningPageIndex + 1, 0, newPage);
            splitDoc = { ...splitDoc, pages: newPages };
          }
          commitDocument({ ...splitDoc, updatedAt: new Date().toISOString() }, 'Split clip');

          // 4. Select the new second clip so the user can immediately edit it.
          //    Without this, selection stays on the first half.
          setSelectedClipId(secondClip.id);

          haptic.medium();
          break;
        }
        case 'duplicate': {
          if (!op.clipId) break;
          // Route through the pure timeline operation for validation —
          // duplicateClip confirms the clip exists in the timeline model
          // before the document-level duplication proceeds.
          const duplicatedClips = duplicateClip(timelineClips, op.clipId);
          if (duplicatedClips === timelineClips) break; // clip not found
          duplicateLayer(op.clipId);
          break;
        }
        case 'delete':
          if (op.clipId) removeLayer(op.clipId);
          setSelectedClipId(null);
          break;
        case 'replace':
          setEditingLayer(
            document.pages.flatMap((p) => p.layers).find((l) => l.id === op.clipId) ?? null,
          );
          setPickerMode('media');
          break;
        case 'moveOverlay': {
          const layer = document.pages
            .flatMap((p) => p.layers)
            .find((l) => l.id === op.overlayId);
          if (!layer) return;
          updateLayer(op.overlayId, {
            timeRange: op.timeRange,
          }, 'Move overlay');
          haptic.light();
          break;
        }
        case 'reorder':
          // Clip reorder maps to page reorder
          if (op.fromIndex !== op.toIndex) {
            reorderPages(op.fromIndex, op.toIndex);
          }
          break;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [timelineClips, timelineTotalDurationMs, document.pages, document, updateLayer, duplicateLayer, removeLayer, reorderPages, show, haptic, addLayer, commitDocument, playbackClock, clipPageIndices],
  );

  // ── Speed curve handler ─────────────────────────────────────────────
  // Opens the speed curve editor for the selected media layer. The curve
  // is stored on the media layer's `speedCurve` field. When the user
  // clears the curve (back to constant), the field is removed.
  const handleSpeedCurveChange = useCallback((nextCurve: SpeedCurve) => {
    if (!selectedLayer || selectedLayer.type !== 'media') return;
    updateLayer(selectedLayer.id, {
      type: 'media',
      payload: { ...selectedLayer.payload, speedCurve: nextCurve },
    }, 'Edit speed curve');
  }, [selectedLayer, updateLayer]);

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
    timelineClips,
    clipPageIndices,
    clipTransitionIds,
    timelineOverlays,
    timelineTotalDurationMs,
    selectedClip,
    timelineState,
    handleTimelineOperation,
    handleSpeedCurveChange,
    handleTimelineTransitionTap,
  };
}
