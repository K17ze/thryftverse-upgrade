import type { NotificationPrefKey, NotifChannel } from '@/lib/store/settingsPrefs';

export interface PrefRowDef {
  key: NotificationPrefKey;
  label: string;
  sub: string;
  /** Channels this category actually delivers on (mobile parity). */
  push?: boolean;
  email?: boolean;
  /** Always-on categories the member can't switch off. */
  locked?: boolean;
}

export interface PrefGroupDef {
  title: string;
  rows: PrefRowDef[];
}

export const GROUPS: PrefGroupDef[] = [
  {
    title: 'Essential',
    rows: [
      {
        key: 'securityAlerts',
        label: 'Security alerts',
        sub: 'Sign-ins, password and payout changes — always on',
        email: true,
        locked: true,
      },
    ],
  },
  {
    title: 'Orders & fulfilment',
    rows: [
      {
        key: 'orderUpdates',
        label: 'Order updates',
        sub: 'Purchases, sales and delivery status',
        push: true,
        email: true,
      },
      {
        key: 'fulfilmentReminders',
        label: 'Dispatch reminders',
        sub: 'Deadlines on items you’ve sold',
        push: true,
      },
    ],
  },
  {
    title: 'Marketplace',
    rows: [
      { key: 'likes', label: 'Likes', sub: 'When someone favourites your item', push: true },
      {
        key: 'offers',
        label: 'Offers',
        sub: 'Offers and counter-offers on your items',
        push: true,
      },
      {
        key: 'priceDrops',
        label: 'Price drops',
        sub: 'Wishlisted items going cheaper',
        push: true,
        email: true,
      },
      {
        key: 'savedSearchAlerts',
        label: 'Saved-search alerts',
        sub: 'New listings matching your saved searches',
        push: true,
        email: true,
      },
    ],
  },
  {
    title: 'Social',
    rows: [
      { key: 'followers', label: 'New followers', sub: 'When someone follows you', push: true },
      {
        key: 'comments',
        label: 'Comments & mentions',
        sub: 'Replies and mentions on your posts',
        push: true,
      },
      {
        key: 'messages',
        label: 'Messages',
        sub: 'Chat replies and offer messages',
        push: true,
        email: true,
      },
    ],
  },
  {
    title: 'Co-Own & auctions',
    rows: [
      {
        key: 'auctionAlerts',
        label: 'Auction alerts',
        sub: 'Outbid, ending soon and auction results',
        push: true,
        email: true,
      },
      {
        key: 'coownDistributions',
        label: 'Distribution notices',
        sub: 'Payouts on assets you co-own',
        email: true,
      },
      {
        key: 'coownCorporateActions',
        label: 'Corporate actions',
        sub: 'Votes and asset events',
        email: true,
      },
    ],
  },
  {
    title: 'Marketing',
    rows: [
      {
        key: 'marketing',
        label: 'News & promotions',
        sub: 'Features, events and member offers',
        push: true,
        email: true,
      },
    ],
  },
];

export const CHANNEL_KEYS: Record<NotifChannel, NotificationPrefKey[]> = {
  push: GROUPS.flatMap((g) => g.rows.filter((r) => r.push && !r.locked).map((r) => r.key)),
  email: GROUPS.flatMap((g) => g.rows.filter((r) => r.email && !r.locked).map((r) => r.key)),
};

export function formatHour(h: number): string {
  if (h === 0) return '12 AM';
  if (h < 12) return `${h} AM`;
  if (h === 12) return '12 PM';
  return `${h - 12} PM`;
}

export const HOURS = Array.from({ length: 24 }, (_, i) => i);
