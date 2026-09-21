import React from 'react';
import type { Listing } from '../domain';
import { MOCK_LISTINGS, MOCK_USERS } from '../data/mockData';
import { getApiBaseUrl } from '../lib/apiClient';
import { fetchHomeFeed } from '../services/feedApi';
import {
  ENABLE_RUNTIME_MOCKS,
  IS_INTEGRATION_TRUTH_MODE,
  MOCK_MODE,
  SHOW_BACKEND_DIAGNOSTICS,
} from '../constants/runtimeFlags';
import { recordListingsSync } from '../lib/backendDiagnostics';
import { BackendDiagnosticsOverlay } from '../dev/BackendDiagnosticsOverlay';

interface BackendDataContextValue {
  listings: Listing[];
  source: 'api' | 'fixture' | 'cache' | 'offline-cache';
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
  const [source, setSource] = React.useState<BackendDataContextValue['source']>('api');
  const [isSyncing, setIsSyncing] = React.useState(false);
  const [lastError, setLastError] = React.useState<string | null>(null);
  const [cursor, setCursor] = React.useState<string | undefined>(undefined);
  const [hasMore, setHasMore] = React.useState(false);
  const [isLoadingMore, setIsLoadingMore] = React.useState(false);
  const apiBaseUrl = React.useMemo(() => getApiBaseUrl(), []);
  // Latest committed listings, readable inside the stable refreshListings
  // callback — decides whether a failed refresh can fall back to last-good
  // content without re-creating the callback (and re-firing the load
  // effect that depends on it).
  const listingsRef = React.useRef<Listing[]>(listings);
  React.useEffect(() => {
    listingsRef.current = listings;
  }, [listings]);

  // ── Request ordering (FRESH-02) ──
  // refreshListings has several independent callers — the mount effect,
  // discovery pull-to-refresh and the checkout settle/cancel paths — and
  // nothing serialized them. A monotonic epoch gives latest-wins
  // semantics: a slower older response can never roll back the
  // listings/cursor/lastError a newer refresh already committed, and a
  // stale failure can't downgrade fresh content to source:'cache'. The
  // in-flight count keeps isSyncing true until EVERY pending refresh
  // settles — the first finisher no longer clears the flag under a
  // second request. Same epoch convention as useDiscoverySearch.
  const refreshEpochRef = React.useRef(0);
  const refreshInFlightRef = React.useRef(0);

  const refreshListings = React.useCallback(async () => {
    const epoch = ++refreshEpochRef.current;
    refreshInFlightRef.current += 1;
    setIsSyncing(true);
    // Home feed — GET /feed/home is the canonical blended feed endpoint:
    // it serves ranked listing units (including promoted "Sponsored" slots
    // with disclosure + promotionId) plus poster/look units. Only listing
    // units land in `listings`; creator units are carried by their own
    // surfaces. Cursor semantics are identical to /listings.
    try {
      const result = await fetchHomeFeed();
      if (epoch !== refreshEpochRef.current) {
        // A newer refresh was issued while this one was in flight — this
        // response is a dead identity. The sync still happened, so the
        // diagnostic is recorded, but every state write is dropped:
        // applying it would roll back (or falsely downgrade) the newer
        // refresh's content.
        recordListingsSync(result.listings.length, result.error ?? null);
        return;
      }
      if (result.listings.length > 0) {
        setListings(result.listings);
        setCursor(result.nextCursor ?? undefined);
        setHasMore(Boolean(result.nextCursor));
        setLastError(result.error ?? null);
        setSource('api');
      } else if (ENABLE_RUNTIME_MOCKS) {
        // fixture-design mode: substitute demo listings so design work proceeds
        // without a live backend. This branch never runs in integration-truth or
        // production modes — empty API responses stay empty there.
        setListings(DEVELOPMENT_LISTINGS);
        setCursor(undefined);
        setHasMore(false);
        setLastError(null);
        setSource('fixture');
      } else if (result.failed) {
        // FRESH-02: the request failed — keep the last-good listings rather
        // than blanking the app-wide cache. `lastError` carries the failure
        // for the inline retry banner; `source: 'cache'` marks the on-screen
        // content as last-good (getBackendSyncStatus already renders it as
        // cached/offline). Cursor/hasMore are preserved — they belong to the
        // page still on screen, so pagination stays alive for it.
        const hadLastGood = listingsRef.current.length > 0;
        setSource(hadLastGood ? 'cache' : 'api');
        setLastError(result.error ?? 'Couldn’t refresh the feed.');
        if (IS_INTEGRATION_TRUTH_MODE) {
          console.warn(
            `[BackendDataContext] listings refresh failed; keeping ${listingsRef.current.length} ` +
              `last-good listing(s): ${result.error}`,
          );
        }
      } else {
        // Successful response with zero listings — the feed is genuinely
        // empty, so clearing is the truthful state.
        setListings([]);
        setCursor(undefined);
        setHasMore(false);
        setLastError(result.error ?? null);
        // integration-truth mode keeps source as 'api' so consumers can tell the
        // API was the source of truth (even when it returned an empty page).
        setSource('api');
        if (IS_INTEGRATION_TRUTH_MODE && result.error) {
          console.warn(
            `[BackendDataContext] integration-truth mode: listings API returned no results. ` +
              `Backend error honoured (mock fallback suppressed): ${result.error}`,
          );
        }
      }
      recordListingsSync(result.listings.length, result.error ?? null);
    } finally {
      // In-flight count, not first-finisher: isSyncing only clears when
      // every pending refresh has settled.
      refreshInFlightRef.current -= 1;
      if (refreshInFlightRef.current === 0) {
        setIsSyncing(false);
      }
    }
  }, []);

  const loadMoreListings = React.useCallback(async () => {
    if (!hasMore || !cursor || isLoadingMore || isSyncing) return;
    setIsLoadingMore(true);
    try {
      const result = await fetchHomeFeed(cursor);
      if (result.listings.length > 0) {
        setListings((prev) => {
          const existingIds = new Set(prev.map((l) => l.id));
          const newOnes = result.listings.filter((l) => !existingIds.has(l.id));
          return [...prev, ...newOnes];
        });
        setCursor(result.nextCursor ?? undefined);
        setHasMore(Boolean(result.nextCursor));
      } else {
        setCursor(undefined);
        setHasMore(false);
      }
      recordListingsSync(result.listings.length, result.error ?? null);
    } catch {
      recordListingsSync(0, 'load-more-failed');
    } finally {
      setIsLoadingMore(false);
    }
  }, [hasMore, cursor, isLoadingMore, isSyncing]);

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
      {SHOW_BACKEND_DIAGNOSTICS ? <BackendDiagnosticsOverlay /> : null}
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
