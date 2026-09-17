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
import { ApiRequestError } from '../../lib/apiClient';
import { resolveNotificationRoute } from '../../utils/notificationRouting';
import { haptics } from '../../utils/haptics';
import type { NotificationCard } from '../../components/notifications/notificationViewModels';

/**
 * The backend returns 404 NOTIFICATION_NOT_FOUND for events that are already
 * read or deleted — for a mark-read fan-out that is a success outcome, not a
 * failure. Tolerating it prevents a stale member from rolling back the whole
 * aggregated card.
 */
function isNotificationNotFound(error: unknown): boolean {
  if (!(error instanceof ApiRequestError)) return false;
  if (error.status === 404) return true;
  const details = error.details;
  return (
    typeof details === 'object' &&
    details !== null &&
    (details as { code?: unknown }).code === 'NOTIFICATION_NOT_FOUND'
  );
}

async function markEventReadTolerant(eventId: string): Promise<void> {
  try {
    await markNotificationRead(eventId);
  } catch (error) {
    if (isNotificationNotFound(error)) return;
    throw error;
  }
}

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
  const setNotificationCount = useStore((state) => state.setNotificationCount);

  // Aggregated cards carry a synthetic `agg:` render id — mutations must fan
  // out to the real member event ids or they silently no-op server-side.
  const memberIds = (notification: NotificationCard): string[] =>
    notification.aggregatedIds ?? [notification.id];

  // Mark-read fans out to UNREAD members only. Already-read members 404
  // server-side; even with the tolerant wrapper, targeting only unread
  // members keeps the write set honest.
  const unreadMemberIds = (notification: NotificationCard): string[] =>
    notification.aggregatedUnreadIds ??
    (notification.aggregatedIds ? notification.aggregatedIds : [notification.id]);

  const handleSwipeMarkRead = React.useCallback(
    async (notification: NotificationCard) => {
      if (notification.read) return;
      const previousRead = notification.read;
      const unreadDelta = notification.aggregatedUnreadCount ?? 1;
      setNotifications((prev) =>
        prev.map((item) => (item.id === notification.id ? { ...item, read: true } : item))
      );
      try {
        await Promise.all(unreadMemberIds(notification).map(markEventReadTolerant));
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
      // Dismissing an unread card removes it from the feed — mirror the
      // badge decrement optimistically and restore it if the delete fails.
      const unreadDelta = notification.read
        ? 0
        : (notification.aggregatedUnreadCount ?? 1);
      setNotifications((previous) => previous.filter((item) => item.id !== notification.id));
      if (unreadDelta > 0) {
        setNotificationCount(Math.max(0, useStore.getState().notificationCount - unreadDelta));
      }
      haptics.tap();
      void Promise.all(memberIds(notification).map(deleteNotificationEvent)).catch(() => {
        setNotifications(previousNotifications);
        if (unreadDelta > 0) {
          setNotificationCount(useStore.getState().notificationCount + unreadDelta);
        }
        show('Could not delete this notification', 'error');
      });
    },
    [notifications, show, setNotificationCount]
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
          await Promise.all(unreadMemberIds(notification).map(markEventReadTolerant));
          // Read the badge from the store at apply time — the render-captured
          // `notificationCount` goes stale when several opens happen between
          // renders.
          setNotificationCount(Math.max(0, useStore.getState().notificationCount - unreadDelta));
        } catch {
          setNotifications((previous) =>
            previous.map((item) => (item.id === notification.id ? { ...item, read: previousRead } : item))
          );
        }
      }

      const route = resolveNotificationRoute(notification.route, notification.payload);
      if (route) {
        // Route screens are resolved dynamically from the payload — the
        // navigate signature is widened once here rather than casting at
        // each call site.
        const navigateTo = navigation.navigate as (
          screen: string,
          params?: Record<string, unknown>
        ) => void;
        navigateTo(route.screen, 'params' in route ? route.params : undefined);
        return;
      }

      show('No linked destination for this notification yet.', 'info');
    },
    [navigation, show, notifications, setNotifications, setNotificationCount]
  );

  /**
   * Quiet action affordance ("Dispatch now", "Review offer"). Semantically
   * this is an open — mark read, then follow the resolved route — so it
   * delegates to the open path rather than duplicating it.
   */
  const handleActionPress = React.useCallback(
    (notification: NotificationCard) => {
      void handleOpenNotification(notification);
    },
    [handleOpenNotification]
  );

  return {
    handleSwipeMarkRead,
    handleSwipeDismiss,
    handleMarkAllAsRead,
    handleOpenNotification,
    handleActionPress,
  };
}
