/**
 * MMKV-based persister for React Query (TanStack Query).
 *
 * This is an alternative to the AsyncStorage persister
 * (`@tanstack/query-async-storage-persister`). Because MMKV is
 * synchronous and JSI-direct, persisting and restoring the query cache
 * has zero bridge overhead — the cache is available instantly on app
 * launch, eliminating the flash of empty/loading state that occurs while
 * an async persister round-trips through the bridge.
 *
 * The persister implements the `Persister` interface from
 * `@tanstack/react-query-persist-client`. Although the interface allows
 * `Promisable` return types (i.e. values or promises), our implementation
 * is fully synchronous — MMKV writes and reads complete in microseconds.
 *
 * An optional `throttleTime` (default 1000 ms) prevents excessive writes
 * when the cache changes rapidly. Because MMKV writes are synchronous and
 * cheap, the default throttle is lower than the AsyncStorage persister's
 * 2-second default — but still avoids writing on every single cache tick.
 *
 * @example
 * ```tsx
 * import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
 * import { cacheStorage, createMMKVPersister } from '../storage';
 *
 * const persister = createMMKVPersister(cacheStorage, undefined, { throttleTime: 500 });
 *
 * <PersistQueryClientProvider
 *   client={queryClient}
 *   persistOptions={{ persister }}
 * >
 *   <App />
 * </PersistQueryClientProvider>
 * ```
 */

import type { Persister, PersistedClient } from '@tanstack/react-query-persist-client';
import type { MMKVLike } from './types';

/** Default storage key for the persisted React Query client. */
const DEFAULT_PERSISTER_KEY = 'react-query-persisted-client-v1';

/** Default throttle interval in milliseconds. */
const DEFAULT_THROTTLE_TIME = 1000;

/** Options accepted by {@link createMMKVPersister}. */
export interface CreateMMKVPersisterOptions {
  /**
   * Throttle interval in milliseconds. Prevents excessive writes when the
   * cache changes rapidly. Defaults to 1000 ms. Set to 0 to disable
   * throttling entirely (write on every cache change).
   */
  throttleTime?: number;
}

/**
 * Create a synchronous MMKV-backed persister for React Query.
 *
 * @param storage  An MMKV instance (typically `cacheStorage`).
 * @param key      The storage key to persist the client under. Defaults to
 *                 `'react-query-persisted-client-v1'`.
 * @param options  Optional configuration (e.g. `throttleTime`).
 * @returns A `Persister` implementation suitable for
 *          `PersistQueryClientProvider`.
 */
export function createMMKVPersister(
  storage: MMKVLike,
  key: string = DEFAULT_PERSISTER_KEY,
  options?: CreateMMKVPersisterOptions,
): Persister {
  const throttleTime = options?.throttleTime ?? DEFAULT_THROTTLE_TIME;

  let lastWriteTime = 0;
  let pendingClient: PersistedClient | null = null;
  let throttleTimer: ReturnType<typeof setTimeout> | null = null;

  function flushPending(): void {
    if (pendingClient) {
      storage.set(key, JSON.stringify(pendingClient));
      pendingClient = null;
      lastWriteTime = Date.now();
    }
    if (throttleTimer) {
      clearTimeout(throttleTimer);
      throttleTimer = null;
    }
  }

  return {
    /**
     * Persist the dehydrated query client to MMKV.
     *
     * Serialises the entire `PersistedClient` (timestamp, buster, and
     * dehydrated state) as a JSON string. When `throttleTime > 0`, writes
     * are throttled so that rapid successive cache changes result in at
     * most one write per throttle interval. The final write is always
     * flushed after the throttle window elapses.
     */
    persistClient(client: PersistedClient): void {
      if (throttleTime <= 0) {
        storage.set(key, JSON.stringify(client));
        return;
      }

      const now = Date.now();
      const elapsed = now - lastWriteTime;

      if (elapsed >= throttleTime) {
        storage.set(key, JSON.stringify(client));
        lastWriteTime = now;
        pendingClient = null;
        if (throttleTimer) {
          clearTimeout(throttleTimer);
          throttleTimer = null;
        }
      } else {
        pendingClient = client;
        if (!throttleTimer) {
          throttleTimer = setTimeout(flushPending, throttleTime - elapsed);
        }
      }
    },

    /**
     * Restore the persisted query client from MMKV.
     *
     * Returns `undefined` when no cache exists or when the stored JSON
     * is corrupt (e.g. schema changed between app versions). Synchronous.
     */
    restoreClient(): PersistedClient | undefined {
      const raw = storage.getString(key);
      if (raw === undefined) return undefined;
      try {
        return JSON.parse(raw) as PersistedClient;
      } catch {
        return undefined;
      }
    },

    /**
     * Remove the persisted query client from MMKV.
     *
     * Called by React Query when the cache is expired or busted.
     * Synchronous.
     */
    removeClient(): void {
      if (throttleTimer) {
        clearTimeout(throttleTimer);
        throttleTimer = null;
      }
      pendingClient = null;
      storage.remove(key);
    },
  };
}
