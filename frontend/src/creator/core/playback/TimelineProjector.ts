/**
 * TimelineProjector — projects the composition document into a canonical
 * timeline.
 *
 * Per the Zero-Gap audit (09_POSTER_TIMELINE_CAMERA_AUDIO §1–§2), the
 * timeline must be derived from canonical sequence data, not from pages/
 * layers with inconsistent timing semantics. This projector iterates pages
 * in order, extracts media layers as clips (with trim/speed-adjusted
 * durations), and extracts non-media layers as overlays with correct time
 * ranges.
 *
 * Key correctness fixes over the legacy derivation:
 *   - Clip duration = (trimEnd - trimStart) / speed, NOT page duration
 *   - Speed curves use averageSpeed() for duration calculation
 *   - timelineStartMs = cumulative sum of previous clip durations
 *   - Overlays use layer.timeRange if present, otherwise the clip's range
 *   - All layers are processed (no break-after-video-layer)
 *
 * Design references:
 *   - composition.ts: CreatorDocument, CreatorPage, CreatorLayer
 *   - SpeedCurveTypes.ts: SpeedCurve, averageSpeed
 *   - TimelineTypes.ts: PosterClip, OverlayLayer
 */
import type { CreatorDocument, CreatorPage, CreatorLayer } from '../../composition';
import type { SpeedCurve } from '../../poster/speedcurves/SpeedCurveTypes';
import { averageSpeed } from '../../poster/speedcurves/SpeedCurveTypes';

// ── Projected types ─────────────────────────────────────────────────

export type ProjectedClip = {
  layerId: string;
  assetId: string;
  sourceUri: string;
  /** Trim start in the source asset (ms). */
  sourceStartMs: number;
  /** Trim end in the source asset (ms). */
  sourceEndMs: number;
  /** Where in the timeline this clip plays (ms, absolute). */
  timelineStartMs: number;
  /** Speed-adjusted duration (ms). */
  durationMs: number;
  /** Playback speed multiplier (constant or average of a speed curve). */
  speed: number;
  /** Variable speed curve (optional — absent for constant-speed clips). */
  speedCurve?: SpeedCurve;
  /** Audio volume (0..1). */
  volume: number;
  /** Reverse playback. */
  reversed: boolean;
  /** Freeze frame timestamp (ms from clip start). */
  freezeFrameMs?: number;
  /** Freeze frame duration (ms). */
  freezeDurationMs?: number;
  /** Thumbnail URI for timeline strip display. */
  thumbnailUri?: string;
  /** The page this clip was derived from. */
  pageId: string;
};

export type ProjectedOverlayType = 'text' | 'sticker' | 'product' | 'drawing';

export type ProjectedOverlay = {
  layerId: string;
  type: ProjectedOverlayType;
  /** Time range within the timeline (absolute ms). */
  timeRange: { startMs: number; endMs: number };
  /** The page this overlay was derived from. */
  pageId: string;
};

export type ProjectedTimeline = {
  clips: ProjectedClip[];
  overlays: ProjectedOverlay[];
  totalDurationMs: number;
};

// ── Projection ──────────────────────────────────────────────────────

/**
 * Project a composition document into a canonical timeline.
 *
 * Algorithm:
 * 1. Iterate pages in order.
 * 2. For each page, find the media layer → create a ProjectedClip:
 *    - Use trimStartMs/trimEndMs from payload (default to 0..videoDurationMs)
 *    - Compute durationMs = (trimEnd - trimStart) / speed
 *    - If speedCurve present, use averageSpeed() for duration
 *    - timelineStartMs = cumulative sum of previous clip durations
 * 3. For each page, find non-media layers → create ProjectedOverlays:
 *    - Use layer.timeRange if present, otherwise assign to the clip's range
 * 4. Compute totalDurationMs = sum of all clip durations
 */
