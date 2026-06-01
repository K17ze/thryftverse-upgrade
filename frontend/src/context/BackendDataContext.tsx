import React from 'react';
import { Listing, MOCK_LISTINGS } from '../data/mockData';
import { getApiBaseUrl } from '../lib/apiClient';
import { fetchListingsFromApiWithFallback } from '../services/listingsApi';
import { ENABLE_RUNTIME_MOCKS } from '../constants/runtimeFlags';

interface BackendDataContextValue {
  listings: Listing[];
  source: 'api' | 'mock';
  apiBaseUrl: string;
  isSyncing: boolean;
  lastError: string | null;
  refreshListings: () => Promise<void>;
  updateListing: (id: string, updates: Partial<Listing>) => void;
  deleteListing: (id: string) => void;
}

const BackendDataContext = React.createContext<BackendDataContextValue | undefined>(undefined);

export function BackendDataProvider({ children }: { children: React.ReactNode }) {
  const [listings, setListings] = React.useState<Listing[]>(ENABLE_RUNTIME_MOCKS ? MOCK_LISTINGS : []);
  const [source, setSource] = React.useState<'api' | 'mock'>(ENABLE_RUNTIME_MOCKS ? 'mock' : 'api');
  const [isSyncing, setIsSyncing] = React.useState(false);
  const [lastError, setLastError] = React.useState<string | null>(null);
  const apiBaseUrl = React.useMemo(() => getApiBaseUrl(), []);

  const refreshListings = React.useCallback(async () => {
    setIsSyncing(true);
    const result = await fetchListingsFromApiWithFallback(ENABLE_RUNTIME_MOCKS ? MOCK_LISTINGS : []);
    setListings(result.listings);
    setSource(result.source);
    setLastError(result.error ?? null);
    setIsSyncing(false);
  }, []);

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
      refreshListings,
      updateListing,
      deleteListing,
    }),
    [apiBaseUrl, deleteListing, isSyncing, lastError, listings, refreshListings, source, updateListing]
  );

  return <BackendDataContext.Provider value={value}>{children}</BackendDataContext.Provider>;
}

export function useBackendData() {
  const context = React.useContext(BackendDataContext);
  if (!context) {
    throw new Error('useBackendData must be used within BackendDataProvider');
  }

  return context;
}
