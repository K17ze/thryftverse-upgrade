// ───────────────────────────────────────────────────────────────────────────
// TimelineDocOps — pure document-level timeline mutations.
//
// The page model stores one clip per page (the projector renders only the
// first visible media layer on each page), so clip-level operations —
// split, duplicate, delete — must perform page surgery on the document.
// These functions encapsulate that surgery so it is unit-testable without
// hook plumbing, and so the owning-page mapping lives in exactly one place.
//
// Invariants each op preserves:
//   - one media layer per page (no invisible ghost clips)
//   - page.durationMs tracks the clip's speed-adjusted wall-clock length
//   - transitionId sits on the boundary AFTER a page — a split moves it
//     to the new second-half page, not the trimmed first half
//   - keyframe timeMs is clip-relative — second-half keyframes are
//     re-anchored by the split offset
//   - a freeze offset inside the discarded first half is cleared on the
//     second half
//
// Every function is immutable and returns `null` on invalid input rather
// than producing a corrupt document.
// ───────────────────────────────────────────────────────────────────────────

import type { CreatorDocument, CreatorLayer, CreatorPage } from '../../core/projectStore/composition';
import { updateLayerInPage } from '../../core/projectStore/composition';
import type { SpeedCurve, SpeedPoint } from '../speedcurves/SpeedCurveTypes';
import { averageSpeed, sampleSpeedAtPosition, clampSpeed } from '../speedcurves/SpeedCurveTypes';

type MediaLayer = Extract<CreatorLayer, { type: 'media' }>;
type MediaPayload = MediaLayer['payload'];

/** Generate a unique id — same strategy as TimelineOperations. */
function generateId(prefix: string): string {
  let uuid: string;
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      uuid = crypto.randomUUID();
    } else {
      uuid = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    }
  } catch {
    uuid = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
  return `${prefix}_${uuid}`;
}

/** Wall-clock speed of a media payload: curve average or constant speed. */
function effectiveSpeed(payload: MediaPayload): number {
  if (payload.speedCurve) {
    const avg = averageSpeed(payload.speedCurve as SpeedCurve);
    if (avg > 0 && Number.isFinite(avg)) return avg;
  }
  const speed = payload.speed ?? 1;
  return speed > 0 ? speed : 1;
}

/** Find the media layer on a page by id. */
function findMediaLayer(
  page: CreatorPage | undefined,
  layerId: string,
): MediaLayer | null {
  const layer = page?.layers.find((l) => l.id === layerId);
  return layer?.type === 'media' ? layer : null;
}

/**
 * Slice a normalized-domain speed curve into the [from, to] window and
 * rescale it back to [0,1]. A boundary point is inserted at each end with
 * the curve's interpolated speed so the segment replays faithfully.
 */
function sliceSpeedCurve(curve: SpeedCurve, from: number, to: number): SpeedCurve {
  const span = to - from;
  const rescale = (pos: number) => Math.min(1, Math.max(0, (pos - from) / span));
  const points: SpeedPoint[] = [
    { id: 'p_start', position: 0, speed: clampSpeed(sampleSpeedAtPosition(curve, from)) },
    ...curve.points
      .filter((pt) => pt.position > from && pt.position < to)
      .map((pt) => ({ ...pt, position: rescale(pt.position) })),
    { id: 'p_end', position: 1, speed: clampSpeed(sampleSpeedAtPosition(curve, to)) },
  ];
  return { points, easing: curve.easing };
}

export interface DocSplitResult {
  document: CreatorDocument;
  /** Layer id of the new second-half clip. */
  secondClipLayerId: string;
  /** Page id of the inserted second-half page. */
  newPageId: string;
}

/**
 * Split the clip on `pageIndex` at `splitAtSourceMs` (source-media time).
 *
 * The owning page's media layer is trimmed to [trimStart, splitAt) and a
 * new page holding the second half [splitAt, trimEnd) is inserted
 * immediately after. The page's transitionId moves to the new page (it
 * marks the boundary after the original clip). Page durations are
 * recomputed to each half's speed-adjusted wall-clock length.
 *
 * Returns null when the page/layer is missing, not media, or the split
 * point is outside the trim window. Callers must guard the page cap
 * before calling.
 */
