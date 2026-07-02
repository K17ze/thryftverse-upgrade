import React, { memo, useCallback, useMemo, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  RefreshControl,
  Pressable,
  StatusBar,
  Text,
  ScrollView,
  TextInput,
  useWindowDimensions,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../constants/colors';
import { RootStackParamList } from '../navigation/types';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useBucketedServerClock, resolveAuctionTiming } from '../hooks/useServerClock';
import {
  resolvePriceLabel,
  resolveTimeLabel,
  resolveUrgency,
  formatFinalMinutesCountdown,
  buildAuctionAccessibilityLabel,
  createSearchState,
  IDLE_SEARCH_STATE,
  type AuctionHomeItem,
  type AuctionSearchState,
} from '../utils/auctionHomeLogic';
import { CachedImage } from '../components/CachedImage';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { EmptyState } from '../components/EmptyState';
import { haptics } from '../utils/haptics';
import { Space, Radius, Typography } from '../theme/designTokens';
import { toIze, formatIzeAmount, formatFiatAmount } from '../utils/currency';
import { BottomSheet } from '../components/BottomSheet';
import {
  AuctionMarketHeader,
  AuctionAttentionStrip,
  AuctionRunwayCard,
  AuctionGridCard,
  AuctionSkeletons,
  AuctionSegmentRail,
  type AuctionHeaderAction,
  type Segment,
} from '../components/auction';
import {
  listAuctions,
  getAuctionHome,
  type MarketAuction,
  type AttentionReason,
  type CategoryWorld,
  type AuctionHomeActivity,
  type SellerSummary,
} from '../services/marketApi';

type NavT = StackNavigationProp<RootStackParamList>;

type MarketSegment = 'live' | 'endingSoon' | 'upcoming' | 'watching';

function toViewModel(api: MarketAuction): AuctionHomeItem {
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

interface DualPriceResult {
  primaryText: string;
  secondaryText: string | null;
}

type FormatDualPrice = (amountGbp: number) => DualPriceResult;

// ════════════════════════════════════════════════════════════════
// CATEGORY RAIL — compact horizontal image rail, max 3 visible
// ════════════════════════════════════════════════════════════════
const CategoryRailTile = memo(function CategoryRailTile({
  world,
  onPress,
  cardWidth,
}: {
  world: CategoryWorld;
  onPress: () => void;
  cardWidth: number;
}) {
  return (
    <Pressable
      style={[styles.categoryTile, { width: cardWidth }]}
      onPress={() => { haptics.tap(); onPress(); }}
      accessibilityRole="button"
      accessibilityLabel={`Browse ${world.displayName} auctions`}
    >
      {world.representativeImageUrl ? (
        <CachedImage
          uri={world.representativeImageUrl}
          style={StyleSheet.absoluteFill}
          containerStyle={StyleSheet.absoluteFill}
          contentFit="cover"
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: Colors.surfaceAlt }]} />
      )}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.6)']}
        locations={[0.5, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <View style={styles.categoryTileOverlay}>
        <Text style={styles.categoryTileName} numberOfLines={1}>{world.displayName}</Text>
      </View>
    </Pressable>
  );
});

// ════════════════════════════════════════════════════════════════
// UPCOMING ROW — scheduled programme row
// ════════════════════════════════════════════════════════════════
const UpcomingRow = memo(function UpcomingRow({
  item,
  onPress,
  formatDualPrice,
}: {
  item: AuctionHomeItem;
  onPress: () => void;
  formatDualPrice: FormatDualPrice;
}) {
  const dualPrice = formatDualPrice(item.startingBidGbp);
  const startDate = new Date(item.startsAt);
  const timeStr = startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const dateStr = startDate.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
  const a11yLabel = `Starts ${dateStr} at ${timeStr}. ${item.title}. Starting at ${dualPrice.primaryText}`;

  return (
    <Pressable
      style={styles.upcomingRow}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      accessibilityHint="Opens auction details"
    >
      <View style={styles.upcomingImageWrap}>
        {item.imageUrl ? (
          <CachedImage
            uri={item.imageUrl}
            style={styles.upcomingImage}
            containerStyle={StyleSheet.absoluteFill}
            contentFit="cover"
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: Colors.surface }]} />
        )}
      </View>
      <View style={styles.upcomingBody}>
        <Text style={styles.upcomingDate}>{dateStr} · {timeStr}</Text>
        {item.brand ? <Text style={styles.upcomingEyebrow} numberOfLines={1}>{item.brand}</Text> : null}
        <Text style={styles.upcomingTitle} numberOfLines={1}>{item.title}</Text>
        <Text style={styles.upcomingPrice}>Starting at {dualPrice.primaryText}</Text>
      </View>
      <Pressable
        style={styles.upcomingNotify}
        onPress={() => { haptics.tap(); onPress(); }}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="View auction"
      >
        <Ionicons name="chevron-forward" size={18} color={Colors.brand} />
      </Pressable>
    </Pressable>
  );
});

// ════════════════════════════════════════════════════════════════
// RESULT ROW — compact results ledger
// ════════════════════════════════════════════════════════════════
const ResultRow = memo(function ResultRow({
  item,
  onPress,
  formatDualPrice,
}: {
  item: AuctionHomeItem;
  onPress: () => void;
  formatDualPrice: FormatDualPrice;
}) {
  const dualPrice = formatDualPrice(item.currentBidGbp || item.startingBidGbp);
  const resultText = item.viewerState === 'won' ? 'Won'
    : item.viewerState === 'lost' ? 'Lost'
    : item.terminalReason === 'cancelled' ? 'Cancelled'
    : item.bidCount === 0 ? 'No bids'
    : 'Sold';
  const resultColor = item.viewerState === 'won' ? Colors.success
    : item.viewerState === 'lost' ? Colors.danger
    : item.terminalReason === 'cancelled' ? Colors.textMuted
    : item.bidCount === 0 ? Colors.textMuted
    : Colors.textSecondary;
  const a11yLabel = `${item.title}. ${resultText}. ${item.bidCount > 0 ? `${item.bidCount} bids` : 'No bids'}. ${dualPrice.primaryText}`;

  return (
    <Pressable
      style={styles.resultRow}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      accessibilityHint="Opens auction details"
    >
      <View style={styles.resultImageWrap}>
        {item.imageUrl ? (
          <CachedImage
            uri={item.imageUrl}
            style={styles.resultImage}
            containerStyle={StyleSheet.absoluteFill}
            contentFit="cover"
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: Colors.surface }]} />
        )}
      </View>
      <View style={styles.resultBody}>
        <Text style={styles.resultTitle} numberOfLines={1}>{item.title}</Text>
        <Text style={styles.resultPrice}>{item.bidCount > 0 ? dualPrice.primaryText : 'No bids'}</Text>
      </View>
      <View style={styles.resultRight}>
        <Text style={[styles.resultOutcome, { color: resultColor }]}>{resultText}</Text>
        {item.bidCount > 0 && (
          <Text style={styles.resultBids}>{item.bidCount} bids</Text>
        )}
      </View>
    </Pressable>
  );
});

