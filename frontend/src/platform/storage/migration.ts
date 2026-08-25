/**
 * AsyncStorage → MMKV migration helper.
 *
 * Reads keys from AsyncStorage, writes them to MMKV, then removes them
 * from AsyncStorage. Used on app launch to migrate hot paths (auth token,
 * onboarding flag, theme preference) from the legacy async storage to
 * the faster synchronous MMKV.
 *
 * Idempotent: if a key already exists in MMKV, it is skipped. This means
 * the migration can run on every launch safely — it only does work the
 * first time.
 *
 * @example
 * ```ts
 * import { migrateFromAsyncStorage } from '@/platform/storage/migration';
 *
 * // Run once on app launch, before rendering the root.
 * await migrateFromAsyncStorage([
 *   '@thryftverse/auth-token',
 *   '@thryftverse/onboarding-complete',
 *   '@thryftverse/theme-preference',
 * ]);
 * ```
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDefaultStorage, isMMKVAvailable } from './mmkv';
import type { MMKVInstance } from './mmkv';

export interface MigrationResult {
  /** Keys that were successfully migrated from AsyncStorage to MMKV. */
  migrated: string[];
  /** Keys that already existed in MMKV and were skipped. */
  skipped: string[];
  /** Keys that were not found in AsyncStorage. */
  notFound: string[];
  /** Keys that failed to migrate (with error messages). */
  failed: Array<{ key: string; error: string }>;
}

/**
 * Migrates keys from AsyncStorage to MMKV.
 *
 * @param keys        AsyncStorage keys to migrate
 * @param targetInstance  Optional MMKV instance (defaults to defaultStorage)
 * @returns Migration summary
 */
export async function migrateFromAsyncStorage(
  keys: string[],
  targetInstance?: MMKVInstance | null,
): Promise<MigrationResult> {
  const storage = targetInstance ?? getDefaultStorage();
  const result: MigrationResult = {
    migrated: [],
    skipped: [],
    notFound: [],
    failed: [],
  };

  if (!isMMKVAvailable || !storage) {
    // MMKV not available — skip all keys, don't remove from AsyncStorage.
    result.failed = keys.map((key) => ({
      key,
      error: 'MMKV not available',
    }));
    return result;
  }

  for (const key of keys) {
    try {
      // Check if already migrated (key exists in MMKV).
      if (storage.contains(key)) {
        result.skipped.push(key);
        // Remove from AsyncStorage to clean up.
        try {
          await AsyncStorage.removeItem(key);
        } catch {
          // Best-effort cleanup.
        }
        continue;
      }

      // Read from AsyncStorage.
      const value = await AsyncStorage.getItem(key);
      if (value === null || value === undefined) {
        result.notFound.push(key);
        continue;
      }

      // Write to MMKV.
      storage.set(key, value);

      // Remove from AsyncStorage.
      try {
        await AsyncStorage.removeItem(key);
      } catch {
        // Best-effort cleanup — the value is already in MMKV.
      }

      result.migrated.push(key);
    } catch (error) {
      result.failed.push({
        key,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return result;
}
