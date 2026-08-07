import { secureStorage } from '../utils/security';

/**
 * Persisted auth snapshot — a minimal, non-token identity record used to
 * restore the authenticated user's appearance on app launch before the live
 * profile fetch completes.
 *
 * SECURITY NOTE: This previously lived in unencrypted AsyncStorage. It has been
 * migrated to hardware-backed SecureStore (see `utils/security.ts`) for
 * defence-in-depth. Auth *tokens* were already in SecureStore via
 * `lib/apiClient.ts`; this snapshot is auth-adjacent identity data.
 *
 * A one-time migration reads any legacy AsyncStorage value and moves it to
 * SecureStore, then deletes the old entry.
 */

const AUTH_SNAPSHOT_KEY = 'auth-snapshot';
const LEGACY_AUTH_SNAPSHOT_STORAGE_KEY = 'thryftverse:auth-snapshot:v1';

export interface StoredAuthSnapshotUser {
  id: string;
  username: string;
  avatar: string | null;
}

export interface StoredAuthSnapshot {
  user: StoredAuthSnapshotUser;
  twoFactorEnabled: boolean;
}

function isValidUser(value: unknown): value is StoredAuthSnapshotUser {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Partial<StoredAuthSnapshotUser>;
  return (
    typeof candidate.id === 'string' && candidate.id.trim().length > 0 &&
    typeof candidate.username === 'string' && candidate.username.trim().length > 0 &&
    (candidate.avatar === null || typeof candidate.avatar === 'string')
  );
}

let migrated = false;

/**
 * One-time migration: move any legacy AsyncStorage snapshot into SecureStore
 * and delete the old unencrypted entry. Safe to call repeatedly — it no-ops
 * after the first successful run.
 */
async function migrateLegacySnapshot(): Promise<void> {
  if (migrated) return;
  migrated = true;
  try {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    if (!AsyncStorage) return;
    const legacy = await AsyncStorage.getItem(LEGACY_AUTH_SNAPSHOT_STORAGE_KEY);
    if (legacy) {
      // Validate before moving so a corrupt entry does not propagate.
      const parsed = JSON.parse(legacy) as Partial<StoredAuthSnapshot>;
      if (isValidUser(parsed.user)) {
        await secureStorage.setItem(AUTH_SNAPSHOT_KEY, legacy);
      }
      await AsyncStorage.removeItem(LEGACY_AUTH_SNAPSHOT_STORAGE_KEY);
    }
  } catch {
    // Best-effort migration — a failure here just means the user re-logs in.
  }
}

export async function getStoredAuthSnapshot(): Promise<StoredAuthSnapshot | null> {
  try {
    await migrateLegacySnapshot();
    const raw = await secureStorage.getItem(AUTH_SNAPSHOT_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<StoredAuthSnapshot>;
    if (!isValidUser(parsed.user)) {
      return null;
    }

    return {
      user: parsed.user,
      twoFactorEnabled: Boolean(parsed.twoFactorEnabled),
    };
  } catch {
    return null;
  }
}

export async function setStoredAuthSnapshot(snapshot: StoredAuthSnapshot): Promise<void> {
  try {
    await secureStorage.setItem(AUTH_SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch {
    // Best-effort persistence should not block local state updates.
  }
}

export async function clearStoredAuthSnapshot(): Promise<void> {
  try {
    await secureStorage.deleteItem(AUTH_SNAPSHOT_KEY);
  } catch {
    // Best-effort cleanup.
  }
  // Also clear any lingering legacy entry.
  try {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    if (AsyncStorage) {
      await AsyncStorage.removeItem(LEGACY_AUTH_SNAPSHOT_STORAGE_KEY);
    }
  } catch {
    // Ignore.
  }
}