// ── Home data shape from /auctions/home ──
interface HomeData {
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

const EMPTY_HOME_DATA: HomeData = {
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

// ── Main screen ──
export default function AuctionHomeScreen() {
  const navigation = useNavigation<NavT>();
  const { currencyCode, displayMode, goldRates } = useFormattedPrice();
  const { width } = useWindowDimensions();
  const [homeData, setHomeData] = React.useState<HomeData>(EMPTY_HOME_DATA);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // ── Segment state ──
  const [activeSegment, setActiveSegment] = useState<MarketSegment>('live');
  const hasSetDefaultSegment = useRef(false);

  // ── Search overlay ──
  const [searchOverlayVisible, setSearchOverlayVisible] = React.useState(false);
  const [searchState, setSearchState] = React.useState<AuctionSearchState>(IDLE_SEARCH_STATE);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [debouncedQuery, setDebouncedQuery] = React.useState('');
  const [isLoadingMoreSearch, setIsLoadingMoreSearch] = React.useState(false);
  const [paginationError, setPaginationError] = React.useState<string | null>(null);

  // ── Filter result mode ──
  const [filterResult, setFilterResult] = React.useState<{
    status: 'idle' | 'loading' | 'ready' | 'empty' | 'error';
    items: AuctionHomeItem[];
    cursor: string | null;
  }>({ status: 'idle', items: [], cursor: null });
  const [isLoadingMoreFilters, setIsLoadingMoreFilters] = React.useState(false);
  const filterReqIdRef = React.useRef(0);
  const [filterRefreshTick, setFilterRefreshTick] = React.useState(0);

  // ── Filter state ──
  const [filterStatus, setFilterStatus] = useState<'all' | 'live' | 'scheduled' | 'ended'>('all');
  const [filterSort, setFilterSort] = useState<'endingSoon' | 'newest' | 'mostBids' | 'priceLow' | 'priceHigh'>('endingSoon');
  const [filterCategory, setFilterCategory] = useState<string | null>(null);
  const [filterSheetVisible, setFilterSheetVisible] = React.useState(false);

  // ── Draft filter state ──
  const [draftStatus, setDraftStatus] = useState<'all' | 'live' | 'scheduled' | 'ended'>('all');
  const [draftSort, setDraftSort] = useState<'endingSoon' | 'newest' | 'mostBids' | 'priceLow' | 'priceHigh'>('endingSoon');
  const [draftCategory, setDraftCategory] = useState<string | null>(null);

  const isFiltering = filterStatus !== 'all' || !!filterCategory || filterSort !== 'endingSoon';
  const isSearching = searchState.status !== 'idle';

  const openFilterSheet = useCallback(() => {
    setDraftStatus(filterStatus);
    setDraftSort(filterSort);
    setDraftCategory(filterCategory);
    setFilterSheetVisible(true);
  }, [filterStatus, filterSort, filterCategory]);

  const applyDraftFilters = useCallback(() => {
    haptics.tap();
    setFilterStatus(draftStatus);
    setFilterSort(draftSort);
    setFilterCategory(draftCategory);
    setFilterSheetVisible(false);
  }, [draftStatus, draftSort, draftCategory]);

  const resetDraftFilters = useCallback(() => {
    haptics.tap();
    setDraftStatus('all');
    setDraftSort('endingSoon');
    setDraftCategory(null);
  }, []);

  const clearAllFilters = useCallback(() => {
    haptics.tap();
    setFilterStatus('all');
    setFilterSort('endingSoon');
    setFilterCategory(null);
  }, []);

  const { secondClock, minuteClock, resync, needsResync, markResyncFailed, clearResyncFailed } = useBucketedServerClock(homeData.serverNow);

  const requestIdRef = React.useRef(0);

  const fetchHome = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    const reqId = ++requestIdRef.current;
    try {
      const response = await getAuctionHome();
      if (reqId !== requestIdRef.current) return;

      const attentionItem = response.attention.item ? toViewModel(response.attention.item) : null;
      setHomeData({
        attentionItem,
        attentionReason: response.attention.reason,
        activity: response.activity,
        closingSoon: response.closingSoon.map(toViewModel),
        live: response.live.map(toViewModel),
        upcoming: response.upcoming.map(toViewModel),
        categoryWorlds: response.categoryWorlds,
        recentlyClosed: response.recentlyClosed.map(toViewModel),
        sellerSummary: response.sellerSummary,
        sellerAuctions: response.sellerAuctions.map(toViewModel),
        watchlist: response.watchlist.map(toViewModel),
        serverNow: response.serverNow,
      });

      if (response.serverNow) {
        resync(response.serverNow);
        clearResyncFailed();
      }
    } catch (err) {
      if (reqId === requestIdRef.current) {
        const devHint = __DEV__ && err instanceof Error ? err.message : null;
        setError(devHint ? `Unable to load auctions: ${devHint}` : 'Unable to load auctions');
        markResyncFailed();
      }
    } finally {
      if (reqId === requestIdRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [resync, clearResyncFailed, markResyncFailed]);

  React.useEffect(() => {
    void fetchHome();
  }, [fetchHome]);

  React.useEffect(() => {
    if (needsResync) {
      void fetchHome();
    }
  }, [needsResync, fetchHome]);

  // ── Search ──
  const searchReqIdRef = useRef(0);

  const handleRefresh = React.useCallback(() => {
    setRefreshing(true);
    if (isSearching && debouncedQuery.trim().length > 0) {
      setPaginationError(null);
      const reqId = ++searchReqIdRef.current;
      setSearchState(createSearchState(debouncedQuery, 'loading'));
      listAuctions({ query: debouncedQuery, status: 'all', sort: 'endingSoon', limit: 30 })
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
    } else if (isFiltering) {
      setPaginationError(null);
      setFilterRefreshTick((t) => t + 1);
      void fetchHome().finally(() => setRefreshing(false));
    } else {
      void fetchHome();
    }
  }, [fetchHome, isSearching, debouncedQuery, isFiltering]);

  const handleSearchChange = useCallback((text: string) => {
    searchReqIdRef.current++;
    setSearchQuery(text);
    setDebouncedQuery(text);
    if (text.trim().length === 0) {
      setSearchState(IDLE_SEARCH_STATE);
    } else {
      setSearchState(createSearchState(text, 'loading'));
    }
    setPaginationError(null);
  }, []);

  const handleClearSearch = useCallback(() => {
    searchReqIdRef.current++;
    setSearchQuery('');
    setDebouncedQuery('');
    setSearchState(IDLE_SEARCH_STATE);
    setPaginationError(null);
  }, []);

  React.useEffect(() => {
    if (debouncedQuery.trim().length === 0) {
      setSearchState(IDLE_SEARCH_STATE);
      return;
    }
    const timer = setTimeout(() => {
      const reqId = ++searchReqIdRef.current;
      setSearchState(createSearchState(debouncedQuery, 'loading'));
      listAuctions({ query: debouncedQuery, status: 'all', sort: 'endingSoon', limit: 30 })
        .then((result) => {
          if (reqId !== searchReqIdRef.current) return;
          const items = result.items.map(toViewModel);
          setSearchState(createSearchState(debouncedQuery, items.length > 0 ? 'ready' : 'empty', items, result.nextCursor));
        })
        .catch(() => {
          if (reqId !== searchReqIdRef.current) return;
          setSearchState(createSearchState(debouncedQuery, 'error'));
        });
    }, 400);
    return () => clearTimeout(timer);
  }, [debouncedQuery]);

  React.useEffect(() => {
    return () => { searchReqIdRef.current++; };
  }, []);

  const loadMoreSearch = React.useCallback(async () => {
    if (!searchState.cursor || isLoadingMoreSearch) return;
    setIsLoadingMoreSearch(true);
    setPaginationError(null);
    const reqId = ++searchReqIdRef.current;
    try {
      const result = await listAuctions({ query: debouncedQuery, status: 'all', sort: 'endingSoon', cursor: searchState.cursor, limit: 30 });
      if (reqId !== searchReqIdRef.current) return;
      setSearchState((prev) => {
        const existingIds = new Set(prev.items.map((a) => a.id));
        const newItems = result.items.map(toViewModel).filter((a) => !existingIds.has(a.id));
        return { ...prev, items: [...prev.items, ...newItems], cursor: result.nextCursor };
      });
    } catch {
      if (reqId === searchReqIdRef.current) {
        setPaginationError('Failed to load more results');
      }
    } finally {
      if (reqId === searchReqIdRef.current) {
        setIsLoadingMoreSearch(false);
      }
    }
  }, [searchState.cursor, isLoadingMoreSearch, debouncedQuery]);

  // ── Filter results fetching ──
  React.useEffect(() => {
    if (!isFiltering) {
      setFilterResult({ status: 'idle', items: [], cursor: null });
      return;
    }
    const reqId = ++filterReqIdRef.current;
    setFilterResult({ status: 'loading', items: [], cursor: null });
    const apiStatus = filterStatus === 'all' ? undefined : filterStatus === 'scheduled' ? 'scheduled' : filterStatus;
    listAuctions({
      status: apiStatus as 'live' | 'scheduled' | 'ended' | 'all' | undefined,
      sort: filterSort,
      category: filterCategory ?? undefined,
      limit: 30,
    })
      .then((result) => {
        if (reqId !== filterReqIdRef.current) return;
        const items = result.items.map(toViewModel);
        setFilterResult({
          status: items.length > 0 ? 'ready' : 'empty',
          items,
          cursor: result.nextCursor,
        });
      })
      .catch(() => {
        if (reqId !== filterReqIdRef.current) return;
        setFilterResult({ status: 'error', items: [], cursor: null });
      });
  }, [filterStatus, filterSort, filterCategory, isFiltering, filterRefreshTick]);

  const loadMoreFilters = React.useCallback(async () => {
    if (filterResult.cursor === null || isLoadingMoreFilters) return;
    setIsLoadingMoreFilters(true);
    setPaginationError(null);
    const reqId = ++filterReqIdRef.current;
    try {
      const apiStatus = filterStatus === 'all' ? undefined : filterStatus === 'scheduled' ? 'scheduled' : filterStatus;
      const result = await listAuctions({
        status: apiStatus as 'live' | 'scheduled' | 'ended' | 'all' | undefined,
        sort: filterSort,
        category: filterCategory ?? undefined,
        cursor: filterResult.cursor,
        limit: 30,
      });
      if (reqId !== filterReqIdRef.current) return;
      setFilterResult((prev) => {
        const existingIds = new Set(prev.items.map((a) => a.id));
        const newItems = result.items.map(toViewModel).filter((a) => !existingIds.has(a.id));
        return { ...prev, items: [...prev.items, ...newItems], cursor: result.nextCursor };
      });
    } catch {
      if (reqId === filterReqIdRef.current) {
        setPaginationError('Failed to load more results');
      }
    } finally {
      if (reqId === filterReqIdRef.current) {
        setIsLoadingMoreFilters(false);
      }
    }
  }, [filterResult.cursor, isLoadingMoreFilters, filterStatus, filterSort, filterCategory]);

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
    setFilterCategory(categoryKey);
    setFilterStatus('all');
    setFilterSort('endingSoon');
  }, []);

  // ── 1ZE + local semantic display ──
  const formatDualPrice = useCallback((amountGbp: number): DualPriceResult => {
    const izeAmount = toIze(amountGbp, 'GBP', goldRates);
    const izeText = formatIzeAmount(izeAmount, 4);
    const fiatValue = izeAmount * (goldRates?.[currencyCode] ?? 1);
    const fiatText = formatFiatAmount(fiatValue, currencyCode, 2);
    if (displayMode === 'ize') return { primaryText: izeText, secondaryText: null };
    if (displayMode === 'fiat') return { primaryText: fiatText, secondaryText: izeText };
    return { primaryText: izeText, secondaryText: fiatText };
  }, [goldRates, currencyCode, displayMode]);

  // ── Renderers for search/filter ──
  const renderSearchItem = useCallback(({ item }: { item: AuctionHomeItem }) => {
    const timing = resolveAuctionTiming(item, secondClock);
    const urgency = resolveUrgency(timing);
    const dualPrice = formatDualPrice(item.currentBidGbp || item.startingBidGbp);
    const timeLabel = urgency === 'finalMinutes'
      ? formatFinalMinutesCountdown(timing.msToEnd)
      : resolveTimeLabel(timing);
    return (
      <AuctionGridCard
        title={item.title}
        imageUrl={item.imageUrl || null}
        brand={item.brand ?? null}
        priceText={dualPrice.primaryText}
        priceLabel={resolvePriceLabel(item, timing)}
        bidCount={item.bidCount}
        countdownText={timeLabel}
        urgent={urgency === 'finalMinutes' || urgency === 'endingSoon'}
        state={timing.effectiveState === 'live' ? 'live' : timing.effectiveState === 'upcoming' ? 'upcoming' : 'ended'}
        viewerState={item.viewerState}
        onPress={() => navigateToDetail(item.id)}
      />
    );
  }, [secondClock, navigateToDetail, formatDualPrice]);

  const renderFilterItem = useCallback(({ item }: { item: AuctionHomeItem }) => {
    const timing = resolveAuctionTiming(item, secondClock);
    const urgency = resolveUrgency(timing);
    const dualPrice = formatDualPrice(item.currentBidGbp || item.startingBidGbp);
    const timeLabel = urgency === 'finalMinutes'
      ? formatFinalMinutesCountdown(timing.msToEnd)
      : resolveTimeLabel(timing);
    return (
      <AuctionGridCard
        title={item.title}
        imageUrl={item.imageUrl || null}
        brand={item.brand ?? null}
        priceText={dualPrice.primaryText}
        priceLabel={resolvePriceLabel(item, timing)}
        bidCount={item.bidCount}
        countdownText={timeLabel}
        urgent={urgency === 'finalMinutes' || urgency === 'endingSoon'}
        state={timing.effectiveState === 'live' ? 'live' : timing.effectiveState === 'upcoming' ? 'upcoming' : 'ended'}
        viewerState={item.viewerState}
        onPress={() => navigateToDetail(item.id)}
      />
    );
  }, [secondClock, navigateToDetail, formatDualPrice]);

  // ── Category options for filter sheet ──
  const categoryOptions = useMemo(() => {
    const cats = new Set<string>();
    [...homeData.live, ...homeData.upcoming, ...homeData.recentlyClosed].forEach((a) => {
      if (a.category) cats.add(a.category);
    });
    return Array.from(cats).sort();
  }, [homeData]);

  // ── Active filter chips ──
  const activeFilterChips = useMemo(() => {
    const chips: string[] = [];
    if (filterStatus !== 'all') chips.push(filterStatus);
    if (filterSort !== 'endingSoon') chips.push(filterSort);
    if (filterCategory) chips.push(filterCategory);
    return chips;
  }, [filterStatus, filterSort, filterCategory]);

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
    () => homeData.watchlist.filter((a) => !spotlightIds.has(a.id)),
    [homeData.watchlist, spotlightIds]
  );

