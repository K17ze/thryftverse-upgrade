/**
 * MMKV high-performance storage layer for ThryftVerse.
 *
 * react-native-mmkv v4 is a JSI-direct (NitroModules) key-value store that
 * is ~30x faster than AsyncStorage. It is fully synchronous — no bridge
 * round-trip — which means auth tokens, onboarding flags, and theme
 * preferences are available instantly on app launch. The user never sees
 * a flash of unauthenticated state or a default theme before their
 * preferences load.
 *
 * This module creates four typed MMKV instances for different data
 * categories and exports a factory + hooks for type-safe access. Existing
 * AsyncStorage usage is untouched; new code should prefer these exports.
 *
 * Dev-mode safety: if the native MMKV module is not linked (Expo Go,
 * vitest, web without NitroModules), every instance falls back to an
 * in-memory Map that implements the same `MMKVLike` interface. This
 * ensures the app and tests never crash on import.
 */

import { useCallback, useRef, useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import { createMMKV } from 'react-native-mmkv';
import type { Configuration } from 'react-native-mmkv';
import type { MMKVLike, TypedStorage } from './types';

// ---------------------------------------------------------------------------
// Dev-mode detection (matches the pattern in constants/runtimeFlags.ts)
// ---------------------------------------------------------------------------

const runtimeDevFlag = (globalThis as { __DEV__?: boolean }).__DEV__;
const isDevelopmentRuntime =
  typeof runtimeDevFlag === 'boolean'
    ? runtimeDevFlag
    : process.env.NODE_ENV !== 'production';

// ---------------------------------------------------------------------------
// In-memory fallback (Expo Go / vitest / web without NitroModules)
// ---------------------------------------------------------------------------

/**
 * Create an in-memory storage that satisfies `MMKVLike`.
 *
 * Used when `createMMKV` throws — the native C++ core is not available in
 * Expo Go, vitest, or web builds without NitroModules. The fallback
 * preserves the same listener semantics as real MMKV so hooks behave
 * identically in every environment.
 */
function createInMemoryMMKV(id: string): MMKVLike {
  const store = new Map<string, boolean | string | number | ArrayBuffer>();
  const listeners = new Set<(key: string) => void>();

  const notify = (key: string): void => {
    listeners.forEach((listener) => listener(key));
  };

  return {
    id,
    set(key, value) {
      store.set(key, value);
      notify(key);
    },
    getBoolean(key) {
      const v = store.get(key);
      return typeof v === 'boolean' ? v : undefined;
    },
    getString(key) {
      const v = store.get(key);
      return typeof v === 'string' ? v : undefined;
    },
    getNumber(key) {
      const v = store.get(key);
      return typeof v === 'number' ? v : undefined;
    },
    contains(key) {
      return store.has(key);
    },
    remove(key) {
      const had = store.delete(key);
      if (had) notify(key);
      return had;
    },
    getAllKeys() {
      return Array.from(store.keys());
    },
    clearAll() {
      const keys = Array.from(store.keys());
      store.clear();
      keys.forEach(notify);
    },
    addOnValueChangedListener(callback) {
      listeners.add(callback);
      return {
        remove() {
          listeners.delete(callback);
        },
      };
    },
  };
}

/**
 * Safely create an MMKV instance, falling back to in-memory storage if
 * the native module is unavailable.
 *
 * On web, encryption is not supported by the MMKV web shim, so we strip
 * the `encryptionKey` to avoid a runtime throw.
 */
function createMMKVSafe(config: Configuration): MMKVLike {
  const resolvedConfig: Configuration =
    Platform.OS === 'web' && config.encryptionKey
      ? { ...config, encryptionKey: undefined }
      : config;

  try {
    return createMMKV(resolvedConfig);
  } catch (error) {
    if (isDevelopmentRuntime) {
      console.warn(
        `[mmkv] Native MMKV unavailable for instance "${config.id}" — ` +
          'using in-memory fallback. This is expected in Expo Go and vitest.',
        error,
      );
    }
    return createInMemoryMMKV(config.id);
  }
}

// ---------------------------------------------------------------------------
// Encryption key for auth storage
// ---------------------------------------------------------------------------

/**
 * AES-128 encryption key for the auth storage instance.
 *
 * MMKV enforces a maximum of 16 bytes for AES-128 keys. This key is
 * compiled into the app binary and protects auth tokens at rest. For
 * maximum security, a production app should generate a random key on
 * first launch and store it in the platform Keychain/Keystore via
 * `expo-secure-store`, then retrieve it asynchronously before creating
 * the auth instance. That approach trades synchronous access for a
 * stronger key source; the current static key is a pragmatic default
 * that still provides file-level encryption.
 */
const AUTH_ENCRYPTION_KEY = 'thryftverse-auth'; // 16 bytes — AES-128

// ---------------------------------------------------------------------------
// MMKV instances
// ---------------------------------------------------------------------------

/**
 * General app state — theme, onboarding, preferences.
 *
 * No encryption. Relies on the OS sandbox for file-level protection.
 * This instance persists across app restarts and logins.
 */
export const appStorage: MMKVLike = createMMKVSafe({
  id: 'thryftverse-app',
});

/**
 * Auth tokens and user identity.
 *
 * Encrypted with AES-128 on native (iOS/Android). On web, encryption is
 * not available so the instance falls back to plain-text localStorage or
 * in-memory — sensitive auth data should not be the primary experience
 * on web.
 */
export const authStorage: MMKVLike = createMMKVSafe({
  id: 'thryftverse-auth',
  encryptionKey: AUTH_ENCRYPTION_KEY,
});

/**
 * Ephemeral cache data — query caches, transient lookups.
 *
 * No encryption. Suitable for the React Query persister and other
 * short-lived cached data that can be safely discarded.
 */
export const cacheStorage: MMKVLike = createMMKVSafe({
  id: 'thryftverse-cache',
});

/**
 * Session-specific data that clears on logout.
 *
 * No encryption. Stores per-session state such as the last active tab,
 * scroll positions, or draft compositions that should not survive a
 * logout.
 */
export const sessionStorage: MMKVLike = createMMKVSafe({
  id: 'thryftverse-session',
});

// ---------------------------------------------------------------------------
// Typed storage factory
// ---------------------------------------------------------------------------

/**
 * Create a typed storage accessor bound to a specific MMKV instance,
 * key, and default value.
 *
 * The accessor serialises values as JSON, so any JSON-serialisable type
 * is supported (objects, arrays, primitives). For primitive-only keys,
 * prefer the dedicated hooks (`useMMKVBoolean`, `useMMKVString`,
 * `useMMKVNumber`) which avoid JSON overhead.
 *
 * @example
 * ```ts
 * const themeStorage = createMMKVStorage(appStorage, 'theme.preference', 'system');
 * const current = themeStorage.get();           // 'system'
 * themeStorage.set('dark');                      // synchronous write
 * const [theme, setTheme] = themeStorage.use();  // React hook
 * ```
 */
export function createMMKVStorage<T>(
  instance: MMKVLike,
  key: string,
  defaultValue: T,
): TypedStorage<T> {
  return {
    get(): T {
      const raw = instance.getString(key);
      if (raw === undefined) return defaultValue;
      try {
        return JSON.parse(raw) as T;
      } catch {
        return defaultValue;
      }
    },

    set(value: T): void {
      instance.set(key, JSON.stringify(value));
    },

    remove(): void {
      instance.remove(key);
    },

    use(): [T, (value: T | ((current: T) => T) | undefined) => void] {
      return useTypedStorageHook(instance, key, defaultValue);
    },
  };
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/**
 * Internal hook used by `TypedStorage.use()`. Wraps `useMMKVStorage` and
 * applies the default value so the returned value is always defined.
 */
function useTypedStorageHook<T>(
  instance: MMKVLike,
  key: string,
  defaultValue: T,
): [T, (value: T | ((current: T) => T) | undefined) => void] {
  const [rawValue, setRawValue] = useMMKVStorage<T>(instance, key);
  const value: T = rawValue === undefined ? defaultValue : rawValue;

  const defaultValueRef = useRef(defaultValue);
  defaultValueRef.current = defaultValue;

  const setValue = useCallback(
    (next: T | ((current: T) => T) | undefined) => {
      if (next === undefined) {
        setRawValue(undefined);
        return;
      }
      if (typeof next === 'function') {
        const updater = next as (current: T) => T;
        const currentRaw = instance.getString(key);
        const current: T =
          currentRaw === undefined
            ? defaultValueRef.current
            : safeParse<T>(currentRaw) ?? defaultValueRef.current;
        setRawValue(updater(current));
      } else {
        setRawValue(next);
      }
    },
    [instance, key, setRawValue],
  );

  return [value, setValue];
}

/**
 * Generic React hook for reading and writing a JSON-serialisable value
 * from an MMKV instance.
 *
 * Uses `useSyncExternalStore` for React 18+ concurrent-safety. The hook
 * caches the parsed value and only re-parses when the raw string changes,
 * avoiding infinite render loops with object values.
 *
 * @returns `[value, setValue]` where `value` is `T | undefined` (undefined
 *          when the key is not set) and `setValue` accepts a direct value,
 *          an updater function, or `undefined` (to remove the key).
 *
 * @example
 * ```ts
 * const [prefs, setPrefs] = useMMKVStorage<ThemePrefs>(appStorage, 'theme.prefs');
 * ```
 */
export function useMMKVStorage<T>(
  instance: MMKVLike,
  key: string,
): [
  T | undefined,
  (value: T | ((current: T | undefined) => T | undefined) | undefined) => void,
] {
  const cachedRawRef = useRef<string | undefined>(undefined);
  const cachedValueRef = useRef<T | undefined>(undefined);

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const listener = instance.addOnValueChangedListener((changedKey) => {
        if (changedKey === key) {
          onStoreChange();
        }
      });
      return () => listener.remove();
    },
    [instance, key],
  );

  const getSnapshot = useCallback((): T | undefined => {
    const raw = instance.getString(key);
    if (raw === cachedRawRef.current) {
      return cachedValueRef.current;
    }
    cachedRawRef.current = raw;
    cachedValueRef.current = raw === undefined ? undefined : safeParse<T>(raw);
    return cachedValueRef.current;
  }, [instance, key]);

  const value = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const setValue = useCallback(
    (
      next:
        | T
        | ((current: T | undefined) => T | undefined)
        | undefined,
    ) => {
      if (next === undefined) {
        instance.remove(key);
        return;
      }
      if (typeof next === 'function') {
        const updater = next as (current: T | undefined) => T | undefined;
        const current = instance.getString(key);
        const currentParsed: T | undefined =
          current === undefined ? undefined : safeParse<T>(current);
        const result = updater(currentParsed);
        if (result === undefined) {
          instance.remove(key);
        } else {
          instance.set(key, JSON.stringify(result));
        }
      } else {
        instance.set(key, JSON.stringify(next));
      }
    },
    [instance, key],
  );

  return [value, setValue];
}

