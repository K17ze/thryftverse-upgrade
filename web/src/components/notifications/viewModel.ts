/**
 * Notifications view-model — pure derivations for the /notifications feed.
 * Normalises the legacy AppNotification rows and the richer
 * NotificationEntry feed into one row model, resolves deep links, and
 * buckets entries into the mobile section grammar: day sections
 * (Today / Yesterday / Earlier) for small sets, Instagram-style type
 * sections (Follows / Orders / Offers / Activity) past six rows.
 * No React, no theme — safe to unit-test.
 */

import type { AppNotification, NotificationEntry, NotificationKind } from '@/lib/contracts/domain';
import { LISTINGS, MY_LISTINGS } from '@/lib/data/fixtures';
import type { AppIconName } from '@/components/ui/Icon';

/** Unified row model rendered by NotificationRow. */
export interface NotificationRowModel {
  id: string;
  kind: NotificationKind;
  text: string;
  time: string;
  image?: string;
  isActor: boolean;
  href?: string;
  unread: boolean;
  /** Actor id from the wire on follow rows — powers the in-row
   *  Follow back. */
  actorId?: string;
  /** Action-required event (mobile requiresAction) — feeds the "Needs
   *  attention" section ahead of the day buckets. */
  requiresAction?: boolean;
  /** Quiet in-row affordance label ("Review offer", "Dispatch now") —
   *  present only when the event's route resolved. */
  actionLabel?: string;
  /** Member event ids behind an aggregated card — dismiss fans out to
   *  these; the `agg:` render id is not a server-resolvable event id. */
  aggregatedIds?: string[];
  /** Members unread at build time — mark-read fans out to these only. */
  aggregatedUnreadIds?: string[];
  /** Group size behind an aggregated card — drives the "+N" badge. */
  aggregatedCount?: number;
}

export type NotificationFilter =
  | 'all'
  | 'unread'
  | 'orders'
  | 'items'
  | 'reviews'
  | 'prices'
  | 'auctions';

/** Primary pill chips — always visible (mobile PRIMARY_FILTERS parity). */
export const NOTIFICATION_FILTERS: { key: NotificationFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'unread', label: 'Unread' },
  { key: 'orders', label: 'Orders' },
];

/**
 * The complete filter set, rendered as a selection list inside the
 * overflow sheet — label + count + checkmark is the complete grammar
 * (mobile OVERFLOW_FILTERS parity). The label is the object: no icons.
 */
export const NOTIFICATION_OVERFLOW_FILTERS: { key: NotificationFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'unread', label: 'Unread' },
  { key: 'orders', label: 'Orders' },
  { key: 'items', label: 'Items' },
  { key: 'reviews', label: 'Reviews' },
  { key: 'prices', label: 'Prices' },
  { key: 'auctions', label: 'Auctions' },
];

/** Per-kind accent — one icon family, semantic colour, like mobile rows. */
export const KIND_ACCENT: Record<NotificationKind, { icon: AppIconName; className: string; filled?: boolean }> = {
  like: { icon: 'heart', className: 'text-danger-text', filled: true },
  offer: { icon: 'offer', className: 'text-warning-text' },
  price_drop: { icon: 'trending', className: 'text-success-text' },
  follow: { icon: 'follow', className: 'text-text-primary' },
  order: { icon: 'box', className: 'text-commerce-trust' },
  review: { icon: 'star', className: 'text-warning-text', filled: true },
  new_item: { icon: 'pricetag', className: 'text-text-secondary' },
  saved_search_match: { icon: 'search', className: 'text-commerce-trust' },
  auction: { icon: 'auction', className: 'text-warning-text' },
  system: { icon: 'info', className: 'text-text-secondary' },
};

const LEGACY_KIND: Record<AppNotification['type'], NotificationKind> = {
  favourite: 'like',
  offer: 'offer',
  order: 'order',
  follow: 'follow',
  new_item: 'new_item',
  system: 'system',
};

/** Photo-id key — strips the size query so a 200w notification thumb can
 *  match the 800w listing cover it was derived from. */
function unsplashKey(uri: string | undefined): string | null {
  if (!uri) return null;
  const match = /photo-[^?&]+/.exec(uri);
  return match ? match[0] : null;
}

