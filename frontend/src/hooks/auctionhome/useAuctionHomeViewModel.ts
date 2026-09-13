import React, { useEffect, useMemo, useRef } from 'react';
import { useAppTheme } from '../../theme/ThemeContext';
import { resolveAuctionTiming } from '../useServerClock';
import {
  resolveTimeLabel,
  resolveUrgency,
  formatFinalMinutesCountdown,
  type AuctionHomeItem,
  type AuctionBrowseState,
  type AuctionBrowseSort,
  type HomeData } from '../../utils/auctionHomeLogic';
import type { AuctionFacets } from '../../services/marketApi';
import type { AuctionAttentionStrip, Segment } from '../../components/auction';

export interface AuctionFilterChip {
  key: string;
  label: string;
  type: 'sort' | 'category' | 'priceMin' | 'priceMax' | 'query';
  value?: string;
}

export type AuctionAttentionProps = React.ComponentProps<typeof AuctionAttentionStrip>;

export interface UseAuctionHomeViewModelResult {
  categoryOptions: string[];
  categoryLabels: Record<string, string>;
  categoryCounts: Record<string, number>;
  filterResultCount: number | undefined;
  activeFilterChips: AuctionFilterChip[];
  hasActiveMarket: boolean;
  hasAnyContent: boolean;
  dedupedWatchlist: AuctionHomeItem[];
  scopeSegments: Segment[];
  headerContext: string | undefined;
  compactHeaderContext: string | undefined;
  attentionProps: AuctionAttentionProps | null;
  scopeItems: AuctionHomeItem[];
  exploreFeedItems: AuctionHomeItem[];
}

/**
 * All derived view-model state for Auction Home: facet-driven filter
 * options, active filter chips, scope rail segments, header context,
 * the attention strip props, the selected scope's items, and the
 * deduplicated "More to explore" feed. Also owns the one-shot default
 * scope selection effect.
 */