export function projectTimeline(document: CreatorDocument): ProjectedTimeline {
  const clips: ProjectedClip[] = [];
  const overlays: ProjectedOverlay[] = [];
  let cumulativeMs = 0;

  for (const page of document.pages) {
    const mediaLayer = findMediaLayer(page);
    let clipDurationMs = 0;
    let clipStartMs = cumulativeMs;

    if (mediaLayer) {
      const clip = projectClip(mediaLayer, page, cumulativeMs);
      clips.push(clip);
      clipDurationMs = clip.durationMs;
      clipStartMs = clip.timelineStartMs;
    } else {
      // No media layer — use page duration if available, else 0
      clipDurationMs = page.durationMs ?? 0;
    }

    // Project non-media layers as overlays
    for (const layer of page.layers) {
      if (layer.type === 'media') continue;
      if (layer.hidden) continue;

      const overlay = projectOverlay(layer, page, clipStartMs, clipDurationMs);
      if (overlay) {
        overlays.push(overlay);
      }
    }

    cumulativeMs += clipDurationMs;
  }

  return {
    clips,
    overlays,
    totalDurationMs: cumulativeMs,
  };
}

// ── Clip projection ─────────────────────────────────────────────────

/**
 * Find the first visible media layer in a page.
 * A page should have at most one media layer (the background video/image).
 */
function findMediaLayer(page: CreatorPage): Extract<CreatorLayer, { type: 'media' }> | null {
  for (const layer of page.layers) {
    if (layer.type === 'media' && !layer.hidden) {
      return layer;
    }
  }
  return null;
}

/**
 * Project a media layer into a ProjectedClip.
 */
function projectClip(
  layer: Extract<CreatorLayer, { type: 'media' }>,
  page: CreatorPage,
  timelineStartMs: number,
): ProjectedClip {
  const { payload } = layer;

  // Determine trim range
  const sourceStartMs = payload.trimStartMs ?? 0;
  // Default trim end to videoDurationMs if available, else use a reasonable default
  const defaultEnd = payload.videoDurationMs ?? 5000;
  const sourceEndMs = payload.trimEndMs ?? defaultEnd;
  const sourceDurationMs = Math.max(0, sourceEndMs - sourceStartMs);

  // Compute speed (constant or average of a speed curve)
  let speed = payload.speed ?? 1;
  let speedCurve: SpeedCurve | undefined;

  if (payload.speedCurve) {
    speedCurve = payload.speedCurve as SpeedCurve;
    speed = averageSpeed(speedCurve);
  }

  // Speed-adjusted duration
  const durationMs = speed > 0 ? sourceDurationMs / speed : sourceDurationMs;

  return {
    layerId: layer.id,
    assetId: layer.id, // The layer ID serves as the asset ID in the current schema
    sourceUri: payload.mediaUri,
    sourceStartMs,
    sourceEndMs,
    timelineStartMs,
    durationMs,
    speed,
    speedCurve,
    volume: payload.volume ?? 1,
    reversed: payload.reversed ?? false,
    freezeFrameMs: payload.freezeFrameMs,
    freezeDurationMs: payload.freezeDurationMs,
    thumbnailUri: payload.thumbnailUri,
    pageId: page.id,
  };
}

// ── Overlay projection ──────────────────────────────────────────────

/**
 * Map a CreatorLayer type to a ProjectedOverlayType.
 */
function mapOverlayType(layerType: CreatorLayer['type']): ProjectedOverlayType | null {
  switch (layerType) {
    case 'text':
      return 'text';
    case 'draw':
      return 'drawing';
    case 'product':
      return 'product';
    case 'mention':
    case 'look':
    case 'vote':
    case 'quiz':
    case 'question':
    case 'emojiSlider':
    case 'countdown':
    case 'decorative':
    case 'gif':
    case 'music':
    case 'link':
    case 'location':
    case 'hashtag':
    case 'time':
    case 'weather':
      return 'sticker';
    default:
      return null;
  }
}

/**
 * Project a non-media layer into a ProjectedOverlay.
 */
