import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { useStore } from '../store/useStore';
import {
  getStoredPushDeviceId,
  registerCurrentPushDevice,
} from '../lib/pushDevice';
import { deactivateNotificationDevice } from '../services/notificationsApi';

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
 *   1. Register the NEW token (upsert) — otherwise the account keeps
 *      targeting the dead token and this device silently goes dark.
 *   2. Deactivate THIS device's previous registration row, identified by
 *      the device id persisted at last registration. Other devices on the
 *      account are left alone — a token roll here says nothing about the
 *      user's iPad, and deactivating it would silently kill its pushes.
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
        // Capture the previously registered id BEFORE registering — the
        // upsert below overwrites it with the new row's id.
        const previousDeviceId = await getStoredPushDeviceId();

        // Register the NEW token first — without this the roll leaves the
        // account pointing at the dead token and this device silently stops
        // receiving pushes. Registration upserts on token and returns the
        // device id, which also refreshes our persisted this-device id.
        const currentDevice = await registerCurrentPushDevice();

        // Deactivate only this device's previous registration — the row
        // pointing at the now-dead token. Tokens are redacted in list
        // responses, so the persisted id is the truthful match.
        if (
          previousDeviceId !== null &&
          previousDeviceId !== currentDevice.id
        ) {
          await deactivateNotificationDevice(previousDeviceId).catch(() => {
            // Best-effort — the dead token row is pruned server-side on
            // DeviceNotRegistered receipts regardless.
          });
        }
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
