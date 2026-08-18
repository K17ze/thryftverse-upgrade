import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Create Mode Preference — persists the user's last-used creation mode so the
 * Create action (P4-02) reopens the camera in the mode they last chose, instead
 * of silently defaulting to Look every time.
 *
 * Per P4-02: Create is an action, not a navigation destination. The mode
 * persisted here is the creation mode (Look / Poster) selected from the bottom
 * bar Create action. `visual-search` is a transient search entry point invoked
 * from other surfaces and is intentionally NOT persisted as a creation default —
 * only Look and Poster represent the user's preferred creation flow.
 */

export const CREATE_MODE_PREF_STORAGE_KEY = 'thryftverse:create-mode-pref:v1';

/** Creation modes that are persisted as the user's preferred default. */
export type PersistedCreateMode = 'look' | 'poster';

const VALID_PERSISTED_MODES: PersistedCreateMode[] = ['look', 'poster'];

const DEFAULT_CREATE_MODE: PersistedCreateMode = 'look';

function parseCreateMode(rawValue: string | null): PersistedCreateMode {
  if (!rawValue) {
    return DEFAULT_CREATE_MODE;
  }
  const normalized = rawValue.trim().toLowerCase();
  return VALID_PERSISTED_MODES.includes(normalized as PersistedCreateMode)
    ? (normalized as PersistedCreateMode)
    : DEFAULT_CREATE_MODE;
}

/** Load the last-used creation mode. Defaults to 'look' on first-ever use. */
export async function getStoredCreateMode(): Promise<PersistedCreateMode> {
  try {
    const raw = await AsyncStorage.getItem(CREATE_MODE_PREF_STORAGE_KEY);
    return parseCreateMode(raw);
  } catch {
    return DEFAULT_CREATE_MODE;
  }
}

/** Persist the user's chosen creation mode for next-time reuse. */
export async function setStoredCreateMode(mode: PersistedCreateMode): Promise<void> {
  try {
    await AsyncStorage.setItem(CREATE_MODE_PREF_STORAGE_KEY, mode);
  } catch {
    // Best-effort persistence — the app still functions if storage fails.
  }
}