/** Find the listing whose images include this notification thumbnail. */
function listingForImage(uri: string | undefined) {
  const key = unsplashKey(uri);
  if (!key) return undefined;
  return [...LISTINGS, ...MY_LISTINGS].find((l) =>
    l.images.some((img) => unsplashKey(img) === key),
  );
}

/**
 * Deep-link a legacy notification — the AppNotification contract carries
 * no route, so the surface is derived from the type: offers → /offers,
 * orders → /orders, follows → the actor's profile, item events → the
 * listing whose cover matches the thumbnail.
 */
function legacyHref(n: AppNotification): string | undefined {
  switch (n.type) {
    case 'offer':
      return '/offers';
    case 'order':
      return '/orders';
    case 'follow': {
      const actor = n.text.split(' ')[0]?.replace(/^@/, '');
      return actor ? `/u/${actor}` : undefined;
    }
    case 'favourite':
    case 'new_item': {
      const listing = listingForImage(n.itemImage);
      return listing ? `/item/${listing.id}` : '/explore';
    }
    case 'system':
      return '/explore';
    default:
      return undefined;
  }
}

/** Adapt a legacy AppNotification into the unified row model. */
export function fromLegacyNotification(n: AppNotification): NotificationRowModel {
  const href = legacyHref(n);
  return {
    id: n.id,
    kind: LEGACY_KIND[n.type] ?? 'system',
    text: n.text,
    time: n.time,
    image: n.itemImage,
    isActor: n.type === 'follow',
    href,
    unread: false, // legacy rows carry no read cursor — treat as read
    // No Follow back: AppNotification carries no actor id, and resolving
    // one through the fixture directory was a live-mode lie.
  };
}

/** Adapt a NotificationEntry (already in row shape). The service may
 *  attach actionability meta (NotificationEntryWithAction) — read it
 *  through the declared optional fields, never fabricate it. */
export function fromNotificationEntry(n: NotificationEntry): NotificationRowModel {
  const actioned = n as NotificationEntry & {
    requiresAction?: boolean;
    actionLabel?: string;
  };
  return {
    id: n.id,
    kind: n.kind,
    text: n.text,
    time: n.time,
    image: n.image,
    isActor: n.isActor === true,
    href: n.href,
    unread: n.unread === true,
    // Wire actorUserId — never a fixture lookup; absent means the event
    // carried no actor and the Follow back stays hidden.
    actorId: n.kind === 'follow' ? n.actorUserId : undefined,
    requiresAction: actioned.requiresAction === true,
    actionLabel: actioned.actionLabel,
    aggregatedIds: n.aggregatedIds,
    aggregatedUnreadIds: n.aggregatedUnreadIds,
    aggregatedCount: n.aggregatedCount,
  };
}

/**
 * Aggregation — port of native aggregateNotifications
 * (frontend/src/components/notifications/notificationViewModels.ts).
 * Like/price-drop/new-item events on the same entity within a 24h
 * window collapse into one card ("X and N others liked your item").
 * Orders, resolutions, auctions and follows never aggregate — each is
 * unique or actor-scoped. The grouped card takes the newest member's
 * feed position and fans mutations out to every member id.
 */

/** Kinds that collapse, keyed by the group copy's action verb. The kind
 *  set mirrors native AGGREGATABLE_TYPES by card type — saved-search
 *  matches file under 'new_item' cards natively, so they join here. */
const AGGREGATED_ACTION: Partial<Record<NotificationKind, string>> = {
  like: 'liked',
  price_drop: 'dropped the price on',
  new_item: 'listed',
  saved_search_match: 'listed',
};

/** Card-type prefix for the legacy fallback key (native `${type}:${id}`
 *  — kind → native card type). */
const AGGREGATION_TYPE_PREFIX: Partial<Record<NotificationKind, string>> = {
  like: 'like',
  price_drop: 'price',
  new_item: 'new_item',
  saved_search_match: 'new_item',
};

const AGGREGATION_WINDOW_MS = 24 * 3_600_000;

/** 24h window membership — prefers the real event timestamp; fixture
 *  rows carry only the relative label, where 'now'/s/m/h units are
 *  always <24h (24h+ renders as Yesterday/Nd). */
