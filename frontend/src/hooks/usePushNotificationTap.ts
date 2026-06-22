import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { createNavigationContainerRef } from '@react-navigation/native';
import type { RootStackParamList } from '../navigation/types';

const navigationRef = createNavigationContainerRef<RootStackParamList>();

export { navigationRef as pushNavigationRef };

interface NotificationRouteData {
  screen?: string;
  params?: Record<string, unknown>;
}

function extractRouteFromNotification(notification: Notifications.Notification): NotificationRouteData | null {
  const data = notification.request.content.data as Record<string, unknown> | undefined;
  if (!data) return null;

  const route = data.route as Record<string, unknown> | undefined;
  if (route && typeof route.screen === 'string') {
    return { screen: route.screen, params: route.params as Record<string, unknown> | undefined };
  }

  const orderId = typeof data.orderId === 'string' ? data.orderId : null;
  if (orderId) {
    return { screen: 'OrderDetail', params: { orderId } };
  }

  const listingId = typeof data.listingId === 'string' ? data.listingId : null;
  if (listingId) {
    return { screen: 'ItemDetail', params: { itemId: listingId } };
  }

  const ticketId = typeof data.ticketId === 'string' ? data.ticketId : null;
  if (ticketId) {
    return { screen: 'SupportTicketDetail', params: { ticketId } };
  }

  return null;
}

function navigateToRoute(route: NotificationRouteData) {
  if (!navigationRef.isReady()) return;

  const { screen, params } = route;

  if (screen === 'OrderDetail' && params?.orderId) {
    navigationRef.navigate('OrderDetail', { orderId: String(params.orderId) });
  } else if (screen === 'ItemDetail' && params?.itemId) {
    navigationRef.navigate('ItemDetail', { itemId: String(params.itemId) });
  } else if (screen === 'SupportTicketDetail' && params?.ticketId) {
    (navigationRef as any).navigate('SupportTicketDetail', { ticketId: String(params.ticketId) });
  } else if (screen === 'Wallet') {
    (navigationRef as any).navigate('Wallet');
  } else if (screen === 'BalanceHistory') {
    (navigationRef as any).navigate('BalanceHistory');
  } else if (screen === 'NotificationsList') {
    navigationRef.navigate('NotificationsList');
  } else {
    (navigationRef as any).navigate(screen, params);
  }
}

export function usePushNotificationTap() {
  const responseListenerRef = useRef<Notifications.EventSubscription | null>(null);
  const receivedListenerRef = useRef<Notifications.EventSubscription | null>(null);

  useEffect(() => {
    // Handle notification received while app is foregrounded
    receivedListenerRef.current = Notifications.addNotificationReceivedListener(() => {
      // Could trigger a refetch of unread count or show an in-app banner
    });

    // Handle notification tap (user taps notification to open app)
    responseListenerRef.current = Notifications.addNotificationResponseReceivedListener((response) => {
      const route = extractRouteFromNotification(response.notification);
      if (route) {
        // Small delay to allow navigation container to be ready
        setTimeout(() => navigateToRoute(route), 100);
      } else {
        // Default to notifications list
        setTimeout(() => {
          if (navigationRef.isReady()) {
            navigationRef.navigate('NotificationsList');
          }
        }, 100);
      }
    });

    return () => {
      receivedListenerRef.current?.remove();
      responseListenerRef.current?.remove();
    };
  }, []);
}
