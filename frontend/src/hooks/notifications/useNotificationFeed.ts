import React from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { Swipeable } from 'react-native-gesture-handler';
import {
  listNotificationEvents,
  type ListNotificationEventsOptions } from '../../services/notificationsApi';
import { haptics } from '../../utils/haptics';
import {
  NotificationCard,
  NotificationFilter,
  NotificationListItem,
  FILTER_EVENT_TYPES,
  mapEventToCard,
  aggregateNotifications,
  groupNotifications,
  flattenNotificationSections } from '../../components/notifications/notificationViewModels';

/**
 * Owns the notifications feed lifecycle: the initial/focus refetch, pull-to-
 * refresh, cursor pagination, the sync error surfaced by banners/empty states,
 * the active filter, the overflow filter sheet visibility, and the derived
 * view-models (filtered → aggregated → grouped → flattened) that FlashList
 * renders.
 *
 * The active filter is sent to the server (`eventType`/`unread` params) so
 * pagination works within the filter — loadMore carries it through. The
 * local `filteredNotifications` pass stays as an idempotent safety net: a
 * server that ignores the params returns an unfiltered page and the local
 * filter still applies; a filtered page passes through unchanged.
 *
 * Per-filter counts come from the server when the response provides them;
 * otherwise they are null and the filter UI renders no count badges rather
 * than counting only the loaded window.
 *
 * Also owns the Swipeable ref registry — refs are registered by row id as
 * FlashList recycles cells, and all open swipe actions are closed on unmount
 * to prevent gesture-handler leaks (RetryableMountingLayerException).
 */
export function useNotificationFeed() {
  const [notifications, setNotifications] = React.useState<NotificationCard[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [isLoadingMore, setIsLoadingMore] = React.useState(false);
  const [loadMoreFailed, setLoadMoreFailed] = React.useState(false);
  const [cursor, setCursor] = React.useState<string | null>(null);
  const [hasMore, setHasMore] = React.useState(false);
  const [hasSyncError, setHasSyncError] = React.useState(false);
  const [activeFilter, setActiveFilter] = React.useState<NotificationFilter>('all');
  const [overflowVisible, setOverflowVisible] = React.useState(false);
  const [serverFilterCounts, setServerFilterCounts] = React.useState<Record<NotificationFilter, number> | null>(null);
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

  /** Translate the UI filter into list query params. */
  const filterOptionsFor = React.useCallback(
    (filter: NotificationFilter): Pick<ListNotificationEventsOptions, 'eventTypes' | 'unread'> => {
      if (filter === 'all') return {};
      if (filter === 'unread') return { unread: true };
      return { eventTypes: FILTER_EVENT_TYPES[filter] };
    },
    []
  );

  const syncNotifications = React.useCallback(
    async (options?: { silent?: boolean }) => {
      if (!options?.silent) {
        setIsLoading(true);
      }

      try {
        const { items, nextCursor, filterCounts } = await listNotificationEvents({
          limit: 30,
          ...filterOptionsFor(activeFilter),
        });
        setNotifications(items.map(mapEventToCard));
        setCursor(nextCursor);
        setHasMore(!!nextCursor);
        setHasSyncError(false);
        setLoadMoreFailed(false);
        if (filterCounts) {
          setServerFilterCounts(filterCounts as Record<NotificationFilter, number>);
        }
      } catch {
        setHasSyncError(true);
      } finally {
        if (!options?.silent) {
          setIsLoading(false);
        }
      }
    },
    [activeFilter, filterOptionsFor]
  );

  const loadMore = React.useCallback(
    async () => {
      if (!hasMore || isLoadingMore || !cursor) return;
      setIsLoadingMore(true);
      setLoadMoreFailed(false);
      try {
        const { items, nextCursor } = await listNotificationEvents({
          limit: 30,
          cursor,
          ...filterOptionsFor(activeFilter),
        });
        setNotifications((prev) => {
          const existingIds = new Set(prev.map((n) => n.id));
          const newItems = items.map(mapEventToCard).filter((n) => !existingIds.has(n.id));
          return [...prev, ...newItems];
        });
        setCursor(nextCursor);
        setHasMore(!!nextCursor);
      } catch {
        // Surface a retryable footer instead of silently failing — otherwise
        // the user has no signal that more items exist but failed to load.
        setLoadMoreFailed(true);
      } finally {
        setIsLoadingMore(false);
      }
    },
    [cursor, hasMore, isLoadingMore, activeFilter, filterOptionsFor]
  );

  // Stable ref so the focus effect doesn't re-subscribe (and double-fetch)
  // every time the filter changes the sync callback's identity.
  const syncRef = React.useRef(syncNotifications);
  syncRef.current = syncNotifications;

  useFocusEffect(
    React.useCallback(() => {
      void syncRef.current();
    }, [])
  );

  // Refetch when the filter changes — the server (or the local fallback
  // filter pass) narrows the result set, and pagination must restart from
  // a fresh cursor within that filter. Silent so the current list stays
  // on screen while the filtered page loads.
  const didMountRef = React.useRef(false);
  React.useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    void syncNotifications({ silent: true });
  }, [activeFilter, syncNotifications]);

  const [isRefreshing, setIsRefreshing] = React.useState(false);

  const handleRefresh = React.useCallback(async () => {
    haptics.press();
    setIsRefreshing(true);
    try {
      const { items, nextCursor, filterCounts } = await listNotificationEvents({
        limit: 30,
        ...filterOptionsFor(activeFilter),
      });
      setNotifications(items.map(mapEventToCard));
      setCursor(nextCursor);
      setHasMore(!!nextCursor);
      setHasSyncError(false);
      setLoadMoreFailed(false);
      if (filterCounts) {
        setServerFilterCounts(filterCounts as Record<NotificationFilter, number>);
      }
    } catch {
      setHasSyncError(true);
    } finally {
      setIsRefreshing(false);
    }
  }, [activeFilter, filterOptionsFor]);

  // Idempotent fallback: when the server already applied the filter this
  // pass is a no-op; when it ignored the params it still narrows the window.
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
    loadMoreFailed,
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
    // null when the server didn't supply counts — the filter UI shows no
    // badges rather than counting only the loaded window.
    filterCounts: serverFilterCounts,
    flattenedData,
    syncNotifications,
    loadMore,
    handleRefresh,
  };
}
