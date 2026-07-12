import { Typography } from '../theme/designTokens';
import React from 'react';
import {
  View,
  Text,
  SectionList,
  StyleSheet,
  StatusBar,
  ActivityIndicator,
  RefreshControl,
  Pressable,
  ScrollView,
} from 'react-native';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Swipeable } from 'react-native-gesture-handler';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { RootStackParamList } from '../navigation/types';
import { EmptyState } from '../components/EmptyState';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { CachedImage } from '../components/CachedImage';
import { AvatarRing } from '../components/chat/AvatarRing';
import { SharedTransitionView } from '../components/SharedTransitionView';
import { useToast } from '../context/ToastContext';
import { useStore } from '../store/useStore';
import {
  NotificationEvent,
  NotificationEventType,
  listNotificationEvents,
  markNotificationRead,
  markAllNotificationsRead,
} from '../services/notificationsApi';
import { resolveNotificationRoute } from '../utils/notificationRouting';
import { haptics } from '../utils/haptics';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { Motion } from '../constants/motion';
import { Space, Radius, Type } from '../theme/designTokens';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { useSettingsPreferences } from '../context/SettingsPreferencesContext';
import { isQuietHoursActive } from '../preferences/settingsPreferences';

type NavT = StackNavigationProp<RootStackParamList>;

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
  /** Aggregated notification count — when >1, this card represents N similar events. */
  aggregatedCount?: number;
  /** Actor names for aggregated notifications (first few). */
  aggregatedActors?: string[];
};

type NotificationFilter = 'all' | 'order' | 'new_item' | 'review' | 'price' | 'auction';

const FILTER_TABS: { key: NotificationFilter; label: string; icon: string }[] = [
  { key: 'all', label: 'All', icon: 'notifications-outline' },
  { key: 'order', label: 'Orders', icon: 'cube-outline' },
  { key: 'new_item', label: 'Items', icon: 'shirt-outline' },
  { key: 'review', label: 'Reviews', icon: 'star-outline' },
  { key: 'price', label: 'Price', icon: 'pricetag-outline' },
  { key: 'auction', label: 'Auctions', icon: 'gavel-outline' },
];

function getNotifIcon(type: NotificationCardType, colors: ThemeColors): { name: string; color: string; bg: string } {
  switch (type) {
    case 'new_item':
      return { name: 'shirt-outline', color: colors.textSecondary, bg: `${colors.textSecondary}15` };
    case 'like':
      return { name: 'heart', color: colors.danger, bg: `${colors.danger}15` };
    case 'review':
      return { name: 'star', color: colors.success, bg: `${colors.success}15` };
    case 'order':
      return { name: 'cube-outline', color: colors.success, bg: `${colors.success}15` };
    case 'price':
      return { name: 'pricetag-outline', color: colors.brand, bg: `${colors.brand}15` };
    case 'resolution':
      return { name: 'headset-outline', color: colors.textSecondary, bg: `${colors.textSecondary}15` };
    case 'auction':
      return { name: 'gavel-outline', color: '#E8A93C', bg: '#E8A93C15' };
    default:
      return { name: 'notifications-outline', color: colors.textMuted, bg: colors.surfaceAlt };
  }
}

