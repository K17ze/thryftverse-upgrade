import type { Listing } from '../domain';
import { AspectRatio } from "../theme/designTokens";
import { getListingCoverUri } from './media';

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

/**
 * Clamp gate shared by server-provided and device-measured geometry.
 * Returns null for non-finite or out-of-band values — callers fall back to
 * the honest default rather than rendering an extreme frame. Exported for
 * `measuredMediaRatio`, which must apply the exact same band.
 */
export function normalizeMediaAspectRatio(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  if (value < MIN_ASPECT_RATIO || value > MAX_ASPECT_RATIO) {
    return null;
  }

  return value;
}

function ratioFromDimensions(width: unknown, height: unknown): number | null {
  if (
    typeof width !== "number" ||
    typeof height !== "number" ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return null;
  }

  return normalizeMediaAspectRatio(width / height);
}

/** Structural view of a canonical `media[]` record (ListingMediaRecord
 *  satisfies this without a contract import). `width`/`height` are
 *  post-orientation pixel geometry; null until the media pipeline has
 *  processed the upload. */
interface MediaGeometryRecord {
  uri?: string | null;
  url?: string | null;
  kind?: string | null;
  width?: number | null;
  height?: number | null;
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
  /**
   * Canonical media contract records (`media[]`). Every listing read
   * (/listings, /feed/*, /related, /recommendations detail payloads) serves
   * these with post-orientation width/height once the pipeline has
   * processed the upload — real server geometry that predates any image
   * download, so it reserves the correct frame before first paint.
   */
  media?: ReadonlyArray<MediaGeometryRecord> | null;
  /** Flat image URI list — used to identify which media record is the
   *  rendered cover so a video-first row never borrows a video frame's
   *  geometry for its image tile. */
  images?: readonly string[] | null;
}

/**
 * Resolve real server-provided media geometry, or null when the API row
 * carries none.
 *
 * Resolution order:
 *   1. `mediaAspectRatio` — the pre-computed cover ratio some endpoints serve.
 *   2. `mediaWidth` / `mediaHeight` — explicit cover geometry fields.
 *   3. The `media[]` record for the rendered cover image — matched by URI so
 *      a video-first row never borrows the video's frame; falls back to the
 *      first image record.
 *
 * Null is the honest answer, not a defect: rows whose media has not been
 * processed (or endpoints that do not join `listing_images`, e.g. the
 * /recommendations For-You feed) carry no geometry. Consumers should then
 * consult the measured-geometry feedback cache (`measuredMediaRatio`) before
 * falling back to the 3:4 standard.
 */
export function resolveServerListingMediaAspectRatio(listing: MediaGeometrySource): number | null {
  const directRatio = normalizeMediaAspectRatio(listing.mediaAspectRatio);
  if (directRatio) {
    return directRatio;
  }

  const fieldRatio = ratioFromDimensions(listing.mediaWidth, listing.mediaHeight);
  if (fieldRatio) {
    return fieldRatio;
  }

  const records = listing.media;
  if (records && records.length > 0) {
    const cover = listing.images ? getListingCoverUri([...listing.images], '') : '';
    const matched =
      (cover
        ? records.find((r) => r.kind !== 'video' && (r.uri === cover || r.url === cover))
        : undefined) ??
      records.find((r) => r.kind !== 'video') ??
      null;
    if (matched) {
      const recordRatio = ratioFromDimensions(matched.width, matched.height);
      if (recordRatio) {
        return recordRatio;
      }
    }
  }

  return null;
}

/**
 * True when the API row carries real media geometry — i.e. the resolved
 * ratio is server truth rather than the 3:4 standard. Measurement reporting
 * is gated on this so device-measured values never override server truth.
 */
export function hasServerListingMediaGeometry(listing: MediaGeometrySource): boolean {
  return resolveServerListingMediaAspectRatio(listing) != null;
}

/**
 * Resolve real media geometry when the API provides it. A stable 3:4 frame is
 * the honest fallback: item IDs must never be used to fabricate image shapes.
 */
export function resolveListingMediaAspectRatio(listing: MediaGeometrySource): number {
  return resolveServerListingMediaAspectRatio(listing) ?? DEFAULT_LISTING_MEDIA_ASPECT_RATIO;
}

/** Height divided by width, for components that calculate an explicit height. */
export function resolveListingMediaHeightRatio(listing: Listing): number {
  return 1 / resolveListingMediaAspectRatio(listing);
}
