import React, { useMemo, useCallback } from 'react';
import {
  View,
  Text,
  SectionList,
  StyleSheet,
  RefreshControl,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Swipeable } from 'react-native-gesture-handler';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { openProfile } from '../navigation/openProfile';
import { EmptyState } from '../components/EmptyState';
import { OfflineBanner } from '../components/OfflineBanner';
import { SkeletonLoader } from '../components/SkeletonLoader';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { CachedImage } from '../components/CachedImage';
import { AvatarRing } from '../components/chat/AvatarRing';
import { SharedTransitionView } from '../components/SharedTransitionView';
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
  upgradeToV2,
} from '../services/notificationsApi';
import { resolveNotificationRoute } from '../utils/notificationRouting';
import { haptics } from '../utils/haptics';
import { useConnectivity } from '../hooks/useConnectivity';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { useSettingsPreferences } from '../context/SettingsPreferencesContext';
import { isQuietHoursActive } from '../preferences/settingsPreferences';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';

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
};

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

function filterLabelForKey(key: NotificationFilter): string {
  return OVERFLOW_FILTERS.find((f) => f.key === key)?.label ?? 'All';
}

function getPayloadString(payload: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const candidate = payload[key];
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate;
    }
  }

  return null;
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
    return 'Just now';
  }

  const diffMs = Date.now() - parsed.getTime();
  const minutes = Math.max(0, Math.floor(diffMs / 60_000));
  if (minutes < 1) {
    return 'Just now';
  }

  if (minutes < 60) {
    return `${minutes} min ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.floor(hours / 24);
  if (days < 7) {
    return `${days} day${days === 1 ? '' : 's'} ago`;
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
  const hasShownSyncErrorRef = React.useRef(false);
  const [activeFilter, setActiveFilter] = React.useState<NotificationFilter>('all');
  const [overflowVisible, setOverflowVisible] = React.useState(false);
  const swipeableRefs = React.useRef<Record<string, Swipeable | null>>({});

  const quietActive = isQuietHoursActive(quietHours);
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
        hasShownSyncErrorRef.current = false;
      } catch {
        hasShownSyncErrorRef.current = true;
      } finally {
        if (!options?.silent) {
          setIsLoading(false);
        }
      }
    },
    [show]
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
    setIsRefreshing(true);
    try {
      const { items, nextCursor } = await listNotificationEvents({ limit: 30 });
      setNotifications(items.map(mapEventToCard));
      setCursor(nextCursor);
      setHasMore(!!nextCursor);
      hasShownSyncErrorRef.current = false;
    } catch {
      hasShownSyncErrorRef.current = true;
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
    (notification: NotificationCard) => {
      if (notification.read) return <View style={{ width: 0, height: Space.xxl + Space.xl }} />;
      return (
        <View style={styles.swipeActionContainer}>
          <View style={styles.swipeReadAction}>
            <Ionicons name="checkmark-circle-outline" size={22} color={colors.success} />
            <Text style={styles.swipeReadText}>Read</Text>
          </View>
        </View>
      );
    },
    []
  );

  const renderSwipeLeftAction = React.useCallback(
    () => (
      <View style={styles.swipeActionContainer}>
        <View style={styles.swipeDeleteAction}>
          <Ionicons name="trash-outline" size={20} color={colors.danger} />
          <Text style={styles.swipeDeleteText}>Clear</Text>
        </View>
      </View>
    ),
    []
  );

  const handleSwipeDismiss = React.useCallback(
    (notification: NotificationCard) => {
      setNotifications((previous) => previous.filter((item) => item.id !== notification.id));
      haptics.tap();
    },
    []
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

  const renderNotificationCard = useCallback(({ item }: { item: NotificationCard; index: number }) => {
    const listingId = typeof item.payload.listingId === 'string' ? item.payload.listingId : undefined;
    const actorUserId = item.actorUserId ?? getPayloadString(item.payload, ['sellerId', 'actorUserId', 'fromUserId', 'counterpartyUserId']);
    const actorHandle = item.actorUsername ?? actorUserId ?? null;
    const visualUri = item.itemImage || item.actorAvatar || '';

    return (
        <Swipeable
          ref={(ref) => { swipeableRefs.current[item.id] = ref; }}
          renderRightActions={() => renderSwipeRightAction(item)}
          renderLeftActions={() => renderSwipeLeftAction()}
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
        <View
          style={[
            styles.notifCard,
            !item.read && styles.notifCardUnread,
            item.attention === 'critical' && styles.notifCardCritical,
            item.attention === 'action' && !item.read && styles.notifCardAction,
          ]}
        >
          {item.attention === 'critical' ? <View style={styles.notifAccentCritical} /> : null}
          {item.attention === 'action' && !item.read ? <View style={styles.notifAccentAction} /> : null}
          {!item.read && item.attention !== 'critical' && item.attention !== 'action' ? <View style={styles.unreadDot} /> : null}
          <AnimatedPressable
            style={styles.notifMainTap}
            activeOpacity={0.8}
            onPress={() => handleOpenNotification(item)}
            accessibilityRole="button"
            accessibilityLabel={`${item.read ? '' : 'Unread: '}${item.text}, ${item.time}`}
          >
            <View style={styles.notifImageWrap}>
              <SharedTransitionView
                style={styles.notifImageShared}
                sharedTransitionTag={listingId ? `image-${listingId}-0` : undefined}
              >
                <CachedImage
                  uri={visualUri}
                  style={styles.notifImage}
                  contentFit="cover"
                  emptyIcon="notifications-outline"
                  emptyLabel={item.title || 'Notification'}
                />
              </SharedTransitionView>
            </View>

            <View style={styles.notifBody}>
              {item.title ? (
                <Text style={[styles.notifTitle, !item.read && styles.notifTitleUnread]} numberOfLines={1}>
                  {item.title}
                </Text>
              ) : null}
              <Text style={[styles.notifText, !item.read && styles.notifTextUnread]} numberOfLines={item.title ? 2 : 3}>
                {item.body || item.text}
              </Text>
              <View style={styles.notifMetaRow}>
                {item.aggregatedCount && item.aggregatedCount > 1 ? (
                  <View style={styles.notifAggregatedRow}>
                    {item.actorAvatar ? (
                      <CachedImage
                        uri={item.actorAvatar}
                        style={styles.notifAggregatedAvatar}
                        contentFit="cover"
                      />
                    ) : (
                      <View style={styles.notifAggregatedAvatarFallback}>
                        <Ionicons name="person" size={10} color={colors.textSecondary} />
                      </View>
                    )}
                    <View style={styles.notifAggregatedCountBadge}>
                      <Text style={styles.notifAggregatedCountText}>
                        +{item.aggregatedCount - 1}
                      </Text>
                    </View>
                  </View>
                ) : null}
                <Text style={styles.notifTime}>{item.time}</Text>
              </View>
            </View>
          </AnimatedPressable>

          {actorUserId && actorHandle ? (
            <View style={styles.notifActionRow}>
              <AnimatedPressable
                style={styles.notifActorChip}
                onPress={() => openProfile(navigation, actorUserId, currentUser?.id)}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={`Open @${actorHandle} profile`}
                accessibilityHint="Shows sender profile details"
              >
                <AvatarRing
                  uri={item.actorAvatar ?? undefined}
                  size={28}
                  isUnread={!item.read}
                />
                <Text style={styles.notifActorText} numberOfLines={1}>@{actorHandle}</Text>
              </AnimatedPressable>

              <AnimatedPressable
                style={styles.notifMessageBtn}
                onPress={() =>
                  navigation.navigate('Chat', {
                    conversationId: listingId ? `${actorUserId}_${listingId}` : `profile_${actorUserId}`,
                    focusQuery: actorHandle,
                    partnerUserId: actorUserId,
                    itemId: listingId,
                  })}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={`Message @${actorHandle}`}
                accessibilityHint="Opens chat with this user"
              >
                <Ionicons name="chatbubble-outline" size={18} color={colors.textPrimary} />
              </AnimatedPressable>
            </View>
          ) : null}
        </View>
        </Swipeable>
    );
  }, [
    swipeableRefs,
    renderSwipeRightAction,
    renderSwipeLeftAction,
    handleSwipeMarkRead,
    handleSwipeDismiss,
    handleOpenNotification,
    navigation,
    colors,
    styles,
  ]);

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

      {/* Active filter chip — shown only when a filter is applied (attention-first hierarchy) */}
      {activeFilter !== 'all' ? (
        <View style={styles.activeFilterChipRow}>
          <Pressable
            style={styles.activeFilterChip}
            onPress={() => { haptics.tap(); setActiveFilter('all'); }}
            accessibilityRole="button"
            accessibilityLabel={`Clear filter: ${filterLabelForKey(activeFilter)}`}
          >
            <Text style={styles.activeFilterChipText} numberOfLines={1}>
              {filterLabelForKey(activeFilter)}
            </Text>
            <Ionicons name="close-circle" size={14} color={colors.textMuted} />
          </Pressable>
        </View>
      ) : null}

      {/* Unread summary + quiet hours indicator */}
      {unreadCount > 0 || quietActive ? (
        <View style={styles.summaryBannerRow}>
          {unreadCount > 0 ? (
            <View style={styles.unreadSummaryBadge}>
              <View style={styles.unreadSummaryDot} />
              <Text style={styles.unreadSummaryText}>
                {unreadCount} unread {unreadCount === 1 ? 'notification' : 'notifications'}
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

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        stickySectionHeadersEnabled={false}
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
        renderSectionHeader={({ section: { title, unreadCount, isAttention } }) => (
          <View style={styles.sectionHeaderRow}>
            {isAttention ? (
              <Ionicons name="alert-circle" size={14} color={colors.danger} style={styles.sectionAttentionIcon} />
            ) : null}
            <Text style={[styles.sectionTitle, isAttention && styles.sectionTitleAttention]}>{title}</Text>
            {unreadCount > 0 ? (
              <View style={[styles.sectionCountBadge, isAttention && styles.sectionCountBadgeAttention]}>
                <Text style={styles.sectionCountText}>{unreadCount}</Text>
              </View>
            ) : null}
          </View>
        )}
        // Performance: notification lists can grow long; clip off-screen
        // items and cap the render batch to keep scroll at 58+ fps.
        removeClippedSubviews
        windowSize={7}
        maxToRenderPerBatch={6}
        initialNumToRender={8}
        renderItem={renderNotificationCard}
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
          ) : hasShownSyncErrorRef.current && notifications.length === 0 ? (
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
              icon="checkmark-done-outline"
              title="You're all caught up"
              subtitle="We'll let you know when there's something new."
              iconColor={colors.textMuted}
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
              <Pressable
                key={filter.key}
                style={({ pressed }) => [
                  styles.overflowRow,
                  isActive && { backgroundColor: `${colors.brand}0A` },
                  pressed && { opacity: 0.6 },
                ]}
                onPress={() => {
                  haptics.tap();
                  setActiveFilter(filter.key);
                  setOverflowVisible(false);
                }}
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
              </Pressable>
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

  filterTabsRow: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  filterTabsContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.md,
    gap: Space.lg,
  },
  filterTab: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: Control.hit + 2,
    position: 'relative',
  },
  filterTabActive: {
    backgroundColor: 'transparent',
  },
  filterTabContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 1,
  },
  filterTabText: {
    fontSize: Type.captionElevated.size,
    lineHeight: Type.captionElevated.lineHeight,
    fontFamily: Typography.family.medium,
    color: colors.textMuted,
  },
  filterTabCount: {
    minWidth: Space.md + 2,
    height: Space.md + 2,
    borderRadius: Radius.full,
    paddingHorizontal: Space.xs + 1,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  filterTabCountActive: {
    backgroundColor: `${colors.brand}20`,
    borderColor: `${colors.brand}40`,
  },
  filterTabCountText: {
    fontSize: Type.meta.size - 2,
    fontFamily: Typography.family.semibold,
    color: colors.textMuted,
  },
  filterTabCountTextActive: {
    color: colors.brand,
  },
  filterTabTextActive: {
    color: colors.textPrimary,
    fontFamily: Typography.family.semibold,
  },
  filterTabIndicator: {
    position: 'absolute',
    bottom: -StyleSheet.hairlineWidth,
    left: 0,
    right: 0,
    height: Stroke.emphasis,
    borderRadius: Radius.sm,
    backgroundColor: colors.brand,
  },

  activeFilterChipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.md,
    paddingTop: Space.sm + 2,
    paddingBottom: Space.xs,
  },
  activeFilterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    paddingVertical: Space.xs + 1,
    paddingHorizontal: Space.sm + 2,
    borderRadius: Radius.full,
    backgroundColor: colors.surfaceAlt,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  activeFilterChipText: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
    color: colors.textPrimary,
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
  },
  sectionAttentionIcon: {
    marginRight: -Space.xs / 2,
  },
  sectionTitle: {
    fontSize: Type.captionElevated.size,
    fontFamily: Typography.family.semibold,
    color: colors.textMuted,
    letterSpacing: Type.captionElevated.letterSpacing,
  },
  sectionTitleAttention: {
    color: colors.danger,
  },
  sectionCountBadge: {
    minWidth: Space.md + 4,
    height: Space.md + 4,
    borderRadius: Radius.full,
    paddingHorizontal: Space.xs + 2,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionCountBadgeAttention: {
    backgroundColor: colors.danger,
  },
  sectionCountText: {
    fontSize: Type.meta.size - 2,
    fontFamily: Typography.family.bold,
    color: colors.background,
  },

  notifCard: {
    backgroundColor: colors.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  notifCardUnread: {
    backgroundColor: colors.surfaceAlt,
  },
  notifCardCritical: {
    backgroundColor: `${colors.danger}0A`,
  },
  notifCardAction: {
    backgroundColor: colors.surfaceAlt,
  },
  notifAccentCritical: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: Stroke.emphasis,
    backgroundColor: colors.danger,
  },
  notifAccentAction: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: Stroke.emphasis,
    backgroundColor: colors.brand,
  },
  notifMainTap: {
    padding: Space.md,
    flexDirection: 'row',
    gap: Space.sm + 2,
    alignItems: 'center',
  },

  unreadDot: {
    position: 'absolute',
    top: Control.iconCompact,
    left: Space.sm,
    width: Space.sm,
    height: Space.sm,
    borderRadius: Radius.full,
    backgroundColor: colors.brand,
  },

  notifImageWrap: {
    width: Space.xxl + Space.xs, height: Space.xxl + Space.xs, borderRadius: Radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.surfaceAlt,
    borderWidth: Stroke.standard,
    borderColor: colors.border,
  },
  notifImageShared: {
    ...StyleSheet.absoluteFill,
  },
  notifImage: { width: '100%', height: '100%' },

  notifBody: { flex: 1 },
  notifTitle: {
    color: colors.textSecondary,
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
    lineHeight: Type.body.lineHeight,
    marginBottom: Space.xs / 2,
  },
  notifTitleUnread: {
    color: colors.textPrimary,
    fontFamily: Typography.family.semibold,
  },
  notifText: {
    color: colors.textSecondary, fontSize: Type.body.size, fontFamily: Typography.family.regular,
    lineHeight: Type.body.lineHeight, marginBottom: Space.sm,
  },
  notifTextUnread: { color: colors.textPrimary, fontFamily: Typography.family.medium },

  notifMetaRow: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
  notifTime: { fontSize: Type.caption.size, color: colors.textMuted, fontFamily: Typography.family.regular },
  notifAggregatedRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  notifAggregatedAvatar: {
    width: Control.iconCompact,
    height: Control.iconCompact,
    borderRadius: Radius.full,
    marginRight: -(Space.sm - Space.xs / 2),
    borderWidth: Stroke.standard + Stroke.hairline,
    borderColor: colors.surface,
  },
  notifAggregatedAvatarFallback: {
    width: Control.iconCompact,
    height: Control.iconCompact,
    borderRadius: Radius.full,
    marginRight: -(Space.sm - Space.xs / 2),
    borderWidth: Stroke.standard + Stroke.hairline,
    borderColor: colors.surface,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifAggregatedCountBadge: {
    minWidth: Space.md + 4,
    height: Space.md + 4,
    borderRadius: Radius.full,
    paddingHorizontal: Space.xs + 2,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: Stroke.standard + Stroke.hairline,
    borderColor: colors.surface,
  },
  notifAggregatedCountText: {
    fontSize: Type.meta.size - 2,
    fontFamily: Typography.family.bold,
    color: colors.background,
  },
  notifActionRow: {
    marginTop: 0,
    marginHorizontal: Space.md,
    marginBottom: Space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Space.sm,
  },
  notifActorChip: {
    flex: 1,
    minHeight: Control.hit,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
    paddingHorizontal: 0,
  },
  notifActorText: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: Type.meta.size,
    fontFamily: Typography.family.semibold,
  },
  notifMessageBtn: {
    width: Control.hit,
    height: Control.hit,
    alignItems: 'center',
    justifyContent: 'center',
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
    fontWeight: '700',
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
