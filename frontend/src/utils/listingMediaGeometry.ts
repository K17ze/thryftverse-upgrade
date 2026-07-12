import type { Listing } from "../data/mockData";

export const DEFAULT_LISTING_MEDIA_ASPECT_RATIO = 4 / 5;

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
 * Resolve real media geometry when the API provides it. A stable 4:5 frame is
 * the honest fallback: item IDs must never be used to fabricate image shapes.
 */
export function resolveListingMediaAspectRatio(listing: Listing): number {
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
