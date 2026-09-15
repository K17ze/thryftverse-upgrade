import React from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { RouteProp, useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAppTheme } from '../theme/ThemeContext';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import {
  fetchCoOwnHoldings,
  listCoOwnAssetsPage,
  fetchCoOwnWatchlist,
  type MarketCoOwnAsset,
} from '../services/marketApi';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useToast } from '../context/ToastContext';
import { useBackendData } from '../context/BackendDataContext';
import { Radius, Space, Typography, Stroke, Control, LetterSpacing } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { haptics } from '../utils/haptics';
import { getCategoryFocalPoint } from '../utils/media';
import { AppInput } from '../components/ui/AppInput';
import { AnimatedPressable } from '../components/AnimatedPressable';
import {
  CoOwnCompactPositionCard,
  CoOwnHubSkeleton,
  CoOwnInstrumentCard,
  CoOwnMarketHighlightsCarousel,
  CoOwnOfflineBanner,
  CoOwnSegmentTabs,
  CoOwnStateCanvas,
  COOWN_POSITION_CARD_WIDTH,
  type CoOwnAssetStatus,
  type CoOwnHubSegment,
  type CoOwnMarketHighlight,
} from '../components/coown';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { useConnectivity } from '../hooks/useConnectivity';
import { formatCoOwnIze } from '../utils/currency';

type NavT = NativeStackNavigationProp<RootStackParamList>;
type SortOption = 'newest' | 'price' | 'activity';
// Canonical segment union lives in CoOwnSegmentTabs — single source of truth.
type HubSegment = CoOwnHubSegment;

interface HubAsset {
  id: string;
  listingId: string;
  issuerId: string;
  title: string;
  image: string;
  category: string;
  totalUnits: number;
  availableUnits: number;
  unitPriceGBP: number;
  unitPriceStable: number;
  bestBidGBP?: number | null;
  bidDepthUnits?: number;
  bestAskGBP?: number | null;
  askDepthUnits?: number;
  volume24hGbp?: number | null;
  lastExecutionPriceGBP?: number | null;
  lastExecutionAt?: string | null;
  settlementMode: 'ONEZE';
  issuerJurisdiction?: string;
  holders: number;
  yourUnits: number;
  avgEntryPriceGBP?: number;
  realizedProfitGBP?: number;
  isOpen: boolean;
  /** Canonical backend lifecycle. Keep these fields intact instead of
   * inferring market state from allocation or old activity. */
  offeringStatus?: 'offering' | 'allocated' | 'failed' | 'closed';
  marketStatus?: 'pre_market' | 'trading' | 'paused' | 'closed';
  createdAt: string;
}

type HubRow =
  | { kind: 'highlights'; key: 'highlights' }
  | { kind: 'positions'; key: 'positions' }
  | { kind: 'instrumentsHeader'; key: 'instruments-header' }
  | { kind: 'instrumentRow'; key: string; assets: HubAsset[] }
  | { kind: 'instrumentsEmpty'; key: 'instruments-empty' };

const SORT_OPTIONS: SortOption[] = ['newest', 'price', 'activity'];
const POSITION_CARD_WIDTH = COOWN_POSITION_CARD_WIDTH;
const POSITION_CARD_GAP = 12;
const POSITION_SNAP_INTERVAL = POSITION_CARD_WIDTH + POSITION_CARD_GAP;
// Catalogue page size for both the first load and each onEndReached page.
const CATALOGUE_PAGE_SIZE = 60;
const SORT_LABELS: Record<SortOption, string> = {
  newest: 'Newest',
  price: 'Reference price',
  activity: 'Activity',
};
const SECTION_TITLES: Record<HubSegment, string> = {
  offerings: 'Offerings',
  trading: 'Trading',
  watchlist: 'Watchlist',
};

/** Map legacy route param values (defined in RootStackParamList, which we
 * cannot edit) to the new discovery segments. */
function normalizeInitialSegment(value: 'active' | 'new_issues' | 'watchlist' | undefined): HubSegment {
  if (value === 'watchlist') return 'watchlist';
  // 'active' and 'new_issues' both map to the offerings discovery segment.
  return 'offerings';
}

/** Whether an asset has secondary-market activity — used to classify it
 * as "Trading" and to choose tile content. Fails closed: only true when
 * the API actually reports orders or settled trades. */
function hasMarketActivity(asset: HubAsset): boolean {
  return (
    asset.bestBidGBP != null ||
    asset.bestAskGBP != null ||
    (asset.volume24hGbp ?? 0) > 0 ||
    asset.lastExecutionPriceGBP != null
  );
}

/** Lifecycle status — drives the status-dot colour on tiles.
 * 'open' (active/green) is used for both Offering and Trading so the
 * dot reads as "live". 'closed' (muted) marks tradeable-but-quiet
 * assets. 'paused' (warning) marks ended/failed offerings. */
function getStatus(asset: HubAsset): CoOwnAssetStatus {
  if (asset.offeringStatus === 'failed' || asset.marketStatus === 'paused') return 'paused';
  if (asset.marketStatus === 'closed' || asset.offeringStatus === 'closed') return 'closed';
  if (asset.offeringStatus === 'offering' || asset.marketStatus === 'trading' || asset.marketStatus === 'pre_market') return 'open';
  // Offering — initial offering still accepting funds.
  if (asset.isOpen && asset.availableUnits > 0) return 'open';
  // Fully allocated — secondary market territory.
  if (asset.availableUnits === 0) {
    return hasMarketActivity(asset) ? 'open' : 'closed';
  }
  // isOpen but no units left to fund AND no market activity, or closed.
  return asset.isOpen ? 'closed' : 'paused';
}

