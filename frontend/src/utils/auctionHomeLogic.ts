import { resolveAuctionTiming, formatCountdown, type AuctionTimingInput, type AuctionEffectiveState } from '../hooks/useServerClock';
import type { AuctionScope, AuctionSortMode, MarketAuction, AttentionReason, CategoryWorld, AuctionHomeActivity, SellerSummary } from '../services/marketApi';
import { DEFAULT_CURRENCY_CODE } from '../constants/currencies';

export type AuctionViewerState = 'not_participating' | 'watching' | 'leading' | 'outbid' | 'won' | 'lost' | 'seller';

// ── Canonical browse state (Phase 2 — one taxonomy, not three) ──

export type AuctionBrowseSort = 'recommended' | AuctionSortMode;

export interface AuctionBrowseState {
  scope: AuctionScope;
  sort: AuctionBrowseSort;
  categories: string[];
  priceMin?: number;
  priceMax?: number;
  query?: string;
}

export const DEFAULT_BROWSE_STATE: AuctionBrowseState = {
  scope: 'live',
  sort: 'recommended',
  categories: [],
};

export function hasActiveFilters(state: AuctionBrowseState): boolean {
  return (
    state.sort !== 'recommended' ||
    state.categories.length > 0 ||
    state.priceMin != null ||
    state.priceMax != null ||
    (state.query != null && state.query.trim().length > 0)
  );
}

export function scopeToApiStatus(scope: AuctionScope): 'live' | 'scheduled' | 'ended' | 'all' | undefined {
  switch (scope) {
    case 'live': return 'live';
    case 'upcoming': return 'scheduled';
    case 'results': return 'ended';
    case 'watching': return undefined;
  }
}

export function scopeUsesWatchedOnly(scope: AuctionScope): boolean {
  return scope === 'watching';
}

export function sortToApiSort(sort: AuctionBrowseSort): AuctionSortMode | undefined {
  if (sort === 'recommended') return undefined;
  return sort;
}

export interface AuctionHomeItem {
  id: string;
  listingId: string;
  sellerId: string;
  sellerUsername: string;
  sellerDisplayName: string | null;
  sellerAvatarUrl: string | null;
  title: string;
  imageUrl: string;
  brand: string | null;
  startsAt: string;
  endsAt: string;
  startingBidGbp: number;
  currentBidGbp: number;
  minimumNextBidGbp: number;
  bidCount: number;
  buyNowPriceGbp: number | null;
  reservePriceGbp: number | null;
  viewerState: AuctionViewerState;
  isWatched: boolean;
  winnerBidderId: string | null;
  cancelledAt: string | null;
  settledAt: string | null;
  lifecycle: string;
  terminalReason: string | null;
  category?: string | null;
}

// ── Urgency thresholds (defined once) ──

const URGENCY_FINAL_MINUTES_MS = 5 * 60 * 1000;
const URGENCY_ENDING_SOON_MS = 60 * 60 * 1000;

export type UrgencyLevel = 'none' | 'endingSoon' | 'finalMinutes';

export function resolveUrgency(timing: { effectiveState: AuctionEffectiveState; msToEnd: number }): UrgencyLevel {
  if (timing.effectiveState !== 'live') return 'none';
  if (timing.msToEnd <= URGENCY_FINAL_MINUTES_MS) return 'finalMinutes';
  if (timing.msToEnd <= URGENCY_ENDING_SOON_MS) return 'endingSoon';
  return 'none';
}

// ── Price label resolver ──

export type PriceLabel = 'Starting bid' | 'Current bid' | 'Final bid' | 'No bids';

export function resolvePriceLabel(item: AuctionHomeItem, timing: { effectiveState: AuctionEffectiveState }): PriceLabel {
  if (timing.effectiveState === 'cancelled') {
    return item.bidCount > 0 ? 'Final bid' : 'No bids';
  }
  if (timing.effectiveState === 'settled' || timing.effectiveState === 'ended') {
    return item.bidCount > 0 ? 'Final bid' : 'No bids';
  }
  if (timing.effectiveState === 'upcoming') {
    return 'Starting bid';
  }
  return item.bidCount > 0 ? 'Current bid' : 'Starting bid';
}

export function resolvePriceText(
  item: AuctionHomeItem,
  timing: { effectiveState: AuctionEffectiveState },
  priceLabel: PriceLabel,
  formatFromFiat: (amount: number, currency?: any, opts?: any) => string
): string {
  if (priceLabel === 'No bids') return 'No bids';
  const amount = item.bidCount > 0 ? item.currentBidGbp : item.startingBidGbp;
  return formatFromFiat(amount, DEFAULT_CURRENCY_CODE);
}

