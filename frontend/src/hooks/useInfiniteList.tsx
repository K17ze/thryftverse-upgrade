import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { View, Text, ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import { useInfiniteQuery, type InfiniteData } from '@tanstack/react-query';
import { useAppTheme } from '../theme/ThemeContext';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Debounce window for `onEndReached` — prevents duplicate fetches when
 *  FlashList fires multiple near-end events in rapid succession (common
 *  during fast scrolls or momentum scrolling). */
const DEBOUNCE_MS = 300;

/** Default FlashList `estimatedItemSize`. FlashList v2 uses this only as a
 *  hint before the first cell is measured; 80pt covers the common card-row
 *  height across marketplace, auction and notification surfaces. */
const DEFAULT_ESTIMATED_ITEM_SIZE = 80;

/** Default `onEndReachedThreshold` — fires when the user is within half a
 *  viewport of the end, giving the next page time to load before the user
 *  reaches the bottom (smooth pagination, no blank gap). */
const DEFAULT_ON_END_REACHED_THRESHOLD = 0.5;

/** Default stale time — 2 minutes. Matches the existing infinite-query
 *  hooks in `useProfileSocialQueries` so refetch behaviour is consistent. */
const DEFAULT_STALE_TIME = 1000 * 60 * 2;

/** Default garbage-collection time — 30 minutes. Aligns with the
 *  `queryClient` default so inactive queries are evicted on the same
 *  cadence as the rest of the app. */
const DEFAULT_GC_TIME = 1000 * 60 * 30;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** A single page returned by the query function. */
export interface InfiniteListPage<T> {
  items: T[];
  nextCursor: string | null;
}

/**
 * Options for {@link useInfiniteList}.
 *
 * @typeParam T - The item type stored in the list.
 * @typeParam P - The parameter shape passed to `queryFn`. Must include a
 *   `cursor` field so the hook can inject the pagination cursor for each
 *   page request.
 */
export interface UseInfiniteListOptions<
  T,
  P extends { cursor: string | null },
> {
  /** React Query cache key. Should be stable across renders for the same
   *  logical list (include filter / sort values so each variant caches
   *  independently). */
  queryKey: string[];

  /** Fetcher that returns one page of items plus the next-page cursor.
   *  The hook injects `cursor` on each call; callers close over any
   *  additional parameters (filters, sort, search query, etc.). */
  queryFn: (params: P) => Promise<InfiniteListPage<T>>;

  /** Cursor for the first page. `null` or `undefined` (default) means
   *  start from the beginning. */
  initialCursor?: string | null;

  /** Whether the query should be enabled. When `false`, the hook returns
   *  an empty list and no fetch is performed. */
  enabled?: boolean;

  /** React Query `staleTime` — how long a page is considered fresh.
   *  Defaults to 2 minutes. */
  staleTime?: number;

  /** React Query `gcTime` — how long an inactive query is kept in cache
   *  before garbage collection. Defaults to 30 minutes. */
  gcTime?: number;

  /** FlashList `estimatedItemSize` hint. Defaults to 80. */
  estimatedItemSize?: number;

  /** FlashList `onEndReachedThreshold`. Defaults to 0.5. */
  onEndReachedThreshold?: number;
}

/**
 * Result returned by {@link useInfiniteList}.
 *
 * @typeParam T - The item type stored in the list.
 */
export interface UseInfiniteListResult<T> {
  /** Flattened items from all loaded pages. Empty array when no data has
   *  been loaded yet or the query is disabled. */
  items: T[];

  /** `true` during the initial page load (no data cached). */
  isLoading: boolean;

  /** `true` while fetching the next page (pagination). */
  isFetchingNextPage: boolean;

  /** `true` when the query is in an error state. */
  isError: boolean;

  /** The error object from the last failed fetch, or `null`. */
  error: unknown;

  /** Refetches all loaded pages from scratch. Returns a promise that
   *  resolves when the refetch completes. */
  refetch: () => Promise<unknown>;

  /** Fetches the next page (if one exists). No-op when `hasNextPage` is
   *  `false` or a fetch is already in flight. */
  fetchNextPage: () => Promise<unknown>;

  /** `true` when the last page returned a non-null `nextCursor`. */
  hasNextPage: boolean;

  /** `true` while a background refetch is in progress (data already
   *  exists). Useful for pull-to-refresh spinner control. */
  isRefetching: boolean;

  /** Drop-in handler for FlashList's `onEndReached`. Debounced 300 ms to
   *  prevent duplicate fetches. Guards against fetching when there is no
   *  next page or a fetch is already in flight. */
  onEndReached: () => void;

  /** Drop-in handler for `RefreshControl.onRefresh`. Triggers a full
   *  refetch of all pages. */
  onRefresh: () => void;

  /** Drop-in `ListEmptyComponent` for FlashList. Renders a loading
   *  indicator during initial load, an error state with a Retry button
   *  on error, and a neutral empty message otherwise. */
  ListEmptyComponent: React.ComponentType;

  /** Drop-in `ListFooterComponent` for FlashList. Renders a loading
   *  indicator while fetching the next page, and `null` otherwise. */
  ListFooterComponent: React.ComponentType;

  /** Drop-in `keyExtractor` for FlashList. Uses `item.id` when present
   *  (string or number), falls back to the numeric index. */
  keyExtractor: (item: T, index: number) => string;

  /** The resolved `estimatedItemSize` (option value or default). */
  estimatedItemSize: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Type guard: does `item` have an `id` property that is a string or number?
 * Used by {@link useInfiniteList} to build a stable `keyExtractor` without
 * requiring the item type to extend a specific interface.
 */
function hasStableId(
  item: unknown,
): item is { id: string | number } {
  if (typeof item !== 'object' || item === null) return false;
  const id = (item as { id?: unknown }).id;
  return typeof id === 'string' || typeof id === 'number';
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `useInfiniteList` — standardised FlashList + React Query infinite-scroll
 * hook.
 *
 * Wraps `useInfiniteQuery` from `@tanstack/react-query` and flattens the
 * paginated result into a single `items` array ready for FlashList. The
 * hook provides every prop a FlashList needs for pagination:
 *
 * - `items` — flattened data array
 * - `onEndReached` — debounced (300 ms) pagination trigger
 * - `onRefresh` — pull-to-refresh that refetches all pages
 * - `keyExtractor` — stable keys via `item.id` with index fallback
 * - `ListEmptyComponent` — loading / error / empty state
 * - `ListFooterComponent` — next-page loading indicator
 * - `estimatedItemSize` — FlashList cell-size hint
 *
 * ## Usage
 *
 * ```tsx
 * const {
 *   items,
 *   isLoading,
 *   isFetchingNextPage,
 *   onEndReached,
 *   onRefresh,
 *   ListEmptyComponent,
 *   ListFooterComponent,
 *   keyExtractor,
 *   estimatedItemSize,
 * } = useInfiniteList<AuctionViewModel, { cursor: string | null }>({
 *   queryKey: ['auctions', statusFilter, sortMode],
 *   queryFn: ({ cursor }) =>
 *     listAuctions({ cursor, status: statusFilter, sort: sortMode }),
 *   estimatedItemSize: 120,
 * });
 *
 * <FlashList
 *   data={items}
 *   renderItem={renderItem}
 *   keyExtractor={keyExtractor}
 *   estimatedItemSize={estimatedItemSize}
 *   onEndReached={onEndReached}
 *   ListEmptyComponent={ListEmptyComponent}
 *   ListFooterComponent={ListFooterComponent}
 *   refreshControl={
 *     <RefreshControl refreshing={isRefetching} onRefresh={onRefresh} />
 *   }
 * />
 * ```
 *
 * ## Edge cases handled
 *
 * - **Duplicate fetches:** `onEndReached` is debounced 300 ms and guards
 *   against `hasNextPage` / `isFetchingNextPage`.
 * - **Disabled queries:** when `enabled` is `false`, `items` is `[]` and
 *   no fetch is performed.
 * - **Empty pages:** a page with `items: []` and `nextCursor: null` is a
 *   valid terminal state — the empty component renders.
 * - **Error recovery:** `ListEmptyComponent` shows a Retry button on
 *   error; `refetch` re-issues all page requests.
 * - **Memory safety:** the debounce timer is cleared on unmount.
 *
 * @typeParam T - The item type stored in the list.
 * @typeParam P - The parameter shape passed to `queryFn`. Must include
 *   `cursor: string | null`.
 */
export function useInfiniteList<
  T,
  P extends { cursor: string | null },
>(options: UseInfiniteListOptions<T, P>): UseInfiniteListResult<T> {
  const {
    queryKey,
    queryFn,
    initialCursor = null,
    enabled = true,
    staleTime = DEFAULT_STALE_TIME,
    gcTime = DEFAULT_GC_TIME,
    estimatedItemSize = DEFAULT_ESTIMATED_ITEM_SIZE,
    onEndReachedThreshold: _onEndReachedThreshold = DEFAULT_ON_END_REACHED_THRESHOLD,
  } = options;

  // ── React Query infinite query ──────────────────────────────────────────
  //
  // `initialPageParam` is the cursor for the first page. `null` / `undefined`
  // means "start from the beginning" — the backend interprets an absent
  // cursor as the first page.
  //
  // `getNextPageParam` converts a `null` cursor to `undefined` so React
  // Query's `hasNextPage` is `false` when the backend signals no more pages.
  const query = useInfiniteQuery<
    InfiniteListPage<T>,
    Error,
    InfiniteData<InfiniteListPage<T>, string | null>,
    string[],
    string | null
  >({
    queryKey,
    queryFn: ({ pageParam }) => queryFn({ cursor: pageParam } as P),
    initialPageParam: initialCursor,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled,
    staleTime,
    gcTime,
  });

  // ── Flattened items ─────────────────────────────────────────────────────
  const items = useMemo<T[]>(() => {
    if (!query.data) return [];
    return query.data.pages.flatMap((page) => page.items);
  }, [query.data]);

  // ── Debounced onEndReached ──────────────────────────────────────────────
  //
  // FlashList can fire `onEndReached` multiple times in rapid succession
  // during momentum scrolling. A 300 ms debounce ensures only the last
  // call within the window triggers a fetch. The guard also prevents
  // fetching when there is no next page or a fetch is already in flight.
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep the latest `hasNextPage` and `isFetchingNextPage` in refs so the
  // debounced callback always reads current values without needing to be
  // recreated on every render (which would reset the debounce timer).
  const hasNextPageRef = useRef(query.hasNextPage);
  const isFetchingNextPageRef = useRef(query.isFetchingNextPage);
  hasNextPageRef.current = query.hasNextPage;
  isFetchingNextPageRef.current = query.isFetchingNextPage;

  const fetchNextPage = useCallback(async () => {
    if (!hasNextPageRef.current || isFetchingNextPageRef.current) return;
    await query.fetchNextPage();
  }, [query]);

  const onEndReached = useCallback(() => {
    if (debounceTimerRef.current !== null) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null;
      void fetchNextPage();
    }, DEBOUNCE_MS);
  }, [fetchNextPage]);

  // Clear the debounce timer on unmount to prevent a fetch after the
  // component is gone (memory safety).
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, []);

  // ── Pull-to-refresh ─────────────────────────────────────────────────────
  const onRefresh = useCallback(() => {
    void query.refetch();
  }, [query]);

  // ── Refetch (exposed for programmatic retry) ────────────────────────────
  const refetch = useCallback(async () => {
    return query.refetch();
  }, [query]);

  // ── keyExtractor ────────────────────────────────────────────────────────
  const keyExtractor = useCallback(
    (item: T, index: number): string => {
      if (hasStableId(item)) {
        return String(item.id);
      }
      return String(index);
    },
    [],
  );

  // ── ListEmptyComponent ──────────────────────────────────────────────────
  //
  // Recreated only when the relevant state flags change so FlashList does
  // not see a new component type on every render. The component reads the
  // theme for consistent light/dark parity.
  const { colors: themeColors } = useAppTheme();

  const ListEmptyComponent = useMemo<React.ComponentType>(() => {
    const isLoading = query.isLoading;
    const isError = query.isError;
    const refetchFn = refetch;

    return function InfiniteListEmpty() {
      if (isLoading) {
        return (
          <View style={styles.emptyContainer}>
            <ActivityIndicator size="large" color={themeColors.brand} />
          </View>
        );
      }
      if (isError) {
        return (
          <View style={styles.emptyContainer}>
            <Text style={[styles.emptyText, { color: themeColors.textSecondary }]}>
              Failed to load
            </Text>
            <Pressable
              onPress={() => void refetchFn()}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Retry loading items"
            >
              <Text style={[styles.retryText, { color: themeColors.brand }]}>
                Retry
              </Text>
            </Pressable>
          </View>
        );
      }
      return (
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyText, { color: themeColors.textMuted }]}>
            No items found
          </Text>
        </View>
      );
    };
  }, [query.isLoading, query.isError, refetch, themeColors]);

  // ── ListFooterComponent ─────────────────────────────────────────────────
  const ListFooterComponent = useMemo<React.ComponentType>(() => {
    const isFetchingNextPage = query.isFetchingNextPage;

    return function InfiniteListFooter() {
      if (!isFetchingNextPage) return null;
      return (
        <View style={styles.footerContainer}>
          <ActivityIndicator size="small" color={themeColors.brand} />
        </View>
      );
    };
  }, [query.isFetchingNextPage, themeColors]);

  return {
    items,
    isLoading: query.isLoading,
    isFetchingNextPage: query.isFetchingNextPage,
    isError: query.isError,
    error: query.error,
    refetch,
    fetchNextPage,
    hasNextPage: query.hasNextPage,
    isRefetching: query.isRefetching,
    onEndReached,
    onRefresh,
    ListEmptyComponent,
    ListFooterComponent,
    keyExtractor,
    estimatedItemSize,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    paddingHorizontal: 24,
  },
  emptyText: {
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 12,
  },
  retryText: {
    fontSize: 15,
    fontWeight: '600',
  },
  footerContainer: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
