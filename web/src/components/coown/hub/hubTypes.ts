'use client';

import { DATA_MODE } from '@/lib/api/client';
import { coOwnMarkGbp } from '@/lib/contracts/coown';
import type {
  AssetLifecycleState,
  CoOwnAsset,
} from '@/lib/contracts/coown';
import type { CoOwnMarketsSort } from '@/lib/hooks/coown-hub-queries';

export const ALL_SEGMENTS = 'All';

// Native hub grammar: Offerings are initial allocations, Trading is the
// secondary market, Watchlist is the viewer's own queue.
export type HubView = 'offerings' | 'trading' | 'watchlist';

export type HubSortKey = CoOwnMarketsSort;

export const HUB_SORTS: { value: HubSortKey; label: string }[] = [
  { value: 'volume', label: 'Volume' },
  { value: 'newest', label: 'Newest' },
  ...(DATA_MODE === 'live' ? [] : [{ value: 'movers' as HubSortKey, label: 'Movers' }]),
  { value: 'price_desc', label: 'Price ↓' },
  { value: 'price_asc', label: 'Price ↑' },
];

export const INFORMATIVE_TAG_STATES: Record<HubView, readonly AssetLifecycleState[]> = {
  offerings: ['tradingPaused', 'exitUnderway'],
  trading: ['tradingPaused', 'exitUnderway'],
  watchlist: ['initialOffering', 'tradingPaused', 'exitUnderway'],
};

export function sortMarkets(rows: CoOwnAsset[], sort: HubSortKey): CoOwnAsset[] {
  const list = [...rows];
  switch (sort) {
    case 'newest':
      return list.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    case 'movers':
      return list.sort(
        (a, b) => Math.abs(b.marketMovePct24h ?? 0) - Math.abs(a.marketMovePct24h ?? 0),
      );
    case 'price_desc':
      return list.sort((a, b) => coOwnMarkGbp(b) - coOwnMarkGbp(a));
    case 'price_asc':
      return list.sort((a, b) => coOwnMarkGbp(a) - coOwnMarkGbp(b));
    case 'volume':
    default:
      return list.sort((a, b) => (b.volume24hGbp ?? -1) - (a.volume24hGbp ?? -1));
  }
}

export function matchesQuery(a: CoOwnAsset, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return (
    a.title.toLowerCase().includes(needle) ||
    (a.subtitle ?? '').toLowerCase().includes(needle) ||
    a.issuer.username.toLowerCase().includes(needle)
  );
}
