/**
 * In-App Notification Service — ThryftVerse
 *
 * A global, in-memory notification queue that powers transient in-app
 * banners/toasts. This is the presentation layer for real-time notification UX:
 * priority-based ordering, max 3 concurrent banners, and type-aware auto-dismiss.
 *
 * In production, persisted notifications (order updates, safety outcomes, etc.)
 * are fetched from the backend via notificationsApi and surfaced as banners
 * through `surfacePersistedNotifications`. In dev mode, notifications created
 * locally via `showNotification` are labelled isDemo: true (per AGENTS.md §11).
 */

import { makeStableId } from '../utils/createStableId';
import { listNotificationEvents, markNotificationRead } from './notificationsApi';

// ---------------------------------------------------------------------------
// Demo mode flag
// ---------------------------------------------------------------------------

/** When true, locally-created notifications are labelled isDemo (dev only). */
export const NOTIFICATION_DEMO_MODE = __DEV__;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NotificationType =
  | 'success'
  | 'warning'
  | 'error'
  | 'info'
  | 'offer'
  | 'message'
  | 'listing'
  | 'order';

/** Priority controls ordering — higher priority banners show first. */
export type NotificationPriority = 'low' | 'normal' | 'high';

export interface InAppNotification {
  id: string;
  type: NotificationType;
  title: string;
  body?: string;
  /** Optional action button label (e.g. "View", "Reply"). */
  actionLabel?: string;
  /** Optional navigation target or deep-link string for the action button. */
  actionTarget?: string;
  /** Auto-dismiss duration in milliseconds. 0 = sticky (no auto-dismiss). */
  duration: number;
  priority: NotificationPriority;
  createdAt: number;
  isRead: boolean;
  /** True when the notification is mock/illustrative (demo mode). */
  isDemo: boolean;
}

export interface NotificationQueue {
  active: InAppNotification[];
  pending: InAppNotification[];
}

/** Input for showNotification — id/createdAt/isRead/isDemo are derived. */
export type ShowNotificationInput = Omit<
  InAppNotification,
  'id' | 'createdAt' | 'isRead' | 'isDemo' | 'duration'
> & { duration?: number };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum concurrent visible banners. */
const MAX_ACTIVE = 3;

const PRIORITY_RANK: Record<NotificationPriority, number> = {
  low: 0,
  normal: 1,
  high: 2,
};

/** Default auto-dismiss durations (ms) per type. 0 = sticky. */
const DEFAULT_DURATION_BY_TYPE: Record<NotificationType, number> = {
  success: 4000,
  info: 4000,
  warning: 6000,
  error: 0, // sticky — requires explicit dismiss
  offer: 6000,
  message: 5000,
  listing: 5000,
  order: 5000,
};

const DEFAULT_PRIORITY_BY_TYPE: Record<NotificationType, NotificationPriority> = {
  success: 'normal',
  info: 'low',
  warning: 'high',
  error: 'high',
  offer: 'high',
  message: 'normal',
  listing: 'normal',
  order: 'high',
};

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

let queue: NotificationQueue = { active: [], pending: [] };
const subscribers = new Set<(notifications: InAppNotification[]) => void>();
const dismissTimers = new Map<string, ReturnType<typeof setTimeout>>();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateId(): string {
  return makeStableId('ian');
}

function resolveDuration(type: NotificationType, duration?: number): number {
  if (typeof duration === 'number') return duration;
  return DEFAULT_DURATION_BY_TYPE[type] ?? 4000;
}

function resolvePriority(
  type: NotificationType,
  priority?: NotificationPriority,
): NotificationPriority {
  return priority ?? DEFAULT_PRIORITY_BY_TYPE[type] ?? 'normal';
}

function sortByPriority(notifications: InAppNotification[]): InAppNotification[] {
  // Stable sort by priority rank (descending), then by createdAt (ascending).
  return [...notifications].sort((a, b) => {
    const rankDelta = PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority];
    if (rankDelta !== 0) return rankDelta;
    return a.createdAt - b.createdAt;
  });
}

function emit(): void {
  const snapshot = getActiveNotifications();
  subscribers.forEach((cb) => {
    try {
      cb(snapshot);
    } catch {
      // Subscriber errors must never break the queue.
    }
  });
}

function scheduleAutoDismiss(notification: InAppNotification): void {
  if (notification.duration <= 0) return; // sticky
  const existing = dismissTimers.get(notification.id);
  if (existing) clearTimeout(existing);
  dismissTimers.set(
    notification.id,
    setTimeout(() => {
      dismissNotification(notification.id);
    }, notification.duration),
  );
}

