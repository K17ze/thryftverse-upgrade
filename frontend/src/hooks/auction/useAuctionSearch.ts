import React, { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { listAuctions } from '../../services/marketApi';
import {
  createSearchState,
  IDLE_SEARCH_STATE,
  toViewModel,
  scopeToApiStatus,
  sortToApiSort,
  type AuctionHomeItem,
  type AuctionSearchState,
  type AuctionBrowseState,
} from '../../utils/auctionHomeLogic';

const RECENT_AUCTION_SEARCHES_KEY = '@thryftverse_recent_auction_searches';

export interface UseAuctionSearchResult {
  searchOverlayVisible: boolean;
  setSearchOverlayVisible: React.Dispatch<React.SetStateAction<boolean>>;
  searchState: AuctionSearchState;
  setSearchState: React.Dispatch<React.SetStateAction<AuctionSearchState>>;
  searchQuery: string;
  debouncedQuery: string;
  isLoadingMoreSearch: boolean;
  searchReqIdRef: React.MutableRefObject<number>;
  recentSearches: string[];
  saveRecentSearch: (term: string) => Promise<void>;
  clearRecentSearches: () => void;
  handleSearchChange: (text: string) => void;
  handleClearSearch: () => void;
  loadMoreSearch: () => Promise<void>;
}

export function useAuctionSearch({
  browseState,
  setPaginationError,
}: {
  browseState: AuctionBrowseState;
  setPaginationError: React.Dispatch<React.SetStateAction<string | null>>;
}): UseAuctionSearchResult {
  const [searchOverlayVisible, setSearchOverlayVisible] = useState(false);
  const [searchState, setSearchState] = useState<AuctionSearchState>(IDLE_SEARCH_STATE);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [isLoadingMoreSearch, setIsLoadingMoreSearch] = useState(false);

  // ── Recent auction searches (persisted, per audit doc 07) ──
  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  useEffect(() => {
    AsyncStorage.getItem(RECENT_AUCTION_SEARCHES_KEY).then((raw) => {
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as string[];
          if (Array.isArray(parsed)) setRecentSearches(parsed);
        } catch { /* ignore corrupt */ }
      }
    }).catch(() => { /* non-fatal */ });
  }, []);

  const saveRecentSearch = useCallback(async (term: string) => {
    setRecentSearches((prev) => {
      const updated = [term, ...prev.filter((s) => s !== term)].slice(0, 6);
      void AsyncStorage.setItem(RECENT_AUCTION_SEARCHES_KEY, JSON.stringify(updated)).catch(() => {});
      return updated;
    });
  }, []);

  const clearRecentSearches = useCallback(() => {
    setRecentSearches([]);
    void AsyncStorage.removeItem(RECENT_AUCTION_SEARCHES_KEY).catch(() => {});
  }, []);

  const searchReqIdRef = useRef(0);

  const handleSearchChange = useCallback((text: string) => {
    searchReqIdRef.current++;
    setSearchQuery(text);
    setDebouncedQuery(text);
    if (text.trim().length === 0) {
      setSearchState(IDLE_SEARCH_STATE);
    } else {
      setSearchState(createSearchState(text, 'loading'));
    }
    setPaginationError(null);
  }, [setPaginationError]);

  const handleClearSearch = useCallback(() => {
    searchReqIdRef.current++;
    setSearchQuery('');
    setDebouncedQuery('');
    setSearchState(IDLE_SEARCH_STATE);
    setPaginationError(null);
  }, [setPaginationError]);

  useEffect(() => {
    if (debouncedQuery.trim().length === 0) {
      setSearchState(IDLE_SEARCH_STATE);
      return;
    }
    const timer = setTimeout(() => {
      const reqId = ++searchReqIdRef.current;
      setSearchState(createSearchState(debouncedQuery, 'loading'));
      listAuctions({ query: debouncedQuery, status: scopeToApiStatus(browseState.scope), sort: sortToApiSort(browseState.sort) ?? 'endingSoon', limit: 30 })
        .then((result) => {
          if (reqId !== searchReqIdRef.current) return;
          const items = result.items.map(toViewModel);
          setSearchState(createSearchState(debouncedQuery, items.length > 0 ? 'ready' : 'empty', items, result.nextCursor));
          // Persist recent search only when results are found
          if (items.length > 0) {
            void saveRecentSearch(debouncedQuery.trim());
          }
        })
        .catch(() => {
          if (reqId !== searchReqIdRef.current) return;
          setSearchState(createSearchState(debouncedQuery, 'error'));
        });
    }, 400);
    return () => clearTimeout(timer);
  }, [debouncedQuery, browseState.scope, browseState.sort, saveRecentSearch]);

  useEffect(() => {
    return () => { searchReqIdRef.current++; };
  }, []);

  const loadMoreSearch = useCallback(async () => {
    if (!searchState.cursor || isLoadingMoreSearch) return;
    setIsLoadingMoreSearch(true);
    setPaginationError(null);
    const reqId = ++searchReqIdRef.current;
    try {
      const result = await listAuctions({ query: debouncedQuery, status: scopeToApiStatus(browseState.scope), sort: sortToApiSort(browseState.sort) ?? 'endingSoon', cursor: searchState.cursor, limit: 30 });
      if (reqId !== searchReqIdRef.current) return;
      setSearchState((prev) => {
        const existingIds = new Set(prev.items.map((a) => a.id));
        const newItems = result.items.map(toViewModel).filter((a: AuctionHomeItem) => !existingIds.has(a.id));
        return { ...prev, items: [...prev.items, ...newItems], cursor: result.nextCursor };
      });
    } catch {
      if (reqId === searchReqIdRef.current) {
        setPaginationError('Failed to load more results');
      }
    } finally {
      if (reqId === searchReqIdRef.current) {
        setIsLoadingMoreSearch(false);
      }
    }
  }, [searchState.cursor, isLoadingMoreSearch, debouncedQuery, browseState.scope, browseState.sort, setPaginationError]);

  return {
    searchOverlayVisible,
    setSearchOverlayVisible,
    searchState,
    setSearchState,
    searchQuery,
    debouncedQuery,
    isLoadingMoreSearch,
    searchReqIdRef,
    recentSearches,
    saveRecentSearch,
    clearRecentSearches,
    handleSearchChange,
    handleClearSearch,
    loadMoreSearch,
  };
}
