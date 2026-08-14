/**
 * In-App Notification Service — ThryftVerse
 *
 * A global, in-memory notification queue that powers transient in-app
 * banners/toasts. This is the presentation layer for real-time notification UX:
 * priority-based ordering, max 3 concurrent banners, and type-aware auto-dismiss.
 *
 * Demo mode: NOTIFICATION_DEMO_MODE is true. All notifications surfaced through
 * this service are mock/illustrative and are clearly labelled with isDemo: true
 * (per AGENTS.md §11 — truthful UI). No notification is persisted or sent to a
 * backend in demo mode.
 */

import { makeStableId } from '../utils/createStableId';

// ---------------------------------------------------------------------------
// Demo mode flag
// ---------------------------------------------------------------------------

/** When true, all notifications surfaced by this service are mock/illustrative. */
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

/** Test-only helper to reset internal state between tests. */
export function __resetForTesting(): void {
  dismissTimers.forEach((timer) => clearTimeout(timer));
  dismissTimers.clear();
  queue = { active: [], pending: [] };
  subscribers.clear();
}
