'use client';

/** Board cover helpers — resolve listing ids to collage thumbnails. */

import { useMemo } from 'react';
import { getListingCoverUri } from '@/lib/utils/media';
import { DATA_MODE } from '@/lib/api/client';
import { useListingIds } from '@/lib/hooks/listing-resolution';
import { listingsForIds } from './fixtures';

/**
 * Cover thumbs for a board card: up to `n` item cover images, padded with
 * the board's own coverUri when the board has fewer than 2 items so a card
 * never renders an empty frame.
 *
 * `coverItemId` is the member's picked cover (boardPrefs overlay) — when
 * set and still on the board its image leads the collage; everything else
 * keeps deriving from real item order. A stale pick (item removed) falls
 * back to derivation rather than rendering a ghost image.
 *
 * Fixture-mode resolver — ids are looked up in the authored catalogue.
 * Live ids must go through `useBoardCoverThumbs`, which fetches the real
 * listings instead of silently rendering catalogue ghosts.
 */
export function listingCoverThumbs(
  itemIds: string[],
  n = 4,
  fallbackCover?: string | null,
  coverItemId?: string | null,
): string[] {
  const ordered =
    coverItemId && itemIds.includes(coverItemId)
      ? [coverItemId, ...itemIds.filter((id) => id !== coverItemId)]
      : itemIds;
  const covers = listingsForIds(ordered)
    .map((l) => getListingCoverUri(l.images))
    .filter(Boolean)
    .slice(0, n);
  if (covers.length <= 1 && fallbackCover) return [fallbackCover];
  return covers;
}

/**
 * Live-aware variant — resolves the board's item ids through
 * `useListingIds` (live: GET /listings/:id per id, misses dropped; fixture:
 * the catalogue) and derives the same collage grammar. While live fetches
 * are in flight the board's own cover stands in, so a card never renders
 * an empty frame or a fixture ghost.
 */
export function useBoardCoverThumbs(
  itemIds: readonly string[],
  n = 4,
  fallbackCover?: string | null,
  coverItemId?: string | null,
): string[] {
  const { byId } = useListingIds(itemIds);
  return useMemo(() => {
    if (DATA_MODE !== 'live') {
      return listingCoverThumbs([...itemIds], n, fallbackCover, coverItemId);
    }
    const ordered =
      coverItemId && itemIds.includes(coverItemId)
        ? [coverItemId, ...itemIds.filter((id) => id !== coverItemId)]
        : itemIds;
    const covers = ordered
      .map((id) => byId.get(id))
      .filter((l): l is NonNullable<typeof l> => Boolean(l))
      .map((l) => getListingCoverUri(l.images))
      .filter(Boolean)
      .slice(0, n);
    if (covers.length <= 1 && fallbackCover) return [fallbackCover];
    return covers;
  }, [byId, itemIds, n, fallbackCover, coverItemId]);
}