/**
 * React hook for a boolean value stored in MMKV.
 *
 * Uses MMKV's native boolean support (no JSON serialisation) for maximum
 * efficiency. Ideal for feature flags, onboarding gates, and toggles.
 *
 * @returns `[value, setValue]` where `value` is `boolean | undefined`.
 */
export function useMMKVBoolean(
  instance: MMKVLike,
  key: string,
): [
  boolean | undefined,
  (value: boolean | ((current: boolean | undefined) => boolean | undefined) | undefined) => void,
] {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const listener = instance.addOnValueChangedListener((changedKey) => {
        if (changedKey === key) {
          onStoreChange();
        }
      });
      return () => listener.remove();
    },
    [instance, key],
  );

  const getSnapshot = useCallback(
    (): boolean | undefined => instance.getBoolean(key),
    [instance, key],
  );

  const value = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const setValue = useCallback(
    (
      next:
        | boolean
        | ((current: boolean | undefined) => boolean | undefined)
        | undefined,
    ) => {
      if (next === undefined) {
        instance.remove(key);
        return;
      }
      if (typeof next === 'function') {
        const updater = next as (
          current: boolean | undefined,
        ) => boolean | undefined;
        const result = updater(instance.getBoolean(key));
        if (result === undefined) {
          instance.remove(key);
        } else {
          instance.set(key, result);
        }
      } else {
        instance.set(key, next);
      }
    },
    [instance, key],
  );

  return [value, setValue];
}