function promotePending(): void {
  while (queue.active.length < MAX_ACTIVE && queue.pending.length > 0) {
    const next = queue.pending.shift()!;
    queue.active = [...queue.active, next];
    scheduleAutoDismiss(next);
  }
  // Keep active sorted by priority for stable stacking.
  queue.active = sortByPriority(queue.active);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Show a notification. Returns the generated id.
 * High-priority notifications are promoted ahead of lower-priority pending ones.
 */
export function showNotification(input: ShowNotificationInput): string {
  const id = generateId();
  const notification: InAppNotification = {
    id,
    type: input.type,
    title: input.title,
    body: input.body,
    actionLabel: input.actionLabel,
    actionTarget: input.actionTarget,
    duration: resolveDuration(input.type, input.duration),
    priority: resolvePriority(input.type, input.priority),
    createdAt: Date.now(),
    isRead: false,
    isDemo: NOTIFICATION_DEMO_MODE,
  };

  if (queue.active.length < MAX_ACTIVE) {
    queue.active = sortByPriority([...queue.active, notification]);
    scheduleAutoDismiss(notification);
  } else {
    // Insert into pending by priority so high-priority items surface first.
    queue.pending = sortByPriority([...queue.pending, notification]);
  }

  emit();
  return id;
}

/** Dismiss a single notification by id (removes from active + pending). */
export function dismissNotification(id: string): void {
  queue.active = queue.active.filter((n) => n.id !== id);
  queue.pending = queue.pending.filter((n) => n.id !== id);
  const timer = dismissTimers.get(id);
  if (timer) {
    clearTimeout(timer);
    dismissTimers.delete(id);
  }
  promotePending();
  emit();
}

/** Returns a snapshot of currently active (visible) notifications. */
export function getActiveNotifications(): InAppNotification[] {
  return [...queue.active];
}

/** Mark a notification as read (does not dismiss). */
export function markAsRead(id: string): void {
  queue.active = queue.active.map((n) =>
    n.id === id ? { ...n, isRead: true } : n,
  );
  queue.pending = queue.pending.map((n) =>
    n.id === id ? { ...n, isRead: true } : n,
  );
  emit();
}

/** Clear all active and pending notifications. */
export function clearAll(): void {
  dismissTimers.forEach((timer) => clearTimeout(timer));
  dismissTimers.clear();
  queue = { active: [], pending: [] };
  emit();
}

/**
 * Subscribe to active-notification changes. Returns an unsubscribe function.
 * The callback receives a snapshot of active notifications on every change.
 */
export function subscribe(
  callback: (notifications: InAppNotification[]) => void,
): () => void {
  subscribers.add(callback);
  // Emit current state immediately so late subscribers hydrate.
  callback(getActiveNotifications());
  return () => {
    subscribers.delete(callback);
  };
}

// ---------------------------------------------------------------------------
// Persisted notification bridge
// ---------------------------------------------------------------------------
//
// Fetches unread notifications from the backend API and surfaces them as
// in-app banners. This closes the loop for safety outcome notifications —
// when a moderator decides a case, the reporter sees the outcome as a banner.
//
// Already-surfaced event IDs are tracked to avoid re-surfacing on repeated
// calls (e.g. from a polling hook).

const surfacedEventIds = new Set<string>();

function mapEventTypeToBannerType(eventType: string): NotificationType {
  if (eventType === 'safety_outcome') return 'info';
  if (eventType.startsWith('order_') || eventType === 'refund_completed') return 'order';
  if (eventType === 'chat_message') return 'message';
  if (eventType.startsWith('auction_')) return 'listing';
  if (eventType === 'review_received') return 'listing';
  return 'info';
}

/**
 * Fetch unread persisted notifications from the backend and surface any
 * not already shown as in-app banners. Returns the count of newly surfaced
 * notifications. Each surfaced notification is marked as read on the server
 * so it does not reappear on the next call.
 */
export async function surfacePersistedNotifications(): Promise<number> {
  let surfaced = 0;
  let cursor: string | null = null;

  // Fetch up to 2 pages of recent events to catch up after backgrounding.
  for (let page = 0; page < 2; page++) {
    const { items, nextCursor } = await listNotificationEvents({ limit: 30, cursor });
    for (const event of items) {
      if (event.readAt) continue;
      if (surfacedEventIds.has(event.id)) continue;

      surfacedEventIds.add(event.id);
      showNotification({
        type: mapEventTypeToBannerType(event.eventType),
        title: event.title,
        body: event.body,
        actionLabel: event.route ? 'View' : undefined,
        actionTarget: event.route
          ? `${event.route.screen}${event.route.params ? `:${JSON.stringify(event.route.params)}` : ''}`
          : undefined,
        priority: 'normal',
      });
      surfaced += 1;

      // Mark as read so the unread count stays accurate.
      markNotificationRead(event.id).catch(() => {
        // Best-effort — the banner was already shown.
      });
    }
    if (!nextCursor) break;
    cursor = nextCursor;
  }

  return surfaced;
}

/** Test-only helper to reset internal state between tests. */
export function __resetForTesting(): void {
  dismissTimers.forEach((timer) => clearTimeout(timer));
  dismissTimers.clear();
  queue = { active: [], pending: [] };
  subscribers.clear();
  surfacedEventIds.clear();
}
