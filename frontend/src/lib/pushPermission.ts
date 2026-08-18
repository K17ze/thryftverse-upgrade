import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Contextual moments where requesting push permission is appropriate.
 * Per App Store / Google Play 2026 guidelines, push permission must NOT be
 * requested on app launch or on the first screen — only after a meaningful
 * user action.
 *
 * Extended per flagship research §10 (`push.permissionContexts`) to cover the
 * full set of high-value contextual triggers.
 */
export type PushPermissionContext =
  | 'chat'
  | 'favorite'
  | 'checkout'
  | 'settings'
  | 'auction_bid'
  | 'price_alert'
  | 'follow'
  | 'listing_sold';

const ASKED_FLAG_KEY = 'pushPermissionAskedContexts';

/**
 * Per-category Android notification channels (flagship research §10
 * `push.androidChannels`). Each channel is independently muteable by the user
 * via the OS notification settings, replacing the single 'default' channel
 * that gave users only all-or-nothing control.
 *
 * Importance levels map the notification's urgency to the OS interruption
 * hierarchy (flagship research §2 "Interruption hierarchy"):
 *   - orders / auctions → HIGH (time-critical, user wants these promptly)
 *   - messages / social → DEFAULT (engagement, not urgent)
 *   - news              → LOW   (promotional, never interrupts)
 */
export const ANDROID_PUSH_CHANNELS = [
  { id: 'orders', name: 'Orders & Shipping', importance: Notifications.AndroidImportance.HIGH },
  { id: 'auctions', name: 'Auction Alerts', importance: Notifications.AndroidImportance.HIGH },
  { id: 'messages', name: 'Messages', importance: Notifications.AndroidImportance.DEFAULT },
  { id: 'social', name: 'Social', importance: Notifications.AndroidImportance.DEFAULT },
  { id: 'news', name: 'News & Promotions', importance: Notifications.AndroidImportance.LOW },
] as const;

/**
 * Configures the per-category Android notification channels. Called only after
 * the user has granted push permission — channel config is never touched before
 * opt-in. A legacy 'default' channel is retained at DEFAULT importance so
 * backend payloads that still send `channelId: 'default'` render correctly.
 */
export async function configureAndroidNotificationChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;
  for (const channel of ANDROID_PUSH_CHANNELS) {
    await Notifications.setNotificationChannelAsync(channel.id, {
      name: channel.name,
      importance: channel.importance,
    });
  }
  await Notifications.setNotificationChannelAsync('default', {
    name: 'default',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

/**
 * Soft-ask pre-prompt copy per context (flagship research §M4 / §2 "The soft-ask
 * pre-prompt"). The soft-ask explains the value the user will receive before
 * the one-shot OS prompt fires, so the user can conceptually consent first.
 */
export const SOFT_ASK_COPY: Record<PushPermissionContext, { title: string; body: string }> = {
  chat: {
    title: 'Get notified when they reply?',
    body: "You'll only be pinged for new messages in conversations you care about.",
  },
  favorite: {
    title: 'Get price-drop and outbid alerts?',
    body: "We'll ping you when an item you're watching drops in price or an auction needs a bid.",
  },
  checkout: {
    title: 'Track your order?',
    body: 'Get shipping and delivery updates so you know exactly when your order arrives.',
  },
  auction_bid: {
    title: 'Get outbid alerts?',
    body: "We'll ping you the moment you're outbid so you can bid again in time.",
  },
  price_alert: {
    title: 'Get price-drop alerts?',
    body: "We'll ping you when items on your wishlist drop in price.",
  },
  follow: {
    title: 'Get new-listing alerts?',
    body: "We'll ping you when sellers you follow list new items.",
  },
  listing_sold: {
    title: 'Get sold alerts?',
    body: "We'll ping you the moment your listed item sells.",
  },
  settings: {
    title: 'Enable push notifications?',
    body: 'Get order updates, auction alerts, messages, and more — you control which categories.',
  },
};

/**
 * Presenter registered by the app-wide soft-ask overlay. When set,
 * `requestPushPermissionWithSoftAsk` uses it to show the in-app pre-prompt and
 * only fires the OS prompt if the user conceptually consents. When unset
 * (e.g. in tests or before the overlay mounts), the soft-ask is skipped and the
 * OS prompt fires directly — the system never fabricates a UI it cannot show.
 */
export type SoftAskPresenter = (context: PushPermissionContext) => Promise<boolean>;

let softAskPresenter: SoftAskPresenter | null = null;

/**
 * Registers (or clears) the app-wide soft-ask presenter. The
 * `PushSoftAskOverlay` component calls this on mount so contextual permission
 * requests route through the designed in-app pre-prompt.
 */
export function setSoftAskPresenter(presenter: SoftAskPresenter | null): void {
  softAskPresenter = presenter;
}

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

    // Configure the per-category Android notification channels only after
    // permission is granted, so we never touch channel config before the user
    // has opted in. This replaces the former single 'default' MAX-importance
    // channel with the category set defined in ANDROID_PUSH_CHANNELS.
    if (Platform.OS === 'android') {
      await configureAndroidNotificationChannels();
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
 * Requests push permission with a soft-ask pre-prompt (flagship research §M4 /
 * §2 "The soft-ask pre-prompt"). The flow is:
 *
 *   1. If permission is already granted → return true (no prompt needed).
 *   2. If the OS prompt was already asked for this context → return false
 *      (respect the user's earlier OS-level decision).
 *   3. If a soft-ask presenter is registered, show the in-app pre-prompt that
 *      explains the value before the one-shot OS prompt.
 *        - "Not now"  → return false; the OS prompt never fires, preserving
 *                       the ability to ask again at a future contextual moment.
 *        - "Allow"    → mark the context as asked and fire the OS prompt.
 *   4. If no presenter is registered (tests, or before the overlay mounts),
 *      fall back to `requestPushPermissionOnce` so the system never fabricates
 *      a UI it cannot show.
 *
 * Use this from contextual flows (chat send, favorite, auction bid, co-own
 * watch) so the one-shot iOS OS prompt is only spent on users who have already
 * conceptually consented.
 */
export async function requestPushPermissionWithSoftAsk(
  context: PushPermissionContext,
): Promise<boolean> {
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    if (existingStatus === 'granted') {
      return true;
    }
  } catch {
    // If we cannot read status, proceed — the OS prompt path handles errors.
  }

  if (await hasAskedForContext(context)) {
    // The OS prompt was already shown for this context — respect that decision.
    return false;
  }

  const presenter = softAskPresenter;
  if (!presenter) {
    // No soft-ask UI mounted — fall back to the direct (once-per-context) OS
    // prompt rather than fabricating a pre-prompt we cannot display.
    return requestPushPermissionOnce(context);
  }

  let accepted = false;
  try {
    accepted = await presenter(context);
  } catch {
    // A presenter failure must never block the user's primary action.
    return false;
  }

  if (!accepted) {
    // The user declined the soft-ask. Do NOT burn the one-shot OS prompt and
    // do NOT mark the context as asked — a future high-value contextual moment
    // may soft-ask again. Within a session the caller's ref guard prevents
    // re-prompting on every action.
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
