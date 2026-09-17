import { useEffect, useRef, useCallback } from 'react';
import * as Notifications from 'expo-notifications';
import { extractRouteFromPushData, resolveNotificationRoute, type ResolvedRoute } from '../utils/notificationRouting';
import { getAppNavigationRef } from '../platform/monitoring/appNavigation';
import { markNotificationRead } from '../services/notificationsApi';
import { useStore } from '../store/useStore';
import { track } from '../analytics';

/**
 * Push-tap navigation goes through the app's single navigation ref —
 * registered by App.tsx via `registerAppNavigationRef` when the
 * NavigationContainer mounts. A previous implementation held a second,
 * never-attached container ref here; `isReady()` on it was permanently
 * false, so every push tap enqueued forever and cold-start taps were lost.
 */
let pendingRoute: ResolvedRoute = null;
let navigationReady = false;

function flushPendingRoute() {
  if (pendingRoute === null) return;

  const navigationRef = getAppNavigationRef();
  if (!navigationRef || !navigationRef.isReady()) return;

  const route = pendingRoute;
  pendingRoute = null;

  if (route === null) {
    navigationRef.navigate('NotificationsList');
    return;
  }

  const screen = route.screen;
  const params = 'params' in route ? route.params : undefined;
  // ResolvedRoute's fallback case uses Record<string, unknown> for params,
  // which doesn't satisfy each route's specific param type. Dispatch through
  // a minimal typed interface to avoid `as any`.
  const nav = navigationRef as { navigate: (screen: string, params?: unknown) => void };
  nav.navigate(screen, params);
}

export function setNavigationReady(ready: boolean) {
  navigationReady = ready;
  if (ready) {
    flushPendingRoute();
  }
}

export function getNavigationReady(): boolean {
  return navigationReady;
}

function queueRoute(route: ResolvedRoute) {
  pendingRoute = route;
  const navigationRef = getAppNavigationRef();
  if (navigationRef?.isReady()) {
    flushPendingRoute();
  }
}

/**
 * Extract a stable notification-type identifier from the push payload.
 *
 * The backend sends one of two fields:
 *   - `type` — the semantic notification type (e.g. `new_message`, `outbid`)
 *   - `eventType` — the structured event type from the notification registry
 *
 * We prefer `type` (the user-facing semantic name) and fall back to
 * `eventType` so both legacy and V2 payloads are covered. Returns `unknown`
 * only when neither field is present.
 */
function readNotificationType(data: Record<string, unknown> | undefined): string {
  if (data) {
    if (typeof data.type === 'string' && data.type) return data.type;
    if (typeof data.eventType === 'string' && data.eventType) return data.eventType;
  }
  return 'unknown';
}

/**
 * Mark the persisted notification event read when the push payload carries
 * its event id (`data.eventId` is set by the push dispatcher). Best-effort —
 * the tap has already been handled; a failure only leaves the unread badge
 * stale until the next count poll.
 */
function markTappedEventRead(data: Record<string, unknown> | undefined) {
  const eventId =
    typeof data?.eventId === 'string' ? data.eventId
    : typeof data?.notificationId === 'string' ? data.notificationId
    : null;
  if (!eventId) return;
  markNotificationRead(eventId)
    .then(() => {
      const store = useStore.getState();
      store.setNotificationCount(Math.max(0, store.notificationCount - 1));
    })
    .catch(() => {});
}

function handleNotificationResponse(response: Notifications.NotificationResponse) {
  const data = response.notification.request.content.data as Record<string, unknown> | undefined;
  const actionId = response.actionIdentifier;
  const route = extractRouteFromPushData(data);

  // G5: Handle inline action button taps from per-type notification categories.
  // "mark_as_read" is a no-op for navigation (just dismiss). Other actions
  // navigate normally. Either way, the event is marked read server-side when
  // the payload carries its event id.
  markTappedEventRead(data);

  if (actionId && actionId !== 'mark_as_read') {
    queueRoute(route);
  } else if (!actionId) {
    // Regular tap (no action button) — navigate to the route
    queueRoute(route);
  }

  // Fire-and-forget analytics. PostHog no-ops in dev (no API key), and we
  // additionally guard on __DEV__ so no capture work runs locally.
  if (!__DEV__) {
    const notificationType = readNotificationType(data);
    const targetScreen = route && 'screen' in route ? route.screen : null;
    track('push_notification_tapped', {
      notification_type: notificationType,
      target_screen: targetScreen,
      action_id: actionId ?? null,
    });
  }
}

export function usePushNotificationTap() {
  const responseListenerRef = useRef<Notifications.EventSubscription | null>(null);
  const receivedListenerRef = useRef<Notifications.EventSubscription | null>(null);
  const setNotificationCount = useStore((state) => state.setNotificationCount);
  const isAuthenticated = useStore((state) => state.isAuthenticated);

  const handleForegroundNotification = useCallback(
    (notification: Notifications.Notification) => {
      if (isAuthenticated) {
        setNotificationCount(useStore.getState().notificationCount + 1);
      }

      // Track foreground delivery — separate from the tap event. Fire-and-
      // forget; PostHog no-ops in dev, and we guard on __DEV__ anyway.
      if (!__DEV__) {
        const data = notification.request.content.data as Record<string, unknown> | undefined;
        track('push_notification_received', {
          notification_type: readNotificationType(data),
        });
      }
    },
    [isAuthenticated, setNotificationCount],
  );

  useEffect(() => {
    receivedListenerRef.current = Notifications.addNotificationReceivedListener((notification) => {
      handleForegroundNotification(notification);
    });

    responseListenerRef.current = Notifications.addNotificationResponseReceivedListener((response) => {
      handleNotificationResponse(response);
    });

    Notifications.getLastNotificationResponseAsync()
      .then((lastResponse) => {
        if (lastResponse) {
          handleNotificationResponse(lastResponse);
        }
      })
      .catch(() => {});

    return () => {
      receivedListenerRef.current?.remove();
      responseListenerRef.current?.remove();
    };
  }, [handleForegroundNotification]);
}

export { resolveNotificationRoute, extractRouteFromPushData };
export type { ResolvedRoute };
