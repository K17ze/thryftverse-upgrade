import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  RefreshControl,
  Pressable,
  StatusBar,
  Text,
  ScrollView,
  TextInput,
  useWindowDimensions } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { RootStackParamList } from '../navigation/types';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { resolveAuctionTiming } from '../hooks/useServerClock';
import {
  resolvePriceLabel,
  resolveTimeLabel,
  resolveUrgency,
  formatFinalMinutesCountdown,
  createSearchState,
  toViewModel,
  type AuctionHomeItem,
  type AuctionBrowseState,
  type AuctionBrowseSort,
  DEFAULT_BROWSE_STATE,
  hasActiveFilters,
  scopeToApiStatus,
  sortToApiSort } from '../utils/auctionHomeLogic';
import { HorizontalRail } from '../components/HorizontalRail';
import { EmptyState } from '../components/EmptyState';
import { OfflineBanner } from '../components/OfflineBanner';
import { useConnectivity } from '../hooks/useConnectivity';
import { haptics } from '../utils/haptics';
import { Space, Radius, LetterSpacing } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { toIze, formatIzeAmount, formatFiatAmount } from '../utils/currency';
import {
  AuctionMarketHeader,
  AuctionAttentionStrip,
  AuctionRunwayCard,
  AuctionGridCard,
  AuctionSupportingTile,
  AuctionSkeletons,
  AuctionSegmentRail,
  SegmentContentTransition,
  CategoryRailTile,
  UpcomingRow,
  ResultRow,
  FilterSheet,
  type AuctionHeaderAction,
  type Segment } from '../components/auction';
import {
  useAuctionHomeData,
  useAuctionSearch,
  useAuctionBrowse } from '../hooks/auction';
import {
  listAuctions,
  type AuctionScope } from '../services/marketApi';

type NavT = NativeStackNavigationProp<RootStackParamList>;