export function resolvePriceDisplay(
  item: AuctionHomeItem,
  timing: { effectiveState: AuctionEffectiveState },
  formatFromFiat: (amount: number, currency?: any, opts?: any) => string
): { label: PriceLabel; text: string } {
  const label = resolvePriceLabel(item, timing);
  const text = resolvePriceText(item, timing, label, formatFromFiat);
  return { label, text };
}

// ── Time label resolver ──

export function resolveTimeLabel(timing: { effectiveState: AuctionEffectiveState; msToStart: number; msToEnd: number }): string {
  switch (timing.effectiveState) {
    case 'cancelled':
      return 'Cancelled';
    case 'settled':
      return 'Settled';
    case 'ended':
      return 'Ended';
    case 'reserve_not_met':
      return 'Reserve not met';
    case 'awaiting_payment':
      return 'Awaiting payment';
    case 'payment_expired':
      return 'Payment expired';
    case 'second_chance_offered':
      return 'Second chance';
    case 'upcoming':
      return `Starts in ${formatDurationShort(timing.msToStart)}`;
    case 'live':
      return `${formatDurationShort(timing.msToEnd)} left`;
    default:
      return '';
  }
}

function formatDurationShort(ms: number): string {
  if (ms <= 0) return '0m';
  const totalMinutes = Math.floor(ms / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function formatFinalMinutesCountdown(ms: number): string {
  if (ms <= 0) return 'Ended';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

// ── Viewer state presentation ──

export interface ViewerStatePresentation {
  text: string;
  colorKey: 'danger' | 'brand' | 'success' | 'textSecondary' | 'textMuted';
  icon: string;
  priority: number;
}

export function resolveViewerStatePresentation(state: AuctionViewerState): ViewerStatePresentation | null {
  switch (state) {
    case 'outbid':
      return { text: 'Outbid', colorKey: 'danger', icon: 'trending-up-outline', priority: 1 };
    case 'leading':
      return { text: 'Leading', colorKey: 'success', icon: 'trophy-outline', priority: 2 };
    case 'won':
      return { text: 'Won', colorKey: 'success', icon: 'trophy', priority: 3 };
    case 'lost':
      return { text: 'Lost', colorKey: 'textMuted', icon: 'close-circle-outline', priority: 5 };
    case 'watching':
      return { text: 'Watching', colorKey: 'textSecondary', icon: 'eye-outline', priority: 6 };
    case 'seller':
      return { text: 'Your auction', colorKey: 'brand', icon: 'storefront-outline', priority: 4 };
    case 'not_participating':
      return null;
  }
}

// ── Attention resolver ──

export function isAttentionItem(item: AuctionHomeItem, nowMs: number): boolean {
  const timing = resolveAuctionTiming(item as AuctionTimingInput, nowMs);
  if (timing.effectiveState === 'cancelled') return false;
  if (timing.effectiveState === 'settled') return false;
  if (timing.effectiveState === 'ended') {
    if (item.viewerState === 'won') return true;
    return false;
  }
  if (timing.effectiveState === 'live' && item.viewerState === 'outbid') return true;
  return false;
}

export function isEndingSoon(item: AuctionHomeItem, nowMs: number): boolean {
  const timing = resolveAuctionTiming(item as AuctionTimingInput, nowMs);
  if (timing.effectiveState !== 'live') return false;
  return timing.msToEnd > 0 && timing.msToEnd <= URGENCY_ENDING_SOON_MS;
}

// ── Deduplication: canonical unique map before attention filtering ──

export function buildCanonicalMap(collections: AuctionHomeItem[][]): Map<string, AuctionHomeItem> {
  const map = new Map<string, AuctionHomeItem>();
  for (const collection of collections) {
    for (const item of collection) {
      if (!map.has(item.id)) {
        map.set(item.id, item);
      }
    }
  }
  return map;
}

// ── Seller initials fallback ──

export function getSellerInitials(displayName: string | null, username: string): string {
  const name = displayName ?? username;
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

// ── Accessibility label builder ──

export function buildAuctionAccessibilityLabel(
  item: AuctionHomeItem,
  timing: { effectiveState: AuctionEffectiveState; msToStart: number; msToEnd: number },
  priceLabel: PriceLabel,
  priceText: string
): string {
  const timeLabel = resolveTimeLabel(timing);
  const viewerPresentation = resolveViewerStatePresentation(item.viewerState);
  const viewerText = viewerPresentation ? `, ${viewerPresentation.text}` : '';
  const bidText = item.bidCount > 0 ? `, ${item.bidCount} bids` : '';
  if (priceLabel === 'No bids') {
    return `${item.title}, No bids${viewerText}, ${timeLabel}`;
  }
  return `${item.title}, ${priceLabel} ${priceText}${viewerText}, ${timeLabel}${bidText}`;
}

// ── PASS 2: Server-time fallback selection ──

export interface ServerTimeSource {
  serverNow: string | null;
}

export function selectFirstServerTime<T extends ServerTimeSource>(
  sources: T[]
): string | null {
  for (const s of sources) {
    if (s.serverNow) return s.serverNow;
  }
  return null;
}

// ── PASS 2: All-failed detection ──

export function isAllRejected(results: PromiseSettledResult<unknown>[]): boolean {
  return results.length > 0 && results.every(r => r.status === 'rejected');
}

export function fulfilledCount(results: PromiseSettledResult<unknown>[]): number {
  return results.filter(r => r.status === 'fulfilled').length;
}

// ── PASS 3: Section load state ──

export type SectionLoadState =
  | { status: 'ready'; items: AuctionHomeItem[] }
  | { status: 'empty'; items: [] }
  | { status: 'error'; items: [] };

export function makeSectionLoadState(items: AuctionHomeItem[], hasError: boolean): SectionLoadState {
  if (hasError) return { status: 'error', items: [] };
  if (items.length === 0) return { status: 'empty', items: [] };
  return { status: 'ready', items };
}

// ── PASS 4: Search state model ──

export type SearchStatus = 'idle' | 'loading' | 'ready' | 'empty' | 'error';

export interface AuctionSearchState {
  query: string;
  status: SearchStatus;
  items: AuctionHomeItem[];
  cursor: string | null;
}

export const IDLE_SEARCH_STATE: AuctionSearchState = {
  query: '',
  status: 'idle',
  items: [],
  cursor: null,
};

export function createSearchState(
  query: string,
  status: SearchStatus,
  items: AuctionHomeItem[] = [],
  cursor: string | null = null
): AuctionSearchState {
  return { query, status, items, cursor };
}

// ── API → view-model mapper ──

export function toViewModel(api: MarketAuction): AuctionHomeItem {
  return {
    id: api.id,
    listingId: api.listingId,
    sellerId: api.seller.id,
    sellerUsername: api.seller.username,
    sellerDisplayName: api.seller.displayName,
    sellerAvatarUrl: api.seller.avatarUrl,
    title: api.title,
    imageUrl: api.imageUrl ?? '',
    brand: api.brand,
    startsAt: api.startsAt,
    endsAt: api.endsAt,
    startingBidGbp: api.startingBidGbp,
    currentBidGbp: api.currentBidGbp,
    minimumNextBidGbp: api.minimumNextBidGbp,
    bidCount: api.bidCount,
    buyNowPriceGbp: api.buyNowPriceGbp,
    reservePriceGbp: api.reservePriceGbp ?? null,
    viewerState: api.viewerState,
    isWatched: api.isWatched,
    winnerBidderId: api.winnerBidderId ?? null,
    cancelledAt: api.cancelledAt ?? null,
    settledAt: api.settledAt ?? null,
    lifecycle: api.lifecycle,
    terminalReason: api.terminalReason,
    category: api.category,
  };
}

// ── Home data shape from /auctions/home ──

export interface HomeData {
  attentionItem: AuctionHomeItem | null;
  attentionReason: AttentionReason;
  activity: AuctionHomeActivity;
  closingSoon: AuctionHomeItem[];
  live: AuctionHomeItem[];
  upcoming: AuctionHomeItem[];
  categoryWorlds: CategoryWorld[];
  recentlyClosed: AuctionHomeItem[];
  sellerSummary?: SellerSummary;
  sellerAuctions: AuctionHomeItem[];
  watchlist: AuctionHomeItem[];
  serverNow: string | null;
}

export const EMPTY_HOME_DATA: HomeData = {
  attentionItem: null,
  attentionReason: null,
  activity: { activeCount: 0, needsAttentionCount: 0, leadingCount: 0, outbidCount: 0, watchingCount: 0, unresolvedWonCount: 0 },
  closingSoon: [],
  live: [],
  upcoming: [],
  categoryWorlds: [],
  recentlyClosed: [],
  sellerAuctions: [],
  watchlist: [],
  serverNow: null,
};

// ── Filter sheet options ──

export const SORT_OPTIONS: { key: AuctionBrowseSort; label: string }[] = [
  { key: 'recommended', label: 'Recommended' },
  { key: 'endingSoon', label: 'Ending soon' },
  { key: 'newest', label: 'Newest' },
  { key: 'mostBids', label: 'Most bids' },
  { key: 'priceLow', label: 'Price: low to high' },
  { key: 'priceHigh', label: 'Price: high to low' },
];

export const PRICE_PRESETS: { label: string; min?: number; max?: number }[] = [
  { label: 'Under £50', max: 50 },
  { label: '£50 – £200', min: 50, max: 200 },
  { label: '£200 – £500', min: 200, max: 500 },
  { label: 'Over £500', min: 500 },
];
