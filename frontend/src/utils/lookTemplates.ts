import { AspectRatio } from '../theme/designTokens';
import { isVideoUri } from './media';
import type { LookApiItem } from '../services/looksApi';

// ── Template set ─────────────────────────────────────────────────────────────
// A deterministic template set drives the mixed-tile Explore canvas with
// TRUE masonry rhythm — varying heights so columns stagger naturally
// like Pinterest/Instagram explore, not a uniform grid.
//
//   1×1 standard        — default image look (span 1, 4:5)
//   1×1 portrait        — tall portrait look (span 1, 3:4)
//   1×1 square          — compact square look (span 1, 1:1)
//   2×1 cinematic        — video or multi-layer collage (span 2, 16:9)
//   2×2 editorial anchor — rare, every 8th item (span 2, 4:5)
//
// The height variation between standard/portrait/square is what creates the
// masonry staggering. Assignment is deterministic from index — no randomness.

const EDITORIAL_ANCHOR_INTERVAL = 8;

// Deterministic height rhythm: a 7-step cycle that creates organic masonry
// staggering without visible pattern repetition. Prime-length cycles avoid
// the "every 4th item looks the same" tell.
//
// Per Instagram Explore 2026 research: portrait/vertical ratios dominate
// ~70-80% of discovery grids. This rhythm is weighted toward portrait and
// marketplace (4:5) ratios, with occasional square for compactness and
// rare landscape for visual variety. The mix creates true Pinterest-style
// column stagger while reflecting the vertical-content dominance of 2026.
const HEIGHT_RHYTHM: number[] = [
  AspectRatio.portrait,    // 3:4 — tall
  AspectRatio.marketplace, // 4:5 — standard
  AspectRatio.portrait,    // 3:4 — tall
  AspectRatio.square,      // 1:1 — compact
  AspectRatio.marketplace, // 4:5 — standard
  AspectRatio.portrait,    // 3:4 — tall
  AspectRatio.marketplace, // 4:5 — standard
];

export interface LookTemplate {
  /** Column span (1 or 2). Consumed by overrideItemLayout. */
  span: 1 | 2;
  /** Media aspect ratio (width / height) applied to the tile image. */
  aspect: number;
  /** Semantic template id — drives overlay cues. */
  kind: 'standard' | 'portrait' | 'square' | 'cinematic' | 'editorial';
}

/**
 * Resolve a look's tile template for the masonry grid.
 *
 * Editorial anchors (span 2) appear every 8th item for visual rhythm.
 * Video and multi-layer collage looks get cinematic (span 2, 16:9).
 * All other looks get 1×1 tiles with deterministic height variation
 * from the 7-step HEIGHT_RHYTHM cycle.
 *
 * When `maxSpan` is provided (e.g. for 3-column grids where span-2
 * is the maximum), editorial/cinematic tiles are clamped to that span.
 */
export function resolveLookTemplate(
  look: LookApiItem,
  index: number,
  maxSpan: 1 | 2 = 2,
): LookTemplate {
  // 2×2 editorial anchor — rare, at a controlled interval.
  if (maxSpan >= 2 && index > 0 && index % EDITORIAL_ANCHOR_INTERVAL === 0) {
    return { span: 2, aspect: AspectRatio.marketplace, kind: 'editorial' };
  }

  // 2×1 cinematic — video or multi-layer collage looks get a wide feature.
  const isVideo = look.mediaType === 'video' || isVideoUri(look.mediaUrl);
  const isMultiLayer = look.compositionDocument != null;
  if (maxSpan >= 2 && (isVideo || isMultiLayer)) {
    return { span: 2, aspect: AspectRatio.wide, kind: 'cinematic' };
  }

  // 1×1 tiles with deterministic height variation for true masonry rhythm.
  // The cycle creates visual stagger between columns without randomness.
  const aspect = HEIGHT_RHYTHM[index % HEIGHT_RHYTHM.length];
  if (aspect === AspectRatio.portrait) {
    return { span: 1, aspect, kind: 'portrait' };
  }
  if (aspect === AspectRatio.square) {
    return { span: 1, aspect, kind: 'square' };
  }
  return { span: 1, aspect, kind: 'standard' };
}

/**
 * Detect whether a look is a carousel (has multiple media entries).
 */
export function isLookCarousel(look: LookApiItem): boolean {
  return !!(look.mediaUrls && look.mediaUrls.length > 1);
}

/**
 * Detect whether a look's primary media is video.
 */
export function isLookVideo(look: LookApiItem): boolean {
  return look.mediaType === 'video' || isVideoUri(look.mediaUrl);
}

/**
 * Detect whether a look is a multi-layer collage composition.
 */
export function isLookMultiLayer(look: LookApiItem): boolean {
  return look.compositionDocument != null;
}
