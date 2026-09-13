import React, { useCallback, useMemo, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useBucketedServerClock, resolveAuctionTiming } from '../useServerClock';
import { listAuctions } from '../../services/marketApi';
import type { AuctionHomeItem } from '../../utils/auctionHomeLogic';
import { sellerAuctionBucket } from '../../utils/sellerAuctionState';
import {
  computeStats,
  toViewModel,
  type FlatListItem,
  type SellerStats,
  type SellerTab } from '../../components/auction/sellerAuctionCentreViewModels';

export interface UseSellerAuctionCentreDataResult {
  activeTab: SellerTab;
  setActiveTab: React.Dispatch<React.SetStateAction<SellerTab>>;
  stats: SellerStats;
  flatData: FlatListItem[];
  secondClock: number;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  cursor: string | null;
  loadingMore: boolean;
  fetchAuctions: (isRefresh: boolean) => Promise<void>;
  handleRefresh: () => void;
  handleLoadMore: () => Promise<void>;
}

export function useSellerAuctionCentreData(): UseSellerAuctionCentreDataResult {
  const [activeTab, setActiveTab] = React.useState<SellerTab>('scheduled');
  const [allItems, setAllItems] = React.useState<AuctionHomeItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [cursor, setCursor] = React.useState<string | null>(null);
  const [loadingMore, setLoadingMore] = React.useState(false);

  const requestIdRef = useRef(0);

  const fetchAuctions = React.useCallback(async (isRefresh: boolean) => {
    const reqId = ++requestIdRef.current;
    if (!isRefresh) setLoading(true);
    setError(null);
    try {
      const result = await listAuctions({ seller: 'me', status: 'all', sort: 'endingSoon', limit: 50 });
      if (reqId !== requestIdRef.current) return;
      setAllItems(result.items.map(toViewModel));
      setCursor(result.nextCursor);
    } catch {
      if (reqId === requestIdRef.current) {
        setError('Unable to load your auctions');
      }
    } finally {
      if (reqId === requestIdRef.current) {
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
    }
  }, []);

  React.useEffect(() => {
    void fetchAuctions(false);
  }, [fetchAuctions]);

  const { secondClock, minuteClock, needsResync } =
    useBucketedServerClock(null);

  React.useEffect(() => {
    if (needsResync) void fetchAuctions(true);
  }, [needsResync, fetchAuctions]);

  // Refetch on screen focus — pushed screens (auction detail actions,
  // create auction) keep this list mounted, so auctions cancelled,
  // settled, or created elsewhere would stay invisible until remount.
  // Skip the initial focus (the mount effect owns the first load) and use
  // the silent isRefresh path so the list never flashes skeletons.
  const hasFocusedOnceRef = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!hasFocusedOnceRef.current) {
        hasFocusedOnceRef.current = true;
        return;
      }
      void fetchAuctions(true);
    }, [fetchAuctions])
  );

  const stats = useMemo(() => computeStats(allItems, minuteClock), [allItems, minuteClock]);

  const filteredItems = useMemo(() => {
    const clock = minuteClock;
    return allItems.filter((item) => {
      const timing = resolveAuctionTiming(item, clock);
      return sellerAuctionBucket(timing.effectiveState, item.bidCount) === activeTab;
    });
  }, [allItems, activeTab, minuteClock]);

  // Flatten the single section into a plain array for FlashList:
  //   [header(activeTab), ...filteredItems]
  // The header is always at index 0 so it can be made sticky. When the section
  // has no rows, an explicit 'empty' item is emitted so the loading / error /
  // empty-state content still renders beneath the sticky tab rail — mirroring
  // SectionList's ListEmptyComponent behaviour (which FlashList cannot trigger
  // because the header keeps `data` non-empty).
  const flatData = useMemo<FlatListItem[]>(() => {
    if (filteredItems.length === 0) {
      return [{ type: 'empty' }];
    }
    return filteredItems.map((i) => ({ type: 'item', ...i }));
  }, [filteredItems]);

  const handleRefresh = React.useCallback(() => {
    setRefreshing(true);
    void fetchAuctions(true);
  }, [fetchAuctions]);

  const handleLoadMore = React.useCallback(async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const result = await listAuctions({ seller: 'me', status: 'all', sort: 'endingSoon', cursor, limit: 50 });
      setAllItems((prev) => {
        const existingIds = new Set(prev.map((a) => a.id));
        const newItems = result.items.map(toViewModel).filter((a) => !existingIds.has(a.id));
        return [...prev, ...newItems];
      });
      setCursor(result.nextCursor);
    } catch {
      // silent
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, loadingMore]);

  return {
    activeTab,
    setActiveTab,
    stats,
    flatData,
    secondClock,
    loading,
    refreshing,
    error,
    cursor,
    loadingMore,
    fetchAuctions,
    handleRefresh,
    handleLoadMore };
}
