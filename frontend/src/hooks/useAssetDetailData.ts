import React from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  fetchCoOwnDistributions,
  fetchCoOwnAssetCorporateActions,
  type CoOwnDistribution,
  type CoOwnCorporateAction,
  type MarketCoOwnAsset,
  type MarketCoOwnHolding,
  type CoOwnOrderBookSnapshot,
} from '../services/marketApi';
import {
  useCoOwnAssetQuery,
  useCoOwnHoldingsQuery,
} from '../platform/server/useCoOwnQueries';
import { useCoOwnOrderBookStream } from './useCoOwnOrderBookStream';

export interface UseAssetDetailDataOptions {
  assetId: string | null;
  userId?: string;
  enabled?: boolean;
}

export interface UseAssetDetailDataResult {
  // Asset
  asset: MarketCoOwnAsset | null;
  isLoadingAsset: boolean;
  assetError: unknown;
  refetchAsset: () => void;

  // Holdings
  yourHolding: MarketCoOwnHolding | null;
  isLoadingHoldings: boolean;
  holdingsError: unknown;
  refetchHoldings: () => void;

  // Distributions
  distributions: CoOwnDistribution[];
  isLoadingDistributions: boolean;
  lastDistribution: CoOwnDistribution | null;
  distributionsFailed: boolean;

  // Corporate actions
  corporateActions: CoOwnCorporateAction[];
  isLoadingCorporateActions: boolean;
  corporateActionsFailed: boolean;

  // Order book
  orderBook: CoOwnOrderBookSnapshot | null;
  isStreaming: boolean;
  hasGap: boolean;
  hasError: boolean;
  isForegroundStale: boolean;
  refetchBook: () => void;

  // Refresh all
  refreshAll: () => void;
  refreshing: boolean;
  refreshKey: number;
}

/**
 * useAssetDetailData — single hook for all data-fetching on the Co-Own
 * asset detail surface. Consolidates:
 *   - React Query asset + holdings (shared cache with Due Diligence)
 *   - Distributions (most recent, limit 1)
 *   - Corporate actions (latest 3)
 *   - Realtime order book stream (snapshot + delta)
 *   - Focus-driven refresh via useFocusEffect
 *
 * The hook mirrors the exact patterns from AssetDetailScreen so the
 * extraction is a pure behaviour-preserving move.
 */
