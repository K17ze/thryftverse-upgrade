import type { NotificationKind } from '@/lib/contracts/domain';
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
  /** Event timestamp from the wire — the chronological sort key; the
   *  relative `time` label is only the fallback. */
  createdAt?: string;
}

export type NotificationFilter =
  | 'all'
  | 'unread'
  | 'orders'
  | 'offers'
  | 'follows'
  | 'activity'
  | 'items'
  | 'reviews'
  | 'prices'
  | 'auctions';

/** Primary pill chips — always visible. One chip per feed taxonomy the
 *  feed actually groups: commerce splits into Orders / Offers, social
 *  gets Follows, and wallet events (payouts, completed refunds — the
 *  financial events that route to /wallet, not an order) file under
 *  Activity. The long tail (Items / Reviews / Prices / Auctions) stays
 *  in the overflow sheet. */
export const NOTIFICATION_FILTERS: { key: NotificationFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'unread', label: 'Unread' },
  { key: 'orders', label: 'Orders' },
  { key: 'offers', label: 'Offers' },
  { key: 'follows', label: 'Follows' },
  { key: 'activity', label: 'Activity' },
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
  { key: 'offers', label: 'Offers' },
  { key: 'follows', label: 'Follows' },
  { key: 'activity', label: 'Activity' },
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

export interface NotificationSection {
  label: string;
  items: NotificationRowModel[];
  unreadCount: number;
  /** The "Needs attention" bucket — leads the feed when action-required
   *  events exist (mobile attention-first grammar). */
  attention?: boolean;
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
    // payment_failed resolves to the order (retry the capture), not the
    // wallet — orderObjectExtractor natively.
    'payment_failed',
    'dispatch_extension_proposed',
    'dispatch_extension_responded',
    // Co-own financial events render as 'order' rows — the commerce
    // bucket is the filter grouping they belong to (no co-own filter
    // exists).
    'coown_buyout_accepted',
    'coown_verification_responded',
    'coown_price_alert_triggered',
    'coown_drip_receipt',
  ],
  offers: [
    'offer_created',
    'offer_countered',
    'offer_accepted',
    'offer_declined',
    'offer_expired',
    'offer_cancelled',
    // A Smart Sell decision IS an offer event — the rule auto-accepted
    // one on the seller's behalf.
    'smart_sell_decision',
  ],
  follows: ['new_follower', 'follow_received'],
  // Wallet-side financial events — walletObjectExtractor routes these to
  // Wallet/BalanceHistory natively, so the client-side wallet check
  // (href '/wallet*') keeps every returned row.
  activity: ['payout_processed', 'refund_completed'],
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
