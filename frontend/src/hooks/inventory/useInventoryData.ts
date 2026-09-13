import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useStore } from '../../store/useStore';
import { useConnectivity } from '../useConnectivity';
import { fetchUserListingsFromApi, type ListingApiItem } from '../../services/listingsApi';
import { fetchSellerInventoryTotals, type SellerInventoryTotals } from '../../services/sellerHubApi';
import { parseApiError } from '../../lib/apiClient';
import type { InventorySummary } from './types';

const PAGE_SIZE = 50;

/**
 * Owns the inventory data lifecycle: the initial/focus refetch, pull-to-refresh,
 * cursor pagination, server totals, the load error surfaced by the screen's
 * error state, and the derived summary strip.
 */
export function useInventoryData() {
  const { isOffline } = useConnectivity();
  const currentUser = useStore((state) => state.currentUser);

  const [listings, setListings] = useState<ListingApiItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [totals, setTotals] = useState<SellerInventoryTotals | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!currentUser?.id) {
      setIsLoading(false);
      return;
    }
    if (!silent) setIsLoading(true);
    setError(null);
    setCursor(null);
    setHasMore(false);
    try {
      const [res, invTotals] = await Promise.all([
        fetchUserListingsFromApi(currentUser.id, { limit: PAGE_SIZE }),
        fetchSellerInventoryTotals().catch(() => null),
      ]);
      setListings(res.items);
      setCursor(res.nextCursor ?? null);
      setHasMore(Boolean(res.nextCursor));
      if (invTotals) setTotals(invTotals);
    } catch (err) {
      const isNetworkError = isOffline || (err instanceof Error && /network|fetch|timeout/i.test(err.message));
      const parsed = parseApiError(err, isNetworkError ? 'You appear to be offline. Check your connection and try again.' : undefined);
      setError(parsed.message);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [currentUser?.id, isOffline]);

  const loadMore = useCallback(async () => {
    if (!currentUser?.id || isLoadingMore || !hasMore || !cursor) return;
    setIsLoadingMore(true);
    try {
      const res = await fetchUserListingsFromApi(currentUser.id, { limit: PAGE_SIZE, cursor });
      setListings((prev) => [...prev, ...res.items]);
      setCursor(res.nextCursor ?? null);
      setHasMore(Boolean(res.nextCursor));
    } catch {
      // Non-fatal — user can pull to refresh to retry
    } finally {
      setIsLoadingMore(false);
    }
  }, [currentUser?.id, isLoadingMore, hasMore, cursor]);

  useFocusEffect(
    useCallback(() => {
      setIsLoading(true);
      void load();
    }, [load])
  );

  const onRefresh = useCallback(() => {
    setIsRefreshing(true);
    void load(true);
  }, [load]);

  // ── Derived summary from server totals (uncapped) ──
  const summary: InventorySummary = useMemo(() => {
    if (totals) {
      return {
        total: totals.active + totals.drafts + totals.paused + totals.sold,
        active: totals.active,
        sold: totals.sold,
        paused: totals.paused,
        draft: totals.drafts,
        totalValue: totals.listedValueGbp,
      };
    }
    const active = listings.filter((l) => l.status === 'active');
    const sold = listings.filter((l) => l.status === 'sold');
    const paused = listings.filter((l) => l.status === 'paused');
    const draft = listings.filter((l) => l.status === 'draft');
    const totalValue = active.reduce((sum, l) => sum + l.priceGbp, 0);
    return {
      total: listings.length,
      active: active.length,
      sold: sold.length,
      paused: paused.length,
      draft: draft.length,
      totalValue };
  }, [listings, totals]);

  return {
    listings,
    setListings,
    isLoading,
    isRefreshing,
    isLoadingMore,
    isOffline,
    error,
    summary,
    load,
    loadMore,
    onRefresh,
  };
}