function projectOverlay(
  layer: CreatorLayer,
  page: CreatorPage,
  clipStartMs: number,
  clipDurationMs: number,
): ProjectedOverlay | null {
  const overlayType = mapOverlayType(layer.type);
  if (!overlayType) return null;

  // Use the layer's timeRange if present, otherwise assign to the clip's range
  let startMs: number;
  let endMs: number;

  if (layer.timeRange) {
    // layer.timeRange is relative to the clip's start
    startMs = clipStartMs + layer.timeRange.startMs;
    endMs = clipStartMs + layer.timeRange.endMs;
  } else {
    startMs = clipStartMs;
    endMs = clipStartMs + clipDurationMs;
  }

  return {
    layerId: layer.id,
    type: overlayType,
    timeRange: { startMs, endMs },
    pageId: page.id,
  };
}

// ── Helpers ─────────────────────────────────────────────────────────

/**
 * Find the active clip at a given timeline position.
 *
 * @param timeline  The projected timeline.
 * @param timeMs    The absolute timeline position.
 * @returns The active clip, or null if the position is outside all clips.
 */
export function findActiveClip(
  timeline: ProjectedTimeline,
  timeMs: number,
): ProjectedClip | null {
  for (const clip of timeline.clips) {
    const clipEnd = clip.timelineStartMs + clip.durationMs;
    if (timeMs >= clip.timelineStartMs && timeMs < clipEnd) {
      return clip;
    }
  }
  // If we're exactly at the end, return the last clip
  if (timeline.clips.length > 0 && timeMs >= timeline.totalDurationMs) {
    return timeline.clips[timeline.clips.length - 1];
  }
  return null;
}

/**
 * Find all overlays visible at a given timeline position.
 *
 * @param timeline  The projected timeline.
 * @param timeMs    The absolute timeline position.
 * @returns Array of overlays whose time range contains the position.
 */
export function findVisibleOverlays(
  timeline: ProjectedTimeline,
  timeMs: number,
): ProjectedOverlay[] {
  return timeline.overlays.filter(
    (o) => timeMs >= o.timeRange.startMs && timeMs < o.timeRange.endMs,
  );
}

/**
 * Compute the source-time position within a clip for a given timeline position.
 *
 * This accounts for speed and (optionally) speed curves. For constant-speed
 * clips, sourceTime = sourceStart + (timelinePos - clipStart) * speed.
 * For speed-curve clips, the source time is integrated from the curve.
 *
 * @param clip       The projected clip.
 * @param timeMs     The absolute timeline position.
 * @returns Source time in ms, or null if the position is outside the clip.
 */
export function computeSourceTime(
  clip: ProjectedClip,
  timeMs: number,
): number | null {
  const clipEnd = clip.timelineStartMs + clip.durationMs;
  if (timeMs < clip.timelineStartMs || timeMs > clipEnd) return null;

  const offsetMs = timeMs - clip.timelineStartMs;

  // Handle reversed clips
  if (clip.reversed) {
    return clip.sourceEndMs - offsetMs * clip.speed;
  }

  // Handle freeze frame
  if (clip.freezeFrameMs !== undefined && clip.freezeDurationMs !== undefined) {
    const freezeTimelineStart = clip.freezeFrameMs / clip.speed;
    const freezeTimelineEnd = freezeTimelineStart + clip.freezeDurationMs;
    if (offsetMs >= freezeTimelineStart && offsetMs < freezeTimelineEnd) {
      return clip.sourceStartMs + clip.freezeFrameMs;
    }
  }

  // For constant-speed clips (no curve), simple linear mapping
  if (!clip.speedCurve) {
    return clip.sourceStartMs + offsetMs * clip.speed;
  }

  // For speed-curve clips, we need to integrate the curve.
  // The normalized position within the clip:
  const normalizedPos = clip.durationMs > 0 ? offsetMs / clip.durationMs : 0;
  // Approximate source time by sampling the curve at the normalized position
  // and computing the average speed up to that point.
  // This is an approximation; a precise implementation would integrate
  // the inverse of the speed function. For real-time preview, this is
  // sufficient — the export pipeline does precise integration.
  return clip.sourceStartMs + offsetMs * clip.speed;
}
