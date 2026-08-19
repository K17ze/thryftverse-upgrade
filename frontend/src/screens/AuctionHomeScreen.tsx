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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
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
  type AuctionBrowseState,
  type AuctionBrowseSort,
  DEFAULT_BROWSE_STATE,
  hasActiveFilters,
  scopeToApiStatus,
  scopeUsesWatchedOnly,
  sortToApiSort,
} from '../utils/auctionHomeLogic';
import { CachedImage } from '../components/CachedImage';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { HorizontalRail } from '../components/HorizontalRail';
import { EmptyState } from '../components/EmptyState';
import { OfflineBanner } from '../components/OfflineBanner';
import { useConnectivity } from '../hooks/useConnectivity';
import { haptics } from '../utils/haptics';
import { Space, Radius, Typography, Type, Stroke, Control, LetterSpacing } from '../theme/designTokens';
import { toIze, formatIzeAmount, formatFiatAmount } from '../utils/currency';
import { BottomSheet } from '../components/BottomSheet';
import {
  AuctionMarketHeader,
  AuctionAttentionStrip,
  AuctionRunwayCard,
  AuctionGridCard,
  AuctionSupportingTile,
  AuctionValueLockup,
  AuctionSkeletons,
  AuctionSegmentRail,
  SegmentContentTransition,
  type AuctionHeaderAction,
  type Segment,
} from '../components/auction';
import {
  listAuctions,
  getAuctionHome,
  getAuctionFacets,
  type MarketAuction,
  type AttentionReason,
  type CategoryWorld,
  type AuctionHomeActivity,
  type SellerSummary,
  type AuctionScope,
  type AuctionFacets,
} from '../services/marketApi';

