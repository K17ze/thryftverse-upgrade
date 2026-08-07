import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Contextual moments where requesting push permission is appropriate.
 * Per App Store / Google Play 2026 guidelines, push permission must NOT be
 * requested on app launch or on the first screen — only after a meaningful
 * user action.
 */
export type PushPermissionContext = 'chat' | 'favorite' | 'checkout' | 'settings';

const ASKED_FLAG_KEY = 'pushPermissionAskedContexts';

async function hasAskedForContext(context: PushPermissionContext): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(ASKED_FLAG_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as PushPermissionContext[];
    return Array.isArray(parsed) && parsed.includes(context);
  } catch {
    return false;
  }
}

async function markAskedForContext(context: PushPermissionContext): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(ASKED_FLAG_KEY);
    const parsed = raw ? (JSON.parse(raw) as PushPermissionContext[]) : [];
    if (!Array.isArray(parsed) || !parsed.includes(context)) {
      const next = Array.isArray(parsed) ? [...parsed, context] : [context];
      await AsyncStorage.setItem(ASKED_FLAG_KEY, JSON.stringify(next));
    }
  } catch {
    // best-effort persistence — a failed flag write must not block the prompt
  }
}

/**
 * Returns the current push notification permission status without prompting.
 */
export async function getPushPermissionStatus(): Promise<Notifications.NotificationPermissionsStatus> {
  return Notifications.getPermissionsAsync();
}

/**
 * Requests push notification permission at a contextual moment.
 * Returns true if granted, false if denied.
 *
 * Per App Store / Google Play 2026 guidelines, this should NOT be called on
 * app launch — only after a meaningful user action (e.g. after a purchase,
 * after favoriting an item, after sending a first message, or via a dedicated
 * "Enable notifications" prompt in Settings).
 */
export async function requestPushPermissionWithContext(
  context: PushPermissionContext,
): Promise<boolean> {
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      return false;
    }

    // Configure the default Android notification channel only after permission
    // is granted, so we never touch channel config before the user has opted in.
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
      });
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Requests push permission at a contextual moment, but only once per context.
 * Subsequent calls for the same context are no-ops (the user is never re-prompted
 * for the same contextual trigger). Returns true if permission is granted,
 * false if denied, already-denied, or already asked.
 *
 * Use this from contextual flows (chat send, favorite, checkout) so the system
 * prompt appears at most once per trigger even if the user repeats the action.
 */
export async function requestPushPermissionOnce(
  context: PushPermissionContext,
): Promise<boolean> {
  if (await hasAskedForContext(context)) {
    // Already asked for this context — respect the user's earlier decision.
    return false;
  }
  await markAskedForContext(context);
  return requestPushPermissionWithContext(context);
}

/**
 * Resets the "asked" flag for a context. Intended for tests and explicit
 * user-initiated re-enable flows (e.g. the Settings toggle).
 */
export async function resetPushPermissionAskedFlag(
  context: PushPermissionContext,
): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(ASKED_FLAG_KEY);
    const parsed = raw ? (JSON.parse(raw) as PushPermissionContext[]) : [];
    if (Array.isArray(parsed)) {
      const next = parsed.filter((c) => c !== context);
      await AsyncStorage.setItem(ASKED_FLAG_KEY, JSON.stringify(next));
    }
  } catch {
    // best-effort
  }
}
