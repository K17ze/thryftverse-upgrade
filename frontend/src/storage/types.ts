/**
 * Type definitions for the ThryftVerse MMKV storage layer.
 *
 * These types provide compile-time safety over storage keys and their
 * expected value types. The runtime instances and hooks live in `mmkv.ts`;
 * this file is dependency-free so it can be imported anywhere without
 * pulling in the native MMKV module.
 */

/**
 * Identifies which MMKV instance a storage key belongs to.
 *
 * - `app`     — general app state (theme, onboarding, preferences). No encryption.
 * - `auth`    — auth tokens, user ID. Encrypted with AES-128.
 * - `cache`   — ephemeral cache data (query caches, transient lookups). No encryption.
 * - `session` — session-specific data that clears on logout.
 */
export type MMKVStorageInstance = 'app' | 'auth' | 'cache' | 'session';

/**
 * A storage key paired with its value type and owning instance.
 *
 * Use this to create fully typed storage entries that the compiler can
 * check at the call site:
 *
 * ```ts
 * const themeKey: StorageKey<'light' | 'dark' | 'system'> = {
 *   key: 'theme.preference',
 *   instance: 'app',
 * };
 * ```
 *
 * The generic parameter `T` is phantom — it exists only for compile-time
 * type checking and has no runtime footprint.
 */
export interface StorageKey<T> {
  /** The string key used in the underlying MMKV instance. */
  readonly key: string;
  /** Which MMKV instance this key lives in. */
  readonly instance: MMKVStorageInstance;
}

/**
 * A typed storage accessor returned by `createMMKVStorage`.
 *
 * Provides synchronous get/set/remove plus a React hook (`use`) for
 * subscribing to value changes with automatic default-value application.
 *
 * The `use` method follows the same convention as jotai's `useAtom` —
 * it must be called unconditionally at the top level of a React component
 * or custom hook.
 */
export interface TypedStorage<T> {
  /** Read the current value synchronously. Returns the default if unset or corrupt. */
  get(): T;
  /** Write a new value synchronously. */
  set(value: T): void;
  /** Remove the key from storage. Subsequent reads return the default. */
  remove(): void;
  /**
   * React hook that subscribes to the value. Returns `[value, setValue]`
   * where `value` is always defined (defaults are applied) and
   * `setValue` accepts a direct value or an updater function.
   *
   * Must be called unconditionally at the top level of a component.
   */
  use(): [T, (value: T | ((current: T) => T) | undefined) => void];
}

/**
 * Declaration-mergeable schema mapping storage key strings to their
 * value types. Consumers extend this interface to get compile-time
 * key-to-type checking across the app:
 *
 * ```ts
 * // In your feature module:
 * interface TypedStorageSchema {
 *   'theme.preference': 'light' | 'dark' | 'system';
 *   'onboarding.completed': boolean;
 *   'auth.userId': string;
 * }
 * ```
 *
 * Keys not declared on this interface resolve to a type error when
 * accessed via `TypedStorageSchema['some.key']`, which is the desired
 * behaviour — it forces every storage key to be explicitly typed.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface TypedStorageSchema {
  // Consumers extend via declaration merging. See JSDoc above.
}

/**
 * Minimal subset of the MMKV interface that our storage layer depends on.
 *
 * The real `MMKV` type from `react-native-mmkv` satisfies this interface
 * structurally (it has every member with a compatible signature). We
 * depend on this subset rather than the full `MMKV` so that an in-memory
 * fallback can be used in environments where the native module is not
 * linked (Expo Go, vitest, web without NitroModules).
 *
 * If `react-native-mmkv` adds new required members to `MMKV` in a future
 * version, this interface must be updated to match — otherwise the
 * structural assignment `MMKV -> MMKVLike` will fail at compile time,
 * which is the desired safety behaviour.
 */
export interface MMKVLike {
  /** The unique ID of this MMKV instance. */
  readonly id: string;
  /** Set a value for the given key. */
  set(key: string, value: boolean | string | number | ArrayBuffer): void;
  /** Get the boolean value for the given key, or undefined if it does not exist. */
  getBoolean(key: string): boolean | undefined;
  /** Get the string value for the given key, or undefined if it does not exist. */
  getString(key: string): string | undefined;
  /** Get the number value for the given key, or undefined if it does not exist. */
  getNumber(key: string): number | undefined;
  /** Check whether the given key exists in this instance. */
  contains(key: string): boolean;
  /** Remove the given key. Returns true if the key was removed. */
  remove(key: string): boolean;
  /** Get all keys currently stored in this instance. */
  getAllKeys(): string[];
  /** Clear all keys/values from this instance. */
  clearAll(): void;
  /** Add a listener that fires whenever a value in this instance changes. */
  addOnValueChangedListener(onValueChanged: (key: string) => void): { remove: () => void };
}
