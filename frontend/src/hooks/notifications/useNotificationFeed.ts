import React from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { Swipeable } from 'react-native-gesture-handler';
import { listNotificationEvents } from '../../services/notificationsApi';
import { haptics } from '../../utils/haptics';
import {
  NotificationCard,
  NotificationFilter,
  NotificationListItem,
  mapEventToCard,
  aggregateNotifications,
  groupNotifications,
  flattenNotificationSections,
  computeNotificationFilterCounts } from '../../components/notifications/notificationViewModels';

/**
 * Owns the notifications feed lifecycle: the initial/focus refetch, pull-to-
 * refresh, cursor pagination, the sync error surfaced by banners/empty states,
 * the active filter, the overflow filter sheet visibility, and the derived
 * view-models (filtered → aggregated → grouped → flattened) that FlashList
 * renders.
 *
 * Also owns the Swipeable ref registry — refs are registered by row id as
 * FlashList recycles cells, and all open swipe actions are closed on unmount
 * to prevent gesture-handler leaks (RetryableMountingLayerException).
 */
export function useNotificationFeed() {
  const [notifications, setNotifications] = React.useState<NotificationCard[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [isLoadingMore, setIsLoadingMore] = React.useState(false);
  const [cursor, setCursor] = React.useState<string | null>(null);
  const [hasMore, setHasMore] = React.useState(false);
  const [hasSyncError, setHasSyncError] = React.useState(false);
  const [activeFilter, setActiveFilter] = React.useState<NotificationFilter>('all');
  const [overflowVisible, setOverflowVisible] = React.useState(false);
  const swipeableRefs = React.useRef<Record<string, Swipeable | null>>({});

  // Clean up stale Swipeable refs on unmount. When FlashList recycles items,
  // the Swipeable component's ref callback fires with null, but the ref map
  // can retain stale entries. Clearing on unmount prevents gesture handler
  // leaks that contribute to the RetryableMountingLayerException crash.
  React.useEffect(() => {
    return () => {
      // Close any open swipe actions before the screen unmounts.
      for (const id of Object.keys(swipeableRefs.current)) {
        swipeableRefs.current[id]?.close();
      }
      swipeableRefs.current = {};
    };
  }, []);

  const unreadCount = React.useMemo(() => notifications.filter((n) => !n.read).length, [notifications]);

  const syncNotifications = React.useCallback(
    async (options?: { silent?: boolean }) => {
      if (!options?.silent) {
        setIsLoading(true);
      }

      try {
        const { items, nextCursor } = await listNotificationEvents({ limit: 30 });
        setNotifications(items.map(mapEventToCard));
        setCursor(nextCursor);
        setHasMore(!!nextCursor);
        setHasSyncError(false);
      } catch {
        setHasSyncError(true);
      } finally {
        if (!options?.silent) {
          setIsLoading(false);
        }
      }
    },
    []
  );

  const loadMore = React.useCallback(
    async () => {
      if (!hasMore || isLoadingMore || !cursor) return;
      setIsLoadingMore(true);
      try {
        const { items, nextCursor } = await listNotificationEvents({ limit: 30, cursor });
        setNotifications((prev) => {
          const existingIds = new Set(prev.map((n) => n.id));
          const newItems = items.map(mapEventToCard).filter((n) => !existingIds.has(n.id));
          return [...prev, ...newItems];
        });
        setCursor(nextCursor);
        setHasMore(!!nextCursor);
      } catch {
        // silently fail
      } finally {
        setIsLoadingMore(false);
      }
    },
    [cursor, hasMore, isLoadingMore]
  );

  useFocusEffect(
    React.useCallback(() => {
      void syncNotifications();
    }, [syncNotifications])
  );

  const [isRefreshing, setIsRefreshing] = React.useState(false);

  const handleRefresh = React.useCallback(async () => {
    haptics.press();
    setIsRefreshing(true);
    try {
      const { items, nextCursor } = await listNotificationEvents({ limit: 30 });
      setNotifications(items.map(mapEventToCard));
      setCursor(nextCursor);
      setHasMore(!!nextCursor);
      setHasSyncError(false);
    } catch {
      setHasSyncError(true);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  const filteredNotifications = React.useMemo(() => {
    if (activeFilter === 'all') return notifications;
    if (activeFilter === 'unread') return notifications.filter((n) => !n.read);
    return notifications.filter((n) => n.type === activeFilter);
  }, [notifications, activeFilter]);

  const sections = React.useMemo(
    () => groupNotifications(aggregateNotifications(filteredNotifications)),
    [filteredNotifications]
  );

  // Flatten sections into a single array so FlashList can recycle cells.
  // Each section becomes a header item followed by its data items.
  const flattenedData = React.useMemo<NotificationListItem[]>(
    () => flattenNotificationSections(sections),
    [sections]
  );

  const hasUnread = React.useMemo(() => notifications.some((item) => !item.read), [notifications]);

  const filterCounts = React.useMemo(
    () => computeNotificationFilterCounts(notifications),
    [notifications]
  );

  const registerSwipeableRef = React.useCallback(
    (id: string, ref: Swipeable | null) => {
      swipeableRefs.current[id] = ref;
    },
    []
  );

  return {
    notifications,
    setNotifications,
    isLoading,
    isLoadingMore,
    hasSyncError,
    isRefreshing,
    activeFilter,
    setActiveFilter,
    overflowVisible,
    setOverflowVisible,
    swipeableRefs,
    registerSwipeableRef,
    unreadCount,
    hasUnread,
    filterCounts,
    flattenedData,
    syncNotifications,
    loadMore,
    handleRefresh,
  };
}