function entryWithinWindow(n: NotificationEntry, now: number): boolean {
  const created = n.createdAt ? Date.parse(n.createdAt) : NaN;
  if (!Number.isNaN(created)) return now - created <= AGGREGATION_WINDOW_MS;
  const t = n.time.trim().toLowerCase();
  if (t === 'now' || t === 'just now') return true;
  return /^\d+\s*[smh]$/.test(t);
}

/** Group key — the wire's `aggregationKey` first, then the native legacy
 *  fallback `type:entityId`. A keyless event (no registry key, no
 *  objectRef entity) stays standalone: there is no shared object to
 *  prove the events refer to the same entity. */
function aggregationGroupKey(n: NotificationEntry): string | null {
  if (n.aggregationKey) return n.aggregationKey;
  const prefix = AGGREGATION_TYPE_PREFIX[n.kind];
  const entityId = n.objectRef?.id;
  return prefix && entityId ? `${prefix}:${entityId}` : null;
}

/** Member recency — the group primary is the newest member. Feed order
 *  is already newest-first, so a missing timestamp keeps encounter order. */
function entryTimeMs(n: NotificationEntry): number {
  const t = n.createdAt ? Date.parse(n.createdAt) : NaN;
  return Number.isNaN(t) ? 0 : t;
}

/** Compose the grouped card — "X and N others {verb} {object}", the
 *  native copy grammar verbatim. */
function composeAggregatedEntry(members: NotificationEntry[]): NotificationEntry {
  const sorted = [...members].sort((a, b) => entryTimeMs(b) - entryTimeMs(a));
  const primary = sorted[0];
  // Actor names read newest-first — the lead name is the most recent
  // actor, matching the native sort-then-name ordering.
  const actorNames = sorted
    .map((n) => n.actorDisplayName || n.actorUsername)
    .filter((name): name is string => Boolean(name));
  const uniqueActorNames = [...new Set(actorNames)];
  const count = members.length;
  const othersCount = count - 1;
  const firstActor = uniqueActorNames[0] || 'Someone';
  const action = AGGREGATED_ACTION[primary.kind] ?? 'interacted with';
  const object = primary.objectRef?.label ?? 'your item';
  return {
    ...primary,
    id: `agg:${primary.id}`,
    text: `${firstActor} and ${othersCount} other${othersCount === 1 ? '' : 's'} ${action} ${object}`,
    aggregatedCount: count,
    aggregatedIds: members.map((n) => n.id),
    aggregatedUnreadIds: members.filter((n) => n.unread).map((n) => n.id),
    unread: members.some((n) => n.unread),
  };
}

/**
 * Collapse eligible entries into grouped cards. Input is expected in
 * feed order (newest first) with the read/dismiss overlays already
 * applied — `aggregatedUnreadIds` then describes the members a mark-read
 * actually needs to write. A group card claims its newest member's slot;
 * a group of one returns the member untouched.
 */
export function aggregateNotificationEntries(
  entries: NotificationEntry[],
): NotificationEntry[] {
  const now = Date.now();
  const groups = new Map<string, NotificationEntry[]>();
  const slots = new Map<string, number>();
  const result: (NotificationEntry | null)[] = [];

  for (const entry of entries) {
    const key = AGGREGATED_ACTION[entry.kind] ? aggregationGroupKey(entry) : null;
    if (!key || !entryWithinWindow(entry, now)) {
      result.push(entry);
      continue;
    }
    const group = groups.get(key);
    if (group) {
      group.push(entry);
    } else {
      groups.set(key, [entry]);
      slots.set(key, result.length);
      result.push(null);
    }
  }

  for (const [key, group] of groups) {
    const slot = slots.get(key);
    if (slot !== undefined) {
      result[slot] = group.length > 1 ? composeAggregatedEntry(group) : group[0];
    }
  }

  return result.filter((e): e is NotificationEntry => e !== null);
}

export interface NotificationSection {
  label: string;
  items: NotificationRowModel[];
  unreadCount: number;
  /** The "Needs attention" bucket — leads the feed when action-required
   *  events exist (mobile attention-first grammar). */
  attention?: boolean;
}

