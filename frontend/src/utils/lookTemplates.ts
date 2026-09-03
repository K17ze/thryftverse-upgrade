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

// FALLBACK height rhythm: a 7-step cycle that creates organic masonry
// staggering without visible pattern repetition. Prime-length cycles avoid
// the "every 4th item looks the same" tell.
//
// This is used ONLY when a look's real media dimensions are unavailable
// (see deriveRealAspectRatio in resolveLookTemplate). The primary path uses
// the look's real coverAspectRatio / mediaWidth / mediaHeight so the grid
// reflects true media geometry rather than fabricated variety (Design.md
// §1841: "clients do not fabricate variety from IDs or alternating
// constants").
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
 * All other looks get 1×1 tiles whose aspect ratio is derived from the
 * look's REAL media dimensions when the backend exposes them
 * (`coverAspectRatio`, or `mediaWidth`/`mediaHeight`). Only when real
 * dimensions are unavailable does the resolver fall back to the
 * deterministic HEIGHT_RHYTHM cycle so the grid still staggers — this
 * is an explicit fallback, not the primary path (Design.md §1841:
 * "clients do not fabricate variety from IDs or alternating constants").
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

  // Derive the real aspect ratio from the look's media dimensions when the
  // backend exposes them. coverAspectRatio takes precedence over the raw
  // pixel dimensions. This is the primary path — real data, not fabrication.
  const realAspect = deriveRealAspectRatio(look);
  if (realAspect != null) {
    return classifyByAspectRatio(realAspect);
  }

  // FALLBACK: real media dimensions are unavailable, so use the deterministic
  // HEIGHT_RHYTHM cycle to keep the grid staggering. This is a last-resort
  // fallback only — the primary path above uses the look's real dimensions.
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
 * Derive a real aspect ratio (width / height) from the look's media
 * dimensions when available. Returns `null` when neither coverAspectRatio
 * nor a valid mediaWidth/mediaHeight pair is present.
 */
function deriveRealAspectRatio(look: LookApiItem): number | null {
  if (typeof look.coverAspectRatio === 'number' && look.coverAspectRatio > 0) {
    return look.coverAspectRatio;
  }
  if (
    typeof look.mediaWidth === 'number' && look.mediaWidth > 0 &&
    typeof look.mediaHeight === 'number' && look.mediaHeight > 0
  ) {
    return look.mediaWidth / look.mediaHeight;
  }
  return null;
}

/**
 * Classify a real aspect ratio into the template kind used by the grid.
 * Portrait (< 0.9) → portrait; square-ish (0.9–1.1) → square; everything
 * else → standard. Span is always 1 here — wide/cinematic tiles are handled
 * earlier in resolveLookTemplate.
 */
function classifyByAspectRatio(aspect: number): LookTemplate {
  if (aspect < 0.9) {
    return { span: 1, aspect, kind: 'portrait' };
  }
  if (aspect <= 1.1) {
    return { span: 1, aspect: AspectRatio.square, kind: 'square' };
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
