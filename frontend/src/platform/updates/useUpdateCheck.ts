import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';

/**
 * Minimum interval between update checks (5 minutes).
 * Prevents hammering the update server on rapid foreground/background cycles.
 */
const CHECK_DEBOUNCE_MS = 5 * 60 * 1000;

/**
 * Result of {@link useUpdateCheck}.
 */
export interface UseUpdateCheckResult {
  /** Whether a downloaded update is available and waiting to be applied. */
  isUpdateAvailable: boolean;
  /** Whether an update is currently being fetched from the server. */
  isFetching: boolean;
  /** Fetch the latest update and reload the app to apply it. */
  fetchAndReload: () => Promise<void>;
  /** Manually trigger an update check (respects the debounce). */
  checkForUpdate: () => Promise<void>;
}

/**
 * Monitors expo-updates for available OTA updates.
 *
 * - Checks for updates when the app enters the foreground (debounced to once
 *   per 5 minutes to avoid excessive server load).
 * - Exposes {@link UseUpdateCheckResult.fetchAndReload} to download and apply
 *   an available update immediately.
 * - Gracefully no-ops when running in Expo Go or a build without
 *   expo-updates configured (the hook returns a dormant state).
 *
 * @returns Update state and actions.
 */
export function useUpdateCheck(): UseUpdateCheckResult {
  const [isUpdateAvailable, setIsUpdateAvailable] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const lastCheckRef = useRef<number>(0);

  // Lazily resolve the expo-updates module. In Expo Go or bare builds without
  // expo-updates, this returns null and the hook becomes a no-op.
  const updatesRef = useRef<UpdatesModule | null>(null);
  useEffect(() => {
    try {
      const mod = require('expo-updates') as UpdatesModule;
      // useUpdates is a hook — we can't call it here. Use the imperative API.
      if (mod && typeof mod.checkForUpdateAsync === 'function') {
        updatesRef.current = mod;
      }
    } catch {
      updatesRef.current = null;
    }
  }, []);

  const checkForUpdate = useCallback(async () => {
    const updates = updatesRef.current;
    if (!updates) return;

    const now = Date.now();
    if (now - lastCheckRef.current < CHECK_DEBOUNCE_MS) return;
    lastCheckRef.current = now;

    try {
      const result = await updates.checkForUpdateAsync();
      if (result?.isAvailable) {
        setIsUpdateAvailable(true);
      }
    } catch {
      // Network errors, server errors, etc. — silently ignore.
      // The next foreground cycle will retry.
    }
  }, []);

  const fetchAndReload = useCallback(async () => {
    const updates = updatesRef.current;
    if (!updates || isFetching) return;

    setIsFetching(true);
    try {
      await updates.fetchUpdateAsync();
      await updates.reloadAsync();
    } catch {
      // If fetch or reload fails, reset state so the user can retry.
      setIsFetching(false);
    }
  }, [isFetching]);

  // Check on foreground transitions.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') {
        checkForUpdate();
      }
    });
    return () => subscription?.remove();
  }, [checkForUpdate]);

  return {
    isUpdateAvailable,
    isFetching,
    fetchAndReload,
    checkForUpdate,
  };
}

/**
 * Minimal type for the expo-updates imperative API.
 * Avoids importing the full module at the top level so this hook can be
 * safely required in environments where expo-updates is not installed.
 */
interface UpdatesModule {
  checkForUpdateAsync: () => Promise<{ isAvailable: boolean }>;
  fetchUpdateAsync: () => Promise<unknown>;
  reloadAsync: () => Promise<void>;
}
