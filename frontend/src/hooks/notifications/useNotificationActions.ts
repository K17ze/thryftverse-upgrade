import React from 'react';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/types';
import { useToast } from '../../context/ToastContext';
import { useStore } from '../../store/useStore';
import {
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotificationEvent } from '../../services/notificationsApi';
import { resolveNotificationRoute } from '../../utils/notificationRouting';
import { haptics } from '../../utils/haptics';
import type { NotificationCard } from '../../components/notifications/notificationViewModels';

type NavT = NativeStackNavigationProp<RootStackParamList>;

export interface UseNotificationActionsParams {
  notifications: NotificationCard[];
  setNotifications: React.Dispatch<React.SetStateAction<NotificationCard[]>>;
  hasUnread: boolean;
}

/**
 * Owns the notification mutation actions: swipe-to-mark-read, swipe-to-dismiss,
 * mark-all-read, and open (mark read + route resolution + navigation).
 * Each action updates local state optimistically and rolls back on failure,
 * mirroring the store's badge count so the tab badge stays in sync (§37.6).
 */
export function useNotificationActions({
  notifications,
  setNotifications,
  hasUnread,
}: UseNotificationActionsParams) {
  const navigation = useNavigation<NavT>();
  const { show } = useToast();
  // Tab/app badge propagation (§37.6): mark-as-read must update the global
  // unread count immediately, not wait for the next app-state poll.
  const notificationCount = useStore((state) => state.notificationCount);
  const setNotificationCount = useStore((state) => state.setNotificationCount);

  // Aggregated cards carry a synthetic `agg:` render id — mutations must fan
  // out to the real member event ids or they silently no-op server-side.
  const memberIds = (notification: NotificationCard): string[] =>
    notification.aggregatedIds ?? [notification.id];

  const handleSwipeMarkRead = React.useCallback(
    async (notification: NotificationCard) => {
      if (notification.read) return;
      const previousRead = notification.read;
      const unreadDelta = notification.aggregatedUnreadCount ?? 1;
      setNotifications((prev) =>
        prev.map((item) => (item.id === notification.id ? { ...item, read: true } : item))
      );
      try {
        await Promise.all(memberIds(notification).map(markNotificationRead));
        setNotificationCount(Math.max(0, useStore.getState().notificationCount - unreadDelta));
        show('Marked as read', 'success');
      } catch {
        setNotifications((prev) =>
          prev.map((item) => (item.id === notification.id ? { ...item, read: previousRead } : item))
        );
        show('Failed to mark as read', 'error');
      }
    },
    [show]
  );

  const handleSwipeDismiss = React.useCallback(
    (notification: NotificationCard) => {
      const previousNotifications = notifications;
      setNotifications((previous) => previous.filter((item) => item.id !== notification.id));
      haptics.tap();
      void Promise.all(memberIds(notification).map(deleteNotificationEvent)).catch(() => {
        setNotifications(previousNotifications);
        show('Could not delete this notification', 'error');
      });
    },
    [notifications, show]
  );

  const handleMarkAllAsRead = React.useCallback(async () => {
    if (!hasUnread) {
      show('You are all caught up', 'info');
      return;
    }

    haptics.success();
    const previousNotifications = notifications;
    setNotifications((previous) => previous.map((item) => ({ ...item, read: true })));
    try {
      await markAllNotificationsRead();
      setNotificationCount(0);
      show('Marked all notifications as read', 'success');
    } catch {
      setNotifications(previousNotifications);
      show('Failed to mark all as read', 'error');
    }
  }, [hasUnread, notifications, show, setNotificationCount]);

  const handleOpenNotification = React.useCallback(
    async (notification: NotificationCard) => {
      if (!notification.read) {
        const previousRead = notification.read;
        const unreadDelta = notification.aggregatedUnreadCount ?? 1;
        setNotifications((previous) =>
          previous.map((item) => (item.id === notification.id ? { ...item, read: true } : item))
        );
        try {
          await Promise.all(memberIds(notification).map(markNotificationRead));
          setNotificationCount(Math.max(0, notificationCount - unreadDelta));
        } catch {
          setNotifications((previous) =>
            previous.map((item) => (item.id === notification.id ? { ...item, read: previousRead } : item))
          );
        }
      }

      const route = resolveNotificationRoute(notification.route, notification.payload);
      if (route) {
        const params = 'params' in route ? route.params : undefined;
        if (params) {
          (navigation.navigate as (screen: any, params?: any) => void)(route.screen, params);
        } else {
          (navigation.navigate as (screen: any) => void)(route.screen);
        }
        return;
      }

      show('No linked destination for this notification yet.', 'info');
    },
    [navigation, show, notifications, setNotifications, notificationCount, setNotificationCount]
  );

  return {
    handleSwipeMarkRead,
    handleSwipeDismiss,
    handleMarkAllAsRead,
    handleOpenNotification,
  };
}
