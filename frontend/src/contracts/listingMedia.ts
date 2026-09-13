/**
 * Listing Media Contract — canonical `media[]` record.
 *
 * Mirrors `ListingMediaItem` emitted by
 * `backend/api/src/lib/media/listingMediaProjection.ts` on every listing
 * read (`/listings`, `/feed/*`, `/listings/:id`, `/related`,
 * `/recommendations`, `/users/:id/listings`, auction detail `mediaItems`).
 *
 * This contract is the seam between the backend media pipeline and every
 * frontend media consumer. It carries what flat `images: string[]` could
 * never express:
 *
 *   - `derivatives[]` — the responsive rendition ladder the pipeline
 *     pre-renders (`media_derivatives`), so grid thumbnails and PDP heroes
 *     can request a sized file instead of the full-resolution original.
 *   - `blurhash` — a decodable BlurHash placeholder computed at processing
 *     time (pre-fix builds stored an undecodable SHA-256 hex digest; the
 *     projection filters those out, so a non-null value here is always
 *     renderable).
 *   - `lqip` — a 20px blurred-JPEG data URI, a lower-fidelity placeholder
 *     used when no blurhash exists.
 *   - `width`/`height` — post-EXIF-orientation pixel geometry. Portrait
 *     and landscape are reported correctly; clients must not re-derive
 *     aspect ratio from the raw file.
 *   - `focalPoint` — normalized (0–1) art-direction anchor for cover crops.
 *   - `poster`/`posterVerifiedAt` — video poster frame and its backend
 *     verification timestamp.
 */

/** One pre-rendered rendition of a media asset. */
export interface ListingMediaDerivative {
  /** Pipeline variant name, e.g. `jpeg_400`, `webp_1200`, `avif_800`. */
  variant: string;
  /** Delivery URL for this rendition. */
  url: string;
  /** Pixel width of this rendition; null when unknown. */
  width: number | null;
  /** Pixel height of this rendition; null when unknown. */
  height: number | null;
  /** Short format label parsed from the variant, e.g. `jpeg`, `webp`, `avif`. */
  format: string;
  /** Full MIME type, e.g. `image/webp`. */
  contentType: string;
}

/** Canonical listing media record served in `media[]` arrays. */
export interface ListingMediaRecord {
  /** Stable listing_images row id — used for attachmentOrder manifests. */
  id: string;
  /** Canonical delivery URL. */
  uri: string;
  /** Compat alias of `uri` — matches the backend record verbatim. */
  url: string;
  kind: 'image' | 'video';
  sortOrder: number;
  /** Post-orientation pixel geometry; null until processed. */
  width: number | null;
  height: number | null;
  /** Normalized (0–1) art-direction anchor; null when unset. */
  focalPoint: { x: number; y: number } | null;
  /** Video poster frame URL; null for images. */
  poster: string | null;
  /** When the poster was verified by the seller/admin; null when unverified. */
  posterVerifiedAt: string | null;
  /** Decodable BlurHash placeholder; null when not yet processed. */
  blurhash: string | null;
  /** 20px blurred-JPEG data URI; null when not yet processed. */
  lqip: string | null;
  /** Responsive rendition ladder. Empty until processing completes. */
  derivatives: ListingMediaDerivative[];
}