/**
 * Day bucketing — 's/m/h/now' → Today, 'Yesterday'/'1d' → Yesterday,
 * everything older → Earlier. Mirrors the mobile grouping contract.
 *
 * Hydration-safe by construction: inputs are relative labels or ISO
 * strings, and the day-diff branch is pure epoch arithmetic (UTC ms —
 * no local calendar, no runtime timezone). It also only runs once the
 * feed query has resolved client-side, so no SSR render ever produces
 * these labels.
 */
function bucketLabel(time: string): string {
  const t = time.trim().toLowerCase();
  if (t === 'now' || t === 'just now') return 'Today';
  const match = /^(\d+)\s*([smhdw])$/.exec(t);
  if (match) {
    const n = Number(match[1]);
    const unit = match[2];
    if (unit === 's' || unit === 'm' || unit === 'h') return 'Today';
    if (unit === 'd') return n <= 1 ? 'Yesterday' : 'Earlier';
    return 'Earlier';
  }
  if (t === 'yesterday' || t === '1d') return 'Yesterday';
  const d = new Date(time);
  if (!Number.isNaN(d.getTime())) {
    const days = (Date.now() - d.getTime()) / 86_400_000;
    return days < 1 ? 'Today' : days < 2 ? 'Yesterday' : 'Earlier';
  }
  return 'Earlier';
}

const SECTION_ORDER = ['Today', 'Yesterday', 'Earlier'];

export function groupNotifications(items: NotificationRowModel[]): NotificationSection[] {
  const buckets = new Map<string, NotificationRowModel[]>();
  for (const item of items) {
    const label = bucketLabel(item.time);
    const bucket = buckets.get(label);
    if (bucket) bucket.push(item);
    else buckets.set(label, [item]);
  }
  return SECTION_ORDER.map((label) => {
    const section = buckets.get(label) ?? [];
    return { label, items: section, unreadCount: section.filter((i) => i.unread).length };
  }).filter((s) => s.items.length > 0);
}

/**
 * Section grammar — the mobile contract (notificationViewModels
 * groupNotifications): a "Needs attention" bucket of action-required
 * events leads, then the day buckets Today / Yesterday / Earlier. The
 * earlier type-section experiment (Follows/Orders/Offers/Activity past
 * six rows) was a deviation — filtering by kind already lives in the
 * chips and the overflow sheet.
 */
export function groupNotificationsAuto(items: NotificationRowModel[]): NotificationSection[] {
  const attention = items.filter((i) => i.requiresAction);
  const rest = items.filter((i) => !i.requiresAction);
  const daySections = groupNotifications(rest);
  if (!attention.length) return daySections;
  return [
    {
      label: 'Needs attention',
      items: attention,
      unreadCount: attention.filter((i) => i.unread).length,
      attention: true,
    },
    ...daySections,
  ];
}

/**
 * Filter rows — 'orders' covers order + offer activity, 'items' covers
 * new listings and saved-search matches (mobile FILTER_EVENT_TYPES
 * parity). Kinds with no dedicated filter (likes, follows, system) only
 * surface under All — same as mobile.
 */
export function filterNotifications(
  items: NotificationRowModel[],
  filter: NotificationFilter,
): NotificationRowModel[] {
  switch (filter) {
    case 'unread':
      return items.filter((i) => i.unread);
    case 'orders':
      return items.filter((i) => i.kind === 'order' || i.kind === 'offer');
    case 'items':
      return items.filter(
        (i) => i.kind === 'new_item' || i.kind === 'saved_search_match',
      );
    case 'reviews':
      return items.filter((i) => i.kind === 'review');
    case 'prices':
      return items.filter((i) => i.kind === 'price_drop');
    case 'auctions':
      return items.filter((i) => i.kind === 'auction');
    default:
      return items;
  }
}

/**
 * Per-filter counts computed from the merged feed — the sheet's trailing
 * numbers are the dataset's own truth, so a filter with zero rows reads
 * no count rather than a fabricated badge.
 */
export function notificationFilterCounts(
  items: NotificationRowModel[],
): Record<NotificationFilter, number> {
  const counts = {} as Record<NotificationFilter, number>;
  for (const f of NOTIFICATION_OVERFLOW_FILTERS) {
    counts[f.key] = filterNotifications(items, f.key).length;
  }
  return counts;
}

