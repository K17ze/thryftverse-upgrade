import { resolveAuctionTiming, formatCountdown, type AuctionTimingInput, type AuctionEffectiveState } from '../hooks/useServerClock';

export type AuctionViewerState = 'not_participating' | 'watching' | 'leading' | 'outbid' | 'won' | 'lost' | 'seller';

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
  viewerState: AuctionViewerState;
  isWatched: boolean;
  winnerBidderId: string | null;
  cancelledAt: string | null;
  settledAt: string | null;
  lifecycle: string;
  terminalReason: string | null;
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
  return formatFromFiat(amount, 'GBP', { displayMode: 'fiat' });
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
    case 'upcoming':
      return `Starts in ${formatDurationShort(timing.msToStart)}`;
    case 'live':
      return `${formatDurationShort(timing.msToEnd)} left`;
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