function parsePayloadEvent(payload: Record<string, unknown>): string {
  const candidate = payload.event;
  return typeof candidate === 'string' ? candidate.toLowerCase() : '';
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

function deriveCardType(event: NotificationEvent): NotificationCardType {
  const eventType = event.eventType;
  if (eventType === 'resolution_opened' || eventType === 'resolution_status_changed') return 'resolution';
  if (eventType === 'review_received') return 'review';
  if (eventType.startsWith('order_') || eventType === 'refund_completed' || eventType === 'payout_processed') return 'order';
  if (eventType.startsWith('auction_')) return 'auction';

  const payloadEvent = parsePayloadEvent(event.payload);
  const mergedText = `${event.title} ${event.body}`.toLowerCase();

  if (payloadEvent.includes('shipment') || payloadEvent.includes('order') || payloadEvent.includes('deliver')) {
    return 'order';
  }
  if (payloadEvent.includes('review') || mergedText.includes('review')) return 'review';
  if (payloadEvent.includes('price') || mergedText.includes('price')) return 'price';
  if (payloadEvent.includes('like') || mergedText.includes('like')) return 'like';
  if (mergedText.includes('listing') || mergedText.includes('new item')) return 'new_item';

  return 'generic';
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
  return {
    id: event.id,
    itemImage: event.imageUrl ?? '',
    title,
    body,
    text: `${title} ${body}`.trim(),
    time: formatRelativeTime(event.createdAt),
    type: deriveCardType(event),
    read: !!event.readAt,
    createdAt: event.createdAt,
    payload: event.payload,
    eventType: event.eventType,
    actorUserId: event.actorUserId,
    actorUsername: event.actorUsername,
    actorDisplayName: event.actorDisplayName,
    actorAvatar: event.actorAvatar,
    route: event.route,
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

    const listingId = typeof notif.payload.listingId === 'string' ? notif.payload.listingId : '';
    const groupKey = `${notif.type}:${listingId}`;

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
    // Instagram pattern: "username and N others liked your item"
    const actionVerbByType: Record<string, string> = {
      like: 'liked',
      price: 'dropped the price on',
      new_item: 'listed',
    };
    const action = actionVerbByType[primary.type] ?? 'interacted with';

    // Extract the object from the original text — try to find "your X" or "a X"
    const objectMatch = primary.text.match(/(?:your|a)\s+(.+)/i);
    const object = objectMatch ? objectMatch[1].trim() : 'your item';

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

function groupNotifications(notifications: NotificationCard[]) {
  const now = Date.now();
  const today: NotificationCard[] = [];
  const thisWeek: NotificationCard[] = [];
  const earlier: NotificationCard[] = [];

  notifications.forEach((notification) => {
    const parsed = new Date(notification.createdAt);
    if (Number.isNaN(parsed.getTime())) {
      today.push(notification);
      return;
    }

    const ageHours = Math.max(0, (now - parsed.getTime()) / 3_600_000);
    if (ageHours < 24) {
      today.push(notification);
      return;
    }

    if (ageHours < 24 * 7) {
      thisWeek.push(notification);
      return;
    }

    earlier.push(notification);
  });

  const sections: Array<{ title: string; data: NotificationCard[] }> = [];
  if (today.length > 0) {
    sections.push({ title: 'Today', data: today });
  }
  if (thisWeek.length > 0) {
    sections.push({ title: 'This Week', data: thisWeek });
  }
  if (earlier.length > 0) {
    sections.push({ title: 'Earlier', data: earlier });
  }

  return sections;
}

export default function NotificationsScreen() {
  const navigation = useNavigation<NavT>();
  const { colors, isDark } = useAppTheme();
  const { show } = useToast();
  const currentUser = useStore((state) => state.currentUser);
  const reducedMotionEnabled = useReducedMotion();
  const { quietHours } = useSettingsPreferences();
  const [notifications, setNotifications] = React.useState<NotificationCard[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [isLoadingMore, setIsLoadingMore] = React.useState(false);
  const [cursor, setCursor] = React.useState<string | null>(null);
  const [hasMore, setHasMore] = React.useState(false);
  const hasShownSyncErrorRef = React.useRef(false);
  const [activeFilter, setActiveFilter] = React.useState<NotificationFilter>('all');
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
    return notifications.filter((n) => n.type === activeFilter);
  }, [notifications, activeFilter]);

  const sections = React.useMemo(
    () => groupNotifications(aggregateNotifications(filteredNotifications)),
    [filteredNotifications]
  );
  const hasUnread = React.useMemo(() => notifications.some((item) => !item.read), [notifications]);

  const filterCounts = React.useMemo(() => {
    const counts: Record<NotificationFilter, number> = { all: 0, order: 0, new_item: 0, review: 0, price: 0, auction: 0 };
    for (const n of notifications) {
      counts.all++;
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
      if (notification.read) return <View style={{ width: 0, height: 80 }} />;
      return (
        <View style={styles.swipeActionContainer}>
          <View style={[styles.swipeReadAction, { backgroundColor: `${colors.success}20`, borderColor: `${colors.success}40` }]}>
            <Ionicons name="checkmark-circle-outline" size={22} color={colors.success} />
            <Text style={[styles.swipeReadText, { color: colors.success }]}>Read</Text>
          </View>
        </View>
      );
    },
    [colors]
  );

  const renderSwipeLeftAction = React.useCallback(
    () => (
      <View style={styles.swipeActionContainer}>
        <View style={styles.swipeDeleteAction}>
          <Ionicons name="trash-outline" size={20} color={colors.danger} />
          <Text style={[styles.swipeDeleteText, { color: colors.danger }]}>Clear</Text>
        </View>
      </View>
    ),
    [colors]
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
          (navigation as any).navigate(route.screen, params);
        } else {
          (navigation as any).navigate(route.screen);
        }
        return;
      }

      show('No linked destination for this notification yet.', 'info');
    },
    [navigation, show]
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />

      <ScreenHeader
        title="Notifications"
        onBack={() => navigation.goBack()}
        rightAction={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <AnimatedPressable
              onPress={() => navigation.navigate('PushNotifications')}
              accessibilityLabel="Manage notification preferences"
              accessibilityRole="button"
            >
              <Ionicons name="settings-outline" size={20} color={colors.textSecondary} />
            </AnimatedPressable>
            <AnimatedPressable onPress={handleMarkAllAsRead} accessibilityLabel={hasUnread ? 'Mark all notifications as read' : 'All caught up'}>
              <Ionicons name="checkmark-done-outline" size={22} color={hasUnread ? colors.textPrimary : colors.textMuted} />
            </AnimatedPressable>
          </View>
        }
      />

      {/* Filter tabs */}
      <View style={[styles.filterTabsRow, { borderBottomColor: colors.border }]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterTabsContent}
        >
          {FILTER_TABS.map((tab) => {
            const isActive = activeFilter === tab.key;
            const count = filterCounts[tab.key] ?? 0;
            return (
              <Pressable
                key={tab.key}
                style={[
                  styles.filterTab,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                  isActive && { backgroundColor: `${colors.brand}15`, borderColor: colors.brand },
                ]}
                onPress={() => {
                  haptics.tap();
                  setActiveFilter(tab.key);
                }}
                accessibilityRole="button"
                accessibilityLabel={`Filter: ${tab.label}${count > 0 ? `, ${count} items` : ''}`}
                accessibilityState={{ selected: isActive }}
              >
                <Ionicons
                  name={tab.icon as never}
                  size={13}
                  color={isActive ? colors.brand : colors.textMuted}
                />
                <Text
                  style={[styles.filterTabText, { color: colors.textMuted }, isActive && { color: colors.brand, fontFamily: Typography.family.semibold }]}
                  numberOfLines={1}
                >
                  {tab.label}
                </Text>
                {count > 0 && (
                  <View style={[styles.filterTabBadge, { backgroundColor: colors.surfaceAlt }, isActive && { backgroundColor: colors.brand }]}>
                    <Text style={[styles.filterTabBadgeText, { color: colors.textMuted }, isActive && { color: colors.background }]}>
                      {count > 99 ? '99+' : count}
                    </Text>
                  </View>
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Unread summary + quiet hours indicator */}
      {unreadCount > 0 || quietActive ? (
        <View style={styles.summaryBannerRow}>
          {unreadCount > 0 ? (
            <View style={[styles.unreadSummaryBadge, { backgroundColor: `${colors.brand}12` }]}>
              <Ionicons name="notifications" size={12} color={colors.brand} />
              <Text style={[styles.unreadSummaryText, { color: colors.brand }]}>
                {unreadCount} unread {unreadCount === 1 ? 'notification' : 'notifications'}
              </Text>
            </View>
          ) : null}
          {quietActive ? (
            <Pressable
              style={[styles.quietHoursBadge, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
              onPress={() => navigation.navigate('PushNotifications')}
              accessibilityRole="button"
              accessibilityLabel="Quiet hours active. Tap to manage."
            >
              <Ionicons name="moon" size={12} color={colors.textMuted} />
              <Text style={[styles.quietHoursText, { color: colors.textMuted }]}>Quiet hours on</Text>
            </Pressable>
          ) : null}
        </View>
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
        renderSectionHeader={({ section: { title } }) => (
          <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>{title}</Text>
        )}
        renderItem={({ item, index }) => {
          const icon = getNotifIcon(item.type, colors);
          const listingId = typeof item.payload.listingId === 'string' ? item.payload.listingId : undefined;
          const actorUserId = item.actorUserId ?? getPayloadString(item.payload, ['sellerId', 'actorUserId', 'fromUserId', 'counterpartyUserId']);
          const actorHandle = item.actorUsername ?? actorUserId ?? null;

          return (
            <Reanimated.View
              entering={
                reducedMotionEnabled
                  ? undefined
                  : FadeInDown
                      .delay(Math.min(index, Motion.list.maxStaggerItems) * Motion.list.staggerStep)
                      .duration(Motion.list.enterDuration)
              }
            >
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
              <View style={[
                styles.notifCard,
                { backgroundColor: colors.surface, borderColor: colors.border },
                !item.read && { backgroundColor: colors.surfaceAlt, borderColor: colors.border, borderLeftColor: colors.brand },
              ]}>
                <AnimatedPressable
                  style={styles.notifMainTap}
                  activeOpacity={0.8}
                  onPress={() => handleOpenNotification(item)}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.read ? '' : 'Unread: '}${item.text}, ${item.time}`}
                >
                  <View style={[styles.notifImageWrap, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
                    <SharedTransitionView
                      style={styles.notifImageShared}
                      sharedTransitionTag={listingId ? `image-${listingId}-0` : undefined}
                    >
                      <CachedImage uri={item.itemImage} style={styles.notifImage} contentFit="cover" />
                    </SharedTransitionView>
                  </View>

                  <View style={styles.notifBody}>
                    {item.title ? (
                      <Text
                        style={[styles.notifTitle, { color: colors.textSecondary }, !item.read && { color: colors.textPrimary, fontFamily: Typography.family.semibold }]}
                        numberOfLines={1}
                      >
                        {item.title}
                      </Text>
                    ) : null}
                    <Text
                      style={[styles.notifText, { color: colors.textSecondary }, !item.read && { color: colors.textPrimary, fontFamily: Typography.family.medium }]}
                      numberOfLines={item.title ? 2 : 3}
                    >
                      {item.body || item.text}
                    </Text>
                    <View style={styles.notifMetaRow}>
                      <View style={[styles.notifTypeIcon, { backgroundColor: icon.bg }]}>
                        <Ionicons name={icon.name as never} size={12} color={icon.color} />
                      </View>
                      {item.aggregatedCount && item.aggregatedCount > 1 ? (
                        <View style={styles.notifAggregatedRow}>
                          {item.actorAvatar ? (
                            <CachedImage
                              uri={item.actorAvatar}
                              style={[styles.notifAggregatedAvatar, { borderColor: colors.surface }]}
                              contentFit="cover"
                            />
                          ) : (
                            <View style={[styles.notifAggregatedAvatarFallback, { borderColor: colors.surface, backgroundColor: colors.surfaceAlt }]}>
                              <Ionicons name="person" size={10} color={colors.textSecondary} />
                            </View>
                          )}
                          <View style={[styles.notifAggregatedCountBadge, { backgroundColor: colors.brand, borderColor: colors.surface }]}>
                            <Text style={[styles.notifAggregatedCountText, { color: colors.background }]}>
                              +{item.aggregatedCount - 1}
                            </Text>
                          </View>
                        </View>
                      ) : null}
                      <Text style={[styles.notifTime, { color: colors.textMuted }]}>{item.time}</Text>
                    </View>
                  </View>
                </AnimatedPressable>

                {actorUserId && actorHandle ? (
                  <View style={[styles.notifActionRow, { borderTopColor: colors.border }]}>
                    <AnimatedPressable
                      style={[styles.notifActorChip, { borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}
                      onPress={() => navigation.navigate('UserProfile', { userId: actorUserId })}
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
                      <Text style={[styles.notifActorText, { color: colors.textSecondary }]} numberOfLines={1}>@{actorHandle}</Text>
                    </AnimatedPressable>

                    <AnimatedPressable
                      style={[styles.notifMessageBtn, { borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}
                      onPress={() =>
                        navigation.navigate('Chat', {
                          conversationId: listingId ? `${actorUserId}_${listingId}` : `profile_${actorUserId}`,
                          focusQuery: actorHandle,
                          partnerUserId: actorUserId,
                        })}
                      activeOpacity={0.85}
                      accessibilityRole="button"
                      accessibilityLabel={`Message @${actorHandle}`}
                      accessibilityHint="Opens chat with this user"
                    >
                      <Ionicons name="chatbubble-ellipses-outline" size={12} color={colors.textPrimary} />
                    </AnimatedPressable>
                  </View>
                ) : null}
              </View>
              </Swipeable>
            </Reanimated.View>
          );
        }}
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.loadingState}>
              <ActivityIndicator color={colors.brand} size="small" />
              <Text style={[styles.loadingText, { color: colors.textMuted }]}>Syncing notifications...</Text>
            </View>
          ) : hasShownSyncErrorRef.current && notifications.length === 0 ? (
            <EmptyState
              icon="cloud-offline-outline"
              title="Couldn't load notifications"
              subtitle="Pull down to refresh and try again."
              iconColor={colors.textMuted}
            />
          ) : activeFilter !== 'all' && notifications.length > 0 ? (
            <EmptyState
              icon={(FILTER_TABS.find((t) => t.key === activeFilter)?.icon ?? 'notifications-outline') as any}
              title={`No ${FILTER_TABS.find((t) => t.key === activeFilter)?.label.toLowerCase() ?? 'notifications'} yet`}
              subtitle="Switch to 'All' to see everything."
              iconColor={colors.textMuted}
            />
          ) : (
            <EmptyState
              icon="notifications-outline"
              title="No notifications yet"
              subtitle="We'll notify you about new items, price drops, and order updates."
              iconColor={colors.textMuted}
            />
          )
        }
        ListFooterComponent={
          isLoadingMore ? (
            <View style={styles.loadingState}>
              <ActivityIndicator color={colors.brand} size="small" />
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  filterTabsRow: {
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  filterTabsContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: 1,
    minHeight: 32,
  },
  filterTabText: {
    fontSize: 12,
    fontFamily: Typography.family.medium,
  },
  filterTabBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterTabBadgeText: {
    fontSize: 10,
    fontFamily: Typography.family.semibold,
  },

  swipeActionContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    marginBottom: 10,
  },
  swipeReadAction: {
    flex: 1,
    width: 80,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  swipeReadText: {
    fontSize: 11,
    fontFamily: Typography.family.semibold,
  },
  swipeDeleteAction: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 80,
    height: '100%',
    gap: 4,
  },
  swipeDeleteText: {
    fontSize: 11,
    fontFamily: Typography.family.semibold,
  },

  listContent: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 120 },

  summaryBannerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  unreadSummaryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.full,
  },
  unreadSummaryText: {
    fontSize: 12,
    fontFamily: Typography.family.semibold,
  },
  quietHoursBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
  quietHoursText: {
    fontSize: 12,
    fontFamily: Typography.family.semibold,
  },

  sectionTitle: {
    fontSize: 13,
    fontFamily: Typography.family.bold,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginTop: 24,
    marginBottom: 14,
    marginLeft: 4,
  },

  notifCard: {
    borderRadius: 20,
    marginBottom: 10,
    borderWidth: 1,
    borderLeftWidth: 3,
    borderLeftColor: 'transparent',
  },
  notifMainTap: {
    padding: Space.md,
    flexDirection: 'row',
    gap: Space.sm + 2,
    alignItems: 'center',
  },

  unreadDot: {
    position: 'absolute',
    top: 18,
    left: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  notifImageWrap: {
    width: 52, height: 52, borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
  },
  notifImageShared: {
    ...StyleSheet.absoluteFill,
  },
  notifImage: { width: '100%', height: '100%' },

  notifBody: { flex: 1 },
  notifTitle: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
    lineHeight: Type.body.lineHeight,
    marginBottom: 2,
  },
  notifText: {
    fontSize: Type.body.size, fontFamily: Typography.family.regular,
    lineHeight: Type.body.lineHeight, marginBottom: 8,
  },

  notifMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  notifTypeIcon: {
    width: 22, height: 22, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
  },
  notifTime: { fontSize: 12, fontFamily: Typography.family.regular },
  notifAggregatedRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  notifAggregatedAvatar: {
    width: 18,
    height: 18,
    borderRadius: 9,
    marginRight: -6,
    borderWidth: 1.5,
  },
  notifAggregatedAvatarFallback: {
    width: 18,
    height: 18,
    borderRadius: 9,
    marginRight: -6,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifAggregatedCountBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  notifAggregatedCountText: {
    fontSize: 10,
    fontFamily: Typography.family.bold,
  },
  notifActionRow: {
    marginTop: 4,
    marginHorizontal: 16,
    marginBottom: 14,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  notifActorChip: {
    flex: 1,
    minHeight: 28,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
  },
  notifActorAvatarWrap: {
    width: 18,
    height: 18,
    borderRadius: 9,
  },
  notifActorAvatar: {
    width: 18,
    height: 18,
    borderRadius: 9,
  },
  notifActorAvatarFallback: {
    minWidth: 20,
    height: 20,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: Space.sm,
  },
  notifActorText: {
    flex: 1,
    fontSize: 11,
    fontFamily: Typography.family.semibold,
  },
  notifMessageBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  loadingState: {
    marginTop: 40,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  loadingText: {
    fontSize: 13,
    fontFamily: Typography.family.medium,
  },
});