type NavT = NativeStackNavigationProp<RootStackParamList>;

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
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const hasImage = Boolean(world.representativeImageUrl);
  return (
    <Pressable
      style={[styles.categoryTile, { width: cardWidth }]}
      onPress={() => { haptics.tap(); onPress(); }}
      accessibilityRole="button"
      accessibilityLabel={`Browse ${world.displayName} auctions`}
    >
      {hasImage ? (
        <CachedImage
          uri={world.representativeImageUrl!}
          style={StyleSheet.absoluteFill}
          containerStyle={StyleSheet.absoluteFill}
          contentFit="cover"
        />
      ) : (
        // Deliberate editorial placeholder — not a skeleton
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.surfaceAlt }]} />
      )}
      {/* Restrained gradient only behind label */}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.75)']}
        locations={[0.45, 1]}
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
  formatValueLockup,
}: {
  item: AuctionHomeItem;
  onPress: () => void;
  formatValueLockup: (amountGbp: number) => { izeText: string; localText: string | null };
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const valueLockup = formatValueLockup(item.startingBidGbp);
  const startDate = new Date(item.startsAt);
  const timeStr = startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const dateStr = startDate.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
  const a11yLabel = `Starts ${dateStr} at ${timeStr}. ${item.title}. Starting at ${valueLockup.izeText}`;

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
          <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.surface }]} />
        )}
      </View>
      <View style={styles.upcomingBody}>
        <Text style={styles.upcomingDate}>{dateStr} · {timeStr}</Text>
        {item.brand ? <Text style={styles.upcomingEyebrow} numberOfLines={1}>{item.brand}</Text> : null}
        <Text style={styles.upcomingTitle} numberOfLines={1}>{item.title}</Text>
        <AuctionValueLockup
          izeText={valueLockup.izeText}
          localText={valueLockup.localText}
          state="starting"
          scale="compact"
        />
      </View>
      <Pressable
        style={styles.upcomingNotify}
        onPress={() => { haptics.tap(); onPress(); }}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="View auction"
      >
        <Ionicons name="chevron-forward" size={18} color={colors.brand} />
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
  formatValueLockup,
}: {
  item: AuctionHomeItem;
  onPress: () => void;
  formatValueLockup: (amountGbp: number) => { izeText: string; localText: string | null };
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const valueLockup = formatValueLockup(item.currentBidGbp || item.startingBidGbp);
  const resultText = item.viewerState === 'won' ? 'Won'
    : item.viewerState === 'lost' ? 'Lost'
    : item.terminalReason === 'cancelled' ? 'Cancelled'
    : item.bidCount === 0 ? 'No bids'
    : 'Sold';
  const resultColor = item.viewerState === 'won' ? colors.success
    : item.viewerState === 'lost' ? colors.danger
    : item.terminalReason === 'cancelled' ? colors.textMuted
    : item.bidCount === 0 ? colors.textMuted
    : colors.textSecondary;
  // Truthful continuation action
  const continuationLabel = item.viewerState === 'won' ? 'Continue'
    : item.viewerState === 'lost' ? 'View'
    : null;
  const a11yLabel = `${item.title}. ${resultText}. ${item.bidCount > 0 ? `${item.bidCount} bids` : 'No bids'}. ${valueLockup.izeText}`;

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
          <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.surface }]} />
        )}
      </View>
      <View style={styles.resultBody}>
        <Text style={styles.resultTitle} numberOfLines={1}>{item.title}</Text>
        <Text style={[styles.resultOutcome, { color: resultColor }]}>{resultText}{item.bidCount > 0 ? ` · ${item.bidCount} bids` : ''}</Text>
        {item.bidCount > 0 ? (
          <AuctionValueLockup
            izeText={valueLockup.izeText}
            localText={valueLockup.localText}
            state="final"
            scale="compact"
          />
        ) : null}
      </View>
      {continuationLabel && (
        <View style={styles.resultActionWrap}>
          <Text style={styles.resultActionLabel}>{continuationLabel}</Text>
          <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
        </View>
      )}
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
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { currencyCode, displayMode, goldRates } = useFormattedPrice();
  const { width } = useWindowDimensions();
  const { isOffline } = useConnectivity();
  const [homeData, setHomeData] = React.useState<HomeData>(EMPTY_HOME_DATA);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // ── Canonical browse state (one taxonomy, not three) ──
  const [browseState, setBrowseState] = useState<AuctionBrowseState>(DEFAULT_BROWSE_STATE);
  const hasSetDefaultScope = useRef(false);

  // ── Search overlay ──
  const [searchOverlayVisible, setSearchOverlayVisible] = React.useState(false);
  const [searchState, setSearchState] = React.useState<AuctionSearchState>(IDLE_SEARCH_STATE);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [debouncedQuery, setDebouncedQuery] = React.useState('');
  const [isLoadingMoreSearch, setIsLoadingMoreSearch] = React.useState(false);
  const [paginationError, setPaginationError] = React.useState<string | null>(null);

  // ── Recent auction searches (persisted, per audit doc 07) ──
  const RECENT_AUCTION_SEARCHES_KEY = '@thryftverse_recent_auction_searches';
  const [recentSearches, setRecentSearches] = React.useState<string[]>([]);

  React.useEffect(() => {
    AsyncStorage.getItem(RECENT_AUCTION_SEARCHES_KEY).then((raw) => {
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as string[];
          if (Array.isArray(parsed)) setRecentSearches(parsed);
        } catch { /* ignore corrupt */ }
      }
    }).catch(() => { /* non-fatal */ });
  }, []);

  const saveRecentSearch = React.useCallback(async (term: string) => {
    setRecentSearches((prev) => {
      const updated = [term, ...prev.filter((s) => s !== term)].slice(0, 6);
      void AsyncStorage.setItem(RECENT_AUCTION_SEARCHES_KEY, JSON.stringify(updated)).catch(() => {});
      return updated;
    });
  }, []);

  const clearRecentSearches = React.useCallback(() => {
    setRecentSearches([]);
    void AsyncStorage.removeItem(RECENT_AUCTION_SEARCHES_KEY).catch(() => {});
  }, []);

  // ── Browse result (API-fetched when filters are active) ──
  const [browseResult, setBrowseResult] = React.useState<{
    status: 'idle' | 'loading' | 'ready' | 'empty' | 'error';
    items: AuctionHomeItem[];
    cursor: string | null;
  }>({ status: 'idle', items: [], cursor: null });
  const [isLoadingMoreBrowse, setIsLoadingMoreBrowse] = React.useState(false);
  const browseReqIdRef = React.useRef(0);
  const [browseRefreshTick, setBrowseRefreshTick] = React.useState(0);

  // ── Filter sheet ──
  const [filterSheetVisible, setFilterSheetVisible] = React.useState(false);
  const [draftBrowse, setDraftBrowse] = useState<AuctionBrowseState>(DEFAULT_BROWSE_STATE);

  // ── Server-driven facets (canonical category endpoint, not derived from inventory) ──
  const [facets, setFacets] = React.useState<AuctionFacets | null>(null);
  const [facetsLoading, setFacetsLoading] = React.useState(false);
  const facetsReqIdRef = React.useRef(0);

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
        setError('Unable to load auctions');
        markResyncFailed();
      }
    } finally {
      if (reqId === requestIdRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [resync, clearResyncFailed, markResyncFailed]);

  // useFocusEffect ensures the auction home re-fetches whenever the user
  // navigates back to it (e.g., after creating a new auction).
  useFocusEffect(
    React.useCallback(() => {
      void fetchHome();
    }, [fetchHome])
  );

  React.useEffect(() => {
    if (needsResync) {
      void fetchHome();
    }
  }, [needsResync, fetchHome]);

  // ── Fetch server-driven facets when the filter sheet opens ──
  // Provides canonical category list + price range + status counts
  // independent of loaded home inventory (Phase 2 Finding D fix).
  // Passes the full draft state so the CTA count reflects all active
  // filters, not just the scope (2026 best practice: live counts).
  const fetchFacets = React.useCallback(async (draft: AuctionBrowseState) => {
    setFacetsLoading(true);
    const reqId = ++facetsReqIdRef.current;
    try {
      const result = await getAuctionFacets({
        scope: draft.scope,
        query: draft.query,
        category: draft.categories.length > 0 ? draft.categories[0] : undefined,
        priceMin: draft.priceMin,
        priceMax: draft.priceMax,
      });
      if (reqId !== facetsReqIdRef.current) return;
      setFacets(result);
    } catch {
      // Non-fatal — filter sheet falls back to derived categories
      if (reqId === facetsReqIdRef.current) {
        setFacets(null);
      }
    } finally {
      if (reqId === facetsReqIdRef.current) {
        setFacetsLoading(false);
      }
    }
  }, []);

  React.useEffect(() => {
    if (filterSheetVisible) {
      void fetchFacets(draftBrowse);
    }
  }, [filterSheetVisible, draftBrowse, fetchFacets]);

  // ── Search ──
  const searchReqIdRef = useRef(0);

  const handleRefresh = React.useCallback(() => {
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
      listAuctions({ query: debouncedQuery, status: scopeToApiStatus(browseState.scope), sort: sortToApiSort(browseState.sort) ?? 'endingSoon', limit: 30 })
        .then((result) => {
          if (reqId !== searchReqIdRef.current) return;
          const items = result.items.map(toViewModel);
          setSearchState(createSearchState(debouncedQuery, items.length > 0 ? 'ready' : 'empty', items, result.nextCursor));
          // Persist recent search only when results are found
          if (items.length > 0) {
            void saveRecentSearch(debouncedQuery.trim());
          }
        })
        .catch(() => {
          if (reqId !== searchReqIdRef.current) return;
          setSearchState(createSearchState(debouncedQuery, 'error'));
        });
    }, 400);
    return () => clearTimeout(timer);
  }, [debouncedQuery, browseState.scope, browseState.sort, saveRecentSearch]);

  React.useEffect(() => {
    return () => { searchReqIdRef.current++; };
  }, []);

  const loadMoreSearch = React.useCallback(async () => {
    if (!searchState.cursor || isLoadingMoreSearch) return;
    setIsLoadingMoreSearch(true);
    setPaginationError(null);
    const reqId = ++searchReqIdRef.current;
    try {
      const result = await listAuctions({ query: debouncedQuery, status: scopeToApiStatus(browseState.scope), sort: sortToApiSort(browseState.sort) ?? 'endingSoon', cursor: searchState.cursor, limit: 30 });
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
  }, [searchState.cursor, isLoadingMoreSearch, debouncedQuery, browseState.scope, browseState.sort]);

  // ── Browse results fetching (when filters are active) ──
  React.useEffect(() => {
    if (!isBrowsing) {
      setBrowseResult({ status: 'idle', items: [], cursor: null });
      return;
    }
    const reqId = ++browseReqIdRef.current;
    setBrowseResult({ status: 'loading', items: [], cursor: null });
    const apiStatus = scopeToApiStatus(browseState.scope);
    const apiSort = sortToApiSort(browseState.sort);
    const category = browseState.categories.length > 0 ? browseState.categories[0] : undefined;
    listAuctions({
      status: apiStatus,
      sort: apiSort,
      category,
      query: browseState.query,
      priceMin: browseState.priceMin,
      priceMax: browseState.priceMax,
      watchedOnly: scopeUsesWatchedOnly(browseState.scope) ? true : undefined,
      limit: 30,
    })
      .then((result) => {
        if (reqId !== browseReqIdRef.current) return;
        const items = result.items.map(toViewModel);
        setBrowseResult({
          status: items.length > 0 ? 'ready' : 'empty',
          items,
          cursor: result.nextCursor,
        });
      })
      .catch(() => {
        if (reqId !== browseReqIdRef.current) return;
        setBrowseResult({ status: 'error', items: [], cursor: null });
      });
  }, [browseState, isBrowsing, browseRefreshTick]);

  const loadMoreBrowse = React.useCallback(async () => {
    if (browseResult.cursor === null || isLoadingMoreBrowse) return;
    setIsLoadingMoreBrowse(true);
    setPaginationError(null);
    const reqId = ++browseReqIdRef.current;
    try {
      const apiStatus = scopeToApiStatus(browseState.scope);
      const apiSort = sortToApiSort(browseState.sort);
      const category = browseState.categories.length > 0 ? browseState.categories[0] : undefined;
      const result = await listAuctions({
        status: apiStatus,
        sort: apiSort,
        category,
        query: browseState.query,
        priceMin: browseState.priceMin,
        priceMax: browseState.priceMax,
        watchedOnly: scopeUsesWatchedOnly(browseState.scope) ? true : undefined,
        cursor: browseResult.cursor,
        limit: 30,
      });
      if (reqId !== browseReqIdRef.current) return;
      setBrowseResult((prev) => {
        const existingIds = new Set(prev.items.map((a) => a.id));
        const newItems = result.items.map(toViewModel).filter((a) => !existingIds.has(a.id));
        return { ...prev, items: [...prev.items, ...newItems], cursor: result.nextCursor };
      });
    } catch {
      if (reqId === browseReqIdRef.current) {
        setPaginationError('Failed to load more results');
      }
    } finally {
      if (reqId === browseReqIdRef.current) {
        setIsLoadingMoreBrowse(false);
      }
    }
  }, [browseResult.cursor, isLoadingMoreBrowse, browseState]);

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

  // ── 1ZE + local semantic display ──
  const formatDualPrice = useCallback((amountGbp: number): DualPriceResult => {
    const izeAmount = toIze(amountGbp, 'GBP', goldRates);
    const izeText = formatIzeAmount(izeAmount, 2);
    const fiatValue = izeAmount * (goldRates?.[currencyCode] ?? 1);
    const fiatText = formatFiatAmount(fiatValue, currencyCode, 2);
    if (displayMode === 'ize') return { primaryText: izeText, secondaryText: null };
    if (displayMode === 'fiat') return { primaryText: fiatText, secondaryText: izeText };
    return { primaryText: izeText, secondaryText: fiatText };
  }, [goldRates, currencyCode, displayMode]);

  // ── Separate 1ZE + local text for the value lockup primitive ──
  // Always returns the canonical 1ZE text as izeText and local as localText.
  // In fiat-only display mode, izeText holds the local value and localText is null,
  // preserving the user's display preference.
  const formatValueLockup = useCallback((amountGbp: number): { izeText: string; localText: string | null } => {
    const izeAmount = toIze(amountGbp, 'GBP', goldRates);
    const izeText = formatIzeAmount(izeAmount, 2);
    const fiatValue = izeAmount * (goldRates?.[currencyCode] ?? 1);
    const fiatText = formatFiatAmount(fiatValue, currencyCode, 2);
    if (displayMode === 'ize') return { izeText, localText: null };
    if (displayMode === 'fiat') return { izeText: fiatText, localText: null };
    return { izeText, localText: fiatText };
  }, [goldRates, currencyCode, displayMode]);

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
        priceHigh: 'Price: high to low',
      };
      chips.push({ key: 'sort', label: sortLabels[browseState.sort], type: 'sort' });
    }
    for (const cat of browseState.categories) {
      const label = categoryLabels[cat] ?? cat;
      chips.push({ key: `cat-${cat}`, label: `Category: ${label}`, type: 'category', value: cat });
    }
    if (browseState.priceMin != null) {
      chips.push({ key: 'priceMin', label: `Over £${browseState.priceMin}`, type: 'priceMin' });
    }
    if (browseState.priceMax != null) {
      chips.push({ key: 'priceMax', label: `Under £${browseState.priceMax}`, type: 'priceMax' });
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
        message: `Top bid · ${timeLabel}`,
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
        message: 'Payment required',
        actionLabel: 'Continue',
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
                      <Ionicons name="pricetag-outline" size={13} color={colors.textMuted} />
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
    <View style={styles.container}>
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

// ════════════════════════════════════════════════════════════════
// FILTER SHEET — redesigned with hierarchical categories, checkmarked
// sort rows, price range/presets, and bottom CTA with count
// ════════════════════════════════════════════════════════════════
const SORT_OPTIONS: { key: AuctionBrowseSort; label: string }[] = [
  { key: 'recommended', label: 'Recommended' },
  { key: 'endingSoon', label: 'Ending soon' },
  { key: 'newest', label: 'Newest' },
  { key: 'mostBids', label: 'Most bids' },
  { key: 'priceLow', label: 'Price: low to high' },
  { key: 'priceHigh', label: 'Price: high to low' },
];

const PRICE_PRESETS: { label: string; min?: number; max?: number }[] = [
  { label: 'Under £50', max: 50 },
  { label: '£50 – £200', min: 50, max: 200 },
  { label: '£200 – £500', min: 200, max: 500 },
  { label: 'Over £500', min: 500 },
];

const FilterSheet = memo(function FilterSheet({
  visible,
  onDismiss,
  categoryOptions,
  categoryLabels,
  categoryCounts,
  draftBrowse,
  setDraftBrowse,
  onReset,
  onApply,
  resultCount,
  facetsLoading,
}: {
  visible: boolean;
  onDismiss: () => void;
  categoryOptions: string[];
  categoryLabels?: Record<string, string>;
  categoryCounts?: Record<string, number>;
  draftBrowse: AuctionBrowseState;
  setDraftBrowse: React.Dispatch<React.SetStateAction<AuctionBrowseState>>;
  onReset: () => void;
  onApply: () => void;
  resultCount?: number;
  facetsLoading?: boolean;
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const activeCount = useMemo(() => {
    let n = 0;
    if (draftBrowse.sort !== 'recommended') n++;
    n += draftBrowse.categories.length;
    if (draftBrowse.priceMin != null) n++;
    if (draftBrowse.priceMax != null) n++;
    return n;
  }, [draftBrowse]);

  const toggleCategory = useCallback((cat: string) => {
    haptics.tap();
    setDraftBrowse((prev) => {
      const has = prev.categories.includes(cat);
      return {
        ...prev,
        categories: has
          ? prev.categories.filter((c) => c !== cat)
          : [...prev.categories, cat],
      };
    });
  }, [setDraftBrowse]);

  const setSort = useCallback((sort: AuctionBrowseSort) => {
    haptics.tap();
    setDraftBrowse((prev) => ({ ...prev, sort }));
  }, [setDraftBrowse]);

  const applyPricePreset = useCallback((preset: { min?: number; max?: number }) => {
    haptics.tap();
    setDraftBrowse((prev) => ({ ...prev, priceMin: preset.min, priceMax: preset.max }));
  }, [setDraftBrowse]);

  const clearPrice = useCallback(() => {
    haptics.tap();
    setDraftBrowse((prev) => ({ ...prev, priceMin: undefined, priceMax: undefined }));
  }, [setDraftBrowse]);

  const priceLabel = useMemo(() => {
    if (draftBrowse.priceMin != null && draftBrowse.priceMax != null) {
      return `£${draftBrowse.priceMin} – £${draftBrowse.priceMax}`;
    }
    if (draftBrowse.priceMin != null) return `Over £${draftBrowse.priceMin}`;
    if (draftBrowse.priceMax != null) return `Under £${draftBrowse.priceMax}`;
    return 'Any price';
  }, [draftBrowse.priceMin, draftBrowse.priceMax]);

  return (
    <BottomSheet visible={visible} onDismiss={onDismiss}>
      <View style={styles.filterSheetContent}>
        <Text style={styles.filterSheetTitle}>Filter & Sort</Text>

        {/* ── Sort: checkmarked rows ── */}
        <Text style={styles.filterSectionLabel}>Sort</Text>
        <View style={styles.filterSortRows}>
          {SORT_OPTIONS.map((opt) => {
            const selected = draftBrowse.sort === opt.key;
            return (
              <Pressable
                key={opt.key}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={({ pressed }) => [
                  styles.filterSortRow,
                  pressed && styles.filterOptionPressed,
                ]}
                onPress={() => setSort(opt.key)}
                accessibilityRole="button"
                accessibilityLabel={`Sort by ${opt.label}`}
                accessibilityState={{ selected }}
              >
                <Text style={[styles.filterSortRowText, selected && styles.filterSortRowTextActive]}>
                  {opt.label}
                </Text>
                {selected && (
                  <Ionicons name="checkmark" size={18} color={colors.brand} />
                )}
              </Pressable>
            );
          })}
        </View>

        {/* ── Price range: presets + current label ── */}
        <Text style={styles.filterSectionLabel}>Price</Text>
        <View style={styles.filterPricePresets}>
          <Pressable
            style={({ pressed }) => [
              styles.filterPriceChip,
              draftBrowse.priceMin == null && draftBrowse.priceMax == null && styles.filterPriceChipActive,
              pressed && styles.filterOptionPressed,
            ]}
            onPress={clearPrice}
            accessibilityRole="button"
            accessibilityLabel="Any price"
            accessibilityState={{ selected: draftBrowse.priceMin == null && draftBrowse.priceMax == null }}
          >
            <Text style={[styles.filterPriceChipText, draftBrowse.priceMin == null && draftBrowse.priceMax == null && styles.filterPriceChipTextActive]}>
              Any
            </Text>
          </Pressable>
          {PRICE_PRESETS.map((preset) => {
            const selected = draftBrowse.priceMin === preset.min && draftBrowse.priceMax === preset.max;
            return (
              <Pressable
                key={preset.label}
                style={({ pressed }) => [
                  styles.filterPriceChip,
                  selected && styles.filterPriceChipActive,
                  pressed && styles.filterOptionPressed,
                ]}
                onPress={() => applyPricePreset(preset)}
                accessibilityRole="button"
                accessibilityLabel={preset.label}
                accessibilityState={{ selected }}
              >
                <Text style={[styles.filterPriceChipText, selected && styles.filterPriceChipTextActive]}>
                  {preset.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.filterPriceCurrent}>{priceLabel}</Text>

        {/* ── Categories: hierarchical checkmarked rows ── */}
        {categoryOptions.length > 0 && (
          <>
            <Text style={styles.filterSectionLabel}>Categories</Text>
            <View style={styles.filterCategoryList}>
              {categoryOptions.map((cat) => {
                const selected = draftBrowse.categories.includes(cat);
                const displayLabel = categoryLabels?.[cat] ?? cat;
                const count = categoryCounts?.[cat];
                return (
                  <Pressable
                    key={cat}
                    style={({ pressed }) => [
                      styles.filterCategoryRow,
                      pressed && styles.filterOptionPressed,
                    ]}
                    onPress={() => toggleCategory(cat)}
                    accessibilityRole="button"
                    accessibilityLabel={`Category ${displayLabel}${count != null ? `, ${count} auctions` : ''}`}
                    accessibilityState={{ selected }}
                  >
                    <View style={styles.filterCategoryRowLabel}>
                      <Text style={[styles.filterCategoryRowText, selected && styles.filterCategoryRowTextActive]}>
                        {displayLabel}
                      </Text>
                      {count != null && (
                        <Text style={styles.filterCategoryCount}>{count}</Text>
                      )}
                    </View>
                    <View style={styles.filterCheckbox}>
                      {selected && <Ionicons name="checkmark" size={16} color={colors.brand} />}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </>
        )}

        {/* ── Bottom CTA with result count ── */}
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
            accessibilityLabel={
              resultCount != null
                ? `Show ${resultCount} results`
                : activeCount > 0
                  ? `Show ${activeCount} ${activeCount === 1 ? 'filter' : 'filters'}`
                  : 'Show results'
            }
          >
            <Text style={styles.filterApplyText}>
              {resultCount != null
                ? `Show ${resultCount} ${resultCount === 1 ? 'result' : 'results'}`
                : activeCount > 0
                  ? `Show ${activeCount} ${activeCount === 1 ? 'filter' : 'filters'}`
                  : 'Show results'
              }
            </Text>
          </Pressable>
        </View>
      </View>
    </BottomSheet>
  );
});

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  contentContainer: {
    paddingBottom: Space.xxl + 24,
  },

  // ── Active filter chips (individually removable) ──
  filterChipsBar: {
    paddingVertical: Space.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  filterResultSummary: {
    fontSize: Type.caption.size,
    color: colors.textSecondary,
    fontFamily: Typography.family.medium,
    letterSpacing: 0,
    fontVariant: ['tabular-nums'],
    paddingHorizontal: Space.md,
    paddingBottom: Space.xs,
  },
  filterChipsContent: {
    paddingHorizontal: Space.md,
    gap: Space.xs,
    alignItems: 'center',
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    paddingHorizontal: Space.sm + 2,
    paddingVertical: Space.xs + 1,
    borderRadius: Radius.full,
    backgroundColor: colors.surfaceAlt,
    minHeight: 32,
  },
  filterChipText: {
    fontSize: Type.caption.size,
    fontWeight: '500',
    color: colors.textPrimary,
    fontFamily: Typography.family.medium,
    letterSpacing: 0,
    maxWidth: 160,
  },
  filterChipClear: {
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs + 1,
    minHeight: 32,
    justifyContent: 'center',
  },
  filterChipClearText: {
    fontSize: Type.caption.size,
    fontWeight: '600',
    color: colors.brand,
    fontFamily: Typography.family.semibold,
  },

  // ── Zone wrapper ──
  zoneWrap: {
    paddingHorizontal: Space.md,
    marginTop: Space.xl,
  },

  // ── Section title (no subtitle) ──
  sectionTitle: {
    fontSize: Type.sectionTitle.size,
    lineHeight: Type.sectionTitle.lineHeight,
    fontWeight: '700',
    letterSpacing: Type.sectionTitle.letterSpacing,
    color: colors.textPrimary,
    fontFamily: Typography.family.bold,
    marginBottom: Space.md,
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
    marginTop: Space.xl,
  },
  compositionEmpty: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.xl,
    alignItems: 'center',
  },
  compositionEmptyText: {
    fontSize: Type.body.size,
    color: colors.textMuted,
    fontFamily: Typography.family.regular,
  },
  asymmetricRow: {
    flexDirection: 'row',
    gap: Space.sm,
    alignItems: 'stretch',
  },
  supportingColumn: {
    gap: Space.sm,
    flex: 1,
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
    height: Space.xxl + Space.xxl + Space.xxl + Space.xxl + Space.xxl + Space.xxl + Space.xxl - 20,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.surfaceAlt,
  },
  categoryTileOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Space.md,
    paddingVertical: Space.md,
  },
  categoryTileName: {
    fontSize: Type.bodyStrong.size,
    fontWeight: '700',
    color: colors.textInverse,
    fontFamily: Typography.family.bold,
    letterSpacing: LetterSpacing.normal - 0.1,
  },

  // ── Upcoming rows ──
  upcomingContainer: {
    gap: 0,
  },
  upcomingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingVertical: Space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  upcomingImageWrap: {
    width: Space.xxl + Space.xxl + Space.xs,
    height: Space.xxl + Space.xxl + Space.xs,
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  upcomingImage: {
    width: Space.xxl + Space.xxl + Space.xs,
    height: Space.xxl + Space.xxl + Space.xs,
  },
  upcomingBody: {
    flex: 1,
    gap: Space.xs / 4,
  },
  upcomingDate: {
    fontSize: Type.label.size,
    lineHeight: Type.label.lineHeight,
    fontWeight: '600',
    letterSpacing: Type.label.letterSpacing,
    color: colors.textSecondary,
    fontFamily: Typography.family.semibold,
    marginBottom: Space.xs / 2,
    fontVariant: ['tabular-nums'],
  },
  upcomingEyebrow: {
    fontSize: Type.meta.size,
    color: colors.textMuted,
    fontFamily: Typography.family.medium,
    marginBottom: Space.xs / 4,
    letterSpacing: Type.caption.letterSpacing,
  },
  upcomingTitle: {
    fontSize: Type.bodyStrong.size,
    lineHeight: Type.bodyStrong.lineHeight,
    fontWeight: '600',
    color: colors.textPrimary,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.bodyStrong.letterSpacing,
  },
  upcomingNotify: {
    width: Control.hit,
    height: Control.hit,
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
    paddingVertical: Space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  resultImageWrap: {
    width: Space.xxl + Space.xl + Space.xl - 4,
    height: Space.xxl + Space.xl + Space.xl - 4,
    borderRadius: Radius.md,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  resultImage: {
    width: Space.xxl + Space.xl + Space.xl - 4,
    height: Space.xxl + Space.xl + Space.xl - 4,
  },
  resultBody: {
    flex: 1,
    gap: Space.xs / 2,
  },
  resultTitle: {
    fontSize: Type.bodyStrong.size,
    lineHeight: Type.bodyStrong.lineHeight,
    fontWeight: '600',
    color: colors.textPrimary,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.bodyStrong.letterSpacing,
  },
  resultOutcome: {
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    fontWeight: '600',
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.caption.letterSpacing,
    fontVariant: ['tabular-nums'],
  },
  resultActionWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs / 2,
  },
  resultActionLabel: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.medium,
    color: colors.textMuted,
    letterSpacing: Type.caption.letterSpacing,
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
    borderBottomColor: colors.border,
  },
  searchOverlayInput: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm + 2,
    fontSize: Type.bodyStrong.size,
    color: colors.textPrimary,
    fontFamily: Typography.family.medium,
    backgroundColor: colors.surfaceAlt,
  },
  searchScopeContext: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  searchScopeText: {
    fontSize: Type.caption.size,
    color: colors.textSecondary,
    fontFamily: Typography.family.medium,
    letterSpacing: 0,
  },
  searchIdleContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Space.xl,
  },
  searchIdleScroll: {
    flex: 1,
  },
  searchIdleContent: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.lg,
    gap: Space.xl,
  },
  searchIdleFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Space.xxl,
  },
  searchIdleHint: {
    fontSize: Type.body.size,
    color: colors.textMuted,
    fontFamily: Typography.family.regular,
    textAlign: 'center',
  },
  searchIdleSection: {
    gap: Space.sm,
  },
  searchIdleSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  searchIdleSectionTitle: {
    fontSize: Type.caption.size,
    fontWeight: '600',
    letterSpacing: LetterSpacing.wide + 0.08,
    color: colors.textSecondary,
    fontFamily: Typography.family.semibold,
  },
  searchIdleClearBtn: {
    fontSize: Type.caption.size,
    color: colors.brand,
    fontFamily: Typography.family.medium,
  },
  searchIdleChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.xs,
  },
  searchIdleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    paddingHorizontal: Space.sm + 2,
    paddingVertical: Space.xs + 2,
    borderRadius: Radius.full,
    backgroundColor: colors.surfaceAlt,
  },
  searchIdleChipText: {
    fontSize: Type.caption.size,
    color: colors.textPrimary,
    fontFamily: Typography.family.medium,
    maxWidth: 140,
  },

  // ── Filter sheet ──
  filterSheetContent: {
    padding: Space.lg,
  },
  filterSheetTitle: {
    fontSize: Type.priceList.size,
    fontWeight: '700',
    color: colors.textPrimary,
    fontFamily: Typography.family.bold,
    marginBottom: Space.lg,
  },
  filterSectionLabel: {
    fontSize: Type.caption.size,
    fontWeight: '600',
    letterSpacing: LetterSpacing.wide + 0.08,
    color: colors.textSecondary,
    fontFamily: Typography.family.semibold,
    marginBottom: Space.sm,
    marginTop: Space.md,
  },
  filterOptionPressed: {
    opacity: 0.7,
  },

  // ── Sort rows (checkmarked) ──
  filterSortRows: {
    gap: 0,
  },
  filterSortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Space.sm + 2,
    paddingHorizontal: Space.sm,
    borderRadius: Radius.sm,
  },
  filterSortRowText: {
    fontSize: Type.body.size,
    color: colors.textPrimary,
    fontFamily: Typography.family.medium,
  },
  filterSortRowTextActive: {
    fontFamily: Typography.family.semibold,
    color: colors.textPrimary,
  },

  // ── Price presets ──
  filterPricePresets: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.sm,
  },
  filterPriceChip: {
    paddingVertical: Space.sm,
    paddingHorizontal: Space.md,
    borderRadius: Radius.full,
    backgroundColor: colors.surface,
    borderWidth: Stroke.standard,
    borderColor: colors.border,
  },
  filterPriceChipActive: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  filterPriceChipText: {
    fontSize: Type.caption.size,
    color: colors.textPrimary,
    fontFamily: Typography.family.medium,
  },
  filterPriceChipTextActive: {
    color: colors.textInverse,
  },
  filterPriceCurrent: {
    fontSize: Type.caption.size,
    color: colors.textMuted,
    fontFamily: Typography.family.regular,
    marginTop: Space.sm,
  },

  // ── Category rows (hierarchical with checkboxes) ──
  filterCategoryList: {
    gap: 0,
  },
  filterCategoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Space.sm + 2,
    paddingHorizontal: Space.sm,
    borderRadius: Radius.sm,
  },
  filterCategoryRowText: {
    fontSize: Type.body.size,
    color: colors.textPrimary,
    fontFamily: Typography.family.medium,
  },
  filterCategoryRowTextActive: {
    fontFamily: Typography.family.semibold,
  },
  filterCategoryRowLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    flex: 1,
  },
  filterCategoryCount: {
    fontSize: Type.caption.size,
    color: colors.textMuted,
    fontFamily: Typography.family.regular,
    fontVariant: ['tabular-nums'],
  },
  filterCheckbox: {
    width: 22,
    height: 22,
    borderRadius: Radius.sm,
    borderWidth: Stroke.standard,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Filter actions ──
  filterActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: Space.xl,
  },
  filterResetBtn: {
    paddingVertical: Space.sm + 2,
    paddingHorizontal: Space.lg,
    borderRadius: Radius.md,
    borderWidth: Stroke.standard,
    borderColor: colors.border,
  },
  filterResetText: {
    fontSize: Type.body.size,
    color: colors.textSecondary,
    fontFamily: Typography.family.medium,
  },
  filterApplyBtn: {
    flex: 1,
    paddingVertical: Space.sm,
    borderRadius: Radius.md,
    backgroundColor: colors.brand,
    alignItems: 'center',
    marginLeft: Space.md,
  },
  filterApplyText: {
    fontSize: Type.body.size,
    color: colors.textInverse,
    fontFamily: Typography.family.semibold,
  },
  });
}
