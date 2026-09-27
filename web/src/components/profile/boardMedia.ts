/** Board cover helpers — resolve listing ids to collage thumbnails. */

import { getListingCoverUri } from '@/lib/utils/media';
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
