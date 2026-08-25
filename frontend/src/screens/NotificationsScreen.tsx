import React, { useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  RefreshControl,
  Pressable,
  Animated,
} from 'react-native';
import { FlashList, ListRenderItem } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { Swipeable } from 'react-native-gesture-handler';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { openProfile } from '../navigation/openProfile';
import { EmptyState } from '../components/EmptyState';
import { OfflineBanner } from '../components/OfflineBanner';
import { SyncRetryBanner } from '../components/SyncRetryBanner';
import { SkeletonLoader } from '../components/SkeletonLoader';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { BottomSheet } from '../components/BottomSheet';
import { useToast } from '../context/ToastContext';
import { useStore } from '../store/useStore';
import {
  NotificationEvent,
  NotificationEventType,
  NotificationEventV2,
  NotificationObjectRef,
  NotificationAttentionLevel,
  listNotificationEvents,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotificationEvent,
  upgradeToV2,
} from '../services/notificationsApi';
import { resolveNotificationRoute } from '../utils/notificationRouting';
import { haptics } from '../utils/haptics';
import { useConnectivity } from '../hooks/useConnectivity';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { useSettingsPreferences } from '../context/SettingsPreferencesContext';
import { isQuietHoursActive } from '../preferences/settingsPreferences';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import {
  SocialNotificationRow,
  CommerceNotificationRow,
  AuctionNotificationRow,
  FinancialNotificationRow,
  SystemNotificationRow,
} from '../components/notifications';

import { Typography, Radius, Type, Space, Stroke, Control } from '../theme/designTokens';
type NavT = NativeStackNavigationProp<RootStackParamList>;

type NotificationCardType = 'new_item' | 'like' | 'review' | 'order' | 'price' | 'resolution' | 'auction' | 'generic';

type NotificationCard = {
  id: string;
  itemImage: string;
  title: string;
  body: string;
  text: string;
  time: string;
  type: NotificationCardType;
  read: boolean;
  createdAt: string;
  payload: Record<string, unknown>;
  eventType: NotificationEventType;
  actorUserId: string | null;
  actorUsername: string | null;
  actorDisplayName: string | null;
  actorAvatar: string | null;
  route: { screen: string; params?: Record<string, unknown> } | null;
  /** Whether this event requires user action (outbid, ship order, dispute). */
  requiresAction: boolean;
  /** Structured aggregation key from the V2 registry (e.g. "social.look_liked:look123"). */
  aggregationKey: string | null;
  /** V2 attention priority — critical/action/important/info. */
  attention: NotificationAttentionLevel;
  /** Structured object reference from the V2 registry (label used for aggregation text). */
  objectRef?: NotificationObjectRef;
  /** Aggregated notification count — when >1, this card represents N similar events. */
  aggregatedCount?: number;
  /** Actor names for aggregated notifications (first few). */
  aggregatedActors?: string[];
  /** V2 structured event — passed to role-specific row presenters. */
  v2Event: NotificationEventV2;
};

/**
 * Flattened list item used by FlashList. Each section header becomes a
 * `'header'` item followed by its `'item'` rows, so FlashList can recycle
 * cells by type via `getItemType`.
 */
type NotificationListItem =
  | { type: 'header'; sectionTitle: string; unreadCount: number; isAttention: boolean; itemCount: number }
  | { type: 'item'; card: NotificationCard };

type NotificationFilter = 'all' | 'unread' | 'order' | 'new_item' | 'review' | 'price' | 'auction';

// All filters live behind a single overflow funnel icon — no primary tab row.
// This keeps the screen's information hierarchy attention-first (Needs attention,
// Today, Yesterday, Earlier) rather than split across pseudo-tabs.
const OVERFLOW_FILTERS: { key: NotificationFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'unread', label: 'Unread' },
  { key: 'order', label: 'Orders' },
  { key: 'new_item', label: 'Items' },
  { key: 'review', label: 'Reviews' },
  { key: 'price', label: 'Prices' },
  { key: 'auction', label: 'Auctions' },
];

// Primary pill-style filter tabs — always visible at the top of the list.
// The most useful commerce/social filters get direct one-tap access; the
// remaining filters stay behind the overflow funnel icon.
const PRIMARY_FILTERS: { key: NotificationFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'unread', label: 'Unread' },
  { key: 'order', label: 'Purchases' },
];

function filterLabelForKey(key: NotificationFilter): string {
  return OVERFLOW_FILTERS.find((f) => f.key === key)?.label ?? 'All';
}

/**
 * Direct mapping from known NotificationEventType → NotificationCardType.
 * This is the structured contract: category is NEVER derived from title/body text.
 * All event types in the V2 registry are covered here.
 */
