import React from 'react';
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useAppTheme } from '../theme/ThemeContext';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { fetchCoOwnHoldings, listCoOwnAssets } from '../services/marketApi';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useToast } from '../context/ToastContext';
import { useBackendData } from '../context/BackendDataContext';
import { Radius, Space, Type, Typography } from '../theme/designTokens';
import { haptics } from '../utils/haptics';
import { AppInput } from '../components/ui/AppInput';
import { AnimatedPressable } from '../components/AnimatedPressable';
import {
  CoOwnCompactPositionCard,
  CoOwnEducationCard,
  CoOwnHubSkeleton,
  CoOwnInstrumentCard,
  CoOwnMarketHeader,
  CoOwnMarketHighlightsCarousel,
  CoOwnOfflineBanner,
  CoOwnReconciliationBanner,
  CoOwnStateCanvas,
  COOWN_POSITION_CARD_WIDTH,
  type CoOwnAssetStatus,
  type CoOwnMarketHeaderAction,
  type CoOwnMarketHighlight,
} from '../components/coown';
import { useConnectivity } from '../hooks/useConnectivity';
import { formatCoOwnIze, toIze } from '../utils/currency';

type NavT = StackNavigationProp<RootStackParamList>;
type SortOption = 'newest' | 'available' | 'allocation';
type HubSegment = 'active' | 'auctions' | 'new_issues' | 'watchlist';

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
  settlementMode: 'GBP' | 'TVUSD' | 'HYBRID' | 'ONEZE';
  issuerJurisdiction?: string;
  holders: number;
  yourUnits: number;
  avgEntryPriceGBP?: number;
  realizedProfitGBP?: number;
  isOpen: boolean;
  createdAt: string;
}

type HubRow =
  | { kind: 'highlights'; key: 'highlights' }
  | { kind: 'status'; key: 'status' }
  | { kind: 'tabs'; key: 'tabs' }
  | { kind: 'positions'; key: 'positions' }
  | { kind: 'instrumentsHeader'; key: 'instruments-header' }
  | { kind: 'instrumentRow'; key: string; assets: HubAsset[] }
  | { kind: 'instrumentsEmpty'; key: 'instruments-empty' }
  | { kind: 'remaining'; key: 'remaining' };

const SEGMENTS: HubSegment[] = ['active', 'auctions', 'new_issues', 'watchlist'];
const SORT_OPTIONS: SortOption[] = ['newest', 'available', 'allocation'];
const POSITION_CARD_WIDTH = COOWN_POSITION_CARD_WIDTH;
const POSITION_CARD_GAP = 12;
const POSITION_SNAP_INTERVAL = POSITION_CARD_WIDTH + POSITION_CARD_GAP;
const SEGMENT_LABELS: Record<HubSegment, string> = {
  active: 'Active',
  auctions: 'Auctions',
  new_issues: 'New issues',
  watchlist: 'Watchlist',
};
const SORT_LABELS: Record<SortOption, string> = {
  newest: 'Newest',
  available: 'Availability',
  allocation: 'Allocation',
};
const SECTION_TITLES: Record<HubSegment, string> = {
  active: 'Active instruments',
  auctions: 'Auctions',
  new_issues: 'New issues',
  watchlist: 'Watchlist',
};

function getFocalPoint(category: string): { x: number; y: number } {
  const normalized = category.toLowerCase();
  if (normalized.includes('vehicle') || normalized.includes('car')) return { x: 0.5, y: 0.58 };
  if (normalized.includes('bag') || normalized.includes('shoe')) return { x: 0.5, y: 0.56 };
  if (normalized.includes('watch') || normalized.includes('jewel') || normalized.includes('art')) return { x: 0.5, y: 0.5 };
  return { x: 0.5, y: 0.46 };
}

function getStatus(asset: HubAsset): CoOwnAssetStatus {
  if (!asset.isOpen) return 'paused';
  return asset.availableUnits > 0 ? 'open' : 'closed';
}

