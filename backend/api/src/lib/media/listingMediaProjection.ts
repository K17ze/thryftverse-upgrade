/**
 * Listing media projection — the contract seam between `listing_images`
 * rows and API responses.
 *
 * Historically every listing read selected only `image_url, sort_order`,
 * so the responsive derivative ladder (`media_derivatives`), the stored
 * blurhash, LQIP, focal point and poster data never reached clients — the
 * frontend re-downloaded full-size originals for every thumbnail.
 *
 * `loadListingMedia` projects each `listing_images` row into a
 * {@link ListingMediaItem} carrying everything the media contract needs:
 *
 *   uri / kind / width / height / focalPoint / poster / blurhash / lqip /
 *   derivatives[]
 *
 * Derivatives are resolved by joining the authoritative `media_bindings`
 * link (target_type = 'listing', matched on sort_order — the attach path
 * writes both rows in the same transaction with the same sort order) to
 * `media_assets`, falling back to a canonical-URL match for rows attached
 * before bindings existed. The asset row supplies a processing-computed
 * blurhash and LQIP (`metadata->>'lqip'`) when the listing row itself was
 * attached before processing finished.
 *
 * The projection is defensive: if the media lifecycle tables are absent on
 * an older schema, it degrades to the flat listing_images projection so
 * read endpoints never hard-fail on missing derivative data.
 */

import type { Pool, PoolClient } from 'pg';

type Queryable = Pick<Pool | PoolClient, 'query'>;

export interface ListingMediaDerivative {
  variant: string;
  url: string;
  width: number | null;
  height: number | null;
  format: string;
  contentType: string;
}

export interface ListingMediaItem {
  id: string;
  /** Canonical delivery URL. */
  uri: string;
  /** Compat alias of `uri` — existing consumers read `media[].url`. */
  url: string;
  kind: 'image' | 'video';
  sortOrder: number;
  width: number | null;
  height: number | null;
  focalPoint: { x: number; y: number } | null;
  /** Poster image for video media. */
  poster: string | null;
  posterVerifiedAt: string | null;
  /** Decodable BlurHash placeholder; null when not yet processed. */
  blurhash: string | null;
  /** 20px blurred-JPEG data URI placeholder; null when not yet processed. */
  lqip: string | null;
  /** Responsive derivative ladder, ascending by variant width. */
  derivatives: ListingMediaDerivative[];
}

/**
 * Pre-fix builds persisted a truncated SHA-256 hex digest in the blurhash
 * column — a placeholder that no BlurHash decoder can render. Filter those
 * out at the seam so clients never receive an undecodable value; a missing
 * blurhash is honest, a hex digest masquerading as one is not.
 */
const LEGACY_HEX_PLACEHOLDER = /^[0-9a-f]{32}$/;

function toDecodableBlurhash(value: string | null): string | null {
  if (!value) return null;
  return LEGACY_HEX_PLACEHOLDER.test(value) ? null : value;
}

