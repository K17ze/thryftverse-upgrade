import { resolveAuctionTiming } from '../../hooks/useServerClock';
import { resolveUrgency } from '../../utils/auctionHomeLogic';
import type { ThemeColors } from '../../theme/ThemeContext';
import {
  type AuctionHomeItem } from '../../utils/auctionHomeLogic';
import {
  type MarketAuction } from '../../services/marketApi';
import { sellerAuctionBucket, type SellerAuctionBucket } from '../../utils/sellerAuctionState';

export type SellerTab = SellerAuctionBucket;

/**
 * Flattened list item model.
 *
 * The original SectionList rendered a single section per active tab, with the
 * tab rail as a sticky section header. FlashList has no native concept of
 * sections, so the section is materialised as a discriminated header item
 * followed by its row items in a flat `data` array.
 */
export type SectionHeaderItem = { type: 'header'; sectionTitle: SellerTab };
export type SectionRowItem = { type: 'item' } & AuctionHomeItem;
export type SectionEmptyItem = { type: 'empty' };
export type FlatListItem = SectionHeaderItem | SectionRowItem | SectionEmptyItem;

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
    terminalReason: api.terminalReason };
}

export interface SellerStats {
  total: number;
  pending: number;
  live: number;
  scheduled: number;
  sold: number;
  unsold: number;
  cancelled: number;
  totalBids: number;
  highestBid: number;
}

export function computeStats(items: AuctionHomeItem[], clockMs: number): SellerStats {
  let pending = 0, live = 0, scheduled = 0, sold = 0, unsold = 0, cancelled = 0, totalBids = 0, highestBid = 0;
  for (const item of items) {
    const timing = resolveAuctionTiming(item, clockMs);
    const bucket = sellerAuctionBucket(timing.effectiveState, item.bidCount);
    if (bucket === 'live') live++;
    else if (bucket === 'scheduled') scheduled++;
    else if (bucket === 'cancelled') cancelled++;
    else if (bucket === 'sold') sold++;
    else if (bucket === 'unsold') unsold++;
    else pending++;
    totalBids += item.bidCount;
    if (item.currentBidGbp > highestBid) highestBid = item.currentBidGbp;
  }
  return { total: items.length, pending, live, scheduled, sold, unsold, cancelled, totalBids, highestBid };
}

// ── Terminal reason mapping — never expose raw backend enums ──
const TERMINAL_REASON_MAP: Record<string, string> = {
  seller_cancelled: 'Cancelled by seller',
  policy_violation: 'Cancelled after review',
  payment_failure: 'Payment was not completed',
  admin_cancelled: 'Cancelled after review',
  duplicate_listing: 'Cancelled after review',
  prohibited_item: 'Cancelled after review' };

function mapTerminalReason(reason: string | null): string {
  if (!reason) return 'Cancelled';
  return TERMINAL_REASON_MAP[reason] ?? 'Cancelled';
}

// ── State-specific presentation config ──
export interface StatePresentation {
  stateLabel: string;
  stateColor: string;
  /** Leading operational line — the most important fact for this state */
  leadingLabel: string;
  leadingColor: string;
  /** One truthful next action */
  actionLabel: string;
  /** Whether to show the live signal dot on the image */
  showLiveDot: boolean;
  /** Whether to use danger colour for state text (genuine final urgency only) */
  useDangerState: boolean;
}

export function resolveStatePresentation(
  item: AuctionHomeItem,
  timing: ReturnType<typeof resolveAuctionTiming>,
  urgency: ReturnType<typeof resolveUrgency>,
  timeLabel: string,
  colors: ThemeColors,
): StatePresentation {
  const isCancelled = timing.effectiveState === 'cancelled' || item.cancelledAt;
  const bucket = sellerAuctionBucket(timing.effectiveState, item.bidCount);
  const isSold = bucket === 'sold';
  const isUnsold = bucket === 'unsold';
  const isLive = timing.effectiveState === 'live';
  const isScheduled = timing.effectiveState === 'upcoming';

  if (isCancelled) {
    return {
      stateLabel: 'Cancelled',
      stateColor: colors.textMuted,
      leadingLabel: mapTerminalReason(item.terminalReason),
      leadingColor: colors.textMuted,
      actionLabel: 'View details',
      showLiveDot: false,
      useDangerState: false };
  }
  if (bucket === 'pending') {
    return {
      stateLabel: 'Pending', stateColor: colors.textSecondary,
      leadingLabel: timing.effectiveState === 'awaiting_payment' ? 'Awaiting payment'
        : timing.effectiveState === 'second_chance_offered' ? 'Second chance offered' : 'Result awaiting confirmation',
      leadingColor: colors.textSecondary, actionLabel: 'Review result',
      showLiveDot: false, useDangerState: false,
    };
  }
  if (isSold) {
    return {
      stateLabel: 'Sold',
      stateColor: colors.success,
      leadingLabel: `Sold · ${item.bidCount} ${item.bidCount === 1 ? 'bid' : 'bids'}`,
      leadingColor: colors.textSecondary,
      actionLabel: 'View sale',
      showLiveDot: false,
      useDangerState: false };
  }
  if (isUnsold) {
    return {
      stateLabel: 'Unsold',
      stateColor: colors.textMuted,
      leadingLabel: timing.effectiveState === 'reserve_not_met' ? 'Reserve not met' : timing.effectiveState === 'payment_expired' ? 'Payment expired' : 'No bids received',
      leadingColor: colors.textMuted,
      actionLabel: 'Review result',
      showLiveDot: false,
      useDangerState: false };
  }
  if (isLive) {
    const finalUrgency = urgency === 'finalMinutes';
    return {
      stateLabel: finalUrgency ? 'Ending' : 'Live',
      stateColor: finalUrgency ? colors.danger : colors.textPrimary,
      leadingLabel: timeLabel,
      leadingColor: finalUrgency ? colors.danger : colors.textSecondary,
      actionLabel: 'View bids',
      showLiveDot: true,
      useDangerState: finalUrgency };
  }
  if (isScheduled) {
    return {
      stateLabel: 'Scheduled',
      stateColor: colors.textSecondary,
      leadingLabel: timeLabel,
      leadingColor: colors.textSecondary,
      actionLabel: 'View schedule',
      showLiveDot: false,
      useDangerState: false };
  }
  return {
    stateLabel: 'Ended',
    stateColor: colors.textMuted,
    leadingLabel: timeLabel,
    leadingColor: colors.textMuted,
    actionLabel: 'Review result',
    showLiveDot: false,
    useDangerState: false };
}

export function buildSellerTabs(stats: SellerStats): { key: SellerTab; label: string; count: number }[] {
  return [
    { key: 'scheduled', label: 'Scheduled', count: stats.scheduled },
    { key: 'live', label: 'Live', count: stats.live },
    { key: 'pending', label: 'Pending', count: stats.pending },
    { key: 'sold', label: 'Sold', count: stats.sold },
    { key: 'unsold', label: 'Unsold', count: stats.unsold },
    { key: 'cancelled', label: 'Cancelled', count: stats.cancelled },
  ];
}
