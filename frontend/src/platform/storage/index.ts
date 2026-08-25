/**
 * Storage platform module — barrel export for MMKV storage layer.
 *
 * Provides synchronous, JSI-direct key-value storage via react-native-mmkv,
 * with named instances for different data sensitivity levels and React
 * hooks for reactive storage access.
 *
 * @see ./mmkv.ts for the full API surface.
 */
export {
  isMMKVAvailable,
  getDefaultStorage,
  getSecureStorage,
  getCacheStorage,
  createMMKVQueryPersister,
  useMMKVValue,
  useMMKVState,
} from './mmkv';

export type { MMKVInstance } from './mmkv';

export {
  migrateFromAsyncStorage,
  type MigrationResult,
} from './migration';