export function splitPageClip(
  doc: CreatorDocument,
  pageIndex: number,
  layerId: string,
  splitAtSourceMs: number,
): DocSplitResult | null {
  const page = doc.pages[pageIndex];
  const layer = findMediaLayer(page, layerId);
  if (!page || !layer) return null;

  const trimStart = layer.payload.trimStartMs ?? 0;
  const trimEnd = layer.payload.trimEndMs ?? layer.payload.videoDurationMs ?? 0;
  if (splitAtSourceMs <= trimStart || splitAtSourceMs >= trimEnd) return null;

  const offsetInClip = splitAtSourceMs - trimStart;
  const speed = effectiveSpeed(layer.payload);
  // Keyframes and freeze offsets are authored in clip-relative
  // WALL-CLOCK ms (keyframe timeMs counts against page.durationMs, the
  // speed-adjusted length), so the split boundary in their units is the
  // source offset divided by the effective speed — not the raw source
  // delta. For speed-curve clips this uses the curve average, matching
  // how the projector maps wall-clock duration.
  const offsetWallMs = offsetInClip / speed;

  // Partition keyframes: the first half keeps keyframes at or before the
  // boundary (stale tail data would resurface if the clip is re-extended);
  // the second half keeps keyframes after it, re-anchored to zero.
  const firstKeyframes = layer.keyframes?.filter((kf) => kf.timeMs <= offsetWallMs);
  const secondKeyframes = layer.keyframes
    ?.filter((kf) => kf.timeMs > offsetWallMs)
    .map((kf) => ({ ...kf, timeMs: kf.timeMs - offsetWallMs }));

  // Slice the speed curve at the normalized split position so each half
  // replays only its own segment rescaled to [0,1] — copying the whole
  // curve onto both halves would replay the entire ramp twice.
  const curve = layer.payload.speedCurve as SpeedCurve | undefined;
  const splitNorm = (trimEnd - trimStart) > 0
    ? Math.min(1, Math.max(0, offsetInClip / (trimEnd - trimStart)))
    : 0;
  const firstCurve = curve ? sliceSpeedCurve(curve, 0, splitNorm) : undefined;
  const secondCurve = curve ? sliceSpeedCurve(curve, splitNorm, 1) : undefined;

  const secondClipLayerId = generateId('clip');
  const secondLayer: CreatorLayer = {
    ...layer,
    id: secondClipLayerId,
    zIndex: 0, // new page, fresh z-stack
    keyframes: secondKeyframes && secondKeyframes.length > 0
      ? secondKeyframes
      : undefined,
    payload: {
      ...layer.payload,
      trimStartMs: splitAtSourceMs,
      trimEndMs: trimEnd,
      speedCurve: secondCurve,
      // A freeze offset inside the discarded first half is meaningless
      // on the second half. freezeFrameMs is clip-start-relative
      // wall-clock ms (see FreezeFramePicker), so compare against the
      // wall-clock boundary, not the source offset.
      freezeFrameMs:
        layer.payload.freezeFrameMs != null && layer.payload.freezeFrameMs > offsetWallMs
          ? layer.payload.freezeFrameMs - offsetWallMs
          : undefined,
      // The second half starts mid-clip — an authored fade-in would
      // produce an audible dip at the cut.
      fadeInMs: 0,
      // Clear the thumbnail so it regenerates for the new clip.
      thumbnailUri: undefined,
    },
  };

  const newPageId = generateId('page');
  const newPage: CreatorPage = {
    id: newPageId,
    layers: [secondLayer],
    durationMs: Math.max(100, (trimEnd - splitAtSourceMs) / speed),
    transitionId: page.transitionId,
  };

  let next = updateLayerInPage(doc, pageIndex, layerId, {
    type: 'media',
    keyframes: firstKeyframes && firstKeyframes.length > 0
      ? firstKeyframes
      : undefined,
    payload: {
      ...layer.payload,
      trimEndMs: splitAtSourceMs,
      speedCurve: firstCurve,
      // The first half now ends mid-clip — an authored fade-out would
      // produce an audible dip at the cut.
      fadeOutMs: 0,
    },
  });
  // Overlays on the split page keep absolute timeRanges — clamp any that
  // spanned past the first half's new end so the strip doesn't float a
  // bar outside the page it is bounded by.
  const firstSpanMs = Math.max(100, (splitAtSourceMs - trimStart) / speed);
  const pageStartMs = doc.pages
    .slice(0, pageIndex)
    .reduce((acc, p) => acc + (p.durationMs ?? 0), 0);
  const firstPage = next.pages[pageIndex];
  if (firstPage) {
    next = {
      ...next,
      pages: next.pages.map((p, i) =>
        i !== pageIndex
          ? p
          : {
              ...p,
              layers: p.layers.map((l) =>
                l.type !== 'media' && l.timeRange && l.timeRange.endMs > pageStartMs + firstSpanMs
                  ? { ...l, timeRange: { startMs: l.timeRange.startMs, endMs: pageStartMs + firstSpanMs } }
                  : l,
              ),
            },
      ),
    };
  }
  const pages = [...next.pages];
  pages[pageIndex] = {
    ...pages[pageIndex],
    durationMs: Math.max(100, (splitAtSourceMs - trimStart) / speed),
    transitionId: undefined,
  };
  pages.splice(pageIndex + 1, 0, newPage);
  next = { ...next, pages };

  return { document: next, secondClipLayerId, newPageId };
}

export interface DocDuplicateResult {
  document: CreatorDocument;
  /** Layer id of the duplicated clip's media layer. */
  duplicateClipLayerId: string;
  /** Page id of the cloned page. */
  newPageId: string;
}