function getStatusLabel(asset: HubAsset): string {
  if (asset.offeringStatus === 'offering') return 'Offering';
  if (asset.marketStatus === 'paused') return 'Trading paused';
  if (asset.marketStatus === 'trading') return 'Trading';
  if (asset.offeringStatus === 'allocated' && asset.marketStatus === 'pre_market') return 'Allocated';
  if (asset.marketStatus === 'closed' || asset.offeringStatus === 'closed') return 'Closed';
  if (asset.isOpen && asset.availableUnits > 0) return 'Offering';
  if (asset.availableUnits === 0) {
    return hasMarketActivity(asset) ? 'Trading' : 'Available to trade';
  }
  return asset.isOpen ? 'Available to trade' : 'Funding ended';
}

function isOfferingAsset(asset: HubAsset): boolean {
  return asset.offeringStatus
    ? asset.offeringStatus === 'offering'
    : asset.isOpen && asset.availableUnits > 0;
}

function isTradingAsset(asset: HubAsset): boolean {
  return asset.marketStatus
    ? asset.marketStatus === 'trading'
    : !isOfferingAsset(asset) && hasMarketActivity(asset);
}

export default function CoOwnHubScreen() {
  const navigation = useNavigation<NavT>();
  const route = useRoute<RouteProp<RootStackParamList, 'CoOwnHub'>>();
  const currentUser = useStore((state) => state.currentUser);
  const coOwnWatchlist = useStore((state) => state.coOwnWatchlist);
  const coOwnWatchStatus = useStore((state) => state.coOwnWatchStatus);
  const toggleCoOwnWatch = useStore((state) => state.toggleCoOwnWatch);
  const { formatFromFiat } = useFormattedPrice();
  const { show } = useToast();
  const { colors } = useAppTheme();
  const { width: screenWidth } = useWindowDimensions();
  const { listings } = useBackendData();
  const { isOffline } = useConnectivity();
  const actingUserId = currentUser?.id;

  const [query, setQuery] = React.useState('');
  const [isSearchExpanded, setIsSearchExpanded] = React.useState(false);
  const [isSortExpanded, setIsSortExpanded] = React.useState(false);
  const [sortBy, setSortBy] = React.useState<SortOption>('newest');
  const [activeSegment, setActiveSegment] = React.useState<HubSegment>(normalizeInitialSegment(route.params?.initialSegment));
  const [remoteAssets, setRemoteAssets] = React.useState<HubAsset[]>([]);
  // U03: Watched assets fetched separately via fetchCoOwnWatchlist so they
  // remain discoverable outside the loaded catalogue pages.
  const [watchedAssets, setWatchedAssets] = React.useState<HubAsset[]>([]);
  const [holdings, setHoldings] = React.useState<Map<string, { units: number; avgEntry: number; realized: number }>>(new Map());
  const [isSyncing, setIsSyncing] = React.useState(true);
  const [isError, setIsError] = React.useState(false);
  const [holdingsError, setHoldingsError] = React.useState(false);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [isLoadingMore, setIsLoadingMore] = React.useState(false);
  const [loadMoreError, setLoadMoreError] = React.useState(false);

  // U07: Preserve scroll position through detail navigation.
  const flashListRef = React.useRef<FlashListRef<HubRow>>(null);
  const scrollOffsetRef = React.useRef(0);
  const hasLoadedRef = React.useRef(false);
  // Catalogue pagination — refs because they drive fetch logic, not render.
  const nextCursorRef = React.useRef<string | null>(null);
  const loadingMoreRef = React.useRef(false);
  const mountedRef = React.useRef(true);
  // Read-through refs for values that feed fetch logic. If these lived in
  // loadData's deps, every appended page / keystroke would change its
  // identity, re-fire useFocusEffect, and truncate the catalogue back to
  // page 1.
  const queryRef = React.useRef(query);
  const remoteAssetsLengthRef = React.useRef(remoteAssets.length);
  React.useEffect(() => { queryRef.current = query; }, [query]);
  React.useEffect(() => { remoteAssetsLengthRef.current = remoteAssets.length; }, [remoteAssets.length]);
  // Incremented on every fresh load so a page response that was in flight
  // during a refresh cannot write a stale cursor over the reset state.
  const catalogueEpochRef = React.useRef(0);
  React.useEffect(() => () => { mountedRef.current = false; }, []);

  const mapAssetItem = React.useCallback((item: MarketCoOwnAsset): HubAsset => {
    const linkedListing = item.listingId
      ? listings.find((listing) => listing.id === item.listingId)
      : undefined;
    return {
      id: item.id,
      listingId: item.listingId,
      issuerId: item.issuerId,
      title: item.title,
      image: item.imageUrl || linkedListing?.images?.[0] || '',
      category: linkedListing?.category || linkedListing?.subcategory || 'Luxury asset',
      totalUnits: item.totalUnits,
      availableUnits: item.availableUnits,
      unitPriceGBP: item.unitPriceGbp,
      unitPriceStable: item.unitPriceStable,
      bestBidGBP: item.bestBidGbp ?? null,
      bidDepthUnits: item.bidDepthUnits ?? 0,
      bestAskGBP: item.bestAskGbp ?? null,
      askDepthUnits: item.askDepthUnits ?? 0,
      volume24hGbp: item.volume24hGbp ?? null,
      lastExecutionPriceGBP: item.marketSnapshot?.lastExecutionPriceGbp ?? null,
      lastExecutionAt: item.marketSnapshot?.lastExecutionAt ?? null,
      settlementMode: item.settlementMode as HubAsset['settlementMode'],
      issuerJurisdiction: item.issuerJurisdiction ?? undefined,
      holders: item.holders,
      yourUnits: 0,
      isOpen: item.isOpen,
      offeringStatus: item.offeringStatus,
      marketStatus: item.marketStatus,
      createdAt: item.createdAt,
    };
  }, [listings]);

  const loadData = React.useCallback((opts?: { silent?: boolean }) => {
    // Public browsing: always fetch the marketplace catalogue so
    // unauthenticated users can explore offerings and trading activity.
    // Holdings (portfolio) are only fetched when the user is signed in —
    // auth is requested at the point of saving, funding, or trading, not
    // at the point of discovery.
    let cancelled = false;
    const silent = opts?.silent ?? false;
    // U07: Don't flash the loading skeleton when we already have data
    // (e.g., returning from AssetDetail). Only show it on first load.
    if (!silent || remoteAssetsLengthRef.current === 0) {
      setIsSyncing(true);
    }
    setIsError(false);
    setHoldingsError(false);

    const holdingsPromise = actingUserId
      ? fetchCoOwnHoldings(actingUserId)
          .then((items) => ({ items, failed: false }))
          .catch(() => ({ items: [], failed: true }))
      : Promise.resolve({ items: [] as Awaited<ReturnType<typeof fetchCoOwnHoldings>>, failed: false });

    // U03: Fetch watched assets separately so they remain discoverable
    // outside the loaded catalogue pages. Only when authenticated.
    const watchedPromise = actingUserId
      ? fetchCoOwnWatchlist(200)
          .then((items) => ({ items, failed: false }))
          .catch(() => ({ items: [] as Awaited<ReturnType<typeof fetchCoOwnWatchlist>>, failed: true }))
      : Promise.resolve({ items: [] as Awaited<ReturnType<typeof fetchCoOwnWatchlist>>, failed: false });

    Promise.all([
      listCoOwnAssetsPage({ limit: CATALOGUE_PAGE_SIZE, search: queryRef.current.trim() || undefined }),
      holdingsPromise,
      watchedPromise,
    ])
      .then(([page, holdingResult, watchedResult]) => {
        if (cancelled) return;
        // A fresh load replaces the catalogue — reset the page cursor so
        // infinite scroll resumes from the first page boundary, and bump
        // the epoch so an in-flight page response is discarded.
        catalogueEpochRef.current += 1;
        nextCursorRef.current = page.nextCursor;
        setLoadMoreError(false);
        const mapped = page.items.map(mapAssetItem);
        const holdingsMap = new Map<string, { units: number; avgEntry: number; realized: number }>();
        for (const holding of holdingResult.items) {
          holdingsMap.set(holding.assetId, {
            units: holding.unitsOwned,
            avgEntry: holding.avgEntryPriceGbp,
            realized: holding.realizedPnlGbp,
          });
        }
        setRemoteAssets(mapped);
        setHoldings(holdingsMap);
        setHoldingsError(holdingResult.failed);
        // U03: Watched assets are mapped separately so they're always
        // available in the watchlist segment, even outside the loaded pages.
        setWatchedAssets(watchedResult.items.map(mapAssetItem));
        hasLoadedRef.current = true;
      })
      .catch(() => {
        if (cancelled) return;
        show('Failed to load marketplace', 'error');
        setIsError(true);
      })
      .finally(() => {
        if (!cancelled) {
          setIsSyncing(false);
          setIsRefreshing(false);
        }
      });

    return () => { cancelled = true; };
  }, [actingUserId, mapAssetItem, show]);

  // Infinite scroll — fetch the next catalogue page. Guarded by refs so
  // repeated onEndReached calls cannot fire concurrent requests. On failure
  // the cursor is preserved so the footer retry resumes in place.
  const handleLoadMore = React.useCallback(() => {
    const cursor = nextCursorRef.current;
    if (!cursor || loadingMoreRef.current) return;
    const epoch = catalogueEpochRef.current;
    loadingMoreRef.current = true;
    setIsLoadingMore(true);
    setLoadMoreError(false);
    listCoOwnAssetsPage({
      limit: CATALOGUE_PAGE_SIZE,
      cursor,
      search: queryRef.current.trim() || undefined,
    })
      .then((page) => {
        // Discard if the catalogue was refreshed while this page was in
        // flight — its cursor no longer belongs to the current data set.
        if (!mountedRef.current || epoch !== catalogueEpochRef.current) return;
        nextCursorRef.current = page.nextCursor;
        setRemoteAssets((prev) => {
          const seen = new Set(prev.map((asset) => asset.id));
          const fresh = page.items.map(mapAssetItem).filter((asset) => !seen.has(asset.id));
          return fresh.length > 0 ? [...prev, ...fresh] : prev;
        });
      })
      .catch(() => {
        if (!mountedRef.current || epoch !== catalogueEpochRef.current) return;
        setLoadMoreError(true);
      })
      .finally(() => {
        loadingMoreRef.current = false;
        if (mountedRef.current) setIsLoadingMore(false);
      });
  }, [mapAssetItem]);

  // U07: Re-fetch on initial focus only. On subsequent focuses (returning
  // from AssetDetail), do a silent refresh that preserves scroll position
  // and avoids the loading skeleton flash. The query, sort, and segment
  // state survive navigation since they live in component state.
  useFocusEffect(
    React.useCallback(() => {
      const isInitial = !hasLoadedRef.current;
      const cleanup = loadData({ silent: !isInitial });
      // U07: Restore scroll position after data loads on return from detail.
      if (!isInitial) {
        requestAnimationFrame(() => {
          flashListRef.current?.scrollToOffset({
            offset: scrollOffsetRef.current,
            animated: false,
          });
        });
      }
      return cleanup;
    }, [loadData])
  );

  // Search is server-side — debounce keystrokes into a single silent
  // refetch so typing doesn't fire a catalogue+holdings+watchlist request
  // per character. The first load still comes from the focus effect.
  React.useEffect(() => {
    if (!hasLoadedRef.current) return;
    const timer = setTimeout(() => {
      loadData({ silent: true });
    }, 300);
    return () => clearTimeout(timer);
  }, [query, loadData]);

  React.useEffect(() => {
    if (route.params?.initialSegment) {
      setActiveSegment(normalizeInitialSegment(route.params.initialSegment));
    }
  }, [route.params?.initialSegment]);

  const handleBack = React.useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    navigation.navigate('MainTabs');
  }, [navigation]);

  const handleRefresh = React.useCallback(() => {
    setIsRefreshing(true);
    loadData();
  }, [loadData]);

  const marketAssets = React.useMemo(
    () => {
      // U03: Merge watched assets (fetched separately) into the catalogue
      // so they remain discoverable outside the loaded catalogue pages.
      // Deduplicate by id — catalogue items take precedence.
      const catalogueIds = new Set(remoteAssets.map((a) => a.id));
      const extraWatched = watchedAssets.filter((a) => !catalogueIds.has(a.id));
      return [...remoteAssets, ...extraWatched].map((asset) => {
        const holding = holdings.get(asset.id);
        return holding
          ? {
              ...asset,
              yourUnits: holding.units,
              avgEntryPriceGBP: holding.avgEntry,
              realizedProfitGBP: holding.realized,
            }
          : asset;
      });
    },
    [holdings, remoteAssets, watchedAssets]
  );

  const yourPositions = React.useMemo(
    () => marketAssets.filter((asset) => asset.yourUnits > 0),
    [marketAssets]
  );

  const headerRightAction = React.useMemo(
    () => (
      <View style={styles.headerActions}>
        <AnimatedPressable
          style={styles.headerAction}
          onPress={() => navigation.navigate('Portfolio')}
          accessibilityRole="button"
          accessibilityLabel={yourPositions.length > 0 ? `Portfolio, ${yourPositions.length} positions held` : 'Portfolio'}
          hapticFeedback="light"
        >
          <Ionicons name="pie-chart-outline" size={20} color={colors.textPrimary} />
          {yourPositions.length > 0 ? (
            <View style={[styles.headerBadge, { backgroundColor: colors.brand, borderColor: colors.background }]}>
              <Text style={[styles.headerBadgeText, { color: colors.background }]} maxFontSizeMultiplier={1.1}>
                {yourPositions.length > 9 ? '9+' : yourPositions.length}
              </Text>
            </View>
          ) : null}
        </AnimatedPressable>
        <AnimatedPressable
          style={styles.headerAction}
          onPress={() => navigation.navigate('CoOwnOrderHistory')}
          accessibilityRole="button"
          accessibilityLabel="Activity"
          hapticFeedback="light"
        >
          <Ionicons name="pulse-outline" size={20} color={colors.textPrimary} />
        </AnimatedPressable>
        <AnimatedPressable
          style={styles.headerAction}
          onPress={() => {
            haptics.tap();
            navigation.navigate('CreateCoOwn');
          }}
          accessibilityRole="button"
          accessibilityLabel="Issue a Co-Own"
          accessibilityHint="List an eligible luxury asset for shared ownership"
          hapticFeedback="light"
        >
          <Ionicons name="add-outline" size={22} color={colors.textPrimary} />
        </AnimatedPressable>
      </View>
    ),
    [colors, navigation, yourPositions.length]
  );

  const segmentCounts = React.useMemo<Record<HubSegment, number>>(() => {
    return {
      // Assets in initial offering — still accepting funds.
      offerings: marketAssets.filter(isOfferingAsset).length,
      // Use the backend's market lifecycle. A closed/paused or merely
      // allocated asset is not silently promoted to Trading by old activity.
      trading: marketAssets.filter(isTradingAsset).length,
      // User's watched assets.
      watchlist: marketAssets.filter((asset) => coOwnWatchlist.includes(asset.id)).length,
    };
  }, [coOwnWatchlist, marketAssets]);

  const filteredAssets = React.useMemo(() => {
    const normalized = query.trim().toLowerCase();
    // Segment filter — Offerings, Trading, or Watchlist
    const segmentFiltered = marketAssets.filter((asset) => {
      if (activeSegment === 'offerings') return isOfferingAsset(asset);
      if (activeSegment === 'trading') return isTradingAsset(asset);
      return coOwnWatchlist.includes(asset.id);
    });
    // Search filter
    const searched = normalized
      ? segmentFiltered.filter((asset) =>
          asset.title.toLowerCase().includes(normalized) ||
          asset.category.toLowerCase().includes(normalized) ||
          (asset.issuerJurisdiction ?? '').toLowerCase().includes(normalized)
        )
      : segmentFiltered;
    // Sort — factual options only (no fabricated ROI).
    return [...searched].sort((a, b) => {
      if (sortBy === 'newest') {
        const aDate = new Date(a.createdAt).getTime();
        const bDate = new Date(b.createdAt).getTime();
        return bDate - aDate;
      }
      if (sortBy === 'price') {
        return a.unitPriceGBP - b.unitPriceGBP;
      }
      if (sortBy === 'activity') {
        // Rank by 24h volume (GBP), then by recency of last settled trade.
        const aVol = a.volume24hGbp ?? 0;
        const bVol = b.volume24hGbp ?? 0;
        if (aVol !== bVol) return bVol - aVol;
        const aLast = a.lastExecutionAt ? new Date(a.lastExecutionAt).getTime() : 0;
        const bLast = b.lastExecutionAt ? new Date(b.lastExecutionAt).getTime() : 0;
        return bLast - aLast;
      }
      return 0;
    });
  }, [activeSegment, coOwnWatchlist, marketAssets, query, sortBy]);

  const format1ze = React.useCallback(
    (value1ze: number) => formatCoOwnIze(value1ze),
    []
  );

  const formatLocal = React.useCallback((valueGbp: number) => (
    formatFromFiat(valueGbp, 'GBP', { displayMode: 'fiat', fiatFractionDigits: 2 })
  ), [formatFromFiat]);

  const highlightAssets = React.useMemo(() => {
    // Discovery carousel surfaces active offerings first — the primary
    // discovery intent. Falls back to the full catalogue when no
    // offerings are live so the carousel is never empty.
    const open = marketAssets.filter(isOfferingAsset);
    const source = open.length > 0 ? open : marketAssets;
    return [...source]
      .sort((a, b) => {
        const aAllocation = a.totalUnits > 0 ? (a.totalUnits - a.availableUnits) / a.totalUnits : 0;
        const bAllocation = b.totalUnits > 0 ? (b.totalUnits - b.availableUnits) / b.totalUnits : 0;
        return bAllocation - aAllocation || (b.createdAt ?? '').localeCompare(a.createdAt ?? '');
      })
      .slice(0, 12);
  }, [marketAssets]);

  const highlights = React.useMemo<CoOwnMarketHighlight[]>(() => highlightAssets.map((asset) => {
    const allocatedPct = asset.totalUnits > 0
      ? ((asset.totalUnits - asset.availableUnits) / asset.totalUnits) * 100
      : 0;
    const inOffering = isOfferingAsset(asset);
    return {
      id: asset.id,
      imageUri: asset.image,
      title: asset.title,
      categoryLabel: asset.category,
      unitPriceLabel: format1ze(asset.unitPriceGBP),
      localReferenceLabel: formatLocal(asset.unitPriceGBP),
      // Offering tiles show funding progress; trading tiles show depth.
      availabilityLabel: inOffering
        ? `${asset.totalUnits - asset.availableUnits}/${asset.totalUnits} funded`
        : `${asset.availableUnits} of ${asset.totalUnits} units`,
      liquidityLabel: inOffering
        ? `${Math.round(allocatedPct)}% funded`
        : asset.bestBidGBP != null && asset.bestAskGBP != null
          ? `Bid ${format1ze(asset.bestBidGBP)} · Ask ${format1ze(asset.bestAskGBP)}`
          : asset.bestAskGBP != null
            ? `Ask ${format1ze(asset.bestAskGBP)}`
            : 'No live orders',
      allocatedPct,
      statusLabel: getStatusLabel(asset),
      status: getStatus(asset),
      focalPoint: getCategoryFocalPoint(asset.category),
    };
  }), [format1ze, formatLocal, highlightAssets]);

  const totalPositionValue = React.useMemo(
    () => yourPositions.reduce((sum, asset) => sum + asset.yourUnits * asset.unitPriceGBP, 0),
    [yourPositions]
  );

  const columns = screenWidth >= 768 ? 3 : screenWidth < 350 ? 1 : 2;
  const instrumentRows = React.useMemo(() => {
    const rows: HubAsset[][] = [];
    for (let index = 0; index < filteredAssets.length; index += columns) {
      rows.push(filteredAssets.slice(index, index + columns));
    }
    return rows;
  }, [columns, filteredAssets]);

  const hubRows = React.useMemo<HubRow[]>(() => {
    const hasPositions = yourPositions.length > 0;
    const rows: HubRow[] = [];

    // Holders: positions first (personal portfolio), then the grid.
    // Non-holders: market highlights first (education/discovery), then grid.
    // Per doc 42: "Do not always put generic highlights before existing holdings."
    // The segment tabs are no longer a row — CoOwnSegmentTabs is fixed under
    // the header so the market switch is always visible at the top.
    if (hasPositions) {
      rows.push({ kind: 'positions', key: 'positions' });
    } else {
      rows.push({ kind: 'highlights', key: 'highlights' });
    }

    rows.push({ kind: 'instrumentsHeader', key: 'instruments-header' });

    if (instrumentRows.length === 0) {
      rows.push({ kind: 'instrumentsEmpty', key: 'instruments-empty' });
    } else {
      instrumentRows.forEach((assets, index) => {
        // Key by row position, not content — embedding asset ids meant every
        // infinite-scroll append changed all keys and remounted every row.
        rows.push({ kind: 'instrumentRow', key: `instruments-${index}`, assets });
      });
    }
    return rows;
  }, [instrumentRows, yourPositions.length]);

  const handleHighlightPress = React.useCallback((item: CoOwnMarketHighlight) => {
    navigation.navigate('AssetDetail', { assetId: item.id });
  }, [navigation]);

  const renderPosition = React.useCallback(({ item }: { item: HubAsset }) => {
    const valueGbp = item.yourUnits * item.unitPriceGBP;
    const costBasisGbp = item.yourUnits * Math.max(0, item.avgEntryPriceGBP ?? 0);
    const gainLossGbp = valueGbp - costBasisGbp;
    const gainLossPct = costBasisGbp > 0 ? (gainLossGbp / costBasisGbp) * 100 : null;
    const ownershipPct = item.totalUnits > 0 ? (item.yourUnits / item.totalUnits) * 100 : 0;
    const portfolioWeightPct = totalPositionValue > 0 ? (valueGbp / totalPositionValue) * 100 : 0;
    const sign = gainLossGbp > 0 ? '+' : gainLossGbp < 0 ? '−' : '';
    return (
      <CoOwnCompactPositionCard
        imageUri={item.image}
        title={item.title}
        categoryLabel={item.category}
        unitPriceLabel={format1ze(item.unitPriceGBP)}
        localReferenceLabel={formatLocal(item.unitPriceGBP)}
        unitsOwned={item.yourUnits}
        ownershipPct={ownershipPct}
        positionValueLabel={format1ze(valueGbp)}
        gainLossLabel={costBasisGbp > 0 ? `${sign}${format1ze(Math.abs(gainLossGbp))}` : undefined}
        gainLossPct={gainLossPct}
        portfolioWeightPct={portfolioWeightPct}
        focalPoint={getCategoryFocalPoint(item.category)}
        onPress={() => navigation.navigate('AssetDetail', { assetId: item.id })}
      />
    );
  }, [format1ze, formatLocal, navigation, totalPositionValue]);

  const renderRow = React.useCallback(({ item }: { item: HubRow }) => {
    if (item.kind === 'highlights') {
      return (
        <View style={styles.highlightsSection}>
          <CoOwnMarketHighlightsCarousel items={highlights} onPressItem={handleHighlightPress} />
        </View>
      );
    }

    if (item.kind === 'positions') {
      return (
        <View style={styles.majorSection}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionHeadingGroup}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]} maxFontSizeMultiplier={1.2}>Positions</Text>
            </View>
            <AnimatedPressable
              onPress={() => navigation.navigate('Portfolio')}
              style={styles.sectionAction}
              scaleValue={0.97}
              activeOpacity={0.72}
              accessibilityRole="button"
              accessibilityLabel={`See all ${yourPositions.length} positions`}
            >
              <Text style={[styles.sectionActionText, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.25}>All {yourPositions.length}</Text>
              <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
            </AnimatedPressable>
          </View>
          {holdingsError ? (
            <View style={[styles.inlineState, { borderBottomColor: colors.border }]}>
              <View style={styles.inlineStateBody}>
                <Text style={[styles.inlineStateTitle, { color: colors.textPrimary }]} maxFontSizeMultiplier={1.25}>Positions unavailable</Text>
                <Text style={[styles.inlineStateText, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.3}>Your markets are still available. Retry to load portfolio holdings.</Text>
              </View>
              <AnimatedPressable
                onPress={() => loadData()}
                style={[styles.inlineRetry, { borderColor: colors.border }]}
                accessibilityRole="button"
                accessibilityLabel="Retry loading positions"
              >
                <Text style={[styles.inlineRetryText, { color: colors.textPrimary }]} maxFontSizeMultiplier={1.2}>Retry</Text>
              </AnimatedPressable>
            </View>
          ) : yourPositions.length > 0 ? (
            <FlashList
              data={yourPositions}
              renderItem={renderPosition}
              keyExtractor={(position) => position.id}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.positionsContent}
              ItemSeparatorComponent={() => <View style={styles.positionSeparator} />}
              snapToInterval={POSITION_SNAP_INTERVAL}
              snapToAlignment="start"
              decelerationRate="fast"
              disableIntervalMomentum
              accessibilityLabel="Your positions"
            />
          ) : (
            <View style={[styles.inlineState, { borderBottomColor: colors.border }]}>
              <View style={styles.inlineStateIcon}>
                <Ionicons name="pie-chart-outline" size={18} color={colors.textMuted} />
              </View>
              <View style={styles.inlineStateBody}>
                <Text style={[styles.inlineStateTitle, { color: colors.textPrimary }]} maxFontSizeMultiplier={1.25}>No positions yet</Text>
                <Text style={[styles.inlineStateText, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.3}>Open an active instrument to review its market and ownership terms.</Text>
              </View>
            </View>
          )}
        </View>
      );
    }

    if (item.kind === 'instrumentsHeader') {
      const searchPlaceholder = activeSegment === 'watchlist'
        ? 'Search watchlist'
        : activeSegment === 'trading'
          ? 'Search trading markets'
          : 'Search offerings';
      return (
        <View style={styles.instrumentsHeader} accessibilityLabel="Market search and sorting">
          <View style={styles.sectionHeader}>
            <View style={styles.sectionHeadingGroup}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]} maxFontSizeMultiplier={1.2}>{SECTION_TITLES[activeSegment]}</Text>
            </View>
            <Text style={[styles.resultCount, { color: colors.textMuted }]} maxFontSizeMultiplier={1.3}>{filteredAssets.length} {filteredAssets.length === 1 ? 'market' : 'markets'}</Text>
          </View>
          <View style={styles.marketControls}>
            {isSearchExpanded ? (
              <View style={styles.searchField}>
                <AppInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder={searchPlaceholder}
                  prefix={<Ionicons name="search-outline" size={16} color={colors.textMuted} />}
                  suffix={
                    <AnimatedPressable
                      onPress={() => {
                        setQuery('');
                        setIsSearchExpanded(false);
                        haptics.tap();
                      }}
                      style={styles.inputAction}
                      accessibilityRole="button"
                      accessibilityLabel="Close market search"
                    >
                      <Ionicons name="close" size={18} color={colors.textSecondary} />
                    </AnimatedPressable>
                  }
                  autoFocus
                  accessibilityLabel={searchPlaceholder}
                />
              </View>
            ) : (
              <AnimatedPressable
                onPress={() => {
                  haptics.tap();
                  setIsSearchExpanded(true);
                  setIsSortExpanded(false);
                }}
                style={[styles.controlButton, styles.searchControl, { backgroundColor: colors.surface, borderColor: colors.border }]}
                accessibilityRole="button"
                accessibilityLabel={searchPlaceholder}
              >
                <Ionicons name="search-outline" size={17} color={colors.textSecondary} />
                <Text style={[styles.controlText, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.25}>Search</Text>
              </AnimatedPressable>
            )}
            <AnimatedPressable
              onPress={() => {
                haptics.tap();
                setIsSortExpanded((current) => !current);
              }}
              style={[styles.controlButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
              accessibilityRole="button"
              accessibilityLabel={`Sort instruments, currently ${SORT_LABELS[sortBy]}`}
              accessibilityState={{ expanded: isSortExpanded }}
            >
              <Ionicons name="swap-vertical-outline" size={18} color={colors.textSecondary} />
              <Text style={[styles.controlText, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.25}>{SORT_LABELS[sortBy]}</Text>
            </AnimatedPressable>
          </View>
          {isSortExpanded ? (
            <View style={styles.sortOptions}>
              {SORT_OPTIONS.map((option) => {
                const selected = sortBy === option;
                return (
                  <AnimatedPressable
                    key={option}
                    onPress={() => {
                      setSortBy(option);
                      setIsSortExpanded(false);
                      haptics.selection();
                    }}
                    style={[
                      styles.sortOption,
                      {
                        backgroundColor: selected ? colors.textPrimary : colors.surfaceAlt,
                        borderColor: selected ? colors.textPrimary : colors.border,
                      },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={`Sort by ${SORT_LABELS[option]}`}
                    accessibilityState={{ selected }}
                  >
                    <Text style={[styles.sortOptionText, { color: selected ? colors.background : colors.textSecondary }]} maxFontSizeMultiplier={1.25}>
                      {SORT_LABELS[option]}
                    </Text>
                  </AnimatedPressable>
                );
              })}
            </View>
          ) : null}
        </View>
      );
    }

    if (item.kind === 'instrumentRow') {
      return (
        <View style={styles.instrumentRow}>
          {item.assets.map((asset) => {
            const inOffering = isOfferingAsset(asset);
            const allocatedPct = asset.totalUnits > 0
              ? Math.round(((asset.totalUnits - asset.availableUnits) / asset.totalUnits) * 100)
              : 0;
            // U02: One lifecycle/liquidity fact per card — offering tiles
            // surface funding progress; trading tiles surface last trade or
            // best bid/ask. Less urgent metadata lives on the detail screen.
            const liquidityLabel = inOffering
              ? `${allocatedPct}% funded`
              : asset.lastExecutionPriceGBP != null
                ? `Last ${format1ze(asset.lastExecutionPriceGBP)}`
                : asset.bestBidGBP != null && asset.bestAskGBP != null
                  ? `Bid ${format1ze(asset.bestBidGBP)} · Ask ${format1ze(asset.bestAskGBP)}`
                  : asset.bestAskGBP != null
                    ? `Ask ${format1ze(asset.bestAskGBP)}`
                    : 'No trades yet';
            return (
              <CoOwnInstrumentCard
                key={asset.id}
                imageUri={asset.image}
                title={asset.title}
                categoryLabel={asset.category}
                unitPriceLabel={format1ze(asset.unitPriceGBP)}
                liquidityLabel={liquidityLabel}
                allocatedPct={inOffering ? allocatedPct : undefined}
                statusLabel={getStatusLabel(asset)}
                status={getStatus(asset)}
                isWatched={coOwnWatchlist.includes(asset.id)}
                watchStatus={coOwnWatchStatus[asset.id]}
                focalPoint={getCategoryFocalPoint(asset.category)}
                onPress={() => navigation.navigate('AssetDetail', { assetId: asset.id })}
                onToggleWatch={() => toggleCoOwnWatch(asset.id)}
              />
            );
          })}
          {item.assets.length < columns
            ? Array.from({ length: columns - item.assets.length }).map((_, index) => <View key={`spacer-${index}`} style={styles.instrumentSpacer} />)
            : null}
        </View>
      );
    }

    if (item.kind === 'instrumentsEmpty') {
      // U07: Separate "no results" (search returned empty), "no watched
      // items" (watchlist empty), and "no items in segment" (no search).
      const hasQuery = query.trim().length > 0;
      let title: string;
      let subtitle: string;
      let graphicVariant: 'search' | 'box' = 'search';

      if (hasQuery) {
        // No results from active search — distinct from an empty segment.
        title = activeSegment === 'watchlist'
          ? 'No watched items match'
          : 'No matching markets';
        subtitle = 'Try a different search term or clear the search.';
        graphicVariant = 'search';
      } else if (activeSegment === 'watchlist') {
        // Watchlist is empty — no items watched at all.
        title = 'Your watchlist is empty';
        subtitle = 'Use the bookmark control on an instrument to keep it here.';
        graphicVariant = 'box';
      } else if (activeSegment === 'trading') {
        title = 'No trading markets yet';
        subtitle = 'Fully allocated assets with live orders will appear here.';
      } else {
        title = 'No active offerings';
        subtitle = 'New offerings from issuers will appear here. Try the Trading tab for live markets.';
      }
      return (
        <View style={styles.instrumentsEmptyWrap}>
          <CoOwnStateCanvas
            variant="empty"
            title={title}
            subtitle={subtitle}
            emptyGraphicVariant={graphicVariant}
          />
        </View>
      );
    }

    return null;
  }, [
    activeSegment,
    coOwnWatchlist,
    coOwnWatchStatus,
    colors,
    columns,
    filteredAssets.length,
    format1ze,
    formatLocal,
    handleHighlightPress,
    highlights,
    holdingsError,
    isSearchExpanded,
    isSortExpanded,
    loadData,
    navigation,
    query,
    renderPosition,
    sortBy,
    toggleCoOwnWatch,
    yourPositions,
  ]);

  // Fixed segment selector — always at the top, directly under the header.
  const segmentTabs = (
    <CoOwnSegmentTabs
      activeSegment={activeSegment}
      counts={segmentCounts}
      onSelect={setActiveSegment}
    />
  );

  const listFooter = isLoadingMore ? (
    <View
      style={styles.listFooter}
      accessibilityRole="progressbar"
      accessibilityLabel="Loading more markets"
      accessibilityHint="Additional markets will appear when loaded"
    >
      <ActivityIndicator size="small" color={colors.textSecondary} />
    </View>
  ) : loadMoreError ? (
    <AnimatedPressable
      onPress={handleLoadMore}
      style={styles.listFooter}
      accessibilityRole="button"
      accessibilityLabel="Retry loading more markets"
      accessibilityHint="Fetches the next page of markets"
    >
      <Text style={[styles.listFooterText, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.25}>
        Couldn't load more — tap to retry
      </Text>
    </AnimatedPressable>
  ) : null;

  if (isSyncing && remoteAssets.length === 0) {
    return (
      <FlagshipScreen
        header={<FlagshipHeader title="Co-Own" onBack={handleBack} rightAction={headerRightAction} />}
        scrollEnabled={false}
        contentStyle={{ paddingHorizontal: 0, paddingTop: 0 }}
      >
        {segmentTabs}
        <CoOwnHubSkeleton />
      </FlagshipScreen>
    );
  }

  // Error state: hide the canvas only when the watchlist segment has no
  // items — watched assets are fetched independently of the catalogue, so
  // a catalogue failure must not bury them.
  if (isError && remoteAssets.length === 0 && !(activeSegment === 'watchlist' && watchedAssets.length > 0)) {
    return (
      <FlagshipScreen
        header={<FlagshipHeader title="Co-Own" onBack={handleBack} rightAction={headerRightAction} />}
        scrollEnabled={false}
        contentStyle={{ paddingHorizontal: 0, paddingTop: 0 }}
      >
        {segmentTabs}
        <CoOwnStateCanvas variant="error" actionLabel="Try again" onAction={() => loadData()} />
      </FlagshipScreen>
    );
  }

  if (remoteAssets.length === 0 && !(activeSegment === 'watchlist' && watchedAssets.length > 0)) {
    return (
      <FlagshipScreen
        header={<FlagshipHeader title="Co-Own" onBack={handleBack} rightAction={headerRightAction} />}
        scrollEnabled={false}
        contentStyle={{ paddingHorizontal: 0, paddingTop: 0 }}
      >
        {segmentTabs}
        <CoOwnStateCanvas
          variant="empty"
          title="No items yet"
          subtitle="When issuers list items for shared ownership, you'll find them here."
          actionLabel="Issue a Co-Own"
          onAction={() => {
            navigation.navigate('CreateCoOwn');
          }}
          secondaryActionLabel="Learn how it works"
          onSecondaryAction={() => navigation.navigate('CoOwnOnboarding')}
        />
      </FlagshipScreen>
    );
  }

  return (
    <FlagshipScreen
      header={<FlagshipHeader title="Co-Own" onBack={handleBack} rightAction={headerRightAction} />}
      scrollEnabled={false}
      contentStyle={{ paddingHorizontal: 0, paddingTop: 0 }}
    >
      {segmentTabs}
      <CoOwnOfflineBanner isOffline={isOffline} />
      <FlashList
        ref={flashListRef}
        data={hubRows}
        renderItem={renderRow}
        keyExtractor={(item) => item.key}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        onScroll={(e) => {
          scrollOffsetRef.current = e.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={16}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.4}
        ListFooterComponent={listFooter}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={colors.textSecondary}
          />
        }
        keyboardShouldPersistTaps="handled"
      />
    </FlagshipScreen>
  );
}

const styles = StyleSheet.create({
  listContent: {
    paddingBottom: Space.xxl,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerAction: {
    width: Control.hit,
    height: Control.hit,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBadge: {
    position: 'absolute',
    top: -5,
    right: -5,
    minWidth: 17,
    height: 17,
    borderRadius: Radius.lg,
    paddingHorizontal: Space.xs,
    borderWidth: Stroke.standard,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerBadgeText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: Typography.family.bold,
  },
  highlightsSection: {
    paddingTop: Space.sm,
    paddingBottom: Space.md,
  },
  majorSection: {
    paddingTop: Space.lg,
    paddingBottom: Space.lg,
  },
  sectionHeader: {
    paddingHorizontal: Space.md,
    marginBottom: Space.md,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: Space.md,
  },
  sectionHeadingGroup: {
    flex: 1,
    minWidth: 0,
    gap: Space.xs / 2,
  },
  sectionTitle: {
    fontSize: TypographyV2.screenTitle.size,
    lineHeight: TypographyV2.screenTitle.lineHeight,
    fontFamily: TypographyV2.screenTitle.fontFamily,
    letterSpacing: LetterSpacing.tight,
  },
  sectionAction: {
    minHeight: Control.hit,
    paddingLeft: Space.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: Space.xs / 2,
  },
  sectionActionText: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
  },
  positionsContent: {
    paddingHorizontal: Space.md,
  },
  positionSeparator: {
    width: POSITION_CARD_GAP,
  },
  inlineState: {
    minHeight: Space.xxl + Space.xxl + Space.xxl - 24,
    marginHorizontal: Space.md,
    paddingVertical: Space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  inlineStateIcon: {
    width: Control.hit,
    height: Control.hit,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inlineStateBody: {
    flex: 1,
    minWidth: 0,
    gap: Space.xs / 2,
  },
  inlineStateTitle: {
    fontSize: TypographyV2.bodyStrong.size,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
  },
  inlineStateText: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
  },
  inlineRetry: {
    minWidth: Space.xxl + Space.xl + Space.xs,
    minHeight: Control.hit,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inlineRetryText: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: TypographyV2.body.fontFamily,
  },
  instrumentsHeader: {
    paddingTop: Space.sm,
    paddingBottom: Space.md,
  },
  resultCount: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    fontVariant: ['tabular-nums'],
    paddingBottom: Space.xs,
  },
  marketControls: {
    paddingHorizontal: Space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  searchField: {
    flex: 1,
    minWidth: 0,
  },
  inputAction: {
    width: Control.hit,
    height: Control.hit,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlButton: {
    minHeight: Control.hit,
    paddingHorizontal: Space.smMd,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.xs + 2,
  },
  searchControl: {
    flex: 1,
    justifyContent: 'flex-start',
  },
  controlText: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: TypographyV2.body.fontFamily,
  },
  sortOptions: {
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    flexDirection: 'row',
    gap: Space.sm,
  },
  sortOption: {
    minHeight: Control.hit,
    paddingHorizontal: Space.smMd,
    borderRadius: Radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sortOptionText: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
  },
  instrumentRow: {
    paddingHorizontal: Space.md,
    paddingBottom: Space.md,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.sm,
  },
  instrumentSpacer: {
    flex: 1,
  },
  instrumentsEmptyWrap: {
    minHeight: Space.xxl + Space.xxl + Space.xxl + Space.xxl + Space.xxl + Space.xxl + Space.xxl + Space.xxl + Space.xxl + Space.xxl + Space.xl - 4,
    paddingHorizontal: Space.md,
  },
  listFooter: {
    minHeight: Control.hit,
    paddingVertical: Space.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listFooterText: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
  },
});