/**
 * React hook for a string value stored in MMKV.
 *
 * Uses MMKV's native string support (no JSON serialisation). Ideal for
 * auth tokens, user IDs, and short string preferences.
 *
 * @returns `[value, setValue]` where `value` is `string | undefined`.
 */
export function useMMKVString(
  instance: MMKVLike,
  key: string,
): [
  string | undefined,
  (value: string | ((current: string | undefined) => string | undefined) | undefined) => void,
] {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const listener = instance.addOnValueChangedListener((changedKey) => {
        if (changedKey === key) {
          onStoreChange();
        }
      });
      return () => listener.remove();
    },
    [instance, key],
  );

  const getSnapshot = useCallback(
    (): string | undefined => instance.getString(key),
    [instance, key],
  );

  const value = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const setValue = useCallback(
    (
      next:
        | string
        | ((current: string | undefined) => string | undefined)
        | undefined,
    ) => {
      if (next === undefined) {
        instance.remove(key);
        return;
      }
      if (typeof next === 'function') {
        const updater = next as (
          current: string | undefined,
        ) => string | undefined;
        const result = updater(instance.getString(key));
        if (result === undefined) {
          instance.remove(key);
        } else {
          instance.set(key, result);
        }
      } else {
        instance.set(key, next);
      }
    },
    [instance, key],
  );

  return [value, setValue];
}

