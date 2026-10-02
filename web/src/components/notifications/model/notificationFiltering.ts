import {
  NOTIFICATION_OVERFLOW_FILTERS,
  type NotificationFilter,
  type NotificationRowModel,
} from './notificationTypes';

/**
 * Wallet-route rows — payouts and completed refunds map to kind 'order'
 * on the wire (native files every financial event under Orders), but
 * they route to /wallet and describe money movement, not an order's
 * fulfilment. Detected on the resolved href, never the copy: the row's
 * destination is the taxonomy.
 */
export function isWalletActivity(i: NotificationRowModel): boolean {
  return i.kind === 'order' && (i.href?.startsWith('/wallet') ?? false);
}

/**
 * Filter rows — 'orders' covers order fulfilment (wallet events file
 * under 'activity' instead), 'offers' the offer lifecycle, 'follows' the
 * social graph, 'items' new listings and saved-search matches (mobile
 * FILTER_EVENT_TYPES parity). Kinds with no dedicated filter (likes,
 * system) only surface under All — same as mobile.
 */
export function filterNotifications(
  items: NotificationRowModel[],
  filter: NotificationFilter,
): NotificationRowModel[] {
  switch (filter) {
    case 'unread':
      return items.filter((i) => i.unread);
    case 'orders':
      return items.filter((i) => i.kind === 'order' && !isWalletActivity(i));
    case 'offers':
      return items.filter((i) => i.kind === 'offer');
    case 'follows':
      return items.filter((i) => i.kind === 'follow');
    case 'activity':
      return items.filter(isWalletActivity);
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

/** Server `filterCounts` buckets → web filter keys. The backend emits the
 *  native names (order/new_item/review/price/auction); the sheet and tabs
 *  consume the pluralised web keys. */
export const SERVER_FILTER_KEY: Record<string, NotificationFilter> = {
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
        subtitle: 'Order activity will show up here.',
      };
    case 'offers':
      return {
        title: 'No offers',
        subtitle: 'Offers on your listings and your own bids will show up here.',
      };
    case 'follows':
      return {
        title: 'No new followers',
        subtitle: 'When someone follows you, it will show up here.',
      };
    case 'activity':
      return {
        title: 'No wallet activity',
        subtitle: 'Payouts and completed refunds will show up here.',
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
