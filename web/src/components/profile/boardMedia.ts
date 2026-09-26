/** Board cover helpers — resolve listing ids to collage thumbnails. */

import { getListingCoverUri } from '@/lib/utils/media';
import { listingsForIds } from './fixtures';

/**
 * Cover thumbs for a board card: up to `n` item cover images, padded with
 * the board's own coverUri when the board has fewer than 2 items so a card
 * never renders an empty frame.
 */
export function listingCoverThumbs(
  itemIds: string[],
  n = 4,
  fallbackCover?: string | null,
): string[] {
  const covers = listingsForIds(itemIds)
    .map((l) => getListingCoverUri(l.images))
    .filter(Boolean)
    .slice(0, n);
  if (covers.length <= 1 && fallbackCover) return [fallbackCover];
  return covers;
}
