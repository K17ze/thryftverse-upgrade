import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { queryKeys } from '../../platform/server/queryKeys';
import { fetchListingDetailResult } from '../../platform/product/useListingQueries';
import type { Listing } from '../../services/listingsApi';
import type { HydratedLookTag } from '../../components/look/LookHotspots';

/**
 * Hydrates look tags with live listing state (price, title, image, sold).
 *
 * The look_tags contract only carries `{ id, listingId, label, x, y }` — the
 * tag would otherwise deep-link to the PDP with zero indication that the
 * item sold or repriced since the look was published (audit R63).
 *
 * Hydration reuses the canonical PDP read: same `queryKeys.listing.detail`
 * key and same fetcher as `useListingDetail`, so one cache entry per listing
 * is shared between this screen and the product detail the tag navigates to.
 *
 * Honesty contract:
 *  - While a listing is still loading, its tag renders with only the baked-in
 *    data (label) — no fabricated price, no skeleton chrome.
 *  - On fetch failure the baked-in data is kept silently — the tag never
 *    claims live state it could not confirm.
 *  - Once a live row lands, the server is authoritative: a null live price
 *    hides the price rather than presenting a stale snapshot as current.
 */
export function useLookTagHydration(tags: HydratedLookTag[]): HydratedLookTag[] {
  const listingIds = useMemo(() => {
    const ids: string[] = [];
    for (const tag of tags) {
      if (tag.listingId && !ids.includes(tag.listingId)) ids.push(tag.listingId);
    }
    return ids;
  }, [tags]);

  const results = useQueries({
    queries: listingIds.map((listingId) => ({
      queryKey: queryKeys.listing.detail(listingId),
      queryFn: () => fetchListingDetailResult(listingId),
      staleTime: 5 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
      // 404/403 are terminal (gone / not public for this viewer) — no retry.
      retry: (failureCount: number, error: any) => {
        if (error?.status === 404 || error?.status === 403) return false;
        return failureCount < 2;
      },
    })),
  });

  return useMemo(() => {
    const liveByListingId = new Map<string, Listing>();
    listingIds.forEach((listingId, index) => {
      const listing = results[index]?.data?.listing;
      if (listing) liveByListingId.set(listingId, listing);
    });
    if (liveByListingId.size === 0) return tags;

    return tags.map((tag) => {
      const live = tag.listingId ? liveByListingId.get(tag.listingId) : undefined;
      if (!live) return tag;
      return {
        ...tag,
        title: live.title ?? tag.title,
        // Server row is authoritative — a missing live price renders no
        // price rather than a stale baked-in one.
        price: live.price ?? undefined,
        currency: live.price !== null ? 'GBP' : undefined,
        image: live.images[0] ?? tag.image,
        images: live.images.length > 0 ? live.images : tag.images,
        isSold: live.isSold === true,
      };
    });
  }, [tags, listingIds, results]);
}