/**
 * Duplicate the clip on `pageIndex` by cloning the whole page.
 *
 * One media layer per page means duplicating a clip is a page clone —
 * adding a second media layer to the same page would produce an
 * invisible ghost the projector never renders. Every layer on the page
 * gets a fresh id so the clone shares no identity with the source.
 *
 * `idSuffix` disambiguates non-clip layer ids deterministically (the
 * hook passes a timestamp; tests can pass a fixed string).
 */
export function duplicateClipPage(
  doc: CreatorDocument,
  pageIndex: number,
  clipLayerId: string,
  idSuffix: string = Date.now().toString(36),
): DocDuplicateResult | null {
  const page = doc.pages[pageIndex];
  const layer = findMediaLayer(page, clipLayerId);
  if (!page || !layer) return null;

  const duplicateClipLayerId = generateId('clip');
  // The clone lands immediately after the source page, so its absolute
  // overlay timeRanges shift by the source page's wall-clock span, and
  // clipId anchors re-point at the duplicated clip (not the original).
  const pageSpanMs = page.durationMs
    ?? ((layer.payload.trimEndMs ?? layer.payload.videoDurationMs ?? 0) - (layer.payload.trimStartMs ?? 0))
      / effectiveSpeed(layer.payload);
  const clonedLayers = page.layers.map((l) => ({
    ...l,
    id: l.id === clipLayerId ? duplicateClipLayerId : `${l.id}_dup_${idSuffix}`,
    clipId: l.clipId === clipLayerId ? duplicateClipLayerId : l.clipId,
    timeRange: l.timeRange
      ? { startMs: l.timeRange.startMs + pageSpanMs, endMs: l.timeRange.endMs + pageSpanMs }
      : l.timeRange,
  }));
  const newPageId = generateId('page');
  const newPage: CreatorPage = {
    ...page,
    id: newPageId,
    layers: clonedLayers,
  };

  const pages = [...doc.pages];
  pages.splice(pageIndex + 1, 0, newPage);
  return {
    document: { ...doc, pages },
    duplicateClipLayerId,
    newPageId,
  };
}

/**
 * Delete the clip on `pageIndex` by removing its owning page.
 *
 * The clip's media layer IS the page's content — removing only the
 * layer would leave an empty page holding its durationMs as a dead gap
 * in the timeline. Refuses to remove the last page (a document requires
 * at least one page — the caller falls back to a layer-only delete).
 */
export function deleteClipPage(
  doc: CreatorDocument,
  pageIndex: number,
): CreatorDocument | null {
  if (doc.pages.length <= 1) return null;
  const page = doc.pages[pageIndex];
  if (!page) return null;
  return {
    ...doc,
    pages: doc.pages.filter((_, i) => i !== pageIndex),
  };
}

/**
 * Reflow absolute overlay timeRanges after a structural edit.
 *
 * `layer.timeRange` is stored in ABSOLUTE timeline ms (the projector and
 * OverlayTrack both read it verbatim). Any op that shifts a page's
 * timeline window — trim, speed change, delete, reorder — leaves stored
 * ranges pointing at their old absolute positions, so overlays would
 * render outside their page's active window while the strip bar floats
 * at the stale spot. For every page present in both documents (matched
 * by page id), shift each non-media layer's stored range by that page's
 * start delta. Newly inserted pages (split/duplicate) are skipped — the
 * ops themselves place their layers.
 *
 * Layers without a stored timeRange need no shift: the strip derives
 * their default range from the owning page/clip anchor each projection.
 */
export function reflowOverlayTimeRanges(
  prev: CreatorDocument,
  next: CreatorDocument,
): CreatorDocument {
  const spanOf = (p: CreatorPage) => {
    const media = p.layers.find((l) => l.type === 'media');
    if (media && media.type === 'media') {
      const trimEnd = media.payload.trimEndMs ?? media.payload.videoDurationMs ?? 0;
      const trimStart = media.payload.trimStartMs ?? 0;
      const dur = (trimEnd - trimStart) / effectiveSpeed(media.payload);
      if (dur > 0) return dur;
    }
    return p.durationMs ?? 0;
  };
  const startById = (doc: CreatorDocument) => {
    const map = new Map<string, number>();
    let acc = 0;
    for (const p of doc.pages) {
      map.set(p.id, acc);
      acc += spanOf(p);
    }
    return map;
  };
  const prevStarts = startById(prev);
  const nextStarts = startById(next);
  let changed = false;
  const pages = next.pages.map((p) => {
    const prevStart = prevStarts.get(p.id);
    const nextStart = nextStarts.get(p.id);
    if (prevStart == null || nextStart == null || prevStart === nextStart) return p;
    const delta = nextStart - prevStart;
    let layerChanged = false;
    const layers = p.layers.map((l) => {
      if (l.type === 'media' || !l.timeRange) return l;
      layerChanged = true;
      return {
        ...l,
        timeRange: { startMs: l.timeRange.startMs + delta, endMs: l.timeRange.endMs + delta },
      };
    });
    if (!layerChanged) return p;
    changed = true;
    return { ...p, layers };
  });
  return changed ? { ...next, pages } : next;
}
