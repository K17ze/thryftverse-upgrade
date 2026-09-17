import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useBucketedServerClock } from '../useServerClock';
import {
  getAuctionHome,
  getAuctionFacets,
  type AuctionFacets,
} from '../../services/marketApi';
import {
  toViewModel,
  EMPTY_HOME_DATA,
  type HomeData,
  type AuctionBrowseState,
} from '../../utils/auctionHomeLogic';

export interface UseAuctionHomeDataResult {
  homeData: HomeData;
  loading: boolean;
  refreshing: boolean;
  setRefreshing: React.Dispatch<React.SetStateAction<boolean>>;
  error: string | null;
  facets: AuctionFacets | null;
  facetsLoading: boolean;
  browseRefreshTick: number;
  setBrowseRefreshTick: React.Dispatch<React.SetStateAction<number>>;
  fetchHome: () => Promise<void>;
  secondClock: number;
  minuteClock: number;
  needsResync: boolean;
}

export function useAuctionHomeData({
  filterSheetVisible,
  draftBrowse,
}: {
  filterSheetVisible: boolean;
  draftBrowse: AuctionBrowseState;
}): UseAuctionHomeDataResult {
  const [homeData, setHomeData] = useState<HomeData>(EMPTY_HOME_DATA);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [facets, setFacets] = useState<AuctionFacets | null>(null);
  const [facetsLoading, setFacetsLoading] = useState(false);
  const facetsReqIdRef = useRef(0);

  const [browseRefreshTick, setBrowseRefreshTick] = useState(0);

  const { secondClock, minuteClock, resync, needsResync, markResyncFailed, clearResyncFailed } = useBucketedServerClock(homeData.serverNow);

  const requestIdRef = useRef(0);

  const fetchHome = useCallback(async () => {
    setLoading(true);
    setError(null);
    const reqId = ++requestIdRef.current;
    try {
      const response = await getAuctionHome();
      if (reqId !== requestIdRef.current) return;

      const attentionItem = response.attention.item ? toViewModel(response.attention.item) : null;
      setHomeData({
        attentionItem,
        attentionReason: response.attention.reason,
        activity: response.activity,
        closingSoon: response.closingSoon.map(toViewModel),
        live: response.live.map(toViewModel),
        upcoming: response.upcoming.map(toViewModel),
        categoryWorlds: response.categoryWorlds,
        recentlyClosed: response.recentlyClosed.map(toViewModel),
        sellerSummary: response.sellerSummary,
        sellerAuctions: response.sellerAuctions.map(toViewModel),
        watchlist: response.watchlist.map(toViewModel),
        serverNow: response.serverNow,
      });

      if (response.serverNow) {
        resync(response.serverNow);
        clearResyncFailed();
      }
    } catch (err) {
      if (reqId === requestIdRef.current) {
        setError('Unable to load auctions');
        markResyncFailed();
      }
    } finally {
      if (reqId === requestIdRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [resync, clearResyncFailed, markResyncFailed]);

  // useFocusEffect ensures the auction home re-fetches whenever the user
  // navigates back to it (e.g., after creating a new auction).
  useFocusEffect(
    useCallback(() => {
      void fetchHome();
    }, [fetchHome])
  );

  useEffect(() => {
    if (needsResync) {
      void fetchHome();
    }
  }, [needsResync, fetchHome]);

  // ── Fetch server-driven facets when the filter sheet opens ──
  // Provides canonical category list + price range + status counts
  // independent of loaded home inventory (Phase 2 Finding D fix).
  // Passes the full draft state so the CTA count reflects all active
  // filters, not just the scope (2026 best practice: live counts).
  const fetchFacets = useCallback(async (draft: AuctionBrowseState) => {
    setFacetsLoading(true);
    const reqId = ++facetsReqIdRef.current;
    try {
      const result = await getAuctionFacets({
        scope: draft.scope,
        query: draft.query,
        categories: draft.categories.length > 0 ? draft.categories.join(',') : undefined,
        priceMin: draft.priceMin,
        priceMax: draft.priceMax,
      });
      if (reqId !== facetsReqIdRef.current) return;
      setFacets(result);
    } catch {
      // Non-fatal — filter sheet falls back to derived categories
      if (reqId === facetsReqIdRef.current) {
        setFacets(null);
      }
    } finally {
      if (reqId === facetsReqIdRef.current) {
        setFacetsLoading(false);
      }
    }
  }, []);

  // Facets only depend on scope/query/categories/price — sort is not a
  // facets param, so sort taps no longer issue requests at all. A ref keeps
  // the latest draft readable inside the debounce without making the whole
  // object a dependency.
  const draftRef = useRef(draftBrowse);
  draftRef.current = draftBrowse;
  const facetsKey = `${draftBrowse.scope}|${draftBrowse.query ?? ''}|${draftBrowse.categories.join(',')}|${draftBrowse.priceMin ?? ''}|${draftBrowse.priceMax ?? ''}`;
  useEffect(() => {
    if (!filterSheetVisible) return;
    // Debounce — 300ms collapses a tap burst into one request.
    const handle = setTimeout(() => void fetchFacets(draftRef.current), 300);
    return () => clearTimeout(handle);
  }, [filterSheetVisible, facetsKey, fetchFacets]);

  return {
    homeData,
    loading,
    refreshing,
    setRefreshing,
    error,
    facets,
    facetsLoading,
    browseRefreshTick,
    setBrowseRefreshTick,
    fetchHome,
    secondClock,
    minuteClock,
    needsResync,
  };
}
