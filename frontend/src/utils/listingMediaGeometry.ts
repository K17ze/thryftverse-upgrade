import type { Listing } from '../domain';
import { AspectRatio } from "../theme/designTokens";

/**
 * Default listing media aspect ratio (width / height).
 *
 * 2026 standard: portrait 3:4 imagery — the Poshmark March 2026 redesign
 * made 3:4 the canonical marketplace crop. Real media geometry is still
 * honoured when the API provides it (AGENTS.md §11: never fabricate image
 * shapes); this token is only the honest fallback.
 */
export const DEFAULT_LISTING_MEDIA_ASPECT_RATIO = AspectRatio.portrait;

const MIN_ASPECT_RATIO = 0.55;
const MAX_ASPECT_RATIO = 1.8;

function normalizeAspectRatio(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  if (value < MIN_ASPECT_RATIO || value > MAX_ASPECT_RATIO) {
    return null;
  }

  return value;
}

/**
 * Structural shape required to resolve media geometry. Both the mock-data
 * `Listing` and the production `DiscoveryListingSummary` satisfy this, so the
 * discovery feed can resolve geometry from either without coupling the
 * renderer to a single domain type.
 */
export interface MediaGeometrySource {
  mediaAspectRatio?: number | null;
  mediaWidth?: number | null;
  mediaHeight?: number | null;
}

/**
 * Resolve real media geometry when the API provides it. A stable 4:5 frame is
 * the honest fallback: item IDs must never be used to fabricate image shapes.
 */
export function resolveListingMediaAspectRatio(listing: MediaGeometrySource): number {
  const directRatio = normalizeAspectRatio(listing.mediaAspectRatio);
  if (directRatio) {
    return directRatio;
  }

  const width = listing.mediaWidth;
  const height = listing.mediaHeight;
  if (
    typeof width === "number" &&
    typeof height === "number" &&
    Number.isFinite(width) &&
    Number.isFinite(height) &&
    width > 0 &&
    height > 0
  ) {
    return (
      normalizeAspectRatio(width / height) ?? DEFAULT_LISTING_MEDIA_ASPECT_RATIO
    );
  }

  return DEFAULT_LISTING_MEDIA_ASPECT_RATIO;
}

/** Height divided by width, for components that calculate an explicit height. */
export function resolveListingMediaHeightRatio(listing: Listing): number {
  return 1 / resolveListingMediaAspectRatio(listing);
}
