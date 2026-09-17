import type { CreatorDocument, CreatorLayer } from '../../core/projectStore/composition';
import {
  POSTER_DEFAULT_ASPECT_RATIO,
  POSTER_DEFAULT_BACKGROUND,
} from '../../core/projectStore/composition';
import type { CreatorInitialMedia } from '../../../navigation/types';
import { createStableId, makeStableId } from '../../../utils/createStableId';

export interface CreateMediaLayerOptions {
  /** Reuse an existing layer id (e.g. when replacing frame media). */
  id?: string;
  zIndex?: number;
  width?: number;
  height?: number;
  contentFit?: 'cover' | 'contain' | 'fill';
  /** Carry capture-time metadata (speed multiplier, camera effect) onto the
      payload so the timeline/export engine can reproduce the capture. */
  preserveCaptureMeta?: boolean;
  /** Sequential timeline window for multi-clip compositions. */
  timeRange?: { startMs: number; endMs: number };
}

/**
 * Builds a media layer in the canonical centered, full-bleed default pose.
 * Shared by entry seeding, poster frame methods and clip compositions so the
 * layer shape (defaults, payload, capture metadata) has a single source.
 */
export function createMediaLayer(
  media: Pick<CreatorInitialMedia, 'uri' | 'kind' | 'durationMs' | 'speed' | 'cameraEffect'>,
  options: CreateMediaLayerOptions = {},
): CreatorLayer {
  return {
    id: options.id ?? createStableId('media'),
    type: 'media',
    x: 0.5,
    y: 0.5,
    width: options.width ?? 1,
    height: options.height ?? 1,
    scale: 1,
    rotation: 0,
    zIndex: options.zIndex ?? 0,
    locked: false,
    hidden: false,
    opacity: 1,
    ...(options.timeRange ? { timeRange: options.timeRange } : {}),
    payload: {
      mediaUri: media.uri,
      mediaType: media.kind,
      contentFit: options.contentFit ?? 'cover',
      videoDurationMs: media.kind === 'video' ? media.durationMs : undefined,
      opacity: 1,
      ...(options.preserveCaptureMeta && media.speed ? { speed: media.speed } : {}),
      ...(options.preserveCaptureMeta && media.cameraEffect ? {
        effects: [{ type: 'filter' as const, id: media.cameraEffect, amount: 1 }],
      } : {}),
    },
  };
}

export interface LookProductParams {
  listingId: string;
  snapshotTitle: string;
  snapshotImageUrl?: string;
  snapshotPriceGbp?: number;
  x?: number;
  y?: number;
}

/** Builds a Look product-tag layer at the requested (or centered) position. */
export function createLookProductLayer(params: LookProductParams, zIndex: number): CreatorLayer {
  return {
    id: createStableId('product'),
    type: 'product',
    x: params.x ?? 0.5,
    y: params.y ?? 0.5,
    width: 0.08,
    height: 0.08,
    scale: 1,
    rotation: 0,
    zIndex,
    locked: false,
    hidden: false,
    opacity: 1,
    payload: {
      listingId: params.listingId,
      snapshotTitle: params.snapshotTitle,
      snapshotImageUrl: params.snapshotImageUrl,
      snapshotPriceGbp: params.snapshotPriceGbp,
      availability: 'active',
      hotspotLabel: params.snapshotTitle,
    },
  };
}

/**
 * Builds a poster composition document from a set of captured clips. Each
 * clip becomes a sequential timeline media layer on a single page; the page
 * duration is the sum of all clip durations.
 */
export function buildClipComposition(clips: CreatorInitialMedia[]): CreatorDocument {
  // Default clip duration: 5s for images, actual duration for video.
  const IMAGE_CLIP_DURATION_MS = 5000;
  let cumulativeMs = 0;

  const layers: CreatorLayer[] = clips.map((clip, i) => {
    const durationMs = clip.kind === 'video'
      ? (clip.durationMs ?? IMAGE_CLIP_DURATION_MS)
      : IMAGE_CLIP_DURATION_MS;
    const startMs = cumulativeMs;
    const endMs = cumulativeMs + durationMs;
    cumulativeMs = endMs;

    return createMediaLayer(clip, {
      zIndex: i,
      timeRange: { startMs, endMs },
      preserveCaptureMeta: true,
    });
  });

  const doc: CreatorDocument = {
    id: makeStableId('doc'),
    type: 'poster',
    version: 1,
    canvas: {
      aspectRatio: POSTER_DEFAULT_ASPECT_RATIO,
      background: { type: 'color', value: POSTER_DEFAULT_BACKGROUND },
    },
    pages: [{
      id: 'page_1',
      durationMs: cumulativeMs,
      layers,
    }],
    metadata: {
      caption: '',
      title: '',
      visibility: 'public',
      allowReplies: true,
      allowReactions: true,
      expiresInHours: 24,
      allowRemix: false,
    },
    updatedAt: new Date().toISOString(),
  };

  return doc;
}