/**
 * Filter key → the event types it covers, sent to `/notifications/events`
 * as `eventType` so the server filters the page itself instead of the
 * client filtering a ≤30-row window (native FILTER_EVENT_TYPES port).
 * 'all' and 'unread' are not listed — 'all' sends no filter; 'unread'
 * uses the `unread` flag.
 */
export const NOTIFICATION_FILTER_EVENT_TYPES: Record<
  Exclude<NotificationFilter, 'all' | 'unread'>,
  readonly string[]
> = {
  orders: [
    'order_created',
    'order_paid',
    'order_cancelled',
    'order_dispatched',
    'order_in_transit',
    'order_out_for_delivery',
    'order_delivered',
    'order_refunded',
    'order_dispatch_sla_breach',
    'order_delivery_failed',
    'order_parcel_lost',
    'order_parcel_damaged',
    'payout_processed',
    'refund_completed',
    'payment_failed',
    'dispatch_extension_proposed',
    'dispatch_extension_responded',
    'offer_created',
    'offer_countered',
    'offer_accepted',
    'offer_declined',
    'offer_expired',
    'offer_cancelled',
    'smart_sell_decision',
    // Co-own financial events render as 'order' rows — the commerce
    // bucket is the filter grouping they belong to (no co-own filter
    // exists).
    'coown_buyout_accepted',
    'coown_verification_responded',
    'coown_price_alert_triggered',
    'coown_drip_receipt',
  ],
  items: ['new_listing_from_followed_seller', 'saved_search_match', 'live_started'],
  reviews: ['review_received', 'review_response_received', 'review_moderated'],
  prices: ['price_drop'],
  auctions: [
    'auction_outbid',
    'auction_won',
    'auction_ending_soon',
    'auction_bid',
    'auction_cancelled',
    'auction_reserve_not_met',
    'auction_sold_awaiting_payment',
    'auction_payment_expired',
    'auction_sold',
  ],
};

/** Server `filterCounts` buckets → web filter keys. The backend emits the
 *  native names (order/new_item/review/price/auction); the sheet and tabs
 *  consume the pluralised web keys. */
const SERVER_FILTER_KEY: Record<string, NotificationFilter> = {
  all: 'all',
  unread: 'unread',
  order: 'orders',
  new_item: 'items',
  review: 'reviews',
  price: 'prices',
  auction: 'auctions',
};

/**
 * Server-side per-filter totals → web-keyed counts. These describe the
 * user's whole non-suppressed set, not the loaded page, so badges stay
 * truthful while paginating. Returns undefined when the response carried
 * no counts (fixture mode / older backends) — the caller falls back to
 * the local derivation.
 */
export function serverNotificationFilterCounts(
  counts: Record<string, number> | undefined,
): Record<NotificationFilter, number> | undefined {
  if (!counts) return undefined;
  const out = {} as Record<NotificationFilter, number>;
  for (const f of NOTIFICATION_OVERFLOW_FILTERS) out[f.key] = 0;
  for (const [key, value] of Object.entries(counts)) {
    const filter = SERVER_FILTER_KEY[key];
    if (filter && typeof value === 'number') out[filter] = value;
  }
  return out;
}

/** Empty-state copy for a filtered feed — label-aware, never generic. */
export function notificationFilterEmpty(
  filter: NotificationFilter,
): { title: string; subtitle: string } {
  switch (filter) {
    case 'unread':
      return { title: 'All caught up', subtitle: 'You have no unread notifications.' };
    case 'orders':
      return {
        title: 'No order updates',
        subtitle: 'Order and offer activity will show up here.',
      };
    case 'items':
      return {
        title: 'No item alerts',
        subtitle: 'New listings from sellers you follow and saved-search matches will show up here.',
      };
    case 'reviews':
      return {
        title: 'No reviews yet',
        subtitle: 'Reviews you receive will show up here.',
      };
    case 'prices':
      return {
        title: 'No price drops',
        subtitle: 'Price drops on items you watch will show up here.',
      };
    case 'auctions':
      return {
        title: 'No auction activity',
        subtitle: 'Outbid alerts and auction results will show up here.',
      };
    default:
      return {
        title: 'No notifications',
        subtitle: 'Offers, orders and new followers will show up here.',
      };
  }
}
