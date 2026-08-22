/**
 * Barrel export for the ThryftVerse MMKV storage layer.
 *
 * Import from `../storage` (or `../../storage` depending on depth) to
 * access typed MMKV instances, hooks, the storage factory, and the
 * React Query persister.
 *
 * @example
 * ```ts
 * import { appStorage, useMMKVString, createMMKVStorage, createMMKVPersister } from '../storage';
 * ```
 */

// Types
export type {
  MMKVStorageInstance,
  StorageKey,
  TypedStorage,
  TypedStorageSchema,
  MMKVLike,
} from './types';

// Instances
export {
  appStorage,
  authStorage,
  cacheStorage,
  sessionStorage,
} from './mmkv';

// Factory
export { createMMKVStorage } from './mmkv';

// Hooks
export {
  useMMKVStorage,
  useMMKVBoolean,
  useMMKVString,
  useMMKVNumber,
} from './mmkv';

// Utilities
export { clearAllMMKV } from './mmkv';

// React Query persister
export { createMMKVPersister } from './mmkvPersister';
