import { useEffect, useRef, useCallback } from 'react';
import * as Notifications from 'expo-notifications';
import { createNavigationContainerRef } from '@react-navigation/native';
import type { RootStackParamList } from '../navigation/types';
import { extractRouteFromPushData, resolveNotificationRoute, type ResolvedRoute } from '../utils/notificationRouting';
import { useStore } from '../store/useStore';
import { track } from '../analytics';

const navigationRef = createNavigationContainerRef<RootStackParamList>();

export { navigationRef as pushNavigationRef };

let pendingRoute: ResolvedRoute = null;
let navigationReady = false;

function flushPendingRoute() {
  if (pendingRoute === null) return;
  if (!navigationRef.isReady()) return;

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
  if (navigationRef.isReady()) {
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

function handleNotificationResponse(response: Notifications.NotificationResponse) {
  const data = response.notification.request.content.data as Record<string, unknown> | undefined;
  const route = extractRouteFromPushData(data);
  queueRoute(route);

  // Fire-and-forget analytics. PostHog no-ops in dev (no API key), and we
  // additionally guard on __DEV__ so no capture work runs locally.
  if (!__DEV__) {
    const notificationType = readNotificationType(data);
    const targetScreen = route && 'screen' in route ? route.screen : null;
    track('push_notification_tapped', {
      notification_type: notificationType,
      target_screen: targetScreen,
    });
  }
}

export function usePushNotificationTap() {
  const responseListenerRef = useRef<Notifications.EventSubscription | null>(null);
  const receivedListenerRef = useRef<Notifications.EventSubscription | null>(null);
  const setNotificationCount = useStore((state) => state.setNotificationCount);
  const notificationCount = useStore((state) => state.notificationCount);
  const isAuthenticated = useStore((state) => state.isAuthenticated);

  const handleForegroundNotification = useCallback(
    (notification: Notifications.Notification) => {
      if (isAuthenticated) {
        setNotificationCount(notificationCount + 1);
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
    [isAuthenticated, notificationCount, setNotificationCount],
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
