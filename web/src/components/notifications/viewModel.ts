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
import { LISTINGS, MY_LISTINGS, USERS } from '@/lib/data/fixtures';
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
  /** Resolved actor id for follow rows — powers the in-row Follow back. */
  actorId?: string;
}

export type NotificationFilter = 'all' | 'unread' | 'orders';

export const NOTIFICATION_FILTERS: { key: NotificationFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'unread', label: 'Unread' },
  { key: 'orders', label: 'Orders' },
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
    // Same actor resolution as feed rows — legacy follow rows get the
    // in-row Follow back too, when the username resolves to a member.
    actorId: n.type === 'follow' ? actorIdForHref(href) : undefined,
  };
}

/** "/u/{username}" → the actor's user id, when the member exists. */
function actorIdForHref(href: string | undefined): string | undefined {
  const username = href?.startsWith('/u/') ? href.slice(3) : null;
  return username ? USERS.find((u) => u.username === username)?.id : undefined;
}

/** Adapt a NotificationEntry (already in row shape). */
export function fromNotificationEntry(n: NotificationEntry): NotificationRowModel {
  return {
    id: n.id,
    kind: n.kind,
    text: n.text,
    time: n.time,
    image: n.image,
    isActor: n.isActor === true,
    href: n.href,
    unread: n.unread === true,
    actorId: n.kind === 'follow' ? actorIdForHref(n.href) : undefined,
  };
}

export interface NotificationSection {
  label: string;
  items: NotificationRowModel[];
  unreadCount: number;
}

/**
 * Day bucketing — 's/m/h/now' → Today, 'Yesterday'/'1d' → Yesterday,
 * everything older → Earlier. Mirrors the mobile grouping contract.
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
 * Type sections — Instagram's activity grammar. When the feed is long
 * enough that scanning by kind beats scanning by recency (>6 rows), rows
 * group under micro-caps section headers: Follows, Orders, Offers, then
 * everything else as Activity. Small sets keep the day buckets.
 */
const TYPE_SECTIONS: { label: string; kinds: NotificationKind[] }[] = [
  { label: 'Follows', kinds: ['follow'] },
  { label: 'Orders', kinds: ['order'] },
  { label: 'Offers', kinds: ['offer'] },
  {
    label: 'Activity',
    kinds: ['like', 'review', 'price_drop', 'new_item', 'saved_search_match', 'system'],
  },
];

export function groupNotificationsByType(items: NotificationRowModel[]): NotificationSection[] {
  return TYPE_SECTIONS.map(({ label, kinds }) => {
    const section = items.filter((i) => kinds.includes(i.kind));
    return { label, items: section, unreadCount: section.filter((i) => i.unread).length };
  }).filter((s) => s.items.length > 0);
}

/** Group for render — type sections past 6 rows, day sections below. */
export function groupNotificationsAuto(items: NotificationRowModel[]): NotificationSection[] {
  return items.length > 6 ? groupNotificationsByType(items) : groupNotifications(items);
}

/** Filter rows — 'orders' covers order + offer activity (mobile parity). */
export function filterNotifications(
  items: NotificationRowModel[],
  filter: NotificationFilter,
): NotificationRowModel[] {
  switch (filter) {
    case 'unread':
      return items.filter((i) => i.unread);
    case 'orders':
      return items.filter((i) => i.kind === 'order' || i.kind === 'offer');
    default:
      return items;
  }
}
