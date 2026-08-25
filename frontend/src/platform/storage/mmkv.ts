/**
 * MMKV storage platform layer — re-export barrel for the canonical implementation.
 *
 * This file previously maintained a parallel MMKV implementation with its own
 * lazy native module loader, named instances, and hooks. It now re-exports
 * from `src/storage/mmkv.ts` (the canonical implementation) and provides
 * backward-compatible adapter functions so existing consumers continue to
 * work without any import changes.
 *
 * Canonical instances (from `src/storage/mmkv.ts`):
 *   - appStorage     → general app state (preferences, theme, onboarding)
 *   - authStorage    → encrypted storage for auth tokens
 *   - cacheStorage   → ephemeral cache data (query cache, image metadata)
 *   - sessionStorage → session-specific data that clears on logout
 *
 * Backward-compatible adapters:
 *   - getDefaultStorage() → appStorage
 *   - getSecureStorage()  → authStorage
 *   - getCacheStorage()   → cacheStorage
 *   - isMMKVAvailable     → true (canonical always has in-memory fallback)
 *
 * @see https://github.com/mrousavy/react-native-mmkv
 */

import { useCallback, useEffect, useState } from 'react';
import { appStorage, authStorage, cacheStorage } from '../../storage/mmkv';
import type { MMKVLike } from '../../storage/types';

// ── Canonical re-exports ─────────────────────────────────────────────

export {
  appStorage,
  authStorage,
  cacheStorage,
  sessionStorage,
  useMMKVStorage,
  useMMKVBoolean,
  useMMKVString,
  useMMKVNumber,
  createMMKVStorage,
  clearAllMMKV,
} from '../../storage/mmkv';

export type { MMKVLike } from '../../storage/types';

// ── Backward-compatible type alias ───────────────────────────────────
//
// The legacy `MMKVInstance` type had a `delete` method; `MMKVLike` uses
// `remove`. All external consumers use only shared methods (getString, set,
// contains, getNumber, getBoolean, getAllKeys, clearAll,
// addOnValueChangedListener) so the alias is safe.

export type MMKVInstance = MMKVLike;

// ── Backward-compatible adapters ─────────────────────────────────────

/**
 * True when MMKV storage is available. The canonical implementation always
 * provides an in-memory fallback, so this is always `true`.
 */
export const isMMKVAvailable: boolean = true;

/**
 * General app state storage — preferences, theme, onboarding flags.
 * Returns the canonical `appStorage` instance.
 */
export function getDefaultStorage(): MMKVInstance | null {
  return appStorage;
}

/**
 * Encrypted storage for sensitive data — auth tokens, session data.
 * Returns the canonical `authStorage` instance.
 */
export function getSecureStorage(): MMKVInstance | null {
  return authStorage;
}

/**
 * Ephemeral cache storage — query cache, image metadata, temporary data.
 * Returns the canonical `cacheStorage` instance.
 */
export function getCacheStorage(): MMKVInstance | null {
  return cacheStorage;
}

// ── TanStack Query persister adapter ─────────────────────────────────

/**
 * Adapter that wraps an MMKV instance into the async storage interface
 * expected by `@tanstack/query-async-storage-persister`. MMKV is
 * synchronous, so all operations are wrapped in `Promise.resolve()`.
 *
 * @example
 * ```ts
 * import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
 * const persister = createAsyncStoragePersister({
 *   storage: createMMKVQueryPersister(),
 *   key: 'thryftverse-react-query-cache',
 * });
 * ```
 */
export function createMMKVQueryPersister() {
  return {
    getItem: async (key: string): Promise<string | null> => {
      try {
        return cacheStorage.getString(key) ?? null;
      } catch {
        return null;
      }
    },
    setItem: async (key: string, value: string): Promise<void> => {
      try {
        cacheStorage.set(key, value);
      } catch {
        // Storage may be full — silently drop.
      }
    },
    removeItem: async (key: string): Promise<void> => {
      try {
        cacheStorage.remove(key);
      } catch {
        // Ignore removal errors.
      }
    },
  };
}

// ── React hooks (backward-compatible) ────────────────────────────────

/**
 * Reads a value from MMKV synchronously and subscribes to changes.
 * Returns `undefined` when the key doesn't exist or MMKV is unavailable.
 *
 * @param key     Storage key
 * @param instance Optional MMKV instance (defaults to appStorage)
 */
export function useMMKVValue(
  key: string,
  instance?: MMKVInstance | null,
): string | undefined {
  const storage = instance ?? appStorage;
  const [value, setValue] = useState<string | undefined>(() => {
    try {
      return storage.getString(key);
    } catch {
      return undefined;
    }
  });

  useEffect(() => {
    try {
      setValue(storage.getString(key));
    } catch {
      setValue(undefined);
    }
    const listener = storage.addOnValueChangedListener((changedKey) => {
      if (changedKey === key) {
        try {
          setValue(storage.getString(key));
        } catch {
          setValue(undefined);
        }
      }
    });
    return () => listener.remove();
  }, [key, storage]);

  return value;
}

/**
 * useState backed by MMKV. Reads synchronously on mount, writes
 * synchronously on update. Survives app restarts.
 *
 * @param key          Storage key
 * @param defaultValue Fallback when key doesn't exist
 * @param instance     Optional MMKV instance (defaults to appStorage)
 */
export function useMMKVState<T extends string | number | boolean>(
  key: string,
  defaultValue: T,
  instance?: MMKVInstance | null,
): [T, (value: T) => void] {
  const storage = instance ?? appStorage;

  const readValue = useCallback((): T => {
    try {
      if (typeof defaultValue === 'string') {
        return (storage.getString(key) as T) ?? defaultValue;
      }
      if (typeof defaultValue === 'number') {
        return (storage.getNumber(key) as T) ?? defaultValue;
      }
      return (storage.getBoolean(key) as T) ?? defaultValue;
    } catch {
      return defaultValue;
    }
  }, [storage, key, defaultValue]);

  const [value, setValue] = useState<T>(readValue);

  useEffect(() => {
    setValue(readValue());
  }, [readValue]);

  const setStoredValue = useCallback(
    (next: T) => {
      setValue(next);
      try {
        storage.set(key, next);
      } catch {
        // Storage may be full — value is still in React state.
      }
    },
    [storage, key],
  );

  return [value, setStoredValue];
}
