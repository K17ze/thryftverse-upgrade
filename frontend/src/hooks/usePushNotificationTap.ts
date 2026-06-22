import { useEffect, useRef, useCallback } from 'react';
import * as Notifications from 'expo-notifications';
import { createNavigationContainerRef } from '@react-navigation/native';
import type { RootStackParamList } from '../navigation/types';
import { extractRouteFromPushData, resolveNotificationRoute, type ResolvedRoute } from '../utils/notificationRouting';
import { useStore } from '../store/useStore';

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
  if (params) {
    (navigationRef as any).navigate(screen, params);
  } else {
    (navigationRef as any).navigate(screen);
  }
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

function handleNotificationResponse(response: Notifications.NotificationResponse) {
  const data = response.notification.request.content.data as Record<string, unknown> | undefined;
  const route = extractRouteFromPushData(data);
  queueRoute(route);
}

export function usePushNotificationTap() {
  const responseListenerRef = useRef<Notifications.EventSubscription | null>(null);
  const receivedListenerRef = useRef<Notifications.EventSubscription | null>(null);
  const setNotificationCount = useStore((state) => state.setNotificationCount);
  const notificationCount = useStore((state) => state.notificationCount);
  const isAuthenticated = useStore((state) => state.isAuthenticated);

  const handleForegroundNotification = useCallback(() => {
    if (isAuthenticated) {
      setNotificationCount(notificationCount + 1);
    }
  }, [isAuthenticated, notificationCount, setNotificationCount]);

  useEffect(() => {
    receivedListenerRef.current = Notifications.addNotificationReceivedListener(() => {
      handleForegroundNotification();
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
