import React, { useSyncExternalStore } from 'react';
import {
  onlineManager,
  defaultShouldDehydrateQuery,
  type Query,
} from '@tanstack/react-query';
import {
  PersistQueryClientProvider,
} from '@tanstack/react-query-persist-client';
import { queryClient } from './queryClient';
import { cacheStorage } from '../../storage/mmkv';
import { createMMKVPersister } from '../../storage/mmkvPersister';

/**
 * ServerStateProvider — React Query provider with offline-persistent cache.
 *
 * Wraps `PersistQueryClientProvider` with an MMKV-backed persister so
 * the query cache survives app restarts. Because MMKV is synchronous and
 * JSI-direct, the cache is hydrated instantly on app launch — there is no
 * async bridge round-trip, eliminating the flash of empty/loading state
 * that occurs with an AsyncStorage persister.
 *
 * Key design decisions:
 *  - Storage: `cacheStorage` MMKV instance (no encryption, ephemeral cache).
 *  - Max age: 7 days — persisted cache older than a week is discarded.
 *  - Throttle: 500 ms — MMKV writes are synchronous and cheap, so we can
 *    throttle more aggressively than AsyncStorage without losing data.
 *  - Dehydrate: only successful queries with `staleTime > 0` are persisted;
 *    always-stale queries (`staleTime: 0`) and pending/error queries are
 *    excluded so the persisted blob stays lean and valid.
 */

const STORAGE_KEY = 'thryftverse-react-query-cache';
const MAX_AGE = 7 * 24 * 60 * 60 * 1000;
const THROTTLE_TIME = 500;

const mmkvPersister = createMMKVPersister(cacheStorage, STORAGE_KEY, {
  throttleTime: THROTTLE_TIME,
});

/**
 * Custom `shouldDehydrateQuery` — composes the React Query default (only
 * persist successful queries) with an additional guard that excludes queries
 * configured with `staleTime: 0` (always-stale queries that should never be
 * cached to disk).
 */
function shouldDehydrateQuery(query: Query): boolean {
  if (!defaultShouldDehydrateQuery(query)) return false;
  const staleTime = (query.options as { staleTime?: number }).staleTime;
  return staleTime !== 0;
}

export function ServerStateProvider({ children }: { children: React.ReactNode }) {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister: mmkvPersister,
        maxAge: MAX_AGE,
        dehydrateOptions: {
          shouldDehydrateQuery,
        },
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}

/**
 * Returns the current online status as tracked by React Query's
 * `onlineManager`. This is the same source of truth used by the retry policy
 * and `networkMode: 'offlineFirst'`, so UI components stay perfectly in sync
 * with the query layer.
 *
 * Uses `useSyncExternalStore` for tear-free reads across concurrent renders.
 */
export function useIsQueryOnline(): boolean {
  return useSyncExternalStore(
    (onStoreChange: () => void) =>
      onlineManager.subscribe(() => {
        onStoreChange();
      }),
    () => onlineManager.isOnline(),
    () => true,
  );
}
