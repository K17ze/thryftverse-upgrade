/**
 * useClipOps — clip-level timeline operation handlers for the Poster
 * composer.
 *
 * Extracted from usePosterTimeline's handleTimelineOperation switch (pure
 * move — no behavior change). Every handler resolves the clip's OWNING
 * page via clipPageIndices and commits through updateLayerInPage +
 * commitDocument as a single history entry, because updateLayer targets
 * activePageIndex — which may point at the playhead's page rather than
 * the selected clip's page during playback-follow.
 *
 * Duration-affecting ops (trim, speed, speed curve, duplicate, delete)
 * run reflowOverlayTimeRanges(document, nextDoc) before commit so the
 * absolute overlay time ranges on later pages shift with the new spans.
 * Slip and volume do not change wall-clock duration → no reflow. Split
 * performs its own page surgery inside splitPageClip as one commit.
 */

import { useCallback } from 'react';

import type { CreatorDocument, CreatorLayer } from '../core/projectStore/composition';
import { updateLayerInPage } from '../core/projectStore/composition';
import type { useHaptic } from '../../hooks/useHaptic';
import type { ToastType } from '../../context/ToastContext';
import type { PlaybackState } from '../core/playback';
import type { AssetPickerMode } from '../surfaces/CreatorAssetPicker';
import type { PosterClip, TimelineOperation } from './timeline';
import type { SpeedCurve } from './speedcurves/SpeedCurveTypes';
import { averageSpeed } from './speedcurves/SpeedCurveTypes';
import {
  trimClipStart,
  trimClipEnd,
  slipClip,
  setClipSpeed,
  setClipVolume,
} from './timeline/TimelineOperations';
import {
  splitPageClip,
  duplicateClipPage,
  deleteClipPage,
  reflowOverlayTimeRanges,
} from './timeline/TimelineDocOps';

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
 * The commit signature from CreatorContext.commitDocument (history-pushing).
 */
type CommitDocumentFn = (doc: CreatorDocument, label: string) => void;

type TrimOp = Extract<TimelineOperation, { type: 'trim' }>;
type SlipOp = Extract<TimelineOperation, { type: 'slip' }>;
type SpeedOp = Extract<TimelineOperation, { type: 'speed' }>;
type VolumeOp = Extract<TimelineOperation, { type: 'volume' }>;
type SplitOp = Extract<TimelineOperation, { type: 'split' }>;
type DuplicateOp = Extract<TimelineOperation, { type: 'duplicate' }>;
type DeleteOp = Extract<TimelineOperation, { type: 'delete' }>;
type ReplaceOp = Extract<TimelineOperation, { type: 'replace' }>;

export interface UseClipOpsInput {
  /** The composition document (pages array + layer lookup). */
  document: CreatorDocument;
  /** Pages with video media mapped to PosterClip objects. */
  timelineClips: PosterClip[];
  /** Which page each clip originated from. */
  clipPageIndices: number[];
  /** The playback state snapshot (playhead position for trim/split). */
  playbackState: PlaybackState;
  /** Commits a document snapshot through the history stack. */
  commitDocument: CommitDocumentFn;
  /** Removes a layer. From CreatorContext. */
  removeLayer: (id: string) => void;
  /** Haptic engine. */
  haptic: Haptic;
  /** Toast show function. */
  show: ShowToast;
  /** The active page index (kept in bounds after delete). */
  activePageIndex: number;
  /** Setter for the active page index (from CreatorContext). */
  setActivePageIndex: (index: number) => void;
  /** Setter for the transient selected clip id. */
  setSelectedClipId: (id: string | null) => void;
  /** Setter for the editing layer (for the replace operation). */
  setEditingLayer: (layer: CreatorLayer | null) => void;
  /** Setter for the asset picker mode (for the replace operation). */
  setPickerMode: (mode: AssetPickerMode | null) => void;
  /** The currently selected layer (for speed curve editing). */
  selectedLayer: CreatorLayer | null;
}