  const hasAnyContent =
    hasActiveMarket ||
    hasPersonalActivity ||
    homeData.recentlyClosed.length > 0 ||
    homeData.categoryWorlds.length > 0 ||
    dedupedWatchlist.length > 0;

  // ── Default segment selection ──
  React.useEffect(() => {
    if (loading || hasSetDefaultSegment.current) return;
    if (homeData.closingSoon.length > 0) setActiveSegment('endingSoon');
    else if (homeData.live.length > 0) setActiveSegment('live');
    else if (homeData.upcoming.length > 0) setActiveSegment('upcoming');
    else if (dedupedWatchlist.length > 0) setActiveSegment('watching');
    hasSetDefaultSegment.current = true;
  }, [loading, homeData, dedupedWatchlist]);

  // ── Segment rail ──
  const segments: Segment[] = useMemo(() => {
    const segs: Segment[] = [{ key: 'live', label: 'Live', count: homeData.live.length }];
    if (homeData.closingSoon.length > 0) segs.push({ key: 'endingSoon', label: 'Ending soon', count: homeData.closingSoon.length });
    if (homeData.upcoming.length > 0) segs.push({ key: 'upcoming', label: 'Upcoming', count: homeData.upcoming.length });
    if (dedupedWatchlist.length > 0) segs.push({ key: 'watching', label: 'Watching', count: dedupedWatchlist.length });
    return segs;
  }, [homeData.live.length, homeData.closingSoon.length, homeData.upcoming.length, dedupedWatchlist.length]);

