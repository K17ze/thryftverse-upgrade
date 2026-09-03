/**
 * Media Asset System — category-aware aspect ratios, content fit and focal
 * point policy for every media surface in ThryftVerse.
 *
 * Design.md §9.6 — a flagship media system needs:
 *   - category-aware aspect ratios
 *   - predictable cover selection
 *   - focal point / crop metadata
 *   - responsive source selection
 *
 * This is the single source of truth for the geometry of a media frame.
 * Callers pass a `MediaCategory` and receive the ratio, content fit and
 * focal-point policy for that surface. `FlagshipImage` consumes this so the
 * silhouette of every image is deterministic — no per-screen magic ratios.
 *
 * Anti-AI (AGENTS §4): "Placeholder-grade media treatment … `contentFit=
 * 'cover'` on everything with no focal-point logic" is the loudest tell.
 * The config below makes fit and focal policy a property of the category,
 * not a per-call guess.
 */

/** Canonical media surfaces in the product. */
export type MediaCategory =
  | 'product'
  | 'profile'
  | 'cover'
  | 'look'
  | 'story'
  | 'auction'
  | 'evidence';

export interface AspectRatioConfig {
  /** Width / height. */
  ratio: number;
  /** How the image fills the frame. `contain` is reserved for surfaces where
   *  distortion is worse than letterboxing (evidence, panoramas). */
  contentFit: 'cover' | 'contain';
  /** Default focal point (0–1) used when the caller does not supply one.
   *  Applied via `contentPosition` on Expo Image. */
  contentPosition?: { x: number; y: number };
  /** Whether the surface permits a caller-supplied focal point override.
   *  Story and evidence frames are full-bleed or contain-fit and ignore
   *  focal overrides so art direction cannot crop out the subject. */
  allowFocalPoint: boolean;
}

export const MEDIA_ASPECT_RATIOS: Record<MediaCategory, AspectRatioConfig> = {
  // Commerce listing card — 4:5 editorial portrait (Pinterest/Instagram grid).
  product: { ratio: 4 / 5, contentFit: 'cover', allowFocalPoint: true },
  // Avatar / identity — 1:1 square.
  profile: { ratio: 1, contentFit: 'cover', allowFocalPoint: true },
  // Profile / page cover — 16:9 banner.
  cover: { ratio: 16 / 9, contentFit: 'cover', allowFocalPoint: true },
  // Look / editorial poster — 3:4 portrait.
  look: { ratio: 3 / 4, contentFit: 'cover', allowFocalPoint: true },
  // Story / reel — 9:16 full-bleed, no focal override (subject is framed).
  story: { ratio: 9 / 16, contentFit: 'cover', allowFocalPoint: false },
  // Auction lot — 1:1 square, symmetric crop.
  auction: { ratio: 1, contentFit: 'cover', allowFocalPoint: true },
  // Evidence / proof-of-condition — 4:3 contain, never crop out detail.
  evidence: { ratio: 4 / 3, contentFit: 'contain', allowFocalPoint: false },
};

/**
 * Resolve the effective aspect ratio for a category, honouring an explicit
 * override (e.g. a server-supplied ratio for a non-standard asset).
 */
export function getMediaAspectRatio(
  category: MediaCategory,
  override?: number,
): number {
  return override ?? MEDIA_ASPECT_RATIOS[category].ratio;
}

/**
 * Resolve the effective focal point for a category. Returns `undefined` when
 * the category does not permit focal overrides and no default is set, so the
 * caller can fall back to Expo Image's centred default.
 */
export function getMediaFocalPoint(
  category: MediaCategory,
  override?: { x: number; y: number },
): { x: number; y: number } | undefined {
  const config = MEDIA_ASPECT_RATIOS[category];
  if (override) {
    return config.allowFocalPoint ? override : config.contentPosition;
  }
  return config.contentPosition;
}
