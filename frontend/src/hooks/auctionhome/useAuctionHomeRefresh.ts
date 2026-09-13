import React, { useCallback } from 'react';
import { listAuctions } from '../../services/marketApi';
import {
  createSearchState,
  toViewModel,
  scopeToApiStatus,
  sortToApiSort,
  type AuctionBrowseState,
  type AuctionSearchState } from '../../utils/auctionHomeLogic';

/**
 * Pull-to-refresh orchestration shared by the three surfaces:
 *  - active search → re-runs the query and resolves refreshing in finally
 *  - active filters → bumps the browse tick and refetches home
 *  - default home → refetches home only
 */
export function useAuctionHomeRefresh({
  isSearching,
  isBrowsing,
  debouncedQuery,
  browseState,
  setRefreshing,
  setPaginationError,
  searchReqIdRef,
  setSearchState,
  setBrowseRefreshTick,
  fetchHome,
}: {
  isSearching: boolean;
  isBrowsing: boolean;
  debouncedQuery: string;
  browseState: AuctionBrowseState;
  setRefreshing: React.Dispatch<React.SetStateAction<boolean>>;
  setPaginationError: React.Dispatch<React.SetStateAction<string | null>>;
  searchReqIdRef: React.MutableRefObject<number>;
  setSearchState: React.Dispatch<React.SetStateAction<AuctionSearchState>>;
  setBrowseRefreshTick: React.Dispatch<React.SetStateAction<number>>;
  fetchHome: () => Promise<void>;
}): () => void {
  return useCallback(() => {
    setRefreshing(true);
    if (isSearching && debouncedQuery.trim().length > 0) {
      setPaginationError(null);
      const reqId = ++searchReqIdRef.current;
      setSearchState(createSearchState(debouncedQuery, 'loading'));
      listAuctions({ query: debouncedQuery, status: scopeToApiStatus(browseState.scope), sort: sortToApiSort(browseState.sort) ?? 'endingSoon', limit: 30 })
        .then((result) => {
          if (reqId !== searchReqIdRef.current) return;
          const items = result.items.map(toViewModel);
          setSearchState(createSearchState(debouncedQuery, items.length > 0 ? 'ready' : 'empty', items, result.nextCursor));
        })
        .catch(() => {
          if (reqId !== searchReqIdRef.current) return;
          setSearchState(createSearchState(debouncedQuery, 'error'));
        })
        .finally(() => {
          if (reqId === searchReqIdRef.current) {
            setRefreshing(false);
          }
        });
    } else if (isBrowsing) {
      setPaginationError(null);
      setBrowseRefreshTick((t) => t + 1);
      void fetchHome().finally(() => setRefreshing(false));
    } else {
      void fetchHome();
    }
  }, [fetchHome, isSearching, debouncedQuery, isBrowsing, browseState.scope, browseState.sort]);
}