export function useAuctionHomeViewModel({
  homeData,
  facets,
  loading,
  browseState,
  draftBrowse,
  secondClock,
  minuteClock,
  currencySymbol,
  setBrowseState,
  onOpenAuction,
  onOpenActivity,
}: {
  homeData: HomeData;
  facets: AuctionFacets | null;
  loading: boolean;
  browseState: AuctionBrowseState;
  draftBrowse: AuctionBrowseState;
  secondClock: number;
  minuteClock: number;
  currencySymbol: string;
  setBrowseState: React.Dispatch<React.SetStateAction<AuctionBrowseState>>;
  onOpenAuction: (auctionId: string) => void;
  onOpenActivity: () => void;
}): UseAuctionHomeViewModelResult {
  const { colors } = useAppTheme();
  const hasSetDefaultScope = useRef(false);

  // ── Category options for filter sheet ──
  // Prefer server-driven facets (canonical endpoint) over derived inventory.
  // Falls back to derived categories only if facets are unavailable.
  const categoryOptions = useMemo(() => {
    if (facets && facets.categories.length > 0) {
      return facets.categories.map((c) => c.id);
    }
    const cats = new Set<string>();
    [...homeData.live, ...homeData.upcoming, ...homeData.recentlyClosed].forEach((a) => {
      if (a.category) cats.add(a.category);
    });
    return Array.from(cats).sort();
  }, [facets, homeData]);

  // ── Category labels from facets (canonical display names) ──
  const categoryLabels = useMemo(() => {
    const map: Record<string, string> = {};
    if (facets) {
      for (const c of facets.categories) {
        map[c.id] = c.label;
      }
    }
    return map;
  }, [facets]);

  // ── Category counts from facets (2026: show counts next to each option) ──
  const categoryCounts = useMemo(() => {
    const map: Record<string, number> = {};
    if (facets) {
      for (const c of facets.categories) {
        map[c.id] = c.count;
      }
    }
    return map;
  }, [facets]);

  // ── Result count for filter sheet CTA ──
  // Uses statusCounts from facets when available, otherwise falls back to
  // the active filter count.
  const filterResultCount = useMemo(() => {
    if (facets) {
      return facets.statusCounts[draftBrowse.scope] ?? 0;
    }
    return undefined;
  }, [facets, draftBrowse.scope]);

  // ── Active filter chips (individually removable) ──
  const activeFilterChips = useMemo(() => {
    const chips: AuctionFilterChip[] = [];
    if (browseState.sort !== 'recommended') {
      const sortLabels: Record<AuctionBrowseSort, string> = {
        recommended: 'Recommended',
        endingSoon: 'Ending soon',
        newest: 'Newest',
        mostBids: 'Most bids',
        priceLow: 'Price: low to high',
        priceHigh: 'Price: high to low' };
      chips.push({ key: 'sort', label: sortLabels[browseState.sort], type: 'sort' });
    }
    for (const cat of browseState.categories) {
      const label = categoryLabels[cat] ?? cat;
      chips.push({ key: `cat-${cat}`, label: `Category: ${label}`, type: 'category', value: cat });
    }
    if (browseState.priceMin != null) {
      chips.push({ key: 'priceMin', label: `Over ${currencySymbol}${browseState.priceMin}`, type: 'priceMin' });
    }
    if (browseState.priceMax != null) {
      chips.push({ key: 'priceMax', label: `Under ${currencySymbol}${browseState.priceMax}`, type: 'priceMax' });
    }
    if (browseState.query && browseState.query.trim().length > 0) {
      chips.push({ key: 'query', label: `"${browseState.query}"`, type: 'query' });
    }
    return chips;
  }, [browseState, categoryLabels, currencySymbol]);

  // ── Derived values (MUST be before any conditional return) ──
  const hasActiveMarket =
    homeData.closingSoon.length > 0 ||
    homeData.live.length > 0 ||
    homeData.upcoming.length > 0;

  const hasPersonalActivity =
    homeData.activity.activeCount > 0 ||
    homeData.activity.needsAttentionCount > 0 ||
    !!homeData.attentionItem;

  const spotlightIds = useMemo(() => {
    const ids = new Set<string>();
    homeData.closingSoon.forEach((a) => ids.add(a.id));
    homeData.live.forEach((a) => ids.add(a.id));
    return ids;
  }, [homeData.closingSoon, homeData.live]);

  const dedupedWatchlist = useMemo(
    () => homeData.watchlist
      .filter((a) => !spotlightIds.has(a.id))
      .sort((a, b) => {
        // Urgency sort: ending soonest first, then upcoming soonest.
        // Ended/cancelled items sink to the bottom.
        // Uses the server-aligned minuteClock so the sort stays accurate
        // even if the device clock drifts, and recomputes every minute
        // as auctions transition between live/upcoming/ended states.
        const aEnd = new Date(a.endsAt).getTime();
        const bEnd = new Date(b.endsAt).getTime();
        const aStart = new Date(a.startsAt).getTime();
        const bStart = new Date(b.startsAt).getTime();
        const now = minuteClock;
        const aLive = aEnd > now && aStart <= now;
        const bLive = bEnd > now && bStart <= now;
        const aUpcoming = aStart > now;
        const bUpcoming = bStart > now;
        // Live items first (sorted by soonest end), then upcoming (sorted by soonest start), then ended
        if (aLive && !bLive) return -1;
        if (!aLive && bLive) return 1;
        if (aLive && bLive) return aEnd - bEnd;
        if (aUpcoming && !bUpcoming) return -1;
        if (!aUpcoming && bUpcoming) return 1;
        if (aUpcoming && bUpcoming) return aStart - bStart;
        return 0; // both ended — preserve server order
      }),
    [homeData.watchlist, spotlightIds, minuteClock]
  );

  const hasAnyContent =
    hasActiveMarket ||
    hasPersonalActivity ||
    homeData.recentlyClosed.length > 0 ||
    homeData.categoryWorlds.length > 0 ||
    dedupedWatchlist.length > 0;

  // ── Default scope selection ──
  useEffect(() => {
    if (loading || hasSetDefaultScope.current) return;
    if (homeData.live.length > 0 || homeData.closingSoon.length > 0) setBrowseState((prev) => ({ ...prev, scope: 'live' }));
    else if (homeData.upcoming.length > 0) setBrowseState((prev) => ({ ...prev, scope: 'upcoming' }));
    else if (homeData.recentlyClosed.length > 0) setBrowseState((prev) => ({ ...prev, scope: 'results' }));
    else if (dedupedWatchlist.length > 0) setBrowseState((prev) => ({ ...prev, scope: 'watching' }));
    hasSetDefaultScope.current = true;
  }, [loading, homeData, dedupedWatchlist]);

  // ── Scope rail — one canonical taxonomy: Live | Upcoming | Results | Watching ──
  // Each scope carries a distinct accent color so lifecycle phases are
  // visually distinguishable at a glance:
  //   Live     → danger (urgent/warm — active bidding)
  //   Upcoming → brand  (neutral/calm — scheduled)
  //   Results  → textMuted (muted/gray — ended)
  //   Watching → textSecondary (restrained — personal)
  const scopeSegments: Segment[] = useMemo(() => [
    { key: 'live', label: 'Live', count: homeData.live.length + homeData.closingSoon.length, accentColor: colors.danger },
    { key: 'upcoming', label: 'Upcoming', count: homeData.upcoming.length, accentColor: colors.brand },
    { key: 'results', label: 'Results', count: homeData.recentlyClosed.length, accentColor: colors.textMuted },
    { key: 'watching', label: 'Watching', count: dedupedWatchlist.length, accentColor: colors.textSecondary },
  ], [homeData.live.length, homeData.closingSoon.length, homeData.upcoming.length, homeData.recentlyClosed.length, dedupedWatchlist.length, colors.danger, colors.brand, colors.textMuted, colors.textSecondary]);

  // ── Compact header context ──
  const headerContext = useMemo(() => {
    const parts: string[] = [];
    if (homeData.live.length > 0) parts.push(`${homeData.live.length} live`);
    if (homeData.closingSoon.length > 0) parts.push(`${homeData.closingSoon.length} ending`);
    if (homeData.upcoming.length > 0) parts.push(`${homeData.upcoming.length} upcoming`);
    return parts.length > 0 ? parts.join(' · ') : undefined;
  }, [homeData.live.length, homeData.closingSoon.length, homeData.upcoming.length]);

  const compactHeaderContext = useMemo(() => {
    const total = homeData.live.length + homeData.closingSoon.length + homeData.upcoming.length;
    return total > 0 ? `${total} active auctions` : undefined;
  }, [homeData.live.length, homeData.closingSoon.length, homeData.upcoming.length]);

  // ── Personal attention strip props ──
  const attentionProps = useMemo<AuctionAttentionProps | null>(() => {
    if (homeData.attentionReason === 'outbid' && homeData.attentionItem) {
      const timing = resolveAuctionTiming(homeData.attentionItem, secondClock);
      const timeLabel = resolveUrgency(timing) === 'finalMinutes'
        ? formatFinalMinutesCountdown(timing.msToEnd)
        : resolveTimeLabel(timing);
      return {
        kind: 'outbid' as const,
        title: homeData.attentionItem.title,
        imageUrl: homeData.attentionItem.imageUrl || null,
        message: timeLabel,
        actionLabel: 'Bid again',
        countdownText: timeLabel,
        onPress: () => onOpenAuction(homeData.attentionItem!.id),
        onAction: () => onOpenAuction(homeData.attentionItem!.id) };
    }
    if ((homeData.attentionReason === 'leading' || homeData.attentionReason === 'leading_ending') && homeData.attentionItem) {
      const timing = resolveAuctionTiming(homeData.attentionItem, secondClock);
      const timeLabel = resolveUrgency(timing) === 'finalMinutes'
        ? formatFinalMinutesCountdown(timing.msToEnd)
        : resolveTimeLabel(timing);
      return {
        kind: 'leading' as const,
        title: homeData.attentionItem.title,
        imageUrl: homeData.attentionItem.imageUrl || null,
        message: `Top bid · ${timeLabel}`,
        actionLabel: 'View',
        countdownText: timeLabel,
        onPress: () => onOpenAuction(homeData.attentionItem!.id),
        onAction: () => onOpenAuction(homeData.attentionItem!.id) };
    }
    if (homeData.attentionReason === 'won_action' && homeData.attentionItem) {
      return {
        kind: 'won' as const,
        title: homeData.attentionItem.title,
        imageUrl: homeData.attentionItem.imageUrl || null,
        message: 'Payment required',
        actionLabel: 'Continue',
        onPress: () => onOpenAuction(homeData.attentionItem!.id),
        onAction: () => onOpenAuction(homeData.attentionItem!.id) };
    }
    if (dedupedWatchlist.length > 0) {
      return {
        kind: 'watching' as const,
        title: `${dedupedWatchlist.length} watched auctions`,
        imageUrl: dedupedWatchlist[0]?.imageUrl || null,
        message: 'Track your watched auctions',
        actionLabel: 'View',
        onPress: () => onOpenActivity(),
        onAction: () => onOpenActivity() };
    }
    return null;
  }, [homeData.attentionReason, homeData.attentionItem, dedupedWatchlist, onOpenAuction, onOpenActivity, secondClock]);

  // ── Selected scope data (from homeData when no active filters) ──
  const scopeItems = useMemo(() => {
    switch (browseState.scope) {
      case 'live':
        // Ending soon sort uses closingSoon; otherwise live
        return browseState.sort === 'endingSoon' && homeData.closingSoon.length > 0
          ? homeData.closingSoon
          : homeData.live;
      case 'upcoming': return homeData.upcoming;
      case 'results': return homeData.recentlyClosed;
      case 'watching': return dedupedWatchlist;
      default: return [];
    }
  }, [browseState.scope, browseState.sort, homeData.live, homeData.closingSoon, homeData.upcoming, homeData.recentlyClosed, dedupedWatchlist]);

  // ── Continuous "More to explore" feed ──
  // Combines all auction items across every segment + recently closed,
  // excluding those already shown in the active segment composition above.
  // This is the feed layer — scrolling down keeps revealing more auctions.
  const exploreFeedItems = useMemo(() => {
    const seen = new Set(scopeItems.map((i) => i.id));
    const combined: AuctionHomeItem[] = [
      ...homeData.live,
      ...homeData.closingSoon,
      ...homeData.upcoming,
      ...homeData.recentlyClosed,
      ...dedupedWatchlist,
    ];
    const deduped: AuctionHomeItem[] = [];
    const feedSeen = new Set<string>();
    for (const item of combined) {
      if (seen.has(item.id) || feedSeen.has(item.id)) continue;
      feedSeen.add(item.id);
      deduped.push(item);
    }
    return deduped;
  }, [scopeItems, homeData.live, homeData.closingSoon, homeData.upcoming, homeData.recentlyClosed, dedupedWatchlist]);

  return {
    categoryOptions,
    categoryLabels,
    categoryCounts,
    filterResultCount,
    activeFilterChips,
    hasActiveMarket,
    hasAnyContent,
    dedupedWatchlist,
    scopeSegments,
    headerContext,
    compactHeaderContext,
    attentionProps,
    scopeItems,
    exploreFeedItems };
}