function getStatusLabel(asset: HubAsset): string {
  const status = getStatus(asset);
  return status === 'open' ? 'Available' : status === 'paused' ? 'Paused' : 'Fully allocated';
}

export default function CoOwnHubScreen() {
  const navigation = useNavigation<NavT>();
  const currentUser = useStore((state) => state.currentUser);
  const coOwnWatchlist = useStore((state) => state.coOwnWatchlist);
  const toggleCoOwnWatch = useStore((state) => state.toggleCoOwnWatch);
  const { formatFromFiat, goldRates } = useFormattedPrice();
  const { show } = useToast();
  const { colors, isDark } = useAppTheme();
  const { width: screenWidth } = useWindowDimensions();
  const { listings } = useBackendData();
  const { isOffline } = useConnectivity();
  const actingUserId = currentUser?.id;

  const [query, setQuery] = React.useState('');
  const [isSearchExpanded, setIsSearchExpanded] = React.useState(false);
  const [isSortExpanded, setIsSortExpanded] = React.useState(false);
  const [sortBy, setSortBy] = React.useState<SortOption>('newest');
  const [activeSegment, setActiveSegment] = React.useState<HubSegment>('active');
  const [remoteAssets, setRemoteAssets] = React.useState<HubAsset[]>([]);
  const [holdings, setHoldings] = React.useState<Map<string, { units: number; avgEntry: number; realized: number }>>(new Map());
  const [isSyncing, setIsSyncing] = React.useState(true);
  const [isError, setIsError] = React.useState(false);
  const [holdingsError, setHoldingsError] = React.useState(false);
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  const loadData = React.useCallback(() => {
    if (!actingUserId) {
      setIsSyncing(false);
      return;
    }
    let cancelled = false;
    setIsSyncing(true);
    setIsError(false);
    setHoldingsError(false);

    Promise.all([
      listCoOwnAssets({ limit: 120 }),
      fetchCoOwnHoldings(actingUserId)
        .then((items) => ({ items, failed: false }))
        .catch(() => ({ items: [], failed: true })),
    ])
      .then(([items, holdingResult]) => {
        if (cancelled) return;
        const mapped: HubAsset[] = items.map((item) => {
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
            settlementMode: item.settlementMode as HubAsset['settlementMode'],
            issuerJurisdiction: item.issuerJurisdiction ?? undefined,
            holders: item.holders,
            yourUnits: 0,
            isOpen: item.isOpen,
            createdAt: item.createdAt,
          };
        });
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
  }, [actingUserId, listings, show]);

  React.useEffect(() => {
    const cleanup = loadData();
    return cleanup;
  }, [loadData]);

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
    () => remoteAssets.map((asset) => {
      const holding = holdings.get(asset.id);
      return holding
        ? {
            ...asset,
            yourUnits: holding.units,
            avgEntryPriceGBP: holding.avgEntry,
            realizedProfitGBP: holding.realized,
          }
        : asset;
    }),
    [holdings, remoteAssets]
  );

  const yourPositions = React.useMemo(
    () => marketAssets.filter((asset) => asset.yourUnits > 0),
    [marketAssets]
  );

  const headerActions = React.useMemo<CoOwnMarketHeaderAction[]>(() => [
    {
      icon: 'pie-chart-outline',
      label: yourPositions.length > 0 ? `Portfolio, ${yourPositions.length} positions held` : 'Portfolio',
      badge: yourPositions.length,
      onPress: () => navigation.navigate('Portfolio'),
    },
    {
      icon: 'pulse-outline',
      label: 'Activity',
      onPress: () => navigation.navigate('CoOwnOrderHistory'),
    },
  ], [navigation, yourPositions.length]);

  const segmentCounts = React.useMemo<Record<HubSegment, number>>(() => {
    const now = Date.now();
    return {
      active: marketAssets.filter((asset) => asset.isOpen && asset.availableUnits > 0).length,
      auctions: 0,
      new_issues: marketAssets.filter((asset) => {
        const createdAt = new Date(asset.createdAt).getTime();
        return Number.isFinite(createdAt) && now - createdAt <= 7 * 24 * 60 * 60 * 1000;
      }).length,
      watchlist: marketAssets.filter((asset) => coOwnWatchlist.includes(asset.id)).length,
    };
  }, [coOwnWatchlist, marketAssets]);

  const filteredAssets = React.useMemo(() => {
    const now = Date.now();
    const normalized = query.trim().toLowerCase();
    const segmentFiltered = marketAssets.filter((asset) => {
      if (activeSegment === 'active') return asset.isOpen && asset.availableUnits > 0;
      if (activeSegment === 'auctions') return false;
      if (activeSegment === 'watchlist') return coOwnWatchlist.includes(asset.id);
      const createdAt = new Date(asset.createdAt).getTime();
      return Number.isFinite(createdAt) && now - createdAt <= 7 * 24 * 60 * 60 * 1000;
    });
    const searched = normalized
      ? segmentFiltered.filter((asset) =>
          asset.title.toLowerCase().includes(normalized) ||
          asset.category.toLowerCase().includes(normalized) ||
          (asset.issuerJurisdiction ?? '').toLowerCase().includes(normalized)
        )
      : segmentFiltered;
    return [...searched].sort((a, b) => {
      if (sortBy === 'available') return b.availableUnits - a.availableUnits;
      if (sortBy === 'allocation') {
        const aAllocation = a.totalUnits > 0 ? (a.totalUnits - a.availableUnits) / a.totalUnits : 0;
        const bAllocation = b.totalUnits > 0 ? (b.totalUnits - b.availableUnits) / b.totalUnits : 0;
        return bAllocation - aAllocation;
      }
      return (b.createdAt ?? '').localeCompare(a.createdAt ?? '');
    });
  }, [activeSegment, coOwnWatchlist, marketAssets, query, sortBy]);

  const marketContext = React.useMemo(() => {
    const openItems = marketAssets.filter((asset) => asset.isOpen && asset.availableUnits > 0).length;
    const totalAvailableUnits = marketAssets.reduce((sum, asset) => sum + Math.max(0, asset.availableUnits), 0);
    return { openItems, totalAvailableUnits };
  }, [marketAssets]);

  const format1ze = React.useCallback(
    (valueGbp: number) => formatCoOwnIze(toIze(valueGbp, 'GBP', goldRates)),
    [goldRates]
  );

  const formatLocal = React.useCallback((valueGbp: number) => (
    formatFromFiat(valueGbp, 'GBP', { displayMode: 'fiat', fiatFractionDigits: 2 })
  ), [formatFromFiat]);

  const highlightAssets = React.useMemo(() => {
    const open = marketAssets.filter((asset) => asset.isOpen && asset.availableUnits > 0);
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
    return {
      id: asset.id,
      imageUri: asset.image,
      title: asset.title,
      categoryLabel: asset.category,
      unitPriceLabel: format1ze(asset.unitPriceGBP),
      localReferenceLabel: formatLocal(asset.unitPriceGBP),
      availabilityLabel: `${asset.availableUnits} of ${asset.totalUnits} units available`,
      allocatedPct,
      statusLabel: getStatusLabel(asset),
      status: getStatus(asset),
      focalPoint: getFocalPoint(asset.category),
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
    const rows: HubRow[] = [
      { kind: 'highlights', key: 'highlights' },
      { kind: 'status', key: 'status' },
      { kind: 'tabs', key: 'tabs' },
      { kind: 'positions', key: 'positions' },
      { kind: 'instrumentsHeader', key: 'instruments-header' },
    ];
    if (instrumentRows.length === 0) {
      rows.push({ kind: 'instrumentsEmpty', key: 'instruments-empty' });
    } else {
      instrumentRows.forEach((assets, index) => {
        rows.push({ kind: 'instrumentRow', key: `instruments-${index}-${assets.map((asset) => asset.id).join('-')}`, assets });
      });
    }
    rows.push({ kind: 'remaining', key: 'remaining' });
    return rows;
  }, [instrumentRows]);

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
        focalPoint={getFocalPoint(item.category)}
        onPress={() => navigation.navigate('AssetDetail', { assetId: item.id })}
      />
    );
  }, [format1ze, formatLocal, navigation, totalPositionValue]);

  const renderTabs = React.useCallback(() => (
    <View style={[styles.tabsSurface, { backgroundColor: colors.background, borderBottomColor: colors.border }]}> 
      <View style={styles.tabsRow} accessibilityRole="tablist">
        {SEGMENTS.map((segment) => {
          const isActive = activeSegment === segment;
          const isDisabled = segment === 'auctions' && segmentCounts.auctions === 0;
          return (
            <AnimatedPressable
              key={segment}
              onPress={() => {
                if (isDisabled) return;
                haptics.selection();
                setActiveSegment(segment);
              }}
              style={styles.tab}
              scaleValue={0.98}
              activeOpacity={0.72}
              disabled={isDisabled}
              accessibilityRole="tab"
              accessibilityLabel={`${SEGMENT_LABELS[segment]} tab, ${segmentCounts[segment]} items`}
              accessibilityState={{ selected: isActive, disabled: isDisabled }}
            >
              <Text
                style={[
                  styles.tabText,
                  {
                    color: isActive ? colors.textPrimary : isDisabled ? colors.textMuted : colors.textSecondary,
                    fontFamily: isActive ? Typography.family.semibold : Typography.family.regular,
                  },
                ]}
                maxFontSizeMultiplier={1.35}
              >
                {SEGMENT_LABELS[segment]}
              </Text>
              {isActive ? <View style={[styles.tabIndicator, { backgroundColor: colors.textPrimary }]} /> : null}
            </AnimatedPressable>
          );
        })}
      </View>
    </View>
  ), [activeSegment, colors, segmentCounts]);

  const renderRow = React.useCallback(({ item }: { item: HubRow }) => {
    if (item.kind === 'highlights') {
      return (
        <View style={styles.highlightsSection}>
          <View style={styles.highlightsHeading}>
            <Text style={[styles.sectionEyebrow, { color: colors.textMuted }]} maxFontSizeMultiplier={1.3}>MARKET HIGHLIGHTS</Text>
            <Text style={[styles.highlightsHint, { color: colors.textMuted }]} maxFontSizeMultiplier={1.3}>{highlights.length > 1 ? 'Swipe to explore' : 'Featured market'}</Text>
          </View>
          <CoOwnMarketHighlightsCarousel items={highlights} onPressItem={handleHighlightPress} />
        </View>
      );
    }

    if (item.kind === 'status') {
      const isOpen = marketContext.openItems > 0;
      return (
        <View style={[styles.marketStatusStrip, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}> 
          <View style={[styles.marketStatusDot, { backgroundColor: isOpen ? colors.success : colors.textMuted }]} />
          <Text style={[styles.marketStatusLabel, { color: colors.textPrimary }]} numberOfLines={1} maxFontSizeMultiplier={1.25}>
            {isOpen ? 'Continuous market' : 'Market paused'}
          </Text>
          <View style={[styles.marketStatusDivider, { backgroundColor: colors.border }]} />
          <Text style={[styles.marketStatusMeta, { color: colors.textSecondary }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
            {marketContext.openItems} {marketContext.openItems === 1 ? 'instrument' : 'instruments'} live
          </Text>
          <Text style={[styles.marketStatusUnits, { color: colors.textMuted }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
            {marketContext.totalAvailableUnits} units
          </Text>
        </View>
      );
    }

    if (item.kind === 'tabs') return renderTabs();

    if (item.kind === 'positions') {
      return (
        <View style={styles.majorSection}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionHeadingGroup}>
              <Text style={[styles.sectionEyebrow, { color: colors.textMuted }]} maxFontSizeMultiplier={1.3}>YOUR PORTFOLIO</Text>
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
            <View style={[styles.inlineState, { backgroundColor: colors.surface, borderColor: colors.border }]}> 
              <View style={styles.inlineStateBody}>
                <Text style={[styles.inlineStateTitle, { color: colors.textPrimary }]} maxFontSizeMultiplier={1.25}>Positions unavailable</Text>
                <Text style={[styles.inlineStateText, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.3}>Your markets are still available. Retry to load portfolio holdings.</Text>
              </View>
              <AnimatedPressable
                onPress={loadData}
                style={[styles.inlineRetry, { borderColor: colors.border }]}
                accessibilityRole="button"
                accessibilityLabel="Retry loading positions"
              >
                <Text style={[styles.inlineRetryText, { color: colors.textPrimary }]} maxFontSizeMultiplier={1.2}>Retry</Text>
              </AnimatedPressable>
            </View>
          ) : yourPositions.length > 0 ? (
            <FlatList
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
              removeClippedSubviews
              accessibilityLabel="Your positions"
            />
          ) : (
            <View style={[styles.inlineState, { backgroundColor: colors.surface, borderColor: colors.border }]}> 
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
      return (
        <View style={styles.instrumentsHeader} accessibilityLabel="Market search and sorting">
          <View style={styles.sectionHeader}>
            <View style={styles.sectionHeadingGroup}>
              <Text style={[styles.sectionEyebrow, { color: colors.textMuted }]} maxFontSizeMultiplier={1.3}>MARKETPLACE</Text>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]} maxFontSizeMultiplier={1.2}>{SECTION_TITLES[activeSegment]}</Text>
            </View>
            <Text style={[styles.resultCount, { color: colors.textMuted }]} maxFontSizeMultiplier={1.3}>{filteredAssets.length} results</Text>
          </View>
          <View style={styles.marketControls}>
            {isSearchExpanded ? (
              <View style={styles.searchField}>
                <AppInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search instruments"
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
                      <Ionicons name="close" size={17} color={colors.textSecondary} />
                    </AnimatedPressable>
                  }
                  autoFocus
                  accessibilityLabel="Search active instruments"
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
                accessibilityLabel="Search active instruments"
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
              <Ionicons name="swap-vertical-outline" size={17} color={colors.textSecondary} />
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
          {item.assets.map((asset) => (
            <CoOwnInstrumentCard
              key={asset.id}
              imageUri={asset.image}
              title={asset.title}
              categoryLabel={asset.category}
              unitPriceLabel={format1ze(asset.unitPriceGBP)}
              localReferenceLabel={formatLocal(asset.unitPriceGBP)}
              availabilityLabel={`${asset.availableUnits} of ${asset.totalUnits} units`}
              statusLabel={getStatusLabel(asset)}
              status={getStatus(asset)}
              isWatched={coOwnWatchlist.includes(asset.id)}
              focalPoint={getFocalPoint(asset.category)}
              onPress={() => navigation.navigate('AssetDetail', { assetId: asset.id })}
              onToggleWatch={() => toggleCoOwnWatch(asset.id)}
            />
          ))}
          {item.assets.length < columns
            ? Array.from({ length: columns - item.assets.length }).map((_, index) => <View key={`spacer-${index}`} style={styles.instrumentSpacer} />)
            : null}
        </View>
      );
    }

    if (item.kind === 'instrumentsEmpty') {
      const title = activeSegment === 'watchlist'
        ? 'Your watchlist is empty'
        : activeSegment === 'auctions'
          ? 'No auctions are live'
          : query.trim()
            ? 'No matching instruments'
            : 'No instruments in this market';
      const subtitle = activeSegment === 'watchlist'
        ? 'Use the bookmark control on an instrument to keep it here.'
        : query.trim()
          ? 'Try a broader search or change the market tab.'
          : 'Check another market tab or refresh for the latest listings.';
      return (
        <View style={styles.instrumentsEmptyWrap}>
          <CoOwnStateCanvas
            variant="empty"
            title={title}
            subtitle={subtitle}
            emptyGraphicVariant="search"
          />
        </View>
      );
    }

    return (
      <View style={styles.remainingContent}>
        <AnimatedPressable
          onPress={() => {
            haptics.tap();
            navigation.navigate('CreateCoOwn');
          }}
          style={[styles.creatorLink, { borderColor: colors.border }]}
          accessibilityRole="button"
          accessibilityLabel="Issue a new Co-Own item"
        >
          <View style={[styles.creatorIcon, { backgroundColor: colors.surfaceAlt }]}> 
            <Ionicons name="add-outline" size={20} color={colors.textSecondary} />
          </View>
          <View style={styles.creatorBody}>
            <Text style={[styles.creatorTitle, { color: colors.textPrimary }]} maxFontSizeMultiplier={1.25}>Issue a Co-Own</Text>
            <Text style={[styles.creatorText, { color: colors.textSecondary }]} numberOfLines={2} maxFontSizeMultiplier={1.3}>List an eligible luxury asset for shared ownership.</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </AnimatedPressable>
        <CoOwnEducationCard
          onLearnMore={() => navigation.navigate('CoOwnOnboarding')}
          learnMoreLabel="Read full guide"
        />
        <AnimatedPressable
          onPress={() => {
            haptics.tap();
            navigation.navigate('MarketLedger');
          }}
          style={styles.ledgerLink}
          accessibilityRole="button"
          accessibilityLabel="View market ledger"
        >
          <Ionicons name="receipt-outline" size={17} color={colors.textSecondary} />
          <Text style={[styles.ledgerLinkText, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.25}>Market ledger</Text>
          <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
        </AnimatedPressable>
      </View>
    );
  }, [
    activeSegment,
    coOwnWatchlist,
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
    marketContext,
    navigation,
    query,
    renderPosition,
    renderTabs,
    sortBy,
    toggleCoOwnWatch,
    yourPositions,
  ]);

  if (isSyncing && remoteAssets.length === 0) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <CoOwnMarketHeader title="Co-Own" onBack={handleBack} actions={headerActions} />
        <CoOwnHubSkeleton />
      </SafeAreaView>
    );
  }

  if (isError && remoteAssets.length === 0) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <CoOwnMarketHeader title="Co-Own" onBack={handleBack} actions={headerActions} />
        <CoOwnStateCanvas variant="error" actionLabel="Try again" onAction={loadData} />
      </SafeAreaView>
    );
  }

  if (remoteAssets.length === 0) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <CoOwnMarketHeader title="Co-Own" onBack={handleBack} actions={headerActions} />
        <CoOwnStateCanvas
          variant="empty"
          title="No items yet"
          subtitle="When issuers list items for shared ownership, you will find them here."
          actionLabel="Issue a Co-Own"
          onAction={() => {
            haptics.tap();
            navigation.navigate('CreateCoOwn');
          }}
          secondaryActionLabel="Learn how it works"
          onSecondaryAction={() => navigation.navigate('CoOwnOnboarding')}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <CoOwnMarketHeader title="Co-Own" onBack={handleBack} actions={headerActions} />
      <CoOwnOfflineBanner isOffline={isOffline} />
      <CoOwnReconciliationBanner isActive={false} />
      <FlatList
        data={hubRows}
        renderItem={renderRow}
        keyExtractor={(item) => item.key}
        stickyHeaderIndices={[2]}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={colors.textSecondary}
          />
        }
        keyboardShouldPersistTaps="handled"
        removeClippedSubviews
        initialNumToRender={8}
        windowSize={7}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContent: {
    paddingBottom: Space.xxl,
  },
  highlightsSection: {
    paddingTop: Space.xs,
    paddingBottom: Space.sm,
  },
  highlightsHeading: {
    minHeight: 28,
    paddingHorizontal: Space.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  highlightsHint: {
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: Typography.family.regular,
  },
  marketStatusStrip: {
    minHeight: 42,
    marginHorizontal: Space.md,
    marginBottom: Space.sm,
    paddingHorizontal: Space.md,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  marketStatusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    flexShrink: 0,
  },
  marketStatusLabel: {
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
    fontFamily: Typography.family.semibold,
    flexShrink: 0,
  },
  marketStatusDivider: {
    width: StyleSheet.hairlineWidth,
    height: 16,
  },
  marketStatusMeta: {
    flex: 1,
    minWidth: 0,
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    fontFamily: Typography.family.regular,
  },
  marketStatusUnits: {
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: Typography.family.medium,
    fontVariant: ['tabular-nums'],
    flexShrink: 0,
  },
  tabsSurface: {
    minHeight: 50,
    borderBottomWidth: StyleSheet.hairlineWidth,
    justifyContent: 'flex-end',
  },
  tabsRow: {
    minHeight: 49,
    paddingHorizontal: Space.sm,
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  tab: {
    minWidth: 0,
    minHeight: 49,
    flex: 1,
    paddingHorizontal: Space.xs,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  tabText: {
    fontSize: Type.captionElevated.size,
    lineHeight: Type.captionElevated.lineHeight,
    letterSpacing: -0.1,
    textAlign: 'center',
  },
  tabIndicator: {
    position: 'absolute',
    bottom: 0,
    width: 24,
    height: 2,
    borderRadius: 1,
  },
  majorSection: {
    paddingTop: Space.lg,
    paddingBottom: Space.xl,
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
    gap: 2,
  },
  sectionEyebrow: {
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  sectionTitle: {
    fontSize: Type.title.size,
    lineHeight: Type.title.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: -0.45,
  },
  sectionAction: {
    minHeight: 44,
    paddingLeft: Space.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 2,
  },
  sectionActionText: {
    fontSize: Type.captionElevated.size,
    lineHeight: Type.captionElevated.lineHeight,
    fontFamily: Typography.family.semibold,
  },
  positionsContent: {
    paddingHorizontal: Space.md,
  },
  positionSeparator: {
    width: POSITION_CARD_GAP,
  },
  inlineState: {
    minHeight: 92,
    marginHorizontal: Space.md,
    padding: Space.md,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
  },
  inlineStateIcon: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inlineStateBody: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  inlineStateTitle: {
    fontSize: Type.bodyEmphasis.size,
    lineHeight: Type.bodyEmphasis.lineHeight,
    fontFamily: Typography.family.semibold,
  },
  inlineStateText: {
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    fontFamily: Typography.family.regular,
  },
  inlineRetry: {
    minWidth: 64,
    minHeight: 44,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inlineRetryText: {
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
    fontFamily: Typography.family.semibold,
  },
  instrumentsHeader: {
    paddingTop: Space.xs,
    paddingBottom: Space.md,
  },
  resultCount: {
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    fontFamily: Typography.family.medium,
    fontVariant: ['tabular-nums'],
    paddingBottom: 4,
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
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlButton: {
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  searchControl: {
    flex: 1,
    justifyContent: 'flex-start',
  },
  controlText: {
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
    fontFamily: Typography.family.medium,
  },
  sortOptions: {
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    flexDirection: 'row',
    gap: Space.sm,
  },
  sortOption: {
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: Radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sortOptionText: {
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    fontFamily: Typography.family.semibold,
  },
  instrumentRow: {
    paddingHorizontal: Space.md,
    paddingBottom: Space.lg,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.sm,
  },
  instrumentSpacer: {
    flex: 1,
  },
  instrumentsEmptyWrap: {
    minHeight: 260,
    paddingHorizontal: Space.md,
  },
  remainingContent: {
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    gap: Space.lg,
  },
  creatorLink: {
    minHeight: 76,
    padding: Space.md,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
  },
  creatorIcon: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  creatorBody: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  creatorTitle: {
    fontSize: Type.bodyEmphasis.size,
    lineHeight: Type.bodyEmphasis.lineHeight,
    fontFamily: Typography.family.semibold,
  },
  creatorText: {
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    fontFamily: Typography.family.regular,
  },
  ledgerLink: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  ledgerLinkText: {
    flex: 1,
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
    fontFamily: Typography.family.medium,
  },
});
