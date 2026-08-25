import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchJson } from '../lib/apiClient';
import { useStore } from '../store/useStore';
import { useHaptic } from './useHaptic';

const WISHLIST_QUERY_KEY = ['wishlist'] as const;
const PREFETCH_STALE_TIME = Infinity;

interface WishlistResponse {
  ok: true;
  itemIds: string[];
}

/**
 * Fetch the current user's wishlist from the server. Falls back to the
 * local Zustand wishlist when the API is unavailable (offline or
 * unauthenticated), preserving the existing local-only behaviour.
 */
async function fetchWishlist(): Promise<string[]> {
  const res = await fetchJson<WishlistResponse>('/users/me/wishlist');
  return res.itemIds;
}

/**
 * useWishlist — React Query-backed wishlist read hook. Returns the wishlist
 * item IDs from the React Query cache, which is persisted to MMKV via the
 * ServerStateProvider. Uses `staleTime: Infinity` because the wishlist only
 * changes via mutations — there is no need to refetch on mount or focus.
 *
 * The hook also mirrors the React Query state into the existing Zustand
 * store so that legacy consumers of `useStore(s => s.wishlist)` continue
 * to work during the migration period.
 */
export function useWishlist() {
  const setZustandWishlist = useStore((s) => s.wishlist);

  const query = useQuery<string[]>({
    queryKey: WISHLIST_QUERY_KEY,
    queryFn: () => fetchWishlist(),
    staleTime: PREFETCH_STALE_TIME,
    initialData: setZustandWishlist,
  });

  useEffect(() => {
    if (query.data && query.data !== setZustandWishlist) {
      useStore.setState({ wishlist: query.data });
    }
  }, [query.data, setZustandWishlist]);

  return query;
}

/**
 * useToggleWishlist — optimistic mutation that adds or removes a listing ID
 * from the wishlist. The cache is updated instantly via `setQueryData`, and
 * rolled back on error so the UI never lies about the outcome.
 *
 * Haptic feedback (medium impact) fires on every toggle for tactile
 * confirmation, matching the existing `useProductSocialState` behaviour.
 *
 * @param listingId - The listing ID to toggle in the wishlist.
 */
export function useToggleWishlist(listingId: string) {
  const queryClient = useQueryClient();
  const haptic = useHaptic();

  return useMutation({
    mutationFn: async () => {
      const current = queryClient.getQueryData<string[]>(WISHLIST_QUERY_KEY) ?? [];
      const isWishlisted = current.includes(listingId);
      const res = await fetchJson<WishlistResponse>(
        '/users/me/wishlist',
        {
          method: 'POST',
          body: JSON.stringify({ listingId, action: isWishlisted ? 'remove' : 'add' }),
        },
      );
      return res.itemIds;
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: WISHLIST_QUERY_KEY });
      const previous = queryClient.getQueryData<string[]>(WISHLIST_QUERY_KEY);

      queryClient.setQueryData<string[]>(WISHLIST_QUERY_KEY, (old) => {
        const current = old ?? [];
        const isWishlisted = current.includes(listingId);
        return isWishlisted
          ? current.filter((id) => id !== listingId)
          : [...current, listingId];
      });

      haptic.medium();

      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(WISHLIST_QUERY_KEY, context.previous);
      }
    },
    onSuccess: (data) => {
      queryClient.setQueryData(WISHLIST_QUERY_KEY, data);
      useStore.setState({ wishlist: data });
    },
  });
}

/**
 * useIsWishlisted — convenience hook that returns whether a listing is in the
 * wishlist, backed by the React Query cache. This is the React Query
 * equivalent of `useStore(s => s.isWishlisted)(id)`.
 *
 * @param listingId - The listing ID to check.
 */
export function useIsWishlisted(listingId: string): boolean {
  const query = useWishlist();
  return query.data?.includes(listingId) ?? false;
}
