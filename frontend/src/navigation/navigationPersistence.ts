import type { NavigationState, PartialState } from '@react-navigation/routers';
import { sessionStorage } from '../storage/mmkv';

export const persistenceKey = 'navigation-state-v1';

const SAVE_THROTTLE_MS = 500;

let lastSaveTimestamp = 0;
let pendingTimer: ReturnType<typeof setTimeout> | null = null;
let pendingState: NavigationState | null = null;

/**
 * Load the persisted navigation state from MMKV.
 *
 * Reads synchronously from the session MMKV instance and parses the JSON
 * payload. Returns `undefined` when no state is stored or the stored value
 * is corrupt — this function never throws.
 */
export function loadNavigationState(): PartialState<NavigationState> | undefined {
  try {
    const raw = sessionStorage.getString(persistenceKey);
    if (raw === undefined) return undefined;
    const parsed = JSON.parse(raw) as PartialState<NavigationState>;
    if (
      parsed === null ||
      typeof parsed !== 'object' ||
      !Array.isArray((parsed as Record<string, unknown>).routes)
    ) {
      sessionStorage.remove(persistenceKey);
      return undefined;
    }
    return parsed;
  } catch {
    try {
      sessionStorage.remove(persistenceKey);
    } catch {
      // Best-effort cleanup — never crash.
    }
    return undefined;
  }
}

/**
 * Persist the navigation state to MMKV.
 *
 * Writes are throttled to at most once per 500 ms. If called again within
 * the throttle window, the latest state is queued and written when the
 * timer fires. This prevents excessive synchronous writes during rapid
 * navigation (e.g. fast scroll-driven route changes).
 */
export function saveNavigationState(state: NavigationState | PartialState<NavigationState> | undefined): void {
  if (state === undefined) return;

  pendingState = state as NavigationState;

  const now = Date.now();
  const elapsed = now - lastSaveTimestamp;

  if (pendingTimer !== null) {
    return;
  }

  if (elapsed >= SAVE_THROTTLE_MS) {
    flushSave();
    return;
  }

  const delay = SAVE_THROTTLE_MS - elapsed;
  pendingTimer = setTimeout(() => {
    pendingTimer = null;
    flushSave();
  }, delay);
}

function flushSave(): void {
  if (pendingState === null) return;

  const stateToSave = pendingState;
  pendingState = null;
  lastSaveTimestamp = Date.now();

  try {
    sessionStorage.set(persistenceKey, JSON.stringify(stateToSave));
  } catch {
    // Serialization or storage failure must never crash the app.
    try {
      sessionStorage.remove(persistenceKey);
    } catch {
      // Best-effort — ignore.
    }
  }
}

/**
 * Clear any pending throttled save and remove the persisted navigation state.
 *
 * Called on logout so the next session starts fresh.
 */
export function clearNavigationState(): void {
  if (pendingTimer !== null) {
    clearTimeout(pendingTimer);
    pendingTimer = null;
    pendingState = null;
  }
  try {
    sessionStorage.remove(persistenceKey);
  } catch {
    // Best-effort — ignore.
  }
}
