import React, { useCallback, useEffect, useRef, useState } from 'react';
import { listAuctions } from '../../services/marketApi';
import { useStore } from '../../store/useStore';
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
  status: 'idle' | 'loading' | 'ready' | 'empty' | 'error' | 'auth';
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
  // 'Watching' scope requires authentication — a logged-out user has no
  // watchlist, so the watchedOnly request would hard-401. Surface a
  // dedicated auth state instead of a misleading "filter failed" error.
  const viewerId = useStore((s) => s.currentUser?.id ?? null);
  const watchingNeedsAuth = scopeUsesWatchedOnly(browseState.scope) && !viewerId;

  // ── Browse results fetching (when filters are active) ──
  useEffect(() => {
    if (!isBrowsing) {
      setBrowseResult({ status: 'idle', items: [], cursor: null });
      return;
    }
    if (watchingNeedsAuth) {
      setBrowseResult({ status: 'auth', items: [], cursor: null });
      return;
    }
    const reqId = ++browseReqIdRef.current;
    setBrowseResult({ status: 'loading', items: [], cursor: null });
    const apiStatus = scopeToApiStatus(browseState.scope);
    const apiSort = sortToApiSort(browseState.sort);
    // Multi-select: send every selected category — the backend accepts a
    // CSV list. Only sending categories[0] silently dropped selections 2..n.
    const categories = browseState.categories.length > 0 ? browseState.categories.join(',') : undefined;
    listAuctions({
      status: apiStatus,
      sort: apiSort,
      categories,
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
  }, [browseState, isBrowsing, browseRefreshTick, watchingNeedsAuth]);

  const loadMoreBrowse = useCallback(async () => {
    if (browseResult.cursor === null || isLoadingMoreBrowse) return;
    setIsLoadingMoreBrowse(true);
    setPaginationError(null);
    const reqId = ++browseReqIdRef.current;
    try {
      const apiStatus = scopeToApiStatus(browseState.scope);
      const apiSort = sortToApiSort(browseState.sort);
      const categories = browseState.categories.length > 0 ? browseState.categories.join(',') : undefined;
      const result = await listAuctions({
        status: apiStatus,
        sort: apiSort,
        categories,
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