/**
 * React hook for a number value stored in MMKV.
 *
 * Uses MMKV's native number support (no JSON serialisation). Ideal for
 * counters, timestamps, and numeric preferences.
 *
 * @returns `[value, setValue]` where `value` is `number | undefined`.
 */
export function useMMKVNumber(
  instance: MMKVLike,
  key: string,
): [
  number | undefined,
  (value: number | ((current: number | undefined) => number | undefined) | undefined) => void,
] {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const listener = instance.addOnValueChangedListener((changedKey) => {
        if (changedKey === key) {
          onStoreChange();
        }
      });
      return () => listener.remove();
    },
    [instance, key],
  );

  const getSnapshot = useCallback(
    (): number | undefined => instance.getNumber(key),
    [instance, key],
  );

  const value = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const setValue = useCallback(
    (
      next:
        | number
        | ((current: number | undefined) => number | undefined)
        | undefined,
    ) => {
      if (next === undefined) {
        instance.remove(key);
        return;
      }
      if (typeof next === 'function') {
        const updater = next as (
          current: number | undefined,
        ) => number | undefined;
        const result = updater(instance.getNumber(key));
        if (result === undefined) {
          instance.remove(key);
        } else {
          instance.set(key, result);
        }
      } else {
        instance.set(key, next);
      }
    },
    [instance, key],
  );

  return [value, setValue];
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/**
 * Safely parse a JSON string, returning `undefined` on failure.
 *
 * Used by hooks and the typed storage factory to avoid throwing inside
 * `useSyncExternalStore` getSnapshot (which would crash React).
 */
function safeParse<T>(raw: string): T | undefined {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

/**
 * Clear all keys from every MMKV instance.
 *
 * This is the nuclear option for logout. It clears app preferences,
 * auth tokens, cache, and session data. For selective clearing (e.g.
 * preserve theme on logout), call `clearAll()` on specific instances:
 *
 * ```ts
 * authStorage.clearAll();
 * sessionStorage.clearAll();
 * ```
 */
export function clearAllMMKV(): void {
  appStorage.clearAll();
  authStorage.clearAll();
  cacheStorage.clearAll();
  sessionStorage.clearAll();
}
