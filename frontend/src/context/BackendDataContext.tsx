import React from 'react';
import { Listing, MOCK_LISTINGS, MOCK_USERS } from '../data/mockData';
import { getApiBaseUrl } from '../lib/apiClient';
import { fetchListingsFromApi } from '../services/listingsApi';
import { ENABLE_RUNTIME_MOCKS } from '../constants/runtimeFlags';
import { recordListingsSync } from '../lib/backendDiagnostics';
import { BackendDiagnosticsOverlay } from '../dev/BackendDiagnosticsOverlay';

interface BackendDataContextValue {
  listings: Listing[];
  source: 'api';
  apiBaseUrl: string;
  isSyncing: boolean;
  lastError: string | null;
  hasMore: boolean;
  isLoadingMore: boolean;
  refreshListings: () => Promise<void>;
  loadMoreListings: () => Promise<void>;
  updateListing: (id: string, updates: Partial<Listing>) => void;
  deleteListing: (id: string) => void;
}

const BackendDataContext = React.createContext<BackendDataContextValue | undefined>(undefined);

const DEVELOPMENT_LISTINGS = MOCK_LISTINGS.map((listing) => {
  const seller = MOCK_USERS.find((candidate) => candidate.id === listing.sellerId);
  return {
    ...listing,
    seller: seller ? {
      id: seller.id,
      username: seller.username,
      avatar: seller.avatar || null,
      rating: seller.rating,
      reviewCount: seller.reviewCount,
      location: seller.location,
    } : null,
  } satisfies Listing;
});

export function BackendDataProvider({ children }: { children: React.ReactNode }) {
  const [listings, setListings] = React.useState<Listing[]>([]);
  const [source] = React.useState<'api'>('api');
  const [isSyncing, setIsSyncing] = React.useState(false);
  const [lastError, setLastError] = React.useState<string | null>(null);
  const [cursor, setCursor] = React.useState<string | undefined>(undefined);
  const [hasMore, setHasMore] = React.useState(false);
  const [isLoadingMore, setIsLoadingMore] = React.useState(false);
  const apiBaseUrl = React.useMemo(() => getApiBaseUrl(), []);

  const refreshListings = React.useCallback(async () => {
    setIsSyncing(true);
    const result = await fetchListingsFromApi();
    if (result.listings.length > 0) {
      setListings(result.listings);
      setCursor(result.nextCursor);
      setHasMore(Boolean(result.nextCursor));
      setLastError(result.error ?? null);
    } else if (ENABLE_RUNTIME_MOCKS) {
      setListings(DEVELOPMENT_LISTINGS);
      setCursor(undefined);
      setHasMore(false);
      setLastError(null);
    } else {
      setListings([]);
      setCursor(undefined);
      setHasMore(false);
      setLastError(result.error ?? null);
    }
    recordListingsSync(result.listings.length, result.error ?? null);
    setIsSyncing(false);
  }, []);

  const loadMoreListings = React.useCallback(async () => {
    if (!cursor || isLoadingMore || isSyncing) return;
    setIsLoadingMore(true);
    const result = await fetchListingsFromApi(cursor);
    if (result.listings.length > 0) {
      setListings((prev) => {
        const existingIds = new Set(prev.map((l) => l.id));
        const newOnes = result.listings.filter((l) => !existingIds.has(l.id));
        return [...prev, ...newOnes];
      });
      setCursor(result.nextCursor);
      setHasMore(Boolean(result.nextCursor));
    } else {
      setHasMore(false);
    }
    recordListingsSync(result.listings.length, result.error ?? null);
    setIsLoadingMore(false);
  }, [cursor, isLoadingMore, isSyncing]);

  const updateListing = React.useCallback((id: string, updates: Partial<Listing>) => {
    setListings((prev) =>
      prev.map((l) => (l.id === id ? { ...l, ...updates } : l))
    );
  }, []);

  const deleteListing = React.useCallback((id: string) => {
    setListings((prev) => prev.filter((l) => l.id !== id));
  }, []);

  React.useEffect(() => {
    void refreshListings();
  }, [refreshListings]);

  const value = React.useMemo<BackendDataContextValue>(
    () => ({
      listings,
      source,
      apiBaseUrl,
      isSyncing,
      lastError,
      hasMore,
      isLoadingMore,
      refreshListings,
      loadMoreListings,
      updateListing,
      deleteListing,
    }),
    [apiBaseUrl, deleteListing, isSyncing, lastError, listings, refreshListings, loadMoreListings, hasMore, isLoadingMore, source, updateListing]
  );

  return (
    <BackendDataContext.Provider value={value}>
      {children}
      {__DEV__ ? <BackendDiagnosticsOverlay /> : null}
    </BackendDataContext.Provider>
  );
}

export function useBackendData() {
  const context = React.useContext(BackendDataContext);
  if (!context) {
    throw new Error('useBackendData must be used within BackendDataProvider');
  }

  return context;
}
