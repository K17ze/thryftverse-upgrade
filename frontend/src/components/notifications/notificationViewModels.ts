import {
  NotificationEvent,
  NotificationEventType,
  NotificationEventV2,
  NotificationObjectRef,
  NotificationAttentionLevel,
  upgradeToV2 } from '../../services/notificationsApi';

export type NotificationCardType = 'new_item' | 'like' | 'review' | 'order' | 'price' | 'resolution' | 'auction' | 'generic';

export type NotificationCard = {
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
  /** Member event ids for aggregated cards — mutations fan out to these;
   *  the synthetic `agg:` id is a render key, not a server-resolvable id. */
  aggregatedIds?: string[];
  /** Number of member events that were unread when the card was built —
   *  drives correct badge-count decrement on mark-read. */
  aggregatedUnreadCount?: number;
  /** V2 structured event — passed to role-specific row presenters. */
  v2Event: NotificationEventV2;
  /** Delivery status from the push pipeline — drives the status indicator. */
  deliveryStatus: 'queued' | 'ticketed' | 'sent' | 'failed' | 'suppressed';
};

/**
 * Flattened list item used by FlashList. Each section header becomes a
 * `'header'` item followed by its `'item'` rows, so FlashList can recycle
 * cells by type via `getItemType`.
 */
export type NotificationListItem =
  | { type: 'header'; sectionTitle: string; unreadCount: number; isAttention: boolean; itemCount: number }
  | { type: 'item'; card: NotificationCard };

export type NotificationFilter = 'all' | 'unread' | 'order' | 'new_item' | 'review' | 'price' | 'auction';

// All filters live behind a single overflow funnel icon — no primary tab row.
// This keeps the screen's information hierarchy attention-first (Needs attention,
// Today, Yesterday, Earlier) rather than split across pseudo-tabs.
export const OVERFLOW_FILTERS: { key: NotificationFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'unread', label: 'Unread' },
  { key: 'order', label: 'Orders' },
  { key: 'new_item', label: 'Items' },
  { key: 'review', label: 'Reviews' },
  { key: 'price', label: 'Prices' },
  { key: 'auction', label: 'Auctions' },
];

// No per-filter icons — the label is the object (AGENTS.md §4 anti
// label-everything). The filter sheet is a selection list, not a settings
// catalogue: label + count + checkmark is the complete grammar.

// Primary pill-style filter tabs — always visible at the top of the list.
// The most useful commerce/social filters get direct one-tap access; the
// remaining filters stay behind the overflow funnel icon.
export const PRIMARY_FILTERS: { key: NotificationFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'unread', label: 'Unread' },
  { key: 'order', label: 'Purchases' },
];

export function filterLabelForKey(key: NotificationFilter): string {
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
    day: 'numeric' });
}

export function mapEventToCard(event: NotificationEvent): NotificationCard {
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
    deliveryStatus: event.status };
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

export function aggregateNotifications(notifications: NotificationCard[]): NotificationCard[] {
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
      new_item: 'listed' };
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
      aggregatedIds: group.map((n) => n.id),
      aggregatedUnreadCount: group.filter((n) => !n.read).length,
      read: group.every((n) => n.read),
      v2Event: {
        ...primary.v2Event,
        readAt: group.every((n) => n.read) ? primary.v2Event.readAt : null } });
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
  earlier: 'Earlier' };

export interface NotificationSection {
  title: string;
  data: NotificationCard[];
  unreadCount: number;
  isAttention?: boolean;
}

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

export function groupNotifications(notifications: NotificationCard[]): NotificationSection[] {
  const buckets: Record<NotificationGroupKey, NotificationCard[]> = {
    attention: [],
    today: [],
    yesterday: [],
    earlier: [] };

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

  const sections: NotificationSection[] = [];
  for (const key of NOTIFICATION_GROUP_ORDER) {
    const data = buckets[key];
    if (data.length === 0) continue;
    const unreadCount = data.filter((n) => !n.read).length;
    sections.push({ title: NOTIFICATION_GROUP_LABELS[key], data, unreadCount, isAttention: key === 'attention' });
  }

  return sections;
}

/**
 * Flatten sections into a single array so FlashList can recycle cells.
 * Each section becomes a header item followed by its data items.
 */
export function flattenNotificationSections(sections: NotificationSection[]): NotificationListItem[] {
  const items: NotificationListItem[] = [];
  for (const section of sections) {
    items.push({
      type: 'header',
      sectionTitle: section.title,
      unreadCount: section.unreadCount,
      isAttention: !!section.isAttention,
      itemCount: section.data.length });
    for (const card of section.data) {
      items.push({ type: 'item', card });
    }
  }
  return items;
}

export function computeNotificationFilterCounts(
  notifications: NotificationCard[]
): Record<NotificationFilter, number> {
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
}