// ── Main screen ──
export default function AuctionHomeScreen() {
  const navigation = useNavigation<NavT>();
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { currencyCode, currencySymbol, displayMode, fxRates } = useFormattedPrice();
  const { width } = useWindowDimensions();
  const { isOffline } = useConnectivity();

  // ── Canonical browse state (one taxonomy, not three) ──
  const [browseState, setBrowseState] = useState<AuctionBrowseState>(DEFAULT_BROWSE_STATE);
  const hasSetDefaultScope = useRef(false);

  // ── Pagination error (shared by search + browse) ──
  const [paginationError, setPaginationError] = useState<string | null>(null);

  // ── Filter sheet ──
  const [filterSheetVisible, setFilterSheetVisible] = useState(false);
  const [draftBrowse, setDraftBrowse] = useState<AuctionBrowseState>(DEFAULT_BROWSE_STATE);

  // ── Home data, facets, server clock (extracted) ──
  const {
    homeData,
    loading,
    refreshing,
    setRefreshing,
    error,
    facets,
    facetsLoading,
    browseRefreshTick,
    setBrowseRefreshTick,
    fetchHome,
    secondClock,
    minuteClock } = useAuctionHomeData({ filterSheetVisible, draftBrowse });

  // ── Search (extracted) ──
  const {
    searchOverlayVisible,
    setSearchOverlayVisible,
    searchState,
    setSearchState,
    searchQuery,
    debouncedQuery,
    searchReqIdRef,
    recentSearches,
    clearRecentSearches,
    handleSearchChange,
    handleClearSearch,
    loadMoreSearch } = useAuctionSearch({ browseState, setPaginationError });

  // ── Browse results (extracted) ──
  const {
    browseResult,
    loadMoreBrowse } = useAuctionBrowse({ browseState, browseRefreshTick, setPaginationError });

  const isBrowsing = hasActiveFilters(browseState);
  const isSearching = searchState.status !== 'idle';

  const openFilterSheet = useCallback(() => {
    setDraftBrowse(browseState);
    setFilterSheetVisible(true);
  }, [browseState]);

  const applyDraftFilters = useCallback(() => {
    haptics.tap();
    setBrowseState(draftBrowse);
    setFilterSheetVisible(false);
  }, [draftBrowse]);

  const resetDraftFilters = useCallback(() => {
    haptics.tap();
    setDraftBrowse({ ...DEFAULT_BROWSE_STATE, scope: draftBrowse.scope });
  }, [draftBrowse.scope]);

  const clearAllFilters = useCallback(() => {
    haptics.tap();
    setBrowseState((prev) => ({ ...DEFAULT_BROWSE_STATE, scope: prev.scope }));
  }, []);

  const setScope = useCallback((scope: AuctionScope) => {
    haptics.selection();
    setBrowseState((prev) => ({ ...prev, scope }));
  }, []);

  const removeFilterChip = useCallback((chipType: 'sort' | 'category' | 'priceMin' | 'priceMax' | 'query', value?: string) => {
    haptics.tap();
    setBrowseState((prev) => {
      if (chipType === 'sort') return { ...prev, sort: 'recommended' };
      if (chipType === 'category') return { ...prev, categories: prev.categories.filter((c) => c !== value) };
      if (chipType === 'priceMin') return { ...prev, priceMin: undefined };
      if (chipType === 'priceMax') return { ...prev, priceMax: undefined };
      if (chipType === 'query') return { ...prev, query: undefined };
      return prev;
    });
  }, []);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    if (isSearching && debouncedQuery.trim().length > 0) {
      setPaginationError(null);
      const reqId = ++searchReqIdRef.current;
      setSearchState(createSearchState(debouncedQuery, 'loading'));
      listAuctions({ query: debouncedQuery, status: scopeToApiStatus(browseState.scope), sort: sortToApiSort(browseState.sort) ?? 'endingSoon', limit: 30 })
        .then((result) => {
          if (reqId !== searchReqIdRef.current) return;
          const items = result.items.map(toViewModel);
          setSearchState(createSearchState(debouncedQuery, items.length > 0 ? 'ready' : 'empty', items, result.nextCursor));
        })
        .catch(() => {
          if (reqId !== searchReqIdRef.current) return;
          setSearchState(createSearchState(debouncedQuery, 'error'));
        })
        .finally(() => {
          if (reqId === searchReqIdRef.current) {
            setRefreshing(false);
          }
        });
    } else if (isBrowsing) {
      setPaginationError(null);
      setBrowseRefreshTick((t) => t + 1);
      void fetchHome().finally(() => setRefreshing(false));
    } else {
      void fetchHome();
    }
  }, [fetchHome, isSearching, debouncedQuery, isBrowsing, browseState.scope, browseState.sort]);

  const navigateToDetail = useCallback((auctionId: string) => {
    navigation.navigate('AuctionDetail', { auctionId });
  }, [navigation]);

  const handleBack = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate('MainTabs');
    }
  }, [navigation]);

  const handleActivity = useCallback(() => {
    navigation.navigate('MyBids');
  }, [navigation]);

  const handleCategoryPress = useCallback((categoryKey: string) => {
    haptics.tap();
    setBrowseState((prev) => ({ ...prev, categories: [categoryKey] }));
  }, []);

  // ── Separate 1ZE + local text for the value lockup primitive ──
  // Always returns the canonical 1ZE text as izeText and local as localText.
  // In fiat-only display mode, izeText holds the local value and localText is null,
  // preserving the user's display preference.
  const formatValueLockup = useCallback((amountGbp: number): { izeText: string; localText: string | null } => {
    const izeAmount = toIze(amountGbp, 'GBP', fxRates);
    const izeText = formatIzeAmount(izeAmount, 2);
    const fiatValue = izeAmount * (fxRates?.[currencyCode] ?? 1);
    const fiatText = formatFiatAmount(fiatValue, currencyCode, 2);
    if (displayMode === 'ize') return { izeText, localText: null };
    if (displayMode === 'fiat') return { izeText: fiatText, localText: null };
    return { izeText, localText: fiatText };
  }, [fxRates, currencyCode, displayMode]);

  // ── Renderers for search/filter ──
  const renderSearchItem = useCallback(({ item }: { item: AuctionHomeItem }) => {
    const timing = resolveAuctionTiming(item, secondClock);
    const urgency = resolveUrgency(timing);
    const valueLockup = formatValueLockup(item.currentBidGbp || item.startingBidGbp);
    const timeLabel = urgency === 'finalMinutes'
      ? formatFinalMinutesCountdown(timing.msToEnd)
      : resolveTimeLabel(timing);
    return (
      <AuctionGridCard
        title={item.title}
        imageUrl={item.imageUrl || null}
        brand={item.brand ?? null}
        izeText={valueLockup.izeText}
        localText={valueLockup.localText}
        valueState={timing.effectiveState === 'ended' ? 'final' : timing.effectiveState === 'upcoming' ? 'starting' : 'current'}
        priceLabel={resolvePriceLabel(item, timing)}
        bidCount={item.bidCount}
        countdownText={timeLabel}
        urgent={urgency === 'finalMinutes' || urgency === 'endingSoon'}
        state={timing.effectiveState === 'live' ? 'live' : timing.effectiveState === 'upcoming' ? 'upcoming' : 'ended'}
        viewerState={item.viewerState}
        onPress={() => navigateToDetail(item.id)}
      />
    );
  }, [secondClock, navigateToDetail, formatValueLockup]);

  const renderFilterItem = useCallback(({ item }: { item: AuctionHomeItem }) => {
    const timing = resolveAuctionTiming(item, secondClock);
    const urgency = resolveUrgency(timing);
    const valueLockup = formatValueLockup(item.currentBidGbp || item.startingBidGbp);
    const timeLabel = urgency === 'finalMinutes'
      ? formatFinalMinutesCountdown(timing.msToEnd)
      : resolveTimeLabel(timing);
    const effectiveState = timing.effectiveState === 'live' ? 'live' : timing.effectiveState === 'upcoming' ? 'upcoming' : 'ended';
    const valueState = effectiveState === 'ended' ? 'final' : effectiveState === 'upcoming' ? 'starting' : 'current';
    return (
      <AuctionGridCard
        title={item.title}
        imageUrl={item.imageUrl || null}
        brand={item.brand ?? null}
        izeText={valueLockup.izeText}
        localText={valueLockup.localText}
        valueState={valueState}
        priceLabel={resolvePriceLabel(item, timing)}
        bidCount={item.bidCount}
        countdownText={timeLabel}
        urgent={urgency === 'finalMinutes' || urgency === 'endingSoon'}
        state={effectiveState}
        viewerState={item.viewerState}
        onPress={() => navigateToDetail(item.id)}
      />
    );
  }, [secondClock, navigateToDetail, formatValueLockup]);

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
    const chips: { key: string; label: string; type: 'sort' | 'category' | 'priceMin' | 'priceMax' | 'query'; value?: string }[] = [];
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
  }, [browseState, categoryLabels]);

  const renderLoadingState = useCallback(() => (
    <AuctionSkeletons />
  ), []);

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
  React.useEffect(() => {
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

  // ── Header actions — reduced to title + search + filter only ──
  // Per P4-09 spec: first viewport allows title/search/filter, lifecycle
  // scope, attention if real, live content. Create, Seller Centre, and
  // Activity are accessible elsewhere (tab bar, attention strip) and
  // were crowding the header with 5 actions. The attention strip
  // already surfaces real attention needs — the badge icon was redundant.
  const headerActions: AuctionHeaderAction[] = useMemo(() => [
    { key: 'search', icon: 'search-outline', label: 'Search auctions', onPress: () => { haptics.tap(); setSearchOverlayVisible(true); }, priority: 'primary' },
    { key: 'filter', icon: 'options-outline', label: 'Filter auctions', onPress: () => { haptics.tap(); openFilterSheet(); }, priority: 'secondary' },
  ], [openFilterSheet]);

  // ── Personal attention strip props ──
  const attentionProps = useMemo(() => {
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
        onPress: () => navigateToDetail(homeData.attentionItem!.id),
        onAction: () => navigateToDetail(homeData.attentionItem!.id) };
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
        onPress: () => navigateToDetail(homeData.attentionItem!.id),
        onAction: () => navigateToDetail(homeData.attentionItem!.id) };
    }
    if (homeData.attentionReason === 'won_action' && homeData.attentionItem) {
      return {
        kind: 'won' as const,
        title: homeData.attentionItem.title,
        imageUrl: homeData.attentionItem.imageUrl || null,
        message: 'Payment required',
        actionLabel: 'Continue',
        onPress: () => navigateToDetail(homeData.attentionItem!.id),
        onAction: () => navigateToDetail(homeData.attentionItem!.id) };
    }
    if (dedupedWatchlist.length > 0) {
      return {
        kind: 'watching' as const,
        title: `${dedupedWatchlist.length} watched auctions`,
        imageUrl: dedupedWatchlist[0]?.imageUrl || null,
        message: 'Track your watched auctions',
        actionLabel: 'View',
        onPress: () => handleActivity(),
        onAction: () => handleActivity() };
    }
    return null;
  }, [homeData.attentionReason, homeData.attentionItem, dedupedWatchlist, navigateToDetail, handleActivity, secondClock]);

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

  // ════════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════════

  // ── Search overlay (preserves scope) ──
  if (searchOverlayVisible) {
    const scopeLabel = browseState.scope === 'live' ? 'Live'
      : browseState.scope === 'upcoming' ? 'Upcoming'
      : browseState.scope === 'results' ? 'Results'
      : 'Watching';
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.searchOverlayHeader}>
          <Pressable
            onPress={() => { haptics.tap(); setSearchOverlayVisible(false); handleClearSearch(); }}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Close search"
          >
            <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
          </Pressable>
          <TextInput
            value={searchQuery}
            onChangeText={handleSearchChange}
            placeholder={`Search ${scopeLabel.toLowerCase()} auctions…`}
            autoFocus
            returnKeyType="search"
            placeholderTextColor={colors.textMuted}
            style={styles.searchOverlayInput}
          />
          {searchQuery.length > 0 && (
            <Pressable
              onPress={handleClearSearch}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
            >
              <Ionicons name="close-circle" size={20} color={colors.textMuted} />
            </Pressable>
          )}
        </View>

        {/* Scope context indicator */}
        <View style={styles.searchScopeContext}>
          <Text style={styles.searchScopeText}>Searching in {scopeLabel}</Text>
        </View>

        {isSearching ? (
          <FlashList
            data={searchState.items}
            keyExtractor={(item) => item.id}
            renderItem={renderSearchItem}
            numColumns={2}
            ListEmptyComponent={
              searchState.status === 'loading' ? renderLoadingState() : (
                searchState.status === 'error' ? (
                  <EmptyState icon="cloud-offline-outline" title="Search failed" subtitle="Try again" ctaLabel="Retry" onCtaPress={handleRefresh} />
                ) : (
                  <EmptyState icon="search-outline" title="No results" subtitle="Try a different search term" />
                )
              )
            }
            contentContainerStyle={styles.contentContainer}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor={colors.brand}
                colors={[colors.brand]}
                progressBackgroundColor={colors.surfaceAlt}
              />
            }
            onEndReached={loadMoreSearch}
            onEndReachedThreshold={0.25}
          />
        ) : (
          <ScrollView
            style={styles.searchIdleScroll}
            contentContainerStyle={styles.searchIdleContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Recent searches */}
            {recentSearches.length > 0 && (
              <View style={styles.searchIdleSection}>
                <View style={styles.searchIdleSectionHeader}>
                  <Text style={styles.searchIdleSectionTitle}>Recent searches</Text>
                  <Pressable
                    onPress={() => { haptics.tap(); clearRecentSearches(); }}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Clear recent searches"
                  >
                    <Text style={styles.searchIdleClearBtn}>Clear</Text>
                  </Pressable>
                </View>
                <View style={styles.searchIdleChips}>
                  {recentSearches.map((term, idx) => (
                    <Pressable
                      key={idx}
                      style={styles.searchIdleChip}
                      onPress={() => { haptics.tap(); handleSearchChange(term); }}
                      accessibilityRole="button"
                      accessibilityLabel={`Search for ${term}`}
                    >
                      <Ionicons name="time-outline" size={13} color={colors.textMuted} />
                      <Text style={styles.searchIdleChipText} numberOfLines={1}>{term}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}

            {/* Watched categories */}
            {homeData.categoryWorlds.length > 0 && (
              <View style={styles.searchIdleSection}>
                <Text style={styles.searchIdleSectionTitle}>Browse by category</Text>
                <View style={styles.searchIdleChips}>
                  {homeData.categoryWorlds.slice(0, 6).map((world) => (
                    <Pressable
                      key={world.categoryKey}
                      style={styles.searchIdleChip}
                      onPress={() => { haptics.tap(); handleSearchChange(world.displayName); }}
                      accessibilityRole="button"
                      accessibilityLabel={`Search ${world.displayName} auctions`}
                    >
                      <Ionicons name="bag-handle-outline" size={13} color={colors.textMuted} />
                      <Text style={styles.searchIdleChipText} numberOfLines={1}>{world.displayName}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}

            {/* Fallback hint when no recent searches and no categories */}
            {recentSearches.length === 0 && homeData.categoryWorlds.length === 0 && (
              <View style={styles.searchIdleFallback}>
                <Text style={styles.searchIdleHint}>Search by title, brand, or category</Text>
              </View>
            )}
          </ScrollView>
        )}
      </SafeAreaView>
    );
  }

  // ── Loading state ──
  if (loading && !homeData.attentionItem) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <AuctionMarketHeader
          title="Auctions"
          actions={headerActions}
        />
        {renderLoadingState()}
      </View>
    );
  }

  // ── Error state ──
  if (error && !homeData.attentionItem) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <AuctionMarketHeader
          title="Auctions"
          actions={headerActions}
        />
        <EmptyState
          icon="cloud-offline-outline"
          title={isOffline ? 'You are offline' : 'Unable to load'}
          subtitle={isOffline ? 'Check your connection and try again.' : 'Pull to refresh'}
          ctaLabel="Retry"
          onCtaPress={() => void fetchHome()}
        />
      </SafeAreaView>
    );
  }

  // ── Empty market state ──
  if (!hasActiveMarket && !hasAnyContent) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle={!isDark ? 'dark-content' : 'light-content'} />
        <AuctionMarketHeader
          title="Auctions"
          actions={headerActions}
        />
        <ScrollView
          contentContainerStyle={styles.emptyMarketContainer}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.brand}
              colors={[colors.brand]}
              progressBackgroundColor={colors.surfaceAlt}
            />
          }
        >
          <EmptyState
            icon="bag-handle-outline"
            title="Nothing live right now"
            subtitle="New Auctions will appear here when they are scheduled."
            ctaLabel="Create Auction"
            onCtaPress={() => { haptics.tap(); navigation.navigate('CreateAuction'); }}
          />
          {homeData.recentlyClosed.length > 0 && (
            <View style={styles.emptyMarketResultsWrap}>
              <Text style={styles.sectionTitle}>Results</Text>
              <View style={styles.resultsContainer}>
                {homeData.recentlyClosed.slice(0, 3).map((item) => (
                  <ResultRow
                    key={item.id}
                    item={item}
                    onPress={() => navigateToDetail(item.id)}
                    formatValueLockup={formatValueLockup}
                  />
                ))}
              </View>
            </View>
          )}
        </ScrollView>
        <FilterSheet
          visible={filterSheetVisible}
          onDismiss={() => setFilterSheetVisible(false)}
          categoryOptions={categoryOptions}
          categoryLabels={categoryLabels}
          categoryCounts={categoryCounts}
          draftBrowse={draftBrowse}
          setDraftBrowse={setDraftBrowse}
          onReset={resetDraftFilters}
          onApply={applyDraftFilters}
          resultCount={filterResultCount}
          facetsLoading={facetsLoading}
        />
      </View>
    );
  }

  // ── Default: restructured Auction Home ──
  const fullWidth = width - Space.md * 2;
  const gridCardWidth = (width - Space.md * 2 - Space.sm) / 2;
  const categoryCardWidth = (width - Space.md * 2 - Space.sm * 2) / 3;
  const isSmallWidth = width < 360;
  const featuredWidth = isSmallWidth ? fullWidth : fullWidth * 0.62;
  const supportingColumnWidth = isSmallWidth ? 0 : fullWidth - featuredWidth - Space.sm;

  // ── Render selected market composition (single composition per scope, no duplicate rails) ──
  const renderComposition = () => {
    if (isBrowsing) {
      // When filters are active, show API-fetched browse results in-place
      if (browseResult.status === 'loading') return renderLoadingState();
      if (browseResult.status === 'error') {
        return (
          <EmptyState
            icon="cloud-offline-outline"
            title="Filter failed"
            subtitle="Try again"
            ctaLabel="Retry"
            onCtaPress={() => setBrowseRefreshTick((t) => t + 1)}
          />
        );
      }
      if (browseResult.status === 'empty') {
        return (
          <EmptyState
            icon="filter-outline"
            title="No matches"
            subtitle="Try adjusting your filters"
            ctaLabel="Clear filters"
            onCtaPress={clearAllFilters}
          />
        );
      }
      return (
        <FlashList
          data={browseResult.items}
          keyExtractor={(item) => item.id}
          renderItem={renderFilterItem}
          numColumns={2}
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.brand}
              colors={[colors.brand]}
              progressBackgroundColor={colors.surfaceAlt}
            />
          }
          onEndReached={loadMoreBrowse}
          onEndReachedThreshold={0.25}
        />
      );
    }

    if (scopeItems.length === 0) {
      return (
        <View style={styles.compositionEmpty}>
          <Text style={styles.compositionEmptyText}>No auctions in this view</Text>
        </View>
      );
    }

    switch (browseState.scope) {
      case 'live': {
        // ── Editorial composition: featured + supporting + continuation grid ──
        // No duplicate horizontal rail — one composition per viewport.
        if (scopeItems.length >= 3 && !isSmallWidth) {
          const [featured, ...rest] = scopeItems;
          const supporting = rest.slice(0, 2);
          const continuation = rest.slice(2);
          const featuredTiming = resolveAuctionTiming(featured, secondClock);
          const featuredUrgency = resolveUrgency(featuredTiming);
          const featuredValue = formatValueLockup(featured.currentBidGbp || featured.startingBidGbp);
          const featuredTime = featuredUrgency === 'finalMinutes'
            ? formatFinalMinutesCountdown(featuredTiming.msToEnd)
            : resolveTimeLabel(featuredTiming);
          const featuredPersonalAction = featured.viewerState === 'outbid' ? 'Bid again'
            : featured.viewerState === 'won' ? 'View result'
            : null;
          return (
            <View style={styles.compositionWrap}>
              <View style={styles.asymmetricRow}>
                <AuctionRunwayCard
                  title={featured.title}
                  imageUrl={featured.imageUrl || null}
                  brand={featured.brand ?? null}
                  izeText={featuredValue.izeText}
                  localText={featuredValue.localText}
                  valueState="current"
                  bidCount={featured.bidCount}
                  countdownText={featuredTime}
                  urgent={featuredUrgency === 'finalMinutes' || featuredUrgency === 'endingSoon'}
                  state="live"
                  viewerState={featured.viewerState}
                  onPress={() => navigateToDetail(featured.id)}
                  cardWidth={featuredWidth}
                  imageHeight={300}
                  metadataBelow
                  personalActionLabel={featuredPersonalAction}
                  onPersonalAction={featuredPersonalAction ? () => navigateToDetail(featured.id) : undefined}
                />
                <View style={[styles.supportingColumn, { width: supportingColumnWidth }]}>
                  {supporting.map((item) => {
                    const timing = resolveAuctionTiming(item, secondClock);
                    const urgency = resolveUrgency(timing);
                    const valueLockup = formatValueLockup(item.currentBidGbp || item.startingBidGbp);
                    const timeLabel = urgency === 'finalMinutes'
                      ? formatFinalMinutesCountdown(timing.msToEnd)
                      : resolveTimeLabel(timing);
                    return (
                      <AuctionSupportingTile
                        key={item.id}
                        title={item.title}
                        imageUrl={item.imageUrl || null}
                        brand={item.brand}
                        izeText={valueLockup.izeText}
                        localText={valueLockup.localText}
                        valueState="current"
                        timeText={timeLabel}
                        state="live"
                        viewerState={item.viewerState}
                        onPress={() => navigateToDetail(item.id)}
                      />
                    );
                  })}
                </View>
              </View>
              {continuation.length > 0 && (
                <View style={styles.continuationGrid}>
                  {continuation.map((item) => {
                    const timing = resolveAuctionTiming(item, secondClock);
                    const urgency = resolveUrgency(timing);
                    const valueLockup = formatValueLockup(item.currentBidGbp || item.startingBidGbp);
                    const timeLabel = urgency === 'finalMinutes'
                      ? formatFinalMinutesCountdown(timing.msToEnd)
                      : resolveTimeLabel(timing);
                    return (
                      <AuctionGridCard
                        key={item.id}
                        title={item.title}
                        imageUrl={item.imageUrl || null}
                        brand={item.brand ?? null}
                        izeText={valueLockup.izeText}
                        localText={valueLockup.localText}
                        valueState="current"
                        priceLabel={resolvePriceLabel(item, timing)}
                        bidCount={item.bidCount}
                        countdownText={timeLabel}
                        urgent={urgency === 'finalMinutes' || urgency === 'endingSoon'}
                        state="live"
                        viewerState={item.viewerState}
                        onPress={() => navigateToDetail(item.id)}
                        cardWidth={gridCardWidth}
                      />
                    );
                  })}
                </View>
              )}
            </View>
          );
        }
        // Small width or <3 items: featured wide + supporting row
        if (scopeItems.length >= 3 && isSmallWidth) {
          const [featured, ...rest] = scopeItems;
          const supporting = rest.slice(0, 2);
          const continuation = rest.slice(2);
          const featuredTiming = resolveAuctionTiming(featured, secondClock);
          const featuredUrgency = resolveUrgency(featuredTiming);
          const featuredValue = formatValueLockup(featured.currentBidGbp || featured.startingBidGbp);
          const featuredTime = featuredUrgency === 'finalMinutes'
            ? formatFinalMinutesCountdown(featuredTiming.msToEnd)
            : resolveTimeLabel(featuredTiming);
          const featuredPersonalAction = featured.viewerState === 'outbid' ? 'Bid again'
            : featured.viewerState === 'won' ? 'View result'
            : null;
          return (
            <View style={styles.compositionWrap}>
              <AuctionRunwayCard
                title={featured.title}
                imageUrl={featured.imageUrl || null}
                brand={featured.brand ?? null}
                izeText={featuredValue.izeText}
                localText={featuredValue.localText}
                valueState="current"
                bidCount={featured.bidCount}
                countdownText={featuredTime}
                urgent={featuredUrgency === 'finalMinutes' || featuredUrgency === 'endingSoon'}
                state="live"
                viewerState={featured.viewerState}
                onPress={() => navigateToDetail(featured.id)}
                cardWidth={fullWidth}
                imageHeight={260}
                metadataBelow
                personalActionLabel={featuredPersonalAction}
                onPersonalAction={featuredPersonalAction ? () => navigateToDetail(featured.id) : undefined}
              />
              <View style={styles.supportingRow}>
                {supporting.map((item, supportIdx) => {
                  const timing = resolveAuctionTiming(item, secondClock);
                  const urgency = resolveUrgency(timing);
                  const valueLockup = formatValueLockup(item.currentBidGbp || item.startingBidGbp);
                  const timeLabel = urgency === 'finalMinutes'
                    ? formatFinalMinutesCountdown(timing.msToEnd)
                    : resolveTimeLabel(timing);
                  return (
                    <AuctionGridCard
                      key={item.id}
                      title={item.title}
                      imageUrl={item.imageUrl || null}
                      brand={item.brand ?? null}
                      izeText={valueLockup.izeText}
                      localText={valueLockup.localText}
                      valueState="current"
                      priceLabel={resolvePriceLabel(item, timing)}
                      bidCount={item.bidCount}
                      countdownText={timeLabel}
                      urgent={urgency === 'finalMinutes' || urgency === 'endingSoon'}
                      state="live"
                      viewerState={item.viewerState}
                      onPress={() => navigateToDetail(item.id)}
                      cardWidth={gridCardWidth}
                      testID={supportIdx === 0 ? 'golden-auction-first-card' : undefined}
                    />
                  );
                })}
              </View>
              {continuation.length > 0 && (
                <View style={styles.continuationGrid}>
                  {continuation.map((item) => {
                    const timing = resolveAuctionTiming(item, secondClock);
                    const urgency = resolveUrgency(timing);
                    const valueLockup = formatValueLockup(item.currentBidGbp || item.startingBidGbp);
                    const timeLabel = urgency === 'finalMinutes'
                      ? formatFinalMinutesCountdown(timing.msToEnd)
                      : resolveTimeLabel(timing);
                    return (
                      <AuctionGridCard
                        key={item.id}
                        title={item.title}
                        imageUrl={item.imageUrl || null}
                        brand={item.brand ?? null}
                        izeText={valueLockup.izeText}
                        localText={valueLockup.localText}
                        valueState="current"
                        priceLabel={resolvePriceLabel(item, timing)}
                        bidCount={item.bidCount}
                        countdownText={timeLabel}
                        urgent={urgency === 'finalMinutes' || urgency === 'endingSoon'}
                        state="live"
                        viewerState={item.viewerState}
                        onPress={() => navigateToDetail(item.id)}
                        cardWidth={gridCardWidth}
                      />
                    );
                  })}
                </View>
              )}
            </View>
          );
        }
        // 2 items: balanced editorial columns
        if (scopeItems.length === 2) {
          return (
            <View style={styles.compositionWrap}>
              <View style={styles.continuationGrid}>
                {scopeItems.map((item) => {
                  const timing = resolveAuctionTiming(item, secondClock);
                  const urgency = resolveUrgency(timing);
                  const valueLockup = formatValueLockup(item.currentBidGbp || item.startingBidGbp);
                  const timeLabel = urgency === 'finalMinutes'
                    ? formatFinalMinutesCountdown(timing.msToEnd)
                    : resolveTimeLabel(timing);
                  return (
                    <AuctionGridCard
                      key={item.id}
                      title={item.title}
                      imageUrl={item.imageUrl || null}
                      brand={item.brand ?? null}
                      izeText={valueLockup.izeText}
                      localText={valueLockup.localText}
                      valueState="current"
                      priceLabel={resolvePriceLabel(item, timing)}
                      bidCount={item.bidCount}
                      countdownText={timeLabel}
                      urgent={urgency === 'finalMinutes' || urgency === 'endingSoon'}
                      state="live"
                      viewerState={item.viewerState}
                      onPress={() => navigateToDetail(item.id)}
                      cardWidth={gridCardWidth}
                    />
                  );
                })}
              </View>
            </View>
          );
        }
        // 1 item: feature
        const featured = scopeItems[0];
        const featuredTiming = resolveAuctionTiming(featured, secondClock);
        const featuredUrgency = resolveUrgency(featuredTiming);
        const featuredValue = formatValueLockup(featured.currentBidGbp || featured.startingBidGbp);
        const featuredTime = featuredUrgency === 'finalMinutes'
          ? formatFinalMinutesCountdown(featuredTiming.msToEnd)
          : resolveTimeLabel(featuredTiming);
        const featuredPersonalAction = featured.viewerState === 'outbid' ? 'Bid again'
          : featured.viewerState === 'won' ? 'View result'
          : null;
        return (
          <View style={styles.compositionWrap}>
            <AuctionRunwayCard
              title={featured.title}
              imageUrl={featured.imageUrl || null}
              brand={featured.brand ?? null}
              izeText={featuredValue.izeText}
              localText={featuredValue.localText}
              valueState="current"
              bidCount={featured.bidCount}
              countdownText={featuredTime}
              urgent={featuredUrgency === 'finalMinutes' || featuredUrgency === 'endingSoon'}
              state="live"
              viewerState={featured.viewerState}
              onPress={() => navigateToDetail(featured.id)}
              cardWidth={fullWidth}
              imageHeight={280}
              metadataBelow
              personalActionLabel={featuredPersonalAction}
              onPersonalAction={featuredPersonalAction ? () => navigateToDetail(featured.id) : undefined}
            />
          </View>
        );
      }

      case 'upcoming': {
        // Scheduled programme rows — no duplicate rail
        return (
          <View style={styles.compositionWrap}>
            <View style={styles.upcomingContainer}>
              {scopeItems.map((item) => (
                <UpcomingRow
                  key={item.id}
                  item={item}
                  onPress={() => navigateToDetail(item.id)}
                  formatValueLockup={formatValueLockup}
                />
              ))}
            </View>
          </View>
        );
      }

      case 'results': {
        // Results ledger — compact rows with outcome, price, bid count
        return (
          <View style={styles.compositionWrap}>
            <View style={styles.resultsContainer}>
              {scopeItems.map((item) => (
                <ResultRow
                  key={item.id}
                  item={item}
                  onPress={() => navigateToDetail(item.id)}
                  formatValueLockup={formatValueLockup}
                />
              ))}
            </View>
          </View>
        );
      }

      case 'watching': {
        // Compact continuity grid — no duplicate rail
        return (
          <View style={styles.compositionWrap}>
            <View style={styles.continuationGrid}>
              {scopeItems.map((item) => {
                const timing = resolveAuctionTiming(item, secondClock);
                const urgency = resolveUrgency(timing);
                const valueLockup = formatValueLockup(item.currentBidGbp || item.startingBidGbp);
                const timeLabel = urgency === 'finalMinutes'
                  ? formatFinalMinutesCountdown(timing.msToEnd)
                  : resolveTimeLabel(timing);
                const effectiveState = timing.effectiveState === 'live' ? 'live' : timing.effectiveState === 'upcoming' ? 'upcoming' : 'ended';
                const valueState = effectiveState === 'ended' ? 'final' : effectiveState === 'upcoming' ? 'starting' : 'current';
                return (
                  <AuctionGridCard
                    key={item.id}
                    title={item.title}
                    imageUrl={item.imageUrl || null}
                    brand={item.brand ?? null}
                    izeText={valueLockup.izeText}
                    localText={valueLockup.localText}
                    valueState={valueState}
                    priceLabel={resolvePriceLabel(item, timing)}
                    bidCount={item.bidCount}
                    countdownText={timeLabel}
                    urgent={urgency === 'finalMinutes' || urgency === 'endingSoon'}
                    state={effectiveState}
                    viewerState={item.viewerState}
                    onPress={() => navigateToDetail(item.id)}
                    cardWidth={gridCardWidth}
                  />
                );
              })}
            </View>
          </View>
        );
      }

      default:
        return null;
    }
  };

  return (
    <View testID="auction-screen" style={styles.container}>
      <StatusBar barStyle={!isDark ? 'dark-content' : 'light-content'} />
      <AuctionMarketHeader
        title="Auctions"
        context={headerContext}
        compactContext={compactHeaderContext}
        actions={headerActions}
      />
      {/* Single scope rail: Live | Upcoming | Results | Watching */}
      <AuctionSegmentRail
        segments={scopeSegments}
        activeKey={browseState.scope}
        onSelect={(key) => setScope(key as AuctionScope)}
      />
      <ScrollView
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.brand}
            colors={[colors.brand]}
            progressBackgroundColor={colors.surfaceAlt}
          />
        }
      >
        {/* Personal attention strip */}
        {attentionProps && (
          <View style={styles.attentionZone}>
            <AuctionAttentionStrip {...attentionProps} />
          </View>
        )}

        {/* Active filter chips — individually removable, with result count */}
        {activeFilterChips.length > 0 && (
          <View style={styles.filterChipsBar}>
            {browseResult.status === 'ready' && (
              <Text style={styles.filterResultSummary}>
                {browseResult.items.length} {browseResult.items.length === 1 ? 'result' : 'results'}
              </Text>
            )}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterChipsContent}
            >
              {activeFilterChips.map((chip) => (
                <Pressable
                  key={chip.key}
                  style={styles.filterChip}
                  onPress={() => removeFilterChip(chip.type, chip.value)}
                  hitSlop={4}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove filter ${chip.label}`}
                >
                  <Text style={styles.filterChipText} numberOfLines={1}>{chip.label}</Text>
                  <Ionicons name="close" size={13} color={colors.textSecondary} />
                </Pressable>
              ))}
              <Pressable
                style={styles.filterChipClear}
                onPress={clearAllFilters}
                hitSlop={4}
                accessibilityRole="button"
                accessibilityLabel="Clear all filters"
              >
                <Text style={styles.filterChipClearText}>Clear all</Text>
              </Pressable>
            </ScrollView>
          </View>
        )}

        {/* Offline banner — cached auctions are still visible but cannot refresh */}
        {isOffline && hasAnyContent ? (
          <OfflineBanner onRetry={() => void handleRefresh()} />
        ) : null}

        {/* Selected scope composition */}
        <SegmentContentTransition segmentKey={browseState.scope}>
          {renderComposition()}
        </SegmentContentTransition>

        {/* Category discovery */}
        {homeData.categoryWorlds.length > 0 && !isBrowsing && (
          <View style={styles.zoneWrap}>
            <Text style={styles.sectionTitle}>Categories</Text>
            <HorizontalRail
              contentContainerStyle={styles.categoryRailContent}
            >
              {homeData.categoryWorlds.map((world) => (
                <CategoryRailTile
                  key={world.categoryKey}
                  world={world}
                  cardWidth={categoryCardWidth}
                  onPress={() => handleCategoryPress(world.categoryKey)}
                />
              ))}
            </HorizontalRail>
          </View>
        )}

        {/* Results — compact, near lower page (only when not browsing and not in results scope) */}
        {homeData.recentlyClosed.length > 0 && !isBrowsing && browseState.scope !== 'results' && (
          <View style={styles.zoneWrap}>
            <Text style={styles.sectionTitle}>Results</Text>
            <View style={styles.resultsContainer}>
              {homeData.recentlyClosed.map((item) => (
                <ResultRow
                  key={item.id}
                  item={item}
                  onPress={() => navigateToDetail(item.id)}
                  formatValueLockup={formatValueLockup}
                />
              ))}
            </View>
          </View>
        )}

        {/* ── More to explore — continuous feed ── */}
        {exploreFeedItems.length > 0 && !isBrowsing && (
          <View style={styles.zoneWrap}>
            <Text style={styles.sectionTitle}>More to explore</Text>
            <View style={styles.continuationGrid}>
              {exploreFeedItems.map((item) => {
                const timing = resolveAuctionTiming(item, secondClock);
                const urgency = resolveUrgency(timing);
                const valueLockup = formatValueLockup(item.currentBidGbp || item.startingBidGbp);
                const timeLabel = urgency === 'finalMinutes'
                  ? formatFinalMinutesCountdown(timing.msToEnd)
                  : resolveTimeLabel(timing);
                const effectiveState = timing.effectiveState === 'live' ? 'live' : timing.effectiveState === 'upcoming' ? 'upcoming' : 'ended';
                const valueState = effectiveState === 'ended' ? 'final' : effectiveState === 'upcoming' ? 'starting' : 'current';
                return (
                  <AuctionGridCard
                    key={item.id}
                    title={item.title}
                    imageUrl={item.imageUrl || null}
                    brand={item.brand ?? null}
                    izeText={valueLockup.izeText}
                    localText={valueLockup.localText}
                    valueState={valueState}
                    priceLabel={resolvePriceLabel(item, timing)}
                    bidCount={item.bidCount}
                    countdownText={timeLabel}
                    urgent={urgency === 'finalMinutes' || urgency === 'endingSoon'}
                    state={effectiveState}
                    viewerState={item.viewerState}
                    onPress={() => navigateToDetail(item.id)}
                    cardWidth={gridCardWidth}
                  />
                );
              })}
            </View>
          </View>
        )}
      </ScrollView>
      <FilterSheet
        visible={filterSheetVisible}
        onDismiss={() => setFilterSheetVisible(false)}
        categoryOptions={categoryOptions}
        categoryLabels={categoryLabels}
        categoryCounts={categoryCounts}
        draftBrowse={draftBrowse}
        setDraftBrowse={setDraftBrowse}
        onReset={resetDraftFilters}
        onApply={applyDraftFilters}
        resultCount={filterResultCount}
        facetsLoading={facetsLoading}
      />
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background },
    contentContainer: {
      paddingBottom: Space.xxl + 24 },

    // ── Active filter chips (individually removable) ──
    filterChipsBar: {
      paddingVertical: Space.xs,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border },
    filterResultSummary: {
      fontSize: TypographyV2.meta.size,
      color: colors.textSecondary,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: 0,
      fontVariant: ['tabular-nums'],
      paddingHorizontal: Space.md,
      paddingBottom: Space.xs },
    filterChipsContent: {
      paddingHorizontal: Space.md,
      gap: Space.xs,
      alignItems: 'center' },
    filterChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingHorizontal: Space.sm + 2,
      paddingVertical: Space.xs + 1,
      borderRadius: Radius.full,
      backgroundColor: colors.surfaceAlt,
      minHeight: 32 },
    filterChipText: {
      fontSize: TypographyV2.meta.size,
      fontWeight: '500',
      color: colors.textPrimary,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: 0,
      maxWidth: 160 },
    filterChipClear: {
      paddingHorizontal: Space.sm,
      paddingVertical: Space.xs + 1,
      minHeight: 32,
      justifyContent: 'center' },
    filterChipClearText: {
      fontSize: TypographyV2.meta.size,
      fontWeight: '600',
      color: colors.brand,
      fontFamily: TypographyV2.meta.fontFamily },

    // ── Zone wrapper ──
    zoneWrap: {
      paddingHorizontal: Space.md,
      marginTop: Space.xl },

    // ── Section title (no subtitle) ──
    sectionTitle: {
      fontSize: TypographyV2.sectionTitle.size,
      lineHeight: TypographyV2.sectionTitle.lineHeight,
      fontWeight: '700',
      letterSpacing: TypographyV2.sectionTitle.letterSpacing,
      color: colors.textPrimary,
      fontFamily: TypographyV2.sectionTitle.fontFamily,
      marginBottom: Space.md },

    // ── Attention zone ──
    attentionZone: {
      paddingHorizontal: Space.md,
      marginTop: Space.sm,
      marginBottom: Space.xs },

    // ── Composition ──
    compositionWrap: {
      paddingHorizontal: Space.md,
      marginTop: Space.xl },
    compositionEmpty: {
      paddingHorizontal: Space.md,
      paddingVertical: Space.xl,
      alignItems: 'center' },
    compositionEmptyText: {
      fontSize: TypographyV2.body.size,
      color: colors.textMuted,
      fontFamily: TypographyV2.body.fontFamily },
    asymmetricRow: {
      flexDirection: 'row',
      gap: Space.sm,
      alignItems: 'stretch' },
    supportingColumn: {
      gap: Space.sm,
      flex: 1 },
    supportingRow: {
      flexDirection: 'row',
      gap: Space.sm,
      marginTop: Space.sm },
    continuationGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: Space.sm,
      marginTop: Space.sm },

    // ── Horizontal rail ──
    horizontalRailContent: {
      paddingHorizontal: Space.md },

    // ── Category rail ──
    categoryRailContent: {
      gap: Space.sm },

    // ── Upcoming rows ──
    upcomingContainer: {
      gap: 0 },

    // ── Results ──
    resultsContainer: {
      gap: 0 },

    // ── Empty market ──
    emptyMarketContainer: {
      flexGrow: 1,
      paddingBottom: Space.xxl },
    emptyMarketResultsWrap: {
      marginTop: Space.xl,
      paddingHorizontal: Space.md },

    // ── Search overlay ──
    searchOverlayHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border },
    searchOverlayInput: {
      flex: 1,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      borderRadius: Radius.md,
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm + 2,
      fontSize: TypographyV2.bodyStrong.size,
      color: colors.textPrimary,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      backgroundColor: colors.surfaceAlt },
    searchScopeContext: {
      paddingHorizontal: Space.md,
      paddingVertical: Space.xs,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border },
    searchScopeText: {
      fontSize: TypographyV2.meta.size,
      color: colors.textSecondary,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: 0 },
    searchIdleContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: Space.xl },
    searchIdleScroll: {
      flex: 1 },
    searchIdleContent: {
      paddingHorizontal: Space.md,
      paddingVertical: Space.lg,
      gap: Space.xl },
    searchIdleFallback: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: Space.xxl },
    searchIdleHint: {
      fontSize: TypographyV2.body.size,
      color: colors.textMuted,
      fontFamily: TypographyV2.body.fontFamily,
      textAlign: 'center' },
    searchIdleSection: {
      gap: Space.sm },
    searchIdleSectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between' },
    searchIdleSectionTitle: {
      fontSize: TypographyV2.meta.size,
      fontWeight: '600',
      letterSpacing: LetterSpacing.wide + 0.08,
      color: colors.textSecondary,
      fontFamily: TypographyV2.meta.fontFamily },
    searchIdleClearBtn: {
      fontSize: TypographyV2.meta.size,
      color: colors.brand,
      fontFamily: TypographyV2.meta.fontFamily },
    searchIdleChips: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: Space.xs },
    searchIdleChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingHorizontal: Space.sm + 2,
      paddingVertical: Space.xs + 2,
      borderRadius: Radius.full,
      backgroundColor: colors.surfaceAlt },
    searchIdleChipText: {
      fontSize: TypographyV2.meta.size,
      color: colors.textPrimary,
      fontFamily: TypographyV2.meta.fontFamily,
      maxWidth: 140 } });
}