const EVENT_TYPE_CARD_MAP: Record<NotificationEventType, NotificationCardType> = {
  order_created: 'order',
  order_paid: 'order',
  order_cancelled: 'order',
  order_dispatched: 'order',
  order_in_transit: 'order',
  order_out_for_delivery: 'order',
  order_delivered: 'order',
  order_refunded: 'order',
  resolution_opened: 'resolution',
  resolution_status_changed: 'resolution',
  review_received: 'review',
  chat_message: 'generic',
  payout_processed: 'order',
  refund_completed: 'order',
  auction_outbid: 'auction',
  auction_won: 'auction',
  auction_ending_soon: 'auction',
  new_follower: 'generic',
  price_drop: 'price',
  new_listing_from_followed_seller: 'new_item',
  safety_outcome: 'generic',
  generic: 'generic', // resolved further by objectRef below
};

/**
 * For generic events (which don't have a specific event type in the registry),
 * infer the card type from the structured object reference — never from text.
 */
function cardTypeFromObjectRef(objectRef: NotificationObjectRef | undefined): NotificationCardType {
  if (!objectRef) return 'generic';
  switch (objectRef.type) {
    case 'listing':
      return 'new_item';
    case 'order':
      return 'order';
    case 'auction':
      return 'auction';
    case 'look':
      return 'like';
    case 'poster':
      return 'new_item';
    case 'conversation':
      return 'generic';
    case 'wallet':
      return 'order';
    default:
      return 'generic';
  }
}

/**
 * Resolve the notification card type using the V2 registry — never from title/body text.
 * Known event types use a direct mapping; generic events fall back to objectRef shape.
 */
function resolveCardType(v2Event: NotificationEventV2): NotificationCardType {
  if (v2Event.eventType !== 'generic') {
    return EVENT_TYPE_CARD_MAP[v2Event.eventType] ?? 'generic';
  }
  return cardTypeFromObjectRef(v2Event.objectRef);
}

function formatRelativeTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'now';
  }

  const diffMs = Date.now() - parsed.getTime();
  const minutes = Math.max(0, Math.floor(diffMs / 60_000));
  if (minutes < 1) {
    return 'now';
  }

  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h`;
  }

  const days = Math.floor(hours / 24);
  if (days === 1) {
    return 'Yesterday';
  }
  if (days < 7) {
    return `${days}d`;
  }

  return parsed.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

function mapEventToCard(event: NotificationEvent): NotificationCard {
  const title = event.title.trim();
  const body = event.body.trim();
  const v2 = upgradeToV2(event);
  return {
    id: event.id,
    itemImage: event.imageUrl ?? '',
    title,
    body,
    text: `${title} ${body}`.trim(),
    time: formatRelativeTime(event.createdAt),
    type: resolveCardType(v2),
    read: !!event.readAt,
    createdAt: event.createdAt,
    payload: event.payload,
    eventType: event.eventType,
    actorUserId: event.actorUserId,
    actorUsername: event.actorUsername,
    actorDisplayName: event.actorDisplayName,
    actorAvatar: event.actorAvatar,
    route: event.route,
    requiresAction: v2.requiresAction,
    aggregationKey: v2.aggregationKey,
    attention: v2.attention,
    objectRef: v2.objectRef,
    v2Event: v2,
  };
}

/**
 * Aggregate similar notifications of the same type within a 24h window.
 * Merges events like "X liked your item", "Y liked your item" into
 * "X and 2 others liked your item" — Instagram-style notification grouping.
 *
 * Only aggregates social/engagement types (likes, follows, price drops).
 * Order and resolution notifications are never aggregated (each is unique and actionable).
 */
const AGGREGATABLE_TYPES: NotificationCardType[] = ['like', 'price', 'new_item'];
const AGGREGATION_WINDOW_HOURS = 24;

function aggregateNotifications(notifications: NotificationCard[]): NotificationCard[] {
  const now = Date.now();
  const groups: Map<string, NotificationCard[]> = new Map();
  const standalone: NotificationCard[] = [];

  for (const notif of notifications) {
    const ageHours = Math.max(0, (now - new Date(notif.createdAt).getTime()) / 3_600_000);
    if (!AGGREGATABLE_TYPES.includes(notif.type) || ageHours > AGGREGATION_WINDOW_HOURS) {
      standalone.push(notif);
      continue;
    }

    // Use the V2 registry's structured aggregation key when available.
    // Falls back to type+listingId for legacy events without a registry entry.
    const groupKey = notif.aggregationKey ?? `${notif.type}:${typeof notif.payload.listingId === 'string' ? notif.payload.listingId : ''}`;

    const existing = groups.get(groupKey);
    if (existing) {
      existing.push(notif);
    } else {
      groups.set(groupKey, [notif]);
    }
  }

  const result: NotificationCard[] = [...standalone];

  for (const group of groups.values()) {
    if (group.length <= 1) {
      result.push(group[0]);
      continue;
    }

    group.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const primary = group[0];
    const actorNames = group
      .map((n) => n.actorDisplayName || n.actorUsername)
      .filter((name): name is string => Boolean(name));
    const uniqueActorNames = [...new Set(actorNames)];

    const count = group.length;
    const othersCount = count - 1;
    const firstActor = uniqueActorNames[0] || 'Someone';

    // Build clean aggregated text using the notification type — not regex parsing.
    // "username and N others liked your item"
    const actionVerbByType: Record<string, string> = {
      like: 'liked',
      price: 'dropped the price on',
      new_item: 'listed',
    };
    const action = actionVerbByType[primary.type] ?? 'interacted with';

    // Use the V2 registry's structured object label — never regex-parse body text.
    const object = primary.objectRef?.label ?? 'your item';

    const aggregatedText = `${firstActor} and ${othersCount} other${othersCount === 1 ? '' : 's'} ${action} ${object}`;

    result.push({
      ...primary,
      id: `agg:${primary.id}`,
      text: aggregatedText,
      aggregatedCount: count,
      aggregatedActors: uniqueActorNames.slice(0, 5),
      read: group.every((n) => n.read),
      v2Event: {
        ...primary.v2Event,
        readAt: group.every((n) => n.read) ? primary.v2Event.readAt : null,
      },
    });
  }

  result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return result;
}

type NotificationGroupKey = 'attention' | 'today' | 'yesterday' | 'earlier';

const NOTIFICATION_GROUP_ORDER: NotificationGroupKey[] = ['attention', 'today', 'yesterday', 'earlier'];

const NOTIFICATION_GROUP_LABELS: Record<NotificationGroupKey, string> = {
  attention: 'Needs attention',
  today: 'Today',
  yesterday: 'Yesterday',
  earlier: 'Earlier',
};

function getNotificationGroupKey(createdAt: string): NotificationGroupKey {
  const now = new Date();
  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) return 'earlier';

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday.getTime() - 86_400_000);

  if (created >= startOfToday) return 'today';
  if (created >= startOfYesterday) return 'yesterday';
  return 'earlier';
}

function groupNotifications(notifications: NotificationCard[]) {
  const buckets: Record<NotificationGroupKey, NotificationCard[]> = {
    attention: [],
    today: [],
    yesterday: [],
    earlier: [],
  };

  notifications.forEach((notification) => {
    // Action-required events go into the "Needs attention" section,
    // separated from the time-based sections so they are obvious.
    if (notification.requiresAction) {
      buckets.attention.push(notification);
      return;
    }
    const groupKey = getNotificationGroupKey(notification.createdAt);
    buckets[groupKey].push(notification);
  });

  for (const key of NOTIFICATION_GROUP_ORDER) {
    buckets[key].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  const sections: Array<{ title: string; data: NotificationCard[]; unreadCount: number; isAttention?: boolean }> = [];
  for (const key of NOTIFICATION_GROUP_ORDER) {
    const data = buckets[key];
    if (data.length === 0) continue;
    const unreadCount = data.filter((n) => !n.read).length;
    sections.push({ title: NOTIFICATION_GROUP_LABELS[key], data, unreadCount, isAttention: key === 'attention' });
  }

  return sections;
}

export default function NotificationsScreen() {
  const navigation = useNavigation<NavT>();
  const { show } = useToast();
  const currentUser = useStore((state) => state.currentUser);
  const { isOffline } = useConnectivity();
  const { quietHours } = useSettingsPreferences();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [notifications, setNotifications] = React.useState<NotificationCard[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [isLoadingMore, setIsLoadingMore] = React.useState(false);
  const [cursor, setCursor] = React.useState<string | null>(null);
  const [hasMore, setHasMore] = React.useState(false);
  const [hasSyncError, setHasSyncError] = React.useState(false);
  const [activeFilter, setActiveFilter] = React.useState<NotificationFilter>('all');
  const [overflowVisible, setOverflowVisible] = React.useState(false);
  const swipeableRefs = React.useRef<Record<string, Swipeable | null>>({});

  const quietActive = isQuietHoursActive(quietHours);
  const unreadCount = React.useMemo(() => notifications.filter((n) => !n.read).length, [notifications]);
  const reducedMotion = useReducedMotion();

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
  const flattenedData = React.useMemo(() => {
    const items: NotificationListItem[] = [];
    for (const section of sections) {
      items.push({
        type: 'header',
        sectionTitle: section.title,
        unreadCount: section.unreadCount,
        isAttention: !!section.isAttention,
        itemCount: section.data.length,
      });
      for (const card of section.data) {
        items.push({ type: 'item', card });
      }
    }
    return items;
  }, [sections]);

  const getItemType = useCallback(
    (item: NotificationListItem) => item.type,
    []
  );

  const keyExtractor = useCallback(
    (item: NotificationListItem) =>
      item.type === 'header' ? `header-${item.sectionTitle}` : item.card.id,
    []
  );
  const hasUnread = React.useMemo(() => notifications.some((item) => !item.read), [notifications]);

  const filterCounts = React.useMemo(() => {
    const counts: Record<NotificationFilter, number> = { all: 0, unread: 0, order: 0, new_item: 0, review: 0, price: 0, auction: 0 };
    for (const n of notifications) {
      counts.all++;
      if (!n.read) counts.unread++;
      if (n.type === 'order') counts.order++;
      else if (n.type === 'new_item') counts.new_item++;
      else if (n.type === 'review') counts.review++;
      else if (n.type === 'price') counts.price++;
      else if (n.type === 'auction') counts.auction++;
    }
    return counts;
  }, [notifications]);

  const handleSwipeMarkRead = React.useCallback(
    async (notification: NotificationCard) => {
      if (notification.read) return;
      const previousRead = notification.read;
      setNotifications((prev) =>
        prev.map((item) => (item.id === notification.id ? { ...item, read: true } : item))
      );
      try {
        await markNotificationRead(notification.id);
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

  const renderSwipeRightAction = React.useCallback(
    (notification: NotificationCard, progress: Animated.AnimatedInterpolation<number>) => {
      if (notification.read) return <View style={{ width: 0, height: Space.xxl + Space.xl }} />;
      // Subtle scale-up of the action icon as the swipe reveals it (0.8 → 1.0).
      // Collapsed to no scale when reduced motion is enabled.
      const iconScale = reducedMotion
        ? 1
        : progress.interpolate({
            inputRange: [0, 1],
            outputRange: [0.8, 1.0],
            extrapolate: 'clamp',
          });
      return (
        <View style={styles.swipeActionContainer}>
          <View style={styles.swipeReadAction}>
            <Animated.View style={{ transform: [{ scale: iconScale }] }}>
              <Ionicons name="checkmark-circle-outline" size={22} color={colors.success} />
            </Animated.View>
            <Text style={styles.swipeReadText}>Read</Text>
          </View>
        </View>
      );
    },
    [colors.success, reducedMotion]
  );

  const renderSwipeLeftAction = React.useCallback(
    (progress: Animated.AnimatedInterpolation<number>) => {
      // Subtle scale-up of the action icon as the swipe reveals it (0.8 → 1.0).
      // Collapsed to no scale when reduced motion is enabled.
      const iconScale = reducedMotion
        ? 1
        : progress.interpolate({
            inputRange: [0, 1],
            outputRange: [0.8, 1.0],
            extrapolate: 'clamp',
          });
      return (
        <View style={styles.swipeActionContainer}>
          <View style={styles.swipeDeleteAction}>
            <Animated.View style={{ transform: [{ scale: iconScale }] }}>
              <Ionicons name="trash-outline" size={20} color={colors.danger} />
            </Animated.View>
            <Text style={styles.swipeDeleteText}>Clear</Text>
          </View>
        </View>
      );
    },
    [colors.danger, reducedMotion]
  );

  const handleSwipeDismiss = React.useCallback(
    (notification: NotificationCard) => {
      const previousNotifications = notifications;
      setNotifications((previous) => previous.filter((item) => item.id !== notification.id));
      haptics.tap();
      void deleteNotificationEvent(notification.id).catch(() => {
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
      show('Marked all notifications as read', 'success');
    } catch {
      setNotifications(previousNotifications);
      show('Failed to mark all as read', 'error');
    }
  }, [hasUnread, notifications, show]);

  const handleOpenNotification = React.useCallback(
    async (notification: NotificationCard) => {
      if (!notification.read) {
        const previousRead = notification.read;
        setNotifications((previous) =>
          previous.map((item) => (item.id === notification.id ? { ...item, read: true } : item))
        );
        try {
          await markNotificationRead(notification.id);
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
    [navigation, show]
  );

  const renderNotificationRow = useCallback(
    (item: NotificationCard) => {
      const v2Event = item.v2Event;
      const inAttention = item.requiresAction;
      const onPress = () => handleOpenNotification(item);

      switch (v2Event.semanticRole) {
        case 'social':
          return (
            <SocialNotificationRow
              event={v2Event}
              time={item.time}
              aggregatedCount={item.aggregatedCount}
              aggregatedActors={item.aggregatedActors}
              inAttentionSection={inAttention}
              onPress={onPress}
              onActorPress={
                item.actorUserId
                  ? () => openProfile(navigation, item.actorUserId!, currentUser?.id)
                  : undefined
              }
            />
          );
        case 'commerce':
          return (
            <CommerceNotificationRow
              event={v2Event}
              time={item.time}
              aggregatedCount={item.aggregatedCount}
              inAttentionSection={inAttention}
              onPress={onPress}
            />
          );
        case 'auction':
          return (
            <AuctionNotificationRow
              event={v2Event}
              time={item.time}
              aggregatedCount={item.aggregatedCount}
              inAttentionSection={inAttention}
              onPress={onPress}
              onAction={onPress}
            />
          );
        case 'financial':
          return (
            <FinancialNotificationRow
              event={v2Event}
              time={item.time}
              aggregatedCount={item.aggregatedCount}
              inAttentionSection={inAttention}
              onPress={onPress}
            />
          );
        case 'system':
        default:
          return (
            <SystemNotificationRow
              event={v2Event}
              time={item.time}
              aggregatedCount={item.aggregatedCount}
              inAttentionSection={inAttention}
              onPress={onPress}
              onAction={onPress}
            />
          );
      }
    },
    [handleOpenNotification, navigation, currentUser?.id]
  );

  const renderNotificationCard = useCallback(({ item }: { item: NotificationCard; index: number }) => {
    return (
      <Swipeable
        ref={(ref) => { swipeableRefs.current[item.id] = ref; }}
        renderRightActions={(progress) => renderSwipeRightAction(item, progress)}
        renderLeftActions={(progress) => renderSwipeLeftAction(progress)}
        onSwipeableRightOpen={() => {
          void handleSwipeMarkRead(item);
          swipeableRefs.current[item.id]?.close();
        }}
        onSwipeableLeftOpen={() => {
          handleSwipeDismiss(item);
          swipeableRefs.current[item.id]?.close();
        }}
        rightThreshold={80}
        leftThreshold={80}
        overshootRight={false}
        overshootLeft={false}
      >
        {renderNotificationRow(item)}
      </Swipeable>
    );
  }, [
    swipeableRefs,
    renderSwipeRightAction,
    renderSwipeLeftAction,
    handleSwipeMarkRead,
    handleSwipeDismiss,
    renderNotificationRow,
  ]);

  const renderSectionHeader = useCallback(
    (item: {
      sectionTitle: string;
      unreadCount: number;
      isAttention: boolean;
      itemCount: number;
    }) => {
      const { sectionTitle, unreadCount, isAttention, itemCount } = item;
      return (
        <View style={[styles.sectionHeaderRow, isAttention && styles.sectionHeaderRowAttention]}>
          {isAttention ? (
            <View style={styles.sectionAttentionLeading}>
              <Ionicons name="alert-circle" size={13} color={colors.danger} />
              <Text style={[styles.sectionTitle, styles.sectionTitleAttention]}>{sectionTitle}</Text>
            </View>
          ) : (
            <Text style={styles.sectionTitle}>{sectionTitle}</Text>
          )}
          {isAttention && itemCount > 0 ? (
            <Text style={styles.sectionAttentionHint}>
              {itemCount} {itemCount === 1 ? 'item' : 'items'} need{itemCount === 1 ? 's' : ''} your response
            </Text>
          ) : null}
          {unreadCount > 0 ? (
            <View style={[styles.sectionCountBadge, isAttention && styles.sectionCountBadgeAttention]}>
              <Text style={[styles.sectionCountText, isAttention && styles.sectionCountTextAttention]}>{unreadCount}</Text>
            </View>
          ) : null}
        </View>
      );
    },
    [styles, colors.danger]
  );

  const renderListItem = useCallback<ListRenderItem<NotificationListItem>>(
    ({ item }) => {
      if (item.type === 'header') {
        return renderSectionHeader(item);
      }
      return renderNotificationCard({ item: item.card, index: 0 });
    },
    [renderSectionHeader, renderNotificationCard]
  );

  return (
    <FlagshipScreen
      header={
        <FlagshipHeader
          title="Notifications"
          onBack={() => navigation.goBack()}
          rightAction={
            <View style={styles.headerActions}>
              <AnimatedPressable
                style={styles.headerAction}
                onPress={() => { haptics.tap(); setOverflowVisible(true); }}
                accessibilityLabel="Filter notifications"
                accessibilityRole="button"
                hapticFeedback="light"
              >
                <Ionicons
                  name={activeFilter !== 'all' ? 'filter' : 'filter-outline'}
                  size={20}
                  color={activeFilter !== 'all' ? colors.brand : colors.textSecondary}
                />
              </AnimatedPressable>
              <AnimatedPressable
                style={styles.headerAction}
                onPress={() => navigation.navigate('NotificationPreferences')}
                accessibilityLabel="Manage notification preferences"
                accessibilityRole="button"
                hapticFeedback="light"
              >
                <Ionicons name="settings-outline" size={20} color={colors.textSecondary} />
              </AnimatedPressable>
              {unreadCount > 0 ? (
                <AnimatedPressable
                  style={styles.headerAction}
                  onPress={handleMarkAllAsRead}
                  accessibilityRole="button"
                  accessibilityLabel={`Mark all ${unreadCount} notifications as read`}
                  hapticFeedback="light"
                >
                  <Ionicons name="checkmark-done-outline" size={22} color={colors.textPrimary} />
                </AnimatedPressable>
              ) : null}
            </View>
          }
        />
      }
      scrollEnabled={false}
      contentStyle={{ paddingHorizontal: 0, paddingTop: 0 }}
    >

      {/* Primary filter tabs — pill-style, always visible */}
      <View
        style={styles.filterTabRow}
        accessibilityRole="tablist"
        accessibilityLabel="Notification filters"
      >
        {PRIMARY_FILTERS.map((filter) => {
          const isActive = activeFilter === filter.key;
          const count = filterCounts[filter.key] ?? 0;
          return (
            <AnimatedPressable
              key={filter.key}
              style={[
                styles.filterTab,
                isActive && styles.filterTabActive,
              ]}
              onPress={() => { haptics.tap(); setActiveFilter(filter.key); }}
              activeOpacity={0.7}
              scaleValue={0.96}
              hapticFeedback="light"
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={`${filter.label} filter${count > 0 ? `, ${count} items` : ''}`}
            >
              <Text
                style={[
                  styles.filterTabText,
                  isActive && styles.filterTabTextActive,
                ]}
                numberOfLines={1}
              >
                {filter.label}
              </Text>
              {count > 0 ? (
                <Text style={[styles.filterTabCount, isActive && styles.filterTabCountActive]}>
                  {count > 99 ? '99+' : count}
                </Text>
              ) : null}
            </AnimatedPressable>
          );
        })}
      </View>

      {/* Unread summary + quiet hours indicator */}
      {unreadCount > 0 || quietActive ? (
        <View style={styles.summaryBannerRow}>
          {unreadCount > 0 ? (
            <View style={styles.unreadSummaryBadge}>
              <Text style={styles.unreadSummaryText}>
                {unreadCount > 99 ? '99+' : unreadCount} unread {unreadCount === 1 ? 'notification' : 'notifications'}
              </Text>
            </View>
          ) : null}
          {quietActive ? (
            <Pressable
              style={styles.quietHoursBadge}
              onPress={() => navigation.navigate('PushNotifications')}
              accessibilityRole="button"
              accessibilityLabel="Quiet hours active. Tap to manage."
            >
              <Ionicons name="moon" size={12} color={colors.textMuted} />
              <Text style={styles.quietHoursText}>Quiet hours on</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {isOffline ? (
        <OfflineBanner onRetry={() => void handleRefresh()} />
      ) : null}

      {/* Sync error banner — visible when refresh fails but cached notifications exist */}
      {hasSyncError && notifications.length > 0 ? (
        <View style={{ paddingHorizontal: Space.md, marginBottom: Space.sm }}>
          <SyncRetryBanner
            message="Couldn't refresh notifications. Showing cached items."
            onRetry={() => void syncNotifications()}
            isRetrying={isLoading}
            telemetryContext="notifications_sync"
          />
        </View>
      ) : null}

      <FlashList
        data={flattenedData}
        keyExtractor={keyExtractor}
        getItemType={getItemType}
        renderItem={renderListItem}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={colors.brand}
            colors={[colors.brand]}
          />
        }
        onEndReached={loadMore}
        onEndReachedThreshold={0.3}
        // Performance: notification lists can grow long; cap the render
        // batch to keep scroll at 58+ fps. FlashList recycles cells by
        // type via getItemType (header vs item) for efficient pooling.
        //
        // FlashList v2 (2.0.2) does not expose the v1 props
        // `windowSize` / `maxToRenderPerBatch`. The v2-native equivalents:
        //   - drawDistance controls how far beyond the viewport items are
        //     rendered — the v2 counterpart of `windowSize`. 2000dp gives
        //     a generous buffer (~2.5 screens each side) for smooth scroll.
        //   - overrideProps.initialDrawBatchSize caps the first render
        //     batch — the v2 counterpart of `maxToRenderPerBatch`.
        drawDistance={2000}
        overrideProps={{ initialDrawBatchSize: 6 }}
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.notificationSkeletonList} accessibilityLabel="Loading notifications">
              {[0, 1, 2, 3, 4].map((index) => (
                <View key={index} style={styles.notificationSkeletonRow}>
                  <SkeletonLoader width={52} height={52} borderRadius={Radius.md} />
                  <View style={styles.notificationSkeletonCopy}>
                    <SkeletonLoader width={index % 2 === 0 ? '58%' : '44%'} height={13} borderRadius={Radius.sm} />
                    <SkeletonLoader width={index % 2 === 0 ? '88%' : '76%'} height={11} borderRadius={Radius.sm} style={{ marginTop: Space.sm }} />
                    <SkeletonLoader width="30%" height={9} borderRadius={Radius.sm} style={{ marginTop: Space.sm }} />
                  </View>
                </View>
              ))}
            </View>
          ) : hasSyncError && notifications.length === 0 ? (
            <EmptyState
              density="compact"
              icon="cloud-offline-outline"
              title="Couldn't load notifications"
              subtitle="Pull down to refresh and try again."
              iconColor={colors.textMuted}
              ctaLabel="Retry"
              onCtaPress={() => void syncNotifications()}
            />
          ) : activeFilter !== 'all' && notifications.length > 0 ? (
            <EmptyState
              density="compact"
              icon="notifications-outline"
              title={`No ${filterLabelForKey(activeFilter).toLowerCase()} yet`}
              subtitle="Switch to 'All' to see everything."
              iconColor={colors.textMuted}
            />
          ) : (
            <EmptyState
              density="compact"
              graphic={
                <View style={styles.caughtUpGraphic}>
                  <View style={styles.caughtUpRing} />
                  <Ionicons name="checkmark" size={30} color={colors.brand} style={styles.caughtUpCheck} />
                </View>
              }
              title="You're all caught up"
              subtitle="Nothing needs your attention right now."
              hint="Explore new arrivals while you're here."
              ctaLabel="Discover listings"
              onCtaPress={() => navigation.navigate('MainTabs')}
              iconColor={colors.brand}
            />
          )
        }
        ListFooterComponent={
          isLoadingMore ? (
            <View accessibilityLabel="Loading more notifications">
              {[0, 1].map((index) => (
                <View key={index} style={styles.notificationSkeletonRow}>
                  <SkeletonLoader width={52} height={52} borderRadius={Radius.md} />
                  <View style={styles.notificationSkeletonCopy}>
                    <SkeletonLoader width={index % 2 === 0 ? '58%' : '44%'} height={13} borderRadius={Radius.sm} />
                    <SkeletonLoader width={index % 2 === 0 ? '88%' : '76%'} height={11} borderRadius={Radius.sm} style={{ marginTop: Space.sm }} />
                    <SkeletonLoader width="30%" height={9} borderRadius={Radius.sm} style={{ marginTop: Space.sm }} />
                  </View>
                </View>
              ))}
            </View>
          ) : null
        }
      />

      {/* Filter sheet — all filters behind a single overflow funnel icon */}
      <BottomSheet
        visible={overflowVisible}
        onDismiss={() => setOverflowVisible(false)}
        snapPoint={0.5}
      >
        <View style={styles.overflowSheetContent}>
          <Text style={styles.overflowSheetTitle}>Filter notifications</Text>
          {OVERFLOW_FILTERS.map((filter) => {
            const isActive = activeFilter === filter.key;
            const count = filterCounts[filter.key] ?? 0;
            return (
              <AnimatedPressable
                key={filter.key}
                style={[
                  styles.overflowRow,
                  isActive && { backgroundColor: `${colors.brand}0A` },
                ]}
                onPress={() => {
                  haptics.tap();
                  setActiveFilter(filter.key);
                  setOverflowVisible(false);
                }}
                activeOpacity={0.7}
                scaleValue={0.96}
                hapticFeedback="light"
                accessibilityRole="button"
                accessibilityLabel={`Filter: ${filter.label}${count > 0 ? `, ${count} items` : ''}`}
                accessibilityState={{ selected: isActive }}
              >
                <Text
                  style={[
                    styles.overflowRowText,
                    { color: isActive ? colors.brand : colors.textPrimary },
                    isActive && { fontFamily: Typography.family.semibold },
                  ]}
                >
                  {filter.label}
                </Text>
                <View style={styles.overflowRowRight}>
                  {count > 0 ? (
                    <Text style={[styles.overflowRowCount, { color: colors.textMuted }]}>
                      {count}
                    </Text>
                  ) : null}
                  {isActive ? (
                    <Ionicons name="checkmark" size={18} color={colors.brand} />
                  ) : null}
                </View>
              </AnimatedPressable>
            );
          })}
        </View>
      </BottomSheet>
    </FlagshipScreen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerAction: {
    width: Control.hit,
    height: Control.hit,
    alignItems: 'center',
    justifyContent: 'center',
  },

  filterTabRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
    paddingHorizontal: Space.md,
    paddingTop: Space.sm + 2,
    paddingBottom: Space.xs,
  },
  filterTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 1,
    paddingVertical: Space.xs + 2,
    paddingHorizontal: Space.sm + 4,
    borderRadius: Radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
  },
  filterTabActive: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
  },
  filterTabText: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    color: colors.textMuted,
    letterSpacing: Type.caption.letterSpacing,
  },
  filterTabTextActive: {
    fontFamily: Typography.family.semibold,
    color: colors.textPrimary,
  },
  filterTabCount: {
    fontSize: Type.meta.size - 1,
    fontFamily: Typography.family.medium,
    color: colors.textMuted,
    fontVariant: ['tabular-nums'],
  },
  filterTabCountActive: {
    color: colors.brand,
  },

  swipeActionContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    width: Space.xxl + Space.xl,
    marginBottom: Space.sm + 2,
  },
  swipeReadAction: {
    flex: 1,
    width: Space.xxl + Space.xl,
    borderRadius: Radius.xxl,
    backgroundColor: `${colors.success}20`,
    borderWidth: Stroke.standard,
    borderColor: `${colors.success}40`,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.xs,
  },
  swipeReadText: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.semibold,
    color: colors.success,
  },
  swipeDeleteAction: {
    alignItems: 'center',
    justifyContent: 'center',
    width: Space.xxl + Space.xxl + Space.xs,
    height: '100%',
    gap: Space.xs,
  },
  swipeDeleteText: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.semibold,
    color: colors.danger,
  },

  listContent: { paddingHorizontal: Space.md, paddingTop: Space.sm, paddingBottom: Space.xxl + Space.xxl + Space.lg },

  summaryBannerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    paddingTop: Space.sm + 2,
    paddingBottom: Space.xs,
  },
  unreadSummaryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 1,
    minHeight: Control.chromeCompact,
  },
  unreadSummaryDot: {
    width: Space.xs + 2,
    height: Space.xs + 2,
    borderRadius: Radius.full,
    backgroundColor: colors.brand,
  },
  unreadSummaryText: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
    color: colors.brand,
  },
  quietHoursBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 1,
    paddingHorizontal: Space.sm + 2,
    paddingVertical: Space.xs + 1,
    borderRadius: Radius.full,
    backgroundColor: colors.surfaceAlt,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  quietHoursText: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
    color: colors.textMuted,
  },

  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 1,
    marginTop: Space.md + 4,
    marginBottom: Space.sm,
    marginLeft: Space.xs,
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs,
    borderRadius: Radius.sm,
  },
  sectionHeaderRowAttention: {
    backgroundColor: colors.dangerSubtle,
    paddingHorizontal: Space.sm + 2,
    paddingVertical: Space.xs + 2,
    marginLeft: 0,
  },
  sectionAttentionLeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  sectionAttentionHint: {
    flex: 1,
    fontSize: Type.meta.size,
    fontFamily: Typography.family.regular,
    color: colors.textMuted,
    marginLeft: Space.xs,
  },
  sectionTitle: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
    color: colors.textMuted,
    letterSpacing: Type.caption.letterSpacing,
    textTransform: 'uppercase',
  },
  sectionTitleAttention: {
    color: colors.danger,
    fontSize: Type.caption.size,
    textTransform: 'none',
    fontFamily: Typography.family.bold,
  },
  sectionCountBadge: {
    minWidth: Space.md + 4,
    height: Space.md + 4,
    borderRadius: Radius.full,
    paddingHorizontal: Space.xs + 2,
    borderWidth: Stroke.standard,
    borderColor: colors.border,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionCountBadgeAttention: {
    backgroundColor: colors.danger,
    borderColor: 'transparent',
  },
  sectionCountText: {
    fontSize: Type.meta.size - 2,
    fontFamily: Typography.family.bold,
    color: colors.textMuted,
    fontVariant: ['tabular-nums'],
  },
  sectionCountTextAttention: {
    color: colors.textInverse,
  },

  // Crafted "all caught up" graphic — a ring with a checkmark, authored
  // rather than a generic outline icon in a grey circle.
  caughtUpGraphic: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Space.sm,
  },
  caughtUpRing: {
    position: 'absolute',
    width: 64,
    height: 64,
    borderRadius: Radius.full,
    borderWidth: Stroke.emphasis,
    borderColor: colors.brand,
    opacity: 0.5,
  },
  caughtUpCheck: {
    marginTop: 2,
  },

  notificationSkeletonList: {
    paddingTop: Space.sm,
  },
  notificationSkeletonRow: {
    minHeight: Space.xxl + Space.xl + Space.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm + 2,
    paddingVertical: Space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  notificationSkeletonCopy: {
    flex: 1,
  },
  overflowSheetContent: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
  },
  overflowSheetTitle: {
    fontSize: Type.title.size,
    fontFamily: Typography.family.bold,
    color: colors.textPrimary,
    marginBottom: Space.sm,
  },
  overflowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  overflowRowText: {
    fontSize: Type.body.size,
    color: colors.textPrimary,
  },
  overflowRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  overflowRowCount: {
    fontSize: Type.meta.size,
    color: colors.textMuted,
    marginRight: Space.sm,
  },
  });
}