  // ── Compact header context ──
  const headerContext = useMemo(() => {
    const parts: string[] = [];
    if (homeData.live.length > 0) parts.push(`${homeData.live.length} live`);
    if (homeData.closingSoon.length > 0) parts.push(`${homeData.closingSoon.length} ending`);
    if (homeData.upcoming.length > 0) parts.push(`${homeData.upcoming.length} upcoming`);
    return parts.length > 0 ? parts.join(' · ') : undefined;
  }, [homeData.live.length, homeData.closingSoon.length, homeData.upcoming.length]);

  // ── Header actions ──
  const headerActions: AuctionHeaderAction[] = useMemo(() => [
    { key: 'search', icon: 'search-outline', label: 'Search auctions', onPress: () => { haptics.tap(); setSearchOverlayVisible(true); }, priority: 'primary' },
    { key: 'filter', icon: 'options-outline', label: 'Filter auctions', onPress: () => { haptics.tap(); openFilterSheet(); }, priority: 'secondary' },
    { key: 'create', icon: 'add-outline', label: 'Create auction', onPress: () => { haptics.tap(); navigation.navigate('CreateAuction'); }, priority: 'primary' },
    { key: 'seller', icon: 'storefront-outline', label: 'Open Seller Centre', onPress: () => { haptics.tap(); navigation.navigate('SellerAuctionCentre'); }, priority: 'primary' },
    { key: 'activity', icon: 'pulse-outline', label: 'View auction activity', onPress: () => { haptics.tap(); handleActivity(); }, badgeCount: homeData.activity.needsAttentionCount, priority: 'secondary' },
  ], [openFilterSheet, navigation, handleActivity, homeData.activity.needsAttentionCount]);

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
        message: `Bid again to lead · ${timeLabel}`,
        actionLabel: 'Bid again',
        countdownText: timeLabel,
        onPress: () => navigateToDetail(homeData.attentionItem!.id),
        onAction: () => navigateToDetail(homeData.attentionItem!.id),
      };
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
        message: `You have the top bid · ${timeLabel}`,
        actionLabel: 'View',
        countdownText: timeLabel,
        onPress: () => navigateToDetail(homeData.attentionItem!.id),
        onAction: () => navigateToDetail(homeData.attentionItem!.id),
      };
    }
    if (homeData.attentionReason === 'won_action' && homeData.attentionItem) {
      return {
        kind: 'won' as const,
        title: homeData.attentionItem.title,
        imageUrl: homeData.attentionItem.imageUrl || null,
        message: 'Next step required',
        actionLabel: 'View result',
        onPress: () => navigateToDetail(homeData.attentionItem!.id),
        onAction: () => navigateToDetail(homeData.attentionItem!.id),
      };
    }
    if (dedupedWatchlist.length > 0) {
      return {
        kind: 'watching' as const,
        title: `${dedupedWatchlist.length} watched auctions`,
        imageUrl: dedupedWatchlist[0]?.imageUrl || null,
        message: 'Track your watched auctions',
        actionLabel: 'View',
        onPress: () => handleActivity(),
        onAction: () => handleActivity(),
      };
    }
    return null;
  }, [homeData.attentionReason, homeData.attentionItem, dedupedWatchlist, navigateToDetail, handleActivity, secondClock]);

  // ── Selected segment data ──
  const segmentItems = useMemo(() => {
    switch (activeSegment) {
      case 'live': return homeData.live;
      case 'endingSoon': return homeData.closingSoon;
      case 'upcoming': return homeData.upcoming;
      case 'watching': return dedupedWatchlist;
      default: return [];
    }
  }, [activeSegment, homeData.live, homeData.closingSoon, homeData.upcoming, dedupedWatchlist]);

  // ════════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════════

  // ── Search overlay ──
  if (searchOverlayVisible) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.searchOverlayHeader}>
          <Pressable
            onPress={() => { haptics.tap(); setSearchOverlayVisible(false); handleClearSearch(); }}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Close search"
          >
            <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
          </Pressable>
          <TextInput
            value={searchQuery}
            onChangeText={handleSearchChange}
            placeholder="Search auctions…"
            autoFocus
            placeholderTextColor={Colors.textMuted}
            style={styles.searchOverlayInput}
          />
          {searchQuery.length > 0 && (
            <Pressable
              onPress={handleClearSearch}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
            >
              <Ionicons name="close-circle" size={20} color={Colors.textMuted} />
            </Pressable>
          )}
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
                  <EmptyState icon="cloud-offline-outline" title="Search failed" subtitle="Please try again" />
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
                tintColor={Colors.brand}
                colors={[Colors.brand]}
                progressBackgroundColor={Colors.surfaceAlt}
              />
            }
            onEndReached={loadMoreSearch}
            onEndReachedThreshold={0.5}
          />
        ) : (
          <View style={styles.searchIdleContainer}>
            <Text style={styles.searchIdleHint}>Search by title, brand, or category</Text>
          </View>
        )}
      </SafeAreaView>
    );
  }

  // ── Filter result mode ──
  if (isFiltering && !isSearching) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.filterResultHeader}>
          <Pressable
            onPress={() => { haptics.tap(); clearAllFilters(); }}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Clear filters and go back"
            style={styles.filterResultBackBtn}
          >
            <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
          </Pressable>
          <View style={styles.filterResultTitleWrap}>
            <Text style={styles.filterResultTitle}>Filtered results</Text>
            <Text style={styles.filterResultCount}>
              {filterResult.status === 'ready' ? `${filterResult.items.length} auctions` : '…'}
            </Text>
          </View>
          <Pressable
            onPress={() => { haptics.tap(); openFilterSheet(); }}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Open filter sheet"
          >
            <Ionicons name="options-outline" size={24} color={Colors.textPrimary} />
          </Pressable>
        </View>

        {activeFilterChips.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterChipsRow}>
            {activeFilterChips.map((chip) => (
              <View key={chip} style={styles.filterChip}>
                <Text style={styles.filterChipText}>{chip}</Text>
              </View>
            ))}
            <Pressable
              onPress={clearAllFilters}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Clear all filters"
              style={styles.filterChipClear}
            >
              <Text style={styles.filterChipClearText}>Clear all</Text>
            </Pressable>
          </ScrollView>
        )}

        {filterResult.status === 'loading' ? renderLoadingState() :
         filterResult.status === 'error' ? (
          <EmptyState icon="cloud-offline-outline" title="Filter failed" subtitle="Please try again" />
         ) : filterResult.status === 'empty' ? (
          <EmptyState icon="filter-outline" title="No matches" subtitle="Try adjusting your filters" />
         ) : (
          <FlashList
            data={filterResult.items}
            keyExtractor={(item) => item.id}
            renderItem={renderFilterItem}
            numColumns={2}
            contentContainerStyle={styles.contentContainer}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor={Colors.brand}
                colors={[Colors.brand]}
                progressBackgroundColor={Colors.surfaceAlt}
              />
            }
            onEndReached={loadMoreFilters}
            onEndReachedThreshold={0.5}
          />
        )}

        <FilterSheet
          visible={filterSheetVisible}
          onDismiss={() => setFilterSheetVisible(false)}
          categoryOptions={categoryOptions}
          draftStatus={draftStatus}
          setDraftStatus={setDraftStatus}
          draftSort={draftSort}
          setDraftSort={setDraftSort}
          draftCategory={draftCategory}
          setDraftCategory={setDraftCategory}
          onReset={resetDraftFilters}
          onApply={applyDraftFilters}
        />
      </SafeAreaView>
    );
  }

  // ── Loading state ──
  if (loading && !homeData.attentionItem) {
    return (
      <View style={[styles.container, { backgroundColor: Colors.background }]}>
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
          title="Unable to load"
          subtitle={__DEV__ && error !== 'Unable to load auctions' ? error : 'Pull to refresh'}
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
        <StatusBar barStyle="light-content" />
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
              tintColor={Colors.brand}
              colors={[Colors.brand]}
              progressBackgroundColor={Colors.surfaceAlt}
            />
          }
        >
          <EmptyState
            icon="pricetag-outline"
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
                    formatDualPrice={formatDualPrice}
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
          draftStatus={draftStatus}
          setDraftStatus={setDraftStatus}
          draftSort={draftSort}
          setDraftSort={setDraftSort}
          draftCategory={draftCategory}
          setDraftCategory={setDraftCategory}
          onReset={resetDraftFilters}
          onApply={applyDraftFilters}
        />
      </View>
    );
  }

  // ── Default: restructured Auction Home ──
  const fullWidth = width - Space.md * 2;
  const gridCardWidth = (width - Space.md * 2 - Space.sm) / 2;
  const categoryCardWidth = (width - Space.md * 2 - Space.sm * 2) / 3;

  // ── Render selected market composition ──
  const renderComposition = () => {
    if (segmentItems.length === 0) {
      return (
        <View style={styles.compositionEmpty}>
          <Text style={styles.compositionEmptyText}>No auctions in this view</Text>
        </View>
      );
    }

    switch (activeSegment) {
      case 'live': {
        // Asymmetric edit: one featured + two compact + continuation grid
        if (segmentItems.length >= 3) {
          const [featured, ...rest] = segmentItems;
          const supporting = rest.slice(0, 2);
          const continuation = rest.slice(2);
          const featuredTiming = resolveAuctionTiming(featured, secondClock);
          const featuredUrgency = resolveUrgency(featuredTiming);
          const featuredPrice = formatDualPrice(featured.currentBidGbp || featured.startingBidGbp);
          const featuredTime = featuredUrgency === 'finalMinutes'
            ? formatFinalMinutesCountdown(featuredTiming.msToEnd)
            : resolveTimeLabel(featuredTiming);
          return (
            <View style={styles.compositionWrap}>
              <AuctionRunwayCard
                title={featured.title}
                imageUrl={featured.imageUrl || null}
                brand={featured.brand ?? null}
                currentBidText={featuredPrice.primaryText}
                bidCount={featured.bidCount}
                countdownText={featuredTime}
                urgent={featuredUrgency === 'finalMinutes' || featuredUrgency === 'endingSoon'}
                state="live"
                viewerState={featured.viewerState}
                onPress={() => navigateToDetail(featured.id)}
                cardWidth={fullWidth}
                imageHeight={220}
              />
              <View style={styles.supportingRow}>
                {supporting.map((item) => {
                  const timing = resolveAuctionTiming(item, secondClock);
                  const urgency = resolveUrgency(timing);
                  const dualPrice = formatDualPrice(item.currentBidGbp || item.startingBidGbp);
                  const timeLabel = urgency === 'finalMinutes'
                    ? formatFinalMinutesCountdown(timing.msToEnd)
                    : resolveTimeLabel(timing);
                  return (
                    <AuctionGridCard
                      key={item.id}
                      title={item.title}
                      imageUrl={item.imageUrl || null}
                      brand={item.brand ?? null}
                      priceText={dualPrice.primaryText}
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
              {continuation.length > 0 && (
                <View style={styles.continuationGrid}>
                  {continuation.map((item) => {
                    const timing = resolveAuctionTiming(item, secondClock);
                    const urgency = resolveUrgency(timing);
                    const dualPrice = formatDualPrice(item.currentBidGbp || item.startingBidGbp);
                    const timeLabel = urgency === 'finalMinutes'
                      ? formatFinalMinutesCountdown(timing.msToEnd)
                      : resolveTimeLabel(timing);
                    return (
                      <AuctionGridCard
                        key={item.id}
                        title={item.title}
                        imageUrl={item.imageUrl || null}
                        brand={item.brand ?? null}
                        priceText={dualPrice.primaryText}
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
        // <3 items: simple grid
        return (
          <View style={styles.compositionWrap}>
            <View style={styles.continuationGrid}>
              {segmentItems.map((item) => {
                const timing = resolveAuctionTiming(item, secondClock);
                const urgency = resolveUrgency(timing);
                const dualPrice = formatDualPrice(item.currentBidGbp || item.startingBidGbp);
                const timeLabel = urgency === 'finalMinutes'
                  ? formatFinalMinutesCountdown(timing.msToEnd)
                  : resolveTimeLabel(timing);
                return (
                  <AuctionGridCard
                    key={item.id}
                    title={item.title}
                    imageUrl={item.imageUrl || null}
                    brand={item.brand ?? null}
                    priceText={dualPrice.primaryText}
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

      case 'endingSoon': {
        // Dense editorial runway — horizontal scroll of runway cards
        return (
          <View style={styles.compositionWrap}>
            <FlashList
              data={segmentItems}
              keyExtractor={(a) => a.id}
              renderItem={({ item }) => {
                const timing = resolveAuctionTiming(item, secondClock);
                const urgency = resolveUrgency(timing);
                const dualPrice = formatDualPrice(item.currentBidGbp || item.startingBidGbp);
                const timeLabel = urgency === 'finalMinutes'
                  ? formatFinalMinutesCountdown(timing.msToEnd)
                  : resolveTimeLabel(timing);
                return (
                  <AuctionRunwayCard
                    title={item.title}
                    imageUrl={item.imageUrl || null}
                    brand={item.brand ?? null}
                    currentBidText={dualPrice.primaryText}
                    bidCount={item.bidCount}
                    countdownText={timeLabel}
                    urgent={urgency === 'finalMinutes' || urgency === 'endingSoon'}
                    state={timing.effectiveState === 'live' ? 'live' : timing.effectiveState === 'upcoming' ? 'upcoming' : 'ended'}
                    viewerState={item.viewerState}
                    onPress={() => navigateToDetail(item.id)}
                  />
                );
              }}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.horizontalRailContent}
              ItemSeparatorComponent={() => <View style={{ width: Space.md }} />}
            />
          </View>
        );
      }

      case 'upcoming': {
        // Scheduled programme rows
        return (
          <View style={styles.compositionWrap}>
            <View style={styles.upcomingContainer}>
              {segmentItems.map((item) => (
                <UpcomingRow
                  key={item.id}
                  item={item}
                  onPress={() => navigateToDetail(item.id)}
                  formatDualPrice={formatDualPrice}
                />
              ))}
            </View>
          </View>
        );
      }

      case 'watching': {
        // Compact continuity grid
        return (
          <View style={styles.compositionWrap}>
            <View style={styles.continuationGrid}>
              {segmentItems.map((item) => {
                const timing = resolveAuctionTiming(item, secondClock);
                const urgency = resolveUrgency(timing);
                const dualPrice = formatDualPrice(item.currentBidGbp || item.startingBidGbp);
                const timeLabel = urgency === 'finalMinutes'
                  ? formatFinalMinutesCountdown(timing.msToEnd)
                  : resolveTimeLabel(timing);
                return (
                  <AuctionGridCard
                    key={item.id}
                    title={item.title}
                    imageUrl={item.imageUrl || null}
                    brand={item.brand ?? null}
                    priceText={dualPrice.primaryText}
                    priceLabel={resolvePriceLabel(item, timing)}
                    bidCount={item.bidCount}
                    countdownText={timeLabel}
                    urgent={urgency === 'finalMinutes' || urgency === 'endingSoon'}
                    state={timing.effectiveState === 'live' ? 'live' : timing.effectiveState === 'upcoming' ? 'upcoming' : 'ended'}
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
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <AuctionMarketHeader
        title="Auctions"
        context={headerContext}
        actions={headerActions}
      />
      <ScrollView
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={Colors.brand}
            colors={[Colors.brand]}
            progressBackgroundColor={Colors.surfaceAlt}
          />
        }
      >
        {/* Personal attention strip */}
        {attentionProps && (
          <View style={styles.attentionZone}>
            <AuctionAttentionStrip {...attentionProps} />
          </View>
        )}

        {/* Segment rail */}
        <AuctionSegmentRail
          segments={segments}
          activeKey={activeSegment}
          onSelect={(key) => setActiveSegment(key as MarketSegment)}
        />

        {/* Selected market composition */}
        {renderComposition()}

        {/* Category discovery */}
        {homeData.categoryWorlds.length > 0 && (
          <View style={styles.zoneWrap}>
            <Text style={styles.sectionTitle}>Categories</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.categoryRailContent}
            >
              {homeData.categoryWorlds.slice(0, 5).map((world) => (
                <CategoryRailTile
                  key={world.categoryKey}
                  world={world}
                  cardWidth={categoryCardWidth}
                  onPress={() => handleCategoryPress(world.categoryKey)}
                />
              ))}
            </ScrollView>
          </View>
        )}

        {/* Results — compact, near lower page */}
        {homeData.recentlyClosed.length > 0 && (
          <View style={styles.zoneWrap}>
            <Text style={styles.sectionTitle}>Results</Text>
            <View style={styles.resultsContainer}>
              {homeData.recentlyClosed.slice(0, 3).map((item) => (
                <ResultRow
                  key={item.id}
                  item={item}
                  onPress={() => navigateToDetail(item.id)}
                  formatDualPrice={formatDualPrice}
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
        draftStatus={draftStatus}
        setDraftStatus={setDraftStatus}
        draftSort={draftSort}
        setDraftSort={setDraftSort}
        draftCategory={draftCategory}
        setDraftCategory={setDraftCategory}
        onReset={resetDraftFilters}
        onApply={applyDraftFilters}
      />
    </View>
  );
}

// ════════════════════════════════════════════════════════════════
// FILTER SHEET — extracted for reuse across render paths
// ════════════════════════════════════════════════════════════════
const FilterSheet = memo(function FilterSheet({
  visible,
  onDismiss,
  categoryOptions,
  draftStatus,
  setDraftStatus,
  draftSort,
  setDraftSort,
  draftCategory,
  setDraftCategory,
  onReset,
  onApply,
}: {
  visible: boolean;
  onDismiss: () => void;
  categoryOptions: string[];
  draftStatus: 'all' | 'live' | 'scheduled' | 'ended';
  setDraftStatus: (s: 'all' | 'live' | 'scheduled' | 'ended') => void;
  draftSort: 'endingSoon' | 'newest' | 'mostBids' | 'priceLow' | 'priceHigh';
  setDraftSort: (s: 'endingSoon' | 'newest' | 'mostBids' | 'priceLow' | 'priceHigh') => void;
  draftCategory: string | null;
  setDraftCategory: (c: string | null) => void;
  onReset: () => void;
  onApply: () => void;
}) {
  return (
    <BottomSheet visible={visible} onDismiss={onDismiss}>
      <View style={styles.filterSheetContent}>
        <Text style={styles.filterSheetTitle}>Filter & Sort</Text>

        <Text style={styles.filterSectionLabel}>Status</Text>
        <View style={styles.filterOptionRow}>
          {(['all', 'live', 'scheduled', 'ended'] as const).map((opt) => (
            <Pressable
              key={opt}
              style={[styles.filterOption, draftStatus === opt && styles.filterOptionActive]}
              onPress={() => { haptics.tap(); setDraftStatus(opt); }}
            >
              <Text style={[styles.filterOptionText, draftStatus === opt && styles.filterOptionTextActive]}>
                {opt === 'all' ? 'All' : opt === 'live' ? 'Live' : opt === 'scheduled' ? 'Scheduled' : 'Ended'}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.filterSectionLabel}>Sort</Text>
        <View style={styles.filterOptionRow}>
          {(['endingSoon', 'newest', 'mostBids', 'priceLow', 'priceHigh'] as const).map((opt) => (
            <Pressable
              key={opt}
              style={[styles.filterOption, draftSort === opt && styles.filterOptionActive]}
              onPress={() => { haptics.tap(); setDraftSort(opt); }}
            >
              <Text style={[styles.filterOptionText, draftSort === opt && styles.filterOptionTextActive]}>
                {opt === 'endingSoon' ? 'Ending soon' : opt === 'newest' ? 'Newest' : opt === 'mostBids' ? 'Most bids' : opt === 'priceLow' ? 'Price ↑' : 'Price ↓'}
              </Text>
            </Pressable>
          ))}
        </View>

        {categoryOptions.length > 0 && (
          <>
            <Text style={styles.filterSectionLabel}>Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterCategoryScroll}>
              <Pressable
                style={[styles.filterOption, draftCategory === null && styles.filterOptionActive]}
                onPress={() => { haptics.tap(); setDraftCategory(null); }}
              >
                <Text style={[styles.filterOptionText, draftCategory === null && styles.filterOptionTextActive]}>All</Text>
              </Pressable>
              {categoryOptions.map((cat) => (
                <Pressable
                  key={cat}
                  style={[styles.filterOption, draftCategory === cat && styles.filterOptionActive]}
                  onPress={() => { haptics.tap(); setDraftCategory(cat); }}
                >
                  <Text style={[styles.filterOptionText, draftCategory === cat && styles.filterOptionTextActive]}>{cat}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </>
        )}

        <View style={styles.filterActionsRow}>
          <Pressable
            style={styles.filterResetBtn}
            onPress={onReset}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Reset filters"
          >
            <Text style={styles.filterResetText}>Reset</Text>
          </Pressable>
          <Pressable
            style={styles.filterApplyBtn}
            onPress={onApply}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Show results"
          >
            <Text style={styles.filterApplyText}>Show results</Text>
          </Pressable>
        </View>
      </View>
    </BottomSheet>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  contentContainer: {
    paddingBottom: Space.xxl,
  },

  // ── Zone wrapper ──
  zoneWrap: {
    paddingHorizontal: Space.md,
    marginTop: Space.lg,
  },

  // ── Section title (no subtitle) ──
  sectionTitle: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '700',
    letterSpacing: -0.4,
    color: Colors.textPrimary,
    fontFamily: Typography.family.semibold,
    marginBottom: Space.sm,
  },

  // ── Attention zone ──
  attentionZone: {
    paddingHorizontal: Space.md,
    marginTop: Space.sm,
    marginBottom: Space.xs,
  },

  // ── Composition ──
  compositionWrap: {
    paddingHorizontal: Space.md,
    marginTop: Space.sm,
  },
  compositionEmpty: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.xl,
    alignItems: 'center',
  },
  compositionEmptyText: {
    fontSize: 14,
    color: Colors.textMuted,
    fontFamily: Typography.family.regular,
  },
  supportingRow: {
    flexDirection: 'row',
    gap: Space.sm,
    marginTop: Space.sm,
  },
  continuationGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.sm,
    marginTop: Space.sm,
  },

  // ── Horizontal rail ──
  horizontalRailContent: {
    paddingHorizontal: Space.md,
  },

  // ── Category rail ──
  categoryRailContent: {
    gap: Space.sm,
  },
  categoryTile: {
    height: 100,
    borderRadius: Radius.md,
    overflow: 'hidden',
    backgroundColor: Colors.surfaceAlt,
  },
  categoryTileOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: Space.sm,
  },
  categoryTileName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
    fontFamily: Typography.family.bold,
  },

  // ── Upcoming rows ──
  upcomingContainer: {
    gap: 0,
  },
  upcomingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingVertical: Space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  upcomingImageWrap: {
    width: 64,
    height: 64,
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  upcomingImage: {
    width: 64,
    height: 64,
  },
  upcomingBody: {
    flex: 1,
  },
  upcomingDate: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.3,
    color: Colors.textSecondary,
    fontFamily: Typography.family.semibold,
    marginBottom: 3,
  },
  upcomingEyebrow: {
    fontSize: 11,
    color: Colors.textMuted,
    fontFamily: Typography.family.regular,
    marginBottom: 2,
  },
  upcomingTitle: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '600',
    color: Colors.textPrimary,
    fontFamily: Typography.family.semibold,
    marginBottom: 2,
  },
  upcomingPrice: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontFamily: Typography.family.medium,
  },
  upcomingNotify: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Results ──
  resultsContainer: {
    gap: 0,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingVertical: Space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  resultImageWrap: {
    width: 48,
    height: 48,
    borderRadius: Radius.sm,
    overflow: 'hidden',
  },
  resultImage: {
    width: 48,
    height: 48,
  },
  resultBody: {
    flex: 1,
  },
  resultTitle: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
    color: Colors.textPrimary,
    fontFamily: Typography.family.medium,
    marginBottom: 2,
  },
  resultPrice: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontFamily: Typography.family.regular,
  },
  resultRight: {
    alignItems: 'flex-end',
  },
  resultOutcome: {
    fontSize: 12,
    fontWeight: '600',
    fontFamily: Typography.family.semibold,
    marginBottom: 2,
  },
  resultBids: {
    fontSize: 11,
    color: Colors.textMuted,
    fontFamily: Typography.family.regular,
  },

  // ── Empty market ──
  emptyMarketContainer: {
    flexGrow: 1,
    paddingBottom: Space.xxl,
  },
  emptyMarketResultsWrap: {
    marginTop: Space.xl,
    paddingHorizontal: Space.md,
  },

  // ── Search overlay ──
  searchOverlayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  searchOverlayInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Space.md,
    paddingVertical: 10,
    fontSize: 15,
    color: Colors.textPrimary,
    fontFamily: Typography.family.medium,
    backgroundColor: Colors.surfaceAlt,
  },
  searchIdleContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Space.xl,
  },
  searchIdleHint: {
    fontSize: 14,
    color: Colors.textMuted,
    fontFamily: Typography.family.regular,
    textAlign: 'center',
  },

  // ── Filter result mode ──
  filterResultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  filterResultBackBtn: {
    padding: Space.xs,
  },
  filterResultTitleWrap: {
    flex: 1,
  },
  filterResultTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.textPrimary,
    fontFamily: Typography.family.bold,
  },
  filterResultCount: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontFamily: Typography.family.regular,
    marginTop: 2,
  },
  filterChipsRow: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
  },
  filterChip: {
    paddingVertical: 4,
    paddingHorizontal: Space.sm,
    borderRadius: Radius.full,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    marginRight: Space.xs,
  },
  filterChipText: {
    fontSize: 12,
    color: Colors.textPrimary,
    fontFamily: Typography.family.medium,
  },
  filterChipClear: {
    paddingVertical: 4,
    paddingHorizontal: Space.sm,
    marginRight: Space.xs,
  },
  filterChipClearText: {
    fontSize: 12,
    color: Colors.danger,
    fontFamily: Typography.family.medium,
  },

  // ── Filter sheet ──
  filterSheetContent: {
    padding: Space.lg,
  },
  filterSheetTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.textPrimary,
    fontFamily: Typography.family.bold,
    marginBottom: Space.lg,
  },
  filterSectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
    color: Colors.textSecondary,
    fontFamily: Typography.family.semibold,
    textTransform: 'uppercase',
    marginBottom: Space.sm,
    marginTop: Space.md,
  },
  filterOptionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.sm,
  },
  filterCategoryScroll: {
    flexDirection: 'row',
  },
  filterOption: {
    paddingVertical: 8,
    paddingHorizontal: Space.md,
    borderRadius: Radius.full,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    marginRight: Space.sm,
  },
  filterOptionActive: {
    backgroundColor: Colors.brand,
    borderColor: Colors.brand,
  },
  filterOptionText: {
    fontSize: 13,
    color: Colors.textPrimary,
    fontFamily: Typography.family.medium,
  },
  filterOptionTextActive: {
    color: Colors.textInverse,
  },
  filterActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: Space.xl,
  },
  filterResetBtn: {
    paddingVertical: 10,
    paddingHorizontal: Space.lg,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterResetText: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontFamily: Typography.family.medium,
  },
  filterApplyBtn: {
    flex: 1,
    paddingVertical: Space.sm,
    borderRadius: Radius.md,
    backgroundColor: Colors.brand,
    alignItems: 'center',
    marginLeft: Space.md,
  },
  filterApplyText: {
    fontSize: 14,
    color: Colors.textInverse,
    fontFamily: Typography.family.semibold,
  },
});
