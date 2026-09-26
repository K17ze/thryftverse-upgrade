/** Media utilities — mirrors utils/media.ts + listingMediaGeometry.ts. */

import type { Listing, ListingMediaRecord } from '@/lib/contracts/domain';

export const DEFAULT_LISTING_MEDIA_ASPECT_RATIO = 0.75; // 3:4 editorial

const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.m3u8', '.webm'];

export function isVideoUri(uri: string): boolean {
  const lower = uri.toLowerCase().split('?')[0];
  return VIDEO_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export function isUsableUri(uri: unknown): uri is string {
  return typeof uri === 'string' && uri.trim().length > 0;
}

export function getListingCoverUri(images: string[] | undefined): string {
  return (images ?? []).filter(isUsableUri)[0] ?? '';
}

/** Resolve the primary media record for a listing's cover image. */
export function getPrimaryMedia(
  listing: Pick<Listing, 'images' | 'media'>,
): ListingMediaRecord | null {
  const cover = getListingCoverUri(listing.images);
  const records = listing.media ?? [];
  return (
    records.find((m) => m.kind === 'image' && (m.uri === cover || m.url === cover)) ??
    records.find((m) => m.kind === 'image') ??
    null
  );
}

/** Server-truth aspect ratio for a listing's primary media. */
export function resolveListingMediaAspectRatio(
  listing: Pick<Listing, 'mediaAspectRatio' | 'mediaWidth' | 'mediaHeight' | 'media'>,
): number | null {
  if (typeof listing.mediaAspectRatio === 'number' && listing.mediaAspectRatio > 0) {
    return listing.mediaAspectRatio;
  }
  if (
    typeof listing.mediaWidth === 'number' &&
    typeof listing.mediaHeight === 'number' &&
    listing.mediaHeight > 0
  ) {
    return listing.mediaWidth / listing.mediaHeight;
  }
  const primary = (listing.media ?? []).find((m) => m.kind === 'image');
  if (primary?.width && primary?.height && primary.height > 0) {
    return primary.width / primary.height;
  }
  return null;
}

/** CSS object-position from a focal point {x, y} in 0..1 space. */
export function focalPointToObjectPosition(
  focal: { x: number; y: number } | null | undefined,
): string | undefined {
  if (!focal) return undefined;
  const x = Math.min(1, Math.max(0, focal.x));
  const y = Math.min(1, Math.max(0, focal.y));
  return `${Math.round(x * 100)}% ${Math.round(y * 100)}%`;
}

/** Category focal points — art direction per category, mirrors getCategoryFocalPoint. */
const CATEGORY_FOCAL_POINTS: Record<string, { x: number; y: number }> = {
  sneakers: { x: 0.5, y: 0.6 },
  bags: { x: 0.5, y: 0.5 },
  accessories: { x: 0.5, y: 0.45 },
  women: { x: 0.5, y: 0.35 },
  men: { x: 0.5, y: 0.35 },
};

export function getCategoryFocalPoint(category: string | undefined) {
  return CATEGORY_FOCAL_POINTS[category ?? ''] ?? { x: 0.5, y: 0.5 };
}

export const FACE_FOCAL_POINT = { x: 0.5, y: 0.35 };
