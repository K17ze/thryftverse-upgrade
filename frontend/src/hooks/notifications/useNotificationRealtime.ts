/**
 * useNotificationRealtime — consumes the `notifications.user:{userId}`
 * realtime topic the backend publishes from queueUserNotification.
 *
 * On `notification.queued`:
 *   - dedupe + surface an in-app banner via surfacePersistedEvent
 *   - bump the global unread badge (notificationCount) — only when the
 *     event was newly surfaced, so a realtime event that the catch-up
 *     poll already displayed never double-counts
 *   - quiet-hours-deferred events (deferredUntil set) skip the banner but
 *     still bump the badge — the event is feed-visible immediately
 *
 * Mount once inside RealtimeProvider (see NotificationRealtimeBridge in
 * App.tsx). NotificationsScreen additionally re-syncs its feed on these
 * events via useNotificationFeed's own subscription.
 */
import { useEffect } from 'react';
import { useRealtimeSafe } from '../../platform/realtime';
import { useStore } from '../../store/useStore';
import {
  claimPersistedEventSurface,
  surfacePersistedEvent,
} from '../../services/inAppNotificationsApi';

interface NotificationQueuedPayload {
  id?: string;
  title?: string;
  body?: string;
  eventType?: string;
  actorUserId?: string | null;
  imageUrl?: string | null;
  route?: { screen: string; params?: Record<string, unknown> } | null;
  /** ISO timestamp — set when quiet hours deferred the push. */
  deferredUntil?: string | null;
}

export function useNotificationRealtime(): void {
  const ctx = useRealtimeSafe();
  const client = ctx?.client;
  const userId = useStore((s) => s.currentUser?.id);
  const isAuthenticated = useStore((s) => s.isAuthenticated);
  const topic = userId ? `notifications.user:${userId}` : null;

  useEffect(() => {
    if (!client || !topic || !isAuthenticated) return;

    client.subscribe([topic]);
    const unsubscribe = client.on<NotificationQueuedPayload>(topic, (envelope) => {
      if (envelope.type !== 'notification.queued') return;
      const payload = envelope.payload;
      if (!payload?.id || !payload.title || !payload.eventType) return;

      const deferred = typeof payload.deferredUntil === 'string' && payload.deferredUntil.length > 0;
      const isNew = claimPersistedEventSurface(payload.id);
      if (!isNew) return;

      // Badge truth: bump exactly once per event — a realtime event the
      // catch-up poll already surfaced (or vice versa) never double-counts.
      useStore.getState().setNotificationCount(
        useStore.getState().notificationCount + 1,
      );

      // Quiet-hours-deferred events are feed-visible now but must not
      // banner during the DND window — claim consumed, no toast.
      if (deferred) return;
      surfacePersistedEvent({
        id: payload.id,
        eventType: payload.eventType,
        title: payload.title,
        body: payload.body ?? '',
        route: payload.route ?? null,
      });
    });

    return () => {
      unsubscribe();
      client.unsubscribe([topic]);
    };
  }, [client, topic, isAuthenticated]);
}