function toFinitePositiveInt(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

function toUnitInterval(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : null;
}

interface ListingMediaRow {
  id: string;
  listing_id: string;
  image_url: string;
  sort_order: number;
  media_width: number | null;
  media_height: number | null;
  media_type: string | null;
  poster_url: string | null;
  poster_verified_at: string | null;
  image_blurhash: string | null;
  focal_x: string | number | null;
  focal_y: string | number | null;
  media_asset_id: string | null;
  asset_blurhash: string | null;
  lqip: string | null;
}

/**
 * Newer listing_images columns are read through `to_jsonb` so the query
 * still runs when the media-contract migrations (055/066/088) have not
 * been applied — the missing keys simply project as NULL.
 */
const LISTING_MEDIA_SELECT = `
  li.id,
  li.listing_id,
  li.image_url,
  li.sort_order,
  NULLIF(to_jsonb(li) ->> 'media_width', '')::integer AS media_width,
  NULLIF(to_jsonb(li) ->> 'media_height', '')::integer AS media_height,
  COALESCE(NULLIF(to_jsonb(li) ->> 'media_type', ''), 'image') AS media_type,
  NULLIF(to_jsonb(li) ->> 'poster_url', '') AS poster_url,
  NULLIF(to_jsonb(li) ->> 'poster_verified_at', '') AS poster_verified_at,
  NULLIF(to_jsonb(li) ->> 'blurhash', '') AS image_blurhash,
  NULLIF(to_jsonb(li) ->> 'focal_x', '') AS focal_x,
  NULLIF(to_jsonb(li) ->> 'focal_y', '') AS focal_y
`;

const RICH_MEDIA_QUERY = `
  SELECT
    ${LISTING_MEDIA_SELECT},
    COALESCE(bound.id, by_url.id) AS media_asset_id,
    COALESCE(bound.blurhash, by_url.blurhash) AS asset_blurhash,
    COALESCE(bound.metadata, by_url.metadata) ->> 'lqip' AS lqip
  FROM listing_images li
  LEFT JOIN LATERAL (
    SELECT ma.id, ma.blurhash, ma.metadata
    FROM media_bindings mb
    JOIN media_assets ma ON ma.id = mb.media_asset_id
    WHERE mb.target_type = 'listing'
      AND mb.target_ref_id = li.listing_id
      AND mb.sort_order = li.sort_order
      AND mb.removed_at IS NULL
    ORDER BY mb.created_at DESC
    LIMIT 1
  ) bound ON true
  LEFT JOIN LATERAL (
    SELECT ma.id, ma.blurhash, ma.metadata
    FROM media_assets ma
    WHERE ma.canonical_url = li.image_url
       OR ma.original_object_url = li.image_url
    LIMIT 1
  ) by_url ON bound.id IS NULL
  WHERE li.listing_id = ANY($1)
  ORDER BY li.listing_id, li.sort_order, li.created_at, li.id
`;

const FLAT_MEDIA_QUERY = `
  SELECT
    ${LISTING_MEDIA_SELECT},
    NULL AS media_asset_id,
    NULL AS asset_blurhash,
    NULL AS lqip
  FROM listing_images li
  WHERE li.listing_id = ANY($1)
  ORDER BY li.listing_id, li.sort_order, li.created_at, li.id
`;

const DERIVATIVES_QUERY = `
  SELECT media_asset_id, variant, content_type, width, height, canonical_url
  FROM media_derivatives
  WHERE media_asset_id = ANY($1)
`;

function derivativeFormat(variant: string, contentType: string): string {
  const prefix = variant.split('_')[0];
  if (prefix) return prefix;
  return contentType.split('/')[1] ?? contentType;
}

/**
 * Loads the projected `media[]` array for a set of listing ids.
 *
 * Two queries total regardless of listing count: one for the image rows
 * (joined to the bound media asset), one for the derivative ladder of the
 * resolved assets. Returns an empty map for an empty input — callers never
 * issue a pointless query.
 */
export async function loadListingMedia(
  db: Queryable,
  listingIds: readonly string[],
): Promise<Map<string, ListingMediaItem[]>> {
  const mediaByListing = new Map<string, ListingMediaItem[]>();
  if (listingIds.length === 0) return mediaByListing;

  let rows: ListingMediaRow[];
  try {
    const result = await db.query<ListingMediaRow>(RICH_MEDIA_QUERY, [
      [...listingIds],
    ]);
    rows = result.rows;
  } catch {
    // media_bindings / media_assets may not exist on older schemas — fall
    // back to the flat projection so reads keep working.
    const result = await db.query<ListingMediaRow>(FLAT_MEDIA_QUERY, [
      [...listingIds],
    ]);
    rows = result.rows;
  }

  const assetIds = [
    ...new Set(
      rows
        .map((row) => row.media_asset_id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0),
    ),
  ];

  const derivativesByAsset = new Map<string, ListingMediaDerivative[]>();
  if (assetIds.length > 0) {
    try {
      const derivativeResult = await db.query<{
        media_asset_id: string;
        variant: string;
        content_type: string;
        width: number | null;
        height: number | null;
        canonical_url: string;
      }>(DERIVATIVES_QUERY, [assetIds]);
      for (const d of derivativeResult.rows) {
        const list = derivativesByAsset.get(d.media_asset_id) ?? [];
        list.push({
          variant: d.variant,
          url: d.canonical_url,
          width: d.width,
          height: d.height,
          format: derivativeFormat(d.variant, d.content_type),
          contentType: d.content_type,
        });
        derivativesByAsset.set(d.media_asset_id, list);
      }
    } catch {
      // media_derivatives missing on an older schema — items still project,
      // just without a derivative ladder.
    }
  }

  for (const row of rows) {
    const focalX = toUnitInterval(row.focal_x);
    const focalY = toUnitInterval(row.focal_y);
    const item: ListingMediaItem = {
      id: row.id,
      uri: row.image_url,
      url: row.image_url,
      kind: row.media_type === 'video' ? 'video' : 'image',
      sortOrder: row.sort_order,
      width: toFinitePositiveInt(row.media_width),
      height: toFinitePositiveInt(row.media_height),
      focalPoint: focalX !== null && focalY !== null ? { x: focalX, y: focalY } : null,
      poster: row.poster_url,
      posterVerifiedAt: row.poster_verified_at,
      blurhash:
        toDecodableBlurhash(row.image_blurhash)
        ?? toDecodableBlurhash(row.asset_blurhash),
      lqip: row.lqip,
      derivatives: row.media_asset_id
        ? derivativesByAsset.get(row.media_asset_id) ?? []
        : [],
    };
    const list = mediaByListing.get(row.listing_id) ?? [];
    list.push(item);
    mediaByListing.set(row.listing_id, list);
  }

  return mediaByListing;
}

/**
 * Convenience accessor mirroring the legacy `imagesByListing` shape used by
 * feed serializers: the flat ordered URL array plus the geometry of the
 * primary media item.
 */
export function listingImageUrls(
  media: ListingMediaItem[] | undefined,
  fallbackImageUrl: string | null,
): string[] {
  if (media && media.length > 0) {
    return media.map((item) => item.uri);
  }
  return fallbackImageUrl ? [fallbackImageUrl] : [];
}