export function useAssetDetailData(
  options: UseAssetDetailDataOptions,
): UseAssetDetailDataResult {
  const { assetId, userId, enabled = true } = options;

  // ── Shared cache (deduplicated with AssetDueDiligenceScreen) ──
  // When disabled, pass null so the underlying React Query hooks short-
  // circuit their fetchers without firing network requests.
  const assetQuery = useCoOwnAssetQuery(enabled ? assetId : null);
  const holdingsQuery = useCoOwnHoldingsQuery(enabled ? userId : null);

  const asset = assetQuery.data ?? null;
  const isLoadingAsset = assetQuery.isLoading;
  const assetError = assetQuery.error;

  const yourHolding =
    holdingsQuery.data?.find((entry) => entry.assetId === assetId) ?? null;
  const isLoadingHoldings = userId ? holdingsQuery.isLoading : false;
  const holdingsError: unknown = userId ? holdingsQuery.isError : false;

  // ── Distributions (most recent for this asset) ──
  const [distributions, setDistributions] = React.useState<CoOwnDistribution[]>(
    [],
  );
  const [distributionsLoading, setDistributionsLoading] =
    React.useState(true);
  const [distributionsFailed, setDistributionsFailed] = React.useState(false);

  // ── Corporate actions (latest 3 for the ownership timeline) ──
  const [corporateActions, setCorporateActions] = React.useState<
    CoOwnCorporateAction[]
  >([]);
  const [corporateActionsLoading, setCorporateActionsLoading] =
    React.useState(true);
  const [corporateActionsFailed, setCorporateActionsFailed] =
    React.useState(false);

  // ── Focus refresh key — bumped on navigation focus to re-run effects ──
  const [refreshKey, setRefreshKey] = React.useState(0);
  const [refreshing, setRefreshing] = React.useState(false);

  // ── Order book stream (snapshot + delta) ──
  const {
    orderBook,
    isStreaming,
    hasGap,
    hasError,
    isForegroundStale,
    refetch: refetchBook,
  } = useCoOwnOrderBookStream(enabled ? assetId : null);

  // Refresh when the screen regains focus (e.g. returning from
  // TradeConfirm → CoOwnOrderHistory → back). Without this, local state
  // can be stale after a trade because it is not backed by React Query.
  useFocusEffect(
    React.useCallback(() => {
      setRefreshKey((k) => k + 1);
    }, []),
  );

  // ── Last distribution fetch — most recent distribution for this asset.
  // The unclaimed badge treats only non-settled distributions as unclaimed;
  // a settled distribution is history, not an outstanding payout.
  React.useEffect(() => {
    if (!assetId || !enabled) {
      setDistributions([]);
      setDistributionsFailed(false);
      setDistributionsLoading(false);
      return;
    }
    let cancelled = false;
    setDistributionsFailed(false);
    setDistributionsLoading(true);
    void fetchCoOwnDistributions({ assetId, limit: 1 })
      .then((result) => {
        if (cancelled) return;
        setDistributions(result.items);
        setDistributionsFailed(false);
        setDistributionsLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setDistributions([]);
        setDistributionsFailed(true);
        setDistributionsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [assetId, enabled, refreshKey]);

  // ── Corporate actions — latest 3 events for the ownership timeline ──
  React.useEffect(() => {
    if (!assetId || !enabled) {
      setCorporateActions([]);
      setCorporateActionsFailed(false);
      setCorporateActionsLoading(false);
      return;
    }
    let cancelled = false;
    setCorporateActionsFailed(false);
    setCorporateActionsLoading(true);
    void fetchCoOwnAssetCorporateActions(assetId, { limit: 3 })
      .then((items) => {
        if (cancelled) return;
        setCorporateActions(items);
        setCorporateActionsFailed(false);
        setCorporateActionsLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setCorporateActions([]);
        setCorporateActionsFailed(true);
        setCorporateActionsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [assetId, enabled, refreshKey]);

  const refetchAsset = React.useCallback(() => {
    void assetQuery.refetch();
  }, [assetQuery]);

  const refetchHoldings = React.useCallback(() => {
    if (!userId) return;
    void holdingsQuery.refetch();
  }, [holdingsQuery, userId]);

  // Pull-to-refresh — reloads asset, order book, and holdings in parallel.
  // Bumping refreshKey also re-runs the distributions and corporate-actions
  // effects so every surface refreshes.
  const refreshAll = React.useCallback(() => {
    if (!assetId) return;
    setRefreshing(true);
    setRefreshKey((k) => k + 1);
    void Promise.allSettled([
      assetQuery.refetch(),
      refetchBook(),
      userId ? holdingsQuery.refetch() : Promise.resolve(),
    ]).then(() => {
      setRefreshing(false);
    });
  }, [assetId, assetQuery, holdingsQuery, userId, refetchBook]);

  const lastDistribution =
    distributions.length > 0 ? distributions[0] ?? null : null;

  return {
    asset,
    isLoadingAsset,
    assetError,
    refetchAsset,
    yourHolding,
    isLoadingHoldings,
    holdingsError,
    refetchHoldings,
    distributions,
    isLoadingDistributions: distributionsLoading,
    lastDistribution,
    distributionsFailed,
    corporateActions,
    isLoadingCorporateActions: corporateActionsLoading,
    corporateActionsFailed,
    orderBook,
    isStreaming,
    hasGap,
    hasError,
    isForegroundStale,
    refetchBook,
    refreshAll,
    refreshing,
    refreshKey,
  };
}
