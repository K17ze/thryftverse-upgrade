import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { useStore } from '../store/useStore';
import {
  listNotificationDevices,
  deactivateNotificationDevice,
} from '../services/notificationsApi';

/**
 * Stale push-token cleanup.
 *
 * `DeviceNotRegistered` is a server-side receipt error — the Expo push
 * service returns it when a send targets a token that is no longer valid
 * (app uninstalled, push credentials revoked, or the OS rolled the device
 * token). expo-notifications exposes no client-side event for it directly,
 * but it does emit `addPushTokenListener` when the **device** push token
 * changes while the app is running. A token roll invalidates the previously
 * registered Expo token, so this is the client-side signal that a stale
 * token needs cleaning up.
 *
 * When the device token rolls we:
 *   1. Fetch the current Expo push token (the new valid one).
 *   2. List devices registered with our backend.
 *   3. Deactivate any whose token no longer matches — they are stale and
 *      would otherwise accumulate as dead delivery targets.
 *
 * The hook is best-effort: every step is guarded and failures are swallowed
 * so a cleanup hiccup never disrupts the foreground experience. It only
 * runs for authenticated users (anonymous users have no registered devices).
 */
export function usePushTokenCleanup() {
  const isAuthenticated = useStore((state) => state.isAuthenticated);
  const isCleaningRef = useRef(false);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    const subscription = Notifications.addPushTokenListener(async () => {
      // Re-entrancy guard — a token roll can fire more than once in quick
      // succession; only one cleanup pass should run at a time.
      if (isCleaningRef.current) {
        return;
      }
      isCleaningRef.current = true;

      try {
        const projectId = (Constants.expoConfig as { extra?: { eas?: { projectId?: string } } } | null)
          ?.extra?.eas?.projectId;
        const tokenResponse = projectId
          ? await Notifications.getExpoPushTokenAsync({ projectId })
          : await Notifications.getExpoPushTokenAsync();
        const currentToken = tokenResponse.data;

        const devices = await listNotificationDevices();
        const stale = devices.filter(
          (device) => device.isActive && device.token !== currentToken,
        );

        // Deactivate in parallel — each is independent and best-effort.
        await Promise.all(
          stale.map((device) =>
            deactivateNotificationDevice(device.token).catch(() => {
              // A single deactivation failure must not abort the rest.
            }),
          ),
        );
      } catch {
        // Network or permission errors are transient; the next roll will retry.
      } finally {
        isCleaningRef.current = false;
      }
    });

    return () => {
      subscription.remove();
    };
  }, [isAuthenticated]);
}