export interface UseClipOpsResult {
  handleTrim: (op: TrimOp) => void;
  handleSlip: (op: SlipOp) => void;
  handleSpeed: (op: SpeedOp) => void;
  handleVolume: (op: VolumeOp) => void;
  handleSplit: (op: SplitOp) => void;
  handleDuplicate: (op: DuplicateOp) => void;
  handleDelete: (op: DeleteOp) => void;
  handleReplace: (op: ReplaceOp) => void;
  /** Commits a variable speed curve to the selected media layer. */
  handleSpeedCurveChange: (nextCurve: SpeedCurve) => void;
  /** Toggles `locked` on the media layer owning a clip (any page). */
  toggleClipLock: (clipId: string) => void;
}

// ── Hook ─────────────────────────────────────────────────────────────

export function useClipOps({
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
}: UseClipOpsInput): UseClipOpsResult {
  const handleTrim = useCallback((op: TrimOp) => {
    const clip = timelineClips.find((c) => c.id === op.clipId);
    if (!clip) return;
    // Still-image clips have no source window to trim — their display
    // duration is the page's hold time, not a trim range. The trim
    // handles are only rendered for video clips (ClipThumb gates on
    // mediaType); this guard is the safety net.
    if (clip.mediaType === 'image') return;
    const layer = document.pages
      .flatMap((p) => p.layers)
      .find((l) => l.id === op.clipId);
    if (!layer || layer.type !== 'media') return;
    // The gesture delta arrives in *timeline* ms (px→ms over the
    // clip's wall-clock duration). Source time is consumed at
    // `speed`× that rate — convert once, after snapping/quantizing
    // in timeline space. (Speed-curve clips use the average speed
    // stored on clip.speed — the same approximation the projector
    // uses for duration.)
    const frameMs = 1000 / (document.canvas.fps ?? 30);
    const speed = clip.speed > 0 ? clip.speed : 1;
    const clipIdx = timelineClips.findIndex((c) => c.id === op.clipId);
    // Read the projected start directly — summing clip durations
    // diverges whenever a media-less page with durationMs occupies
    // timeline span.
    const clipStartMs = clip.timelineStartMs ?? 0;
    const edgeStartMs = op.edge === 'end' ? clipStartMs + clip.durationMs : clipStartMs;
    // Frame-quantize the requested drag on the project fps grid.
    let timelineDeltaMs = Math.round(op.deltaMs / frameMs) * frameMs;
    const SNAP_MS = 150;
    const playheadMs = playbackState.currentTimeMs;
    // Snap the edge's timeline position to the playhead.
    if (Math.abs(edgeStartMs + timelineDeltaMs - playheadMs) < SNAP_MS) {
      timelineDeltaMs = playheadMs - edgeStartMs;
    }
    let sourceDeltaMs = timelineDeltaMs * speed;
    // Snap to adjacent clip boundaries — only meaningful when the
    // neighbor shares the same source asset (split siblings), since
    // trim values are source-time, not timeline-time.
    if (op.edge === 'start' && clipIdx > 0) {
      const prevClip = timelineClips[clipIdx - 1];
      if (prevClip.sourceUri === clip.sourceUri
        && Math.abs(clip.trimStartMs + sourceDeltaMs - prevClip.trimEndMs) < SNAP_MS) {
        sourceDeltaMs = prevClip.trimEndMs - clip.trimStartMs;
      }
    }
    if (op.edge === 'end' && clipIdx < timelineClips.length - 1) {
      const nextClip = timelineClips[clipIdx + 1];
      if (nextClip.sourceUri === clip.sourceUri
        && Math.abs(clip.trimEndMs + sourceDeltaMs - nextClip.trimStartMs) < SNAP_MS) {
        sourceDeltaMs = nextClip.trimStartMs - clip.trimEndMs;
      }
    }
    // Route through the pure timeline operation so bounds are
    // validated (MIN_TRIM floor, no negative duration) and
    // durationMs is recomputed consistently.
    const trimmedClips = op.edge === 'start'
      ? trimClipStart(timelineClips, op.clipId, sourceDeltaMs)
      : trimClipEnd(timelineClips, op.clipId, sourceDeltaMs);
    const trimmedClip = trimmedClips.find((c) => c.id === op.clipId);
    if (!trimmedClip) return;
    // Page-indexed write — updateLayer targets activePageIndex,
    // which may point at the playhead's clip rather than the
    // selected one during playback-follow. Trim also changes the
    // page's span, so reflow later pages' absolute overlay ranges.
    const trimPageIndex = clipPageIndices[clipIdx];
    if (trimPageIndex == null) return;
    const trimDoc = updateLayerInPage(document, trimPageIndex, op.clipId, {
      type: 'media',
      payload: {
        ...layer.payload,
        trimStartMs: trimmedClip.trimStartMs,
        trimEndMs: trimmedClip.trimEndMs,
      },
    });
    commitDocument(
      { ...reflowOverlayTimeRanges(document, trimDoc), updatedAt: new Date().toISOString() },
      'Trim clip',
    );
  }, [timelineClips, document, clipPageIndices, playbackState.currentTimeMs, commitDocument]);

  const handleSlip = useCallback((op: SlipOp) => {
    // Slip: shift the source window without changing the clip's
    // wall-clock duration (Premiere slip semantics). Page-aware —
    // the owning page comes from clipPageIndices, and the commit is
    // a single history entry via commitDocument (same pattern as
    // toggleClipLock).
    const clipIdx = timelineClips.findIndex((c) => c.id === op.clipId);
    if (clipIdx < 0) return;
    const clip = timelineClips[clipIdx];
    if (clip.mediaType === 'image') return;
    const slipFrameMs = 1000 / (document.canvas.fps ?? 30);
    const slippedClips = slipClip(
      timelineClips, op.clipId,
      Math.round(op.deltaMs / slipFrameMs) * slipFrameMs,
    );
    const slippedClip = slippedClips.find((c) => c.id === op.clipId);
    if (!slippedClip || slippedClip.trimStartMs === clip.trimStartMs) return;
    const pageIndex = clipPageIndices[clipIdx];
    const layer = document.pages[pageIndex]?.layers.find((l) => l.id === op.clipId);
    if (!layer || layer.type !== 'media') return;
    const doc = updateLayerInPage(document, pageIndex, op.clipId, {
      type: 'media',
      payload: {
        ...layer.payload,
        trimStartMs: slippedClip.trimStartMs,
        trimEndMs: slippedClip.trimEndMs,
      },
    });
    commitDocument({ ...doc, updatedAt: new Date().toISOString() }, 'Slip clip');
    haptic.light();
  }, [timelineClips, document, clipPageIndices, commitDocument, haptic]);

  const handleSpeed = useCallback((op: SpeedOp) => {
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
    if (!speedClip) return;
    const speedClipIdx = timelineClips.findIndex((c) => c.id === op.clipId);
    const speedPageIndex = clipPageIndices[speedClipIdx];
    if (speedPageIndex == null) return;
    const speedDoc = updateLayerInPage(document, speedPageIndex, op.clipId, {
      type: 'media',
      payload: {
        ...layer.payload,
        speed: speedClip.speed,
        speedCurve: undefined,
      },
    });
    commitDocument(
      { ...reflowOverlayTimeRanges(document, speedDoc), updatedAt: new Date().toISOString() },
      'Change speed',
    );
    haptic.light();
  }, [document, timelineClips, clipPageIndices, commitDocument, haptic]);

  const handleVolume = useCallback((op: VolumeOp) => {
    const layer = document.pages
      .flatMap((p) => p.layers)
      .find((l) => l.id === op.clipId);
    if (!layer || layer.type !== 'media') return;
    // Route through the pure timeline operation so the volume is
    // clamped to 0.0–1.0 before persisting. Volume does not affect
    // the clip's wall-clock duration, so durationMs is untouched.
    const volumeClips = setClipVolume(timelineClips, op.clipId, op.volume);
    const volumeClip = volumeClips.find((c) => c.id === op.clipId);
    if (!volumeClip) return;
    const volClipIdx = timelineClips.findIndex((c) => c.id === op.clipId);
    const volPageIndex = clipPageIndices[volClipIdx];
    if (volPageIndex == null) return;
    const volDoc = updateLayerInPage(document, volPageIndex, op.clipId, {
      type: 'media',
      payload: { ...layer.payload, volume: volumeClip.volume },
    });
    commitDocument({ ...volDoc, updatedAt: new Date().toISOString() }, 'Change volume');
    haptic.light();
  }, [document, timelineClips, clipPageIndices, commitDocument, haptic]);

  const handleSplit = useCallback((op: SplitOp) => {
    // Split the clip under the playhead — CapCut grammar resolves
    // the target from the split position, not the selection. Fall
    // back to the selected clip when the playhead sits in a gap.
    const clip = timelineClips.find((c) =>
      op.atMs >= (c.timelineStartMs ?? 0) && op.atMs < (c.timelineStartMs ?? 0) + c.durationMs,
    ) ?? timelineClips.find((c) => c.id === op.clipId);
    if (!clip) return;
    // Only video clips carry a source window that can split.
    if (clip.mediaType === 'image') {
      show('Still images cannot be split', 'info');
      return;
    }

    // The clip's timeline start comes straight from the projection —
    // summing clip durations diverges when a media-less page with
    // durationMs occupies timeline span.
    const clipStartMs = clip.timelineStartMs ?? 0;

    // Quantize the split on the *timeline* frame grid (offset within
    // the clip's wall-clock duration), then map to source time —
    // speed scales source consumption, so the frame grid lives in
    // timeline space.
    const splitFrameMs = 1000 / (document.canvas.fps ?? 30);
    const offsetInClip = Math.round(
      Math.max(0, op.atMs - clipStartMs) / splitFrameMs,
    ) * splitFrameMs;
    const splitPoint = clip.trimStartMs + offsetInClip * clip.speed;

    // Clamp the split point to be safely within the trim range
    const minSplit = clip.trimStartMs + 100; // min 100ms on each side
    const maxSplit = clip.trimEndMs - 100;
    if (splitPoint <= minSplit || splitPoint >= maxSplit) {
      haptic.error();
      show("Can't split here", 'info');
      return;
    }

    // Find the clip's owning page index so we can target it
    // directly instead of relying on activePageIndex (which may
    // point to a different page). This is the root fix for the
    // P0 finding that split silently targeted the wrong page.
    const owningClipIdx = timelineClips.findIndex((c) => c.id === op.clipId);
    if (owningClipIdx < 0) return;
    const owningPageIndex = clipPageIndices[owningClipIdx];
    if (owningPageIndex == null) return;

    // Page-cap guard BEFORE any mutation — without it the split
    // silently degrades into a trim of the first half (the new page
    // insert is skipped but the trim already committed).
    if (document.pages.length >= 10) {
      haptic.error();
      show('Clip limit reached — delete a clip before splitting', 'info');
      return;
    }

    // The page surgery (trim first half, new page for the second,
    // transition migration, duration recompute, keyframe re-anchor,
    // freeze clearing) lives in the pure splitPageClip — one doc
    // mutation committed as ONE history entry, so a single undo
    // restores the pre-split state.
    const splitResult = splitPageClip(
      document,
      owningPageIndex,
      op.clipId,
      splitPoint,
    );
    if (!splitResult) {
      haptic.error();
      show("Can't split here", 'info');
      return;
    }
    commitDocument(
      { ...splitResult.document, updatedAt: new Date().toISOString() },
      'Split clip',
    );

    // Select the new second clip so the user can immediately edit
    // it. Without this, selection stays on the first half.
    setSelectedClipId(splitResult.secondClipLayerId);

    haptic.medium();
  }, [timelineClips, document, clipPageIndices, haptic, show, commitDocument, setSelectedClipId]);

  const handleDuplicate = useCallback((op: DuplicateOp) => {
    if (!op.clipId) return;
    // One media layer per page — duplicating a clip means cloning
    // its owning PAGE (pure duplicateClipPage). Adding a second
    // media layer to the same page would produce an invisible
    // ghost the projector never renders.
    const dupClipIdx = timelineClips.findIndex((c) => c.id === op.clipId);
    const owningPageIndex = clipPageIndices[dupClipIdx];
    if (dupClipIdx < 0 || owningPageIndex == null) return;
    if (document.pages.length >= 10) {
      haptic.error();
      show('Clip limit reached — cannot duplicate', 'info');
      return;
    }
    const dupResult = duplicateClipPage(document, owningPageIndex, op.clipId);
    if (!dupResult) return;
    commitDocument(
      { ...reflowOverlayTimeRanges(document, dupResult.document), updatedAt: new Date().toISOString() },
      'Duplicate clip',
    );
    setSelectedClipId(dupResult.duplicateClipLayerId);
    haptic.light();
  }, [timelineClips, clipPageIndices, document, haptic, show, commitDocument, setSelectedClipId]);

  const handleDelete = useCallback((op: DeleteOp) => {
    if (!op.clipId) return;
    const delClipIdx = timelineClips.findIndex((c) => c.id === op.clipId);
    const owningPageIndex = clipPageIndices[delClipIdx];
    const owningPage = document.pages[owningPageIndex];
    const layer = owningPage?.layers.find((l) => l.id === op.clipId);
    // The clip's media layer IS the page's content — removing only
    // the layer would leave an empty page holding its durationMs as
    // a dead gap in the timeline. Remove the whole page instead.
    const deletedDoc = deleteClipPage(document, owningPageIndex);
    if (owningPage && layer?.type === 'media' && deletedDoc) {
      commitDocument(
        { ...reflowOverlayTimeRanges(document, deletedDoc), updatedAt: new Date().toISOString() },
        'Delete clip',
      );
      // Keep the active page index inside bounds after removal.
      if (activePageIndex >= deletedDoc.pages.length) {
        setActivePageIndex(Math.max(0, deletedDoc.pages.length - 1));
      }
    } else {
      removeLayer(op.clipId);
    }
    setSelectedClipId(null);
  }, [timelineClips, clipPageIndices, document, commitDocument, activePageIndex, setActivePageIndex, removeLayer, setSelectedClipId]);

  const handleReplace = useCallback((op: ReplaceOp) => {
    setEditingLayer(
      document.pages.flatMap((p) => p.layers).find((l) => l.id === op.clipId) ?? null,
    );
    setPickerMode('media');
  }, [document, setEditingLayer, setPickerMode]);

  // ── Speed curve handler ─────────────────────────────────────────────
  // The curve is stored on the media layer's `speedCurve` field. When the
  // user clears the curve (back to constant), the field is removed.
  const handleSpeedCurveChange = useCallback((nextCurve: SpeedCurve) => {
    if (!selectedLayer || selectedLayer.type !== 'media') return;
    // Page-indexed write (updateLayer targets activePageIndex, which may
    // diverge from the clip's page during playback-follow) + overlay
    // reflow since the curve changes the page's wall-clock span.
    const curveClipIdx = timelineClips.findIndex((c) => c.id === selectedLayer.id);
    const curvePageIndex = curveClipIdx >= 0 ? clipPageIndices[curveClipIdx] : undefined;
    if (curvePageIndex == null) return;
    const curveDoc = updateLayerInPage(document, curvePageIndex, selectedLayer.id, {
      type: 'media',
      // Keep `speed` in sync with the curve's average so consumers that
      // read the constant field directly (viewers, fallbacks) agree with
      // the projected duration the curve produces.
      payload: {
        ...selectedLayer.payload,
        speedCurve: nextCurve,
        speed: averageSpeed(nextCurve),
      },
    });
    commitDocument(
      { ...reflowOverlayTimeRanges(document, curveDoc), updatedAt: new Date().toISOString() },
      'Edit speed curve',
    );
  }, [selectedLayer, timelineClips, clipPageIndices, document, commitDocument]);

  // ── Clip lock toggle ────────────────────────────────────────────────
  // `toggleLayerLock` in the context only targets the active page; a
  // timeline clip can live on any page, so resolve the owning page via
  // clipPageIndices and commit through the document for a single history
  // entry.
  const toggleClipLock = useCallback(
    (clipId: string) => {
      const clipIdx = timelineClips.findIndex((c) => c.id === clipId);
      if (clipIdx < 0) return;
      const pageIndex = clipPageIndices[clipIdx];
      const layer = document.pages[pageIndex]?.layers.find((l) => l.id === clipId);
      if (!layer) return;
      const doc = updateLayerInPage(document, pageIndex, clipId, { locked: !layer.locked });
      commitDocument({ ...doc, updatedAt: new Date().toISOString() }, layer.locked ? 'Unlock clip' : 'Lock clip');
      haptic.medium();
    },
    [timelineClips, clipPageIndices, document, commitDocument, haptic],
  );

  return {
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
  };
}
