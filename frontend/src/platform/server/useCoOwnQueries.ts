import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchCoOwnAssetById,
  fetchCoOwnOrderBook,
  fetchCoOwnHoldings,
  fetchCoOwnRecourseStatus,
  type MarketCoOwnAsset,
  type MarketCoOwnHolding,
} from '../../services/marketApi';
import { queryKeys } from './queryKeys';

// ---------------------------------------------------------------------------
// Shared Co-Own asset cache — AssetDetailScreen and AssetDueDiligenceScreen
// both read the same asset. Without a shared cache they independently
// refetch the same data. This hook deduplicates the request via React Query.
// ---------------------------------------------------------------------------

export function useCoOwnAssetQuery(assetId: string | null | undefined) {
  return useQuery<MarketCoOwnAsset>({
    queryKey: assetId ? queryKeys.coOwn.asset(assetId) : ['coOwn', 'asset', null],
    queryFn: () => fetchCoOwnAssetById(assetId!),
    enabled: Boolean(assetId),
    staleTime: 1000 * 60 * 2,
  });
}

export function useCoOwnOrderBookQuery(assetId: string | null | undefined) {
  return useQuery({
    queryKey: assetId ? queryKeys.coOwn.orderBook(assetId) : ['coOwn', 'orderBook', null],
    queryFn: () => fetchCoOwnOrderBook(assetId!, { limit: 40 }),
    enabled: Boolean(assetId),
    staleTime: 1000 * 30,
  });
}

export function useCoOwnHoldingsQuery(userId: string | null | undefined) {
  return useQuery<MarketCoOwnHolding[]>({
    queryKey: userId ? queryKeys.coOwn.holdings(userId) : ['coOwn', 'holdings', null],
    queryFn: () => fetchCoOwnHoldings(userId!),
    enabled: Boolean(userId),
    staleTime: 1000 * 60,
  });
}

export function useCoOwnRecourseQuery(assetId: string | null | undefined) {
  return useQuery({
    queryKey: assetId ? queryKeys.coOwn.recourse(assetId) : ['coOwn', 'recourse', null],
    queryFn: () => fetchCoOwnRecourseStatus(assetId!),
    enabled: Boolean(assetId),
    staleTime: 1000 * 60 * 2,
    retry: false,
  });
}

/** Invalidate the asset cache after a trade or mutation. */
export function useInvalidateCoOwnAsset() {
  const queryClient = useQueryClient();
  return (assetId: string) => {
    queryClient.invalidateQueries({ queryKey: queryKeys.coOwn.asset(assetId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.coOwn.orderBook(assetId) });
  };
}
