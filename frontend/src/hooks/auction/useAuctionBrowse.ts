import React, { useCallback, useEffect, useRef, useState } from 'react';
import { listAuctions } from '../../services/marketApi';
import {
  toViewModel,
  hasActiveFilters,
  scopeToApiStatus,
  scopeUsesWatchedOnly,
  sortToApiSort,
  type AuctionHomeItem,
  type AuctionBrowseState,
} from '../../utils/auctionHomeLogic';

export interface BrowseResult {
  status: 'idle' | 'loading' | 'ready' | 'empty' | 'error';
  items: AuctionHomeItem[];
  cursor: string | null;
}

export interface UseAuctionBrowseResult {
  browseResult: BrowseResult;
  setBrowseResult: React.Dispatch<React.SetStateAction<BrowseResult>>;
  isLoadingMoreBrowse: boolean;
  loadMoreBrowse: () => Promise<void>;
}

export function useAuctionBrowse({
  browseState,
  browseRefreshTick,
  setPaginationError,
}: {
  browseState: AuctionBrowseState;
  browseRefreshTick: number;
  setPaginationError: React.Dispatch<React.SetStateAction<string | null>>;
}): UseAuctionBrowseResult {
  const [browseResult, setBrowseResult] = useState<BrowseResult>({
    status: 'idle',
    items: [],
    cursor: null,
  });
  const [isLoadingMoreBrowse, setIsLoadingMoreBrowse] = useState(false);
  const browseReqIdRef = useRef(0);

  const isBrowsing = hasActiveFilters(browseState);

  // ── Browse results fetching (when filters are active) ──
  useEffect(() => {
    if (!isBrowsing) {
      setBrowseResult({ status: 'idle', items: [], cursor: null });
      return;
    }
    const reqId = ++browseReqIdRef.current;
    setBrowseResult({ status: 'loading', items: [], cursor: null });
    const apiStatus = scopeToApiStatus(browseState.scope);
    const apiSort = sortToApiSort(browseState.sort);
    const category = browseState.categories.length > 0 ? browseState.categories[0] : undefined;
    listAuctions({
      status: apiStatus,
      sort: apiSort,
      category,
      query: browseState.query,
      priceMin: browseState.priceMin,
      priceMax: browseState.priceMax,
      watchedOnly: scopeUsesWatchedOnly(browseState.scope) ? true : undefined,
      limit: 30,
    })
      .then((result) => {
        if (reqId !== browseReqIdRef.current) return;
        const items = result.items.map(toViewModel);
        setBrowseResult({
          status: items.length > 0 ? 'ready' : 'empty',
          items,
          cursor: result.nextCursor,
        });
      })
      .catch(() => {
        if (reqId !== browseReqIdRef.current) return;
        setBrowseResult({ status: 'error', items: [], cursor: null });
      });
  }, [browseState, isBrowsing, browseRefreshTick]);

  const loadMoreBrowse = useCallback(async () => {
    if (browseResult.cursor === null || isLoadingMoreBrowse) return;
    setIsLoadingMoreBrowse(true);
    setPaginationError(null);
    const reqId = ++browseReqIdRef.current;
    try {
      const apiStatus = scopeToApiStatus(browseState.scope);
      const apiSort = sortToApiSort(browseState.sort);
      const category = browseState.categories.length > 0 ? browseState.categories[0] : undefined;
      const result = await listAuctions({
        status: apiStatus,
        sort: apiSort,
        category,
        query: browseState.query,
        priceMin: browseState.priceMin,
        priceMax: browseState.priceMax,
        watchedOnly: scopeUsesWatchedOnly(browseState.scope) ? true : undefined,
        cursor: browseResult.cursor,
        limit: 30,
      });
      if (reqId !== browseReqIdRef.current) return;
      setBrowseResult((prev) => {
        const existingIds = new Set(prev.items.map((a) => a.id));
        const newItems = result.items.map(toViewModel).filter((a: AuctionHomeItem) => !existingIds.has(a.id));
        return { ...prev, items: [...prev.items, ...newItems], cursor: result.nextCursor };
      });
    } catch {
      if (reqId === browseReqIdRef.current) {
        setPaginationError('Failed to load more results');
      }
    } finally {
      if (reqId === browseReqIdRef.current) {
        setIsLoadingMoreBrowse(false);
      }
    }
  }, [browseResult.cursor, isLoadingMoreBrowse, browseState, setPaginationError]);

  return {
    browseResult,
    setBrowseResult,
    isLoadingMoreBrowse,
    loadMoreBrowse,
  };
}
