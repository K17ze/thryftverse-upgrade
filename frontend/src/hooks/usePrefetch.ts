import { useCallback, useRef } from 'react';
import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import { queryKeys } from '../platform/server/queryKeys';
import { fetchListingByIdFromApi } from '../services/listingsApi';
import { mapBackendListingToListing } from '../services/listingMapper';
import { fetchPublicProfileAggregate } from '../services/profileApi';
import type { ListingDetailResult } from '../platform/product/useListingQueries';

const PREFETCH_STALE_TIME = 30 * 1000;

/**
 * usePrefetchListing — prefetches a listing detail query so that navigation
 * to the listing detail screen is instant. Designed to be called on
 * `onPressIn` (before the tap registers as a press) to give the network
 * maximum head start.
 *
 * Fire-and-forget: errors are swallowed so the caller never sees a rejection.
 *
 * @param listingId - The listing ID to prefetch.
 */
export function usePrefetchListing(listingId: string | undefined) {
  const client = useQueryClient();

  return useCallback(() => {
    if (!listingId) return;
    client
      .prefetchQuery({
        queryKey: queryKeys.listing.detail(listingId),
        queryFn: async () => {
          const res = await fetchListingByIdFromApi(listingId);
          if (!res.ok || !res.listing) {
            throw new Error(res.error || 'Listing not found');
          }
          return {
            listing: mapBackendListingToListing(res.listing),
            commerce: res.commerce,
          } as ListingDetailResult;
        },
        staleTime: PREFETCH_STALE_TIME,
      })
      .catch(() => {});
  }, [client, listingId]);
}

/**
 * usePrefetchUserProfile — prefetches a user profile aggregate so navigation
 * to a profile screen is instant. Designed for `onPressIn` on user avatars
 * or usernames in feed/list contexts.
 *
 * Fire-and-forget: errors are swallowed.
 *
 * @param userId - The user ID to prefetch.
 */
export function usePrefetchUserProfile(userId: string | undefined) {
  const client = useQueryClient();

  return useCallback(() => {
    if (!userId) return;
    client
      .prefetchQuery({
        queryKey: queryKeys.user.profile(userId),
        queryFn: () => fetchPublicProfileAggregate(userId),
        staleTime: PREFETCH_STALE_TIME,
      })
      .catch(() => {});
  }, [client, userId]);
}

/**
 * usePrefetchNextPage — prefetches the next page of an infinite query when the
 * user is approaching the end of the current list. The `fetchFn` receives the
 * last page's `nextCursor` (or `undefined` for the first page) and should
 * return the next page of data.
 *
 * Fire-and-forget: errors are swallowed.
 *
 * @param queryKey   - The React Query key for the infinite query.
 * @param fetchFn    - Function that fetches the next page given a cursor.
 * @param hasNextPage - Whether there is a next page available.
 * @param nextCursor  - The cursor for the next page (from `getNextPageParam`).
 */
export function usePrefetchNextPage<TData>(
  queryKey: QueryKey,
  fetchFn: (cursor: unknown) => Promise<TData>,
  hasNextPage: boolean,
  nextCursor: unknown,
) {
  const client = useQueryClient();

  return useCallback(() => {
    if (!hasNextPage) return;
    client
      .prefetchInfiniteQuery({
        queryKey,
        queryFn: () => fetchFn(nextCursor),
        initialPageParam: nextCursor,
        staleTime: PREFETCH_STALE_TIME,
      })
      .catch(() => {});
  }, [client, queryKey, fetchFn, hasNextPage, nextCursor]);
}

/**
 * usePrefetchOnScroll — detects when the user is near the end of a list and
 * prefetches the next page. Returns an `onScroll` handler compatible with
 * React Native `ScrollView` / `FlatList` scroll events.
 *
 * When the user is within `threshold` items of the end (default 5), the
 * prefetch callback is invoked. The callback is throttled to once per page
 * transition to avoid redundant prefetches.
 *
 * @param threshold      - Number of items from the end to trigger prefetch (default 5).
 * @param onNearEnd      - Callback invoked when the user is near the end.
 * @returns An `onScroll` handler to attach to the scrollable component.
 */
export function usePrefetchOnScroll(
  threshold: number,
  onNearEnd: () => void,
) {
  const lastTriggeredRef = useRef(0);

  return useCallback(
    (event: { nativeEvent: { layoutMeasurement: { height: number }; contentOffset: { y: number }; contentSize: { height: number } } }) => {
      const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
      const visibleHeight = layoutMeasurement.height;
      const scrollPosition = contentOffset.y;
      const contentHeight = contentSize.height;

      if (contentHeight === 0) return;

      const distanceFromEnd = contentHeight - (scrollPosition + visibleHeight);

      const itemHeightEstimate = visibleHeight / threshold;
      if (distanceFromEnd < itemHeightEstimate * threshold) {
        const now = Date.now();
        if (now - lastTriggeredRef.current > 2000) {
          lastTriggeredRef.current = now;
          onNearEnd();
        }
      }
    },
    [threshold, onNearEnd],
  );
}
