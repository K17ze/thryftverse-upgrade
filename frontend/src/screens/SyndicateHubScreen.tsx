import React from 'react';
import {
  RefreshControl,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { RouteProp, useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAppTheme } from '../theme/ThemeContext';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { fetchCoOwnHoldings, listCoOwnAssets } from '../services/marketApi';
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
  CoOwnEducationCard,
  CoOwnHubSkeleton,
  CoOwnInstrumentCard,
  CoOwnMarketHighlightsCarousel,
  CoOwnOfflineBanner,
  CoOwnReconciliationBanner,
  CoOwnStateCanvas,
  COOWN_POSITION_CARD_WIDTH,
  type CoOwnAssetStatus,
  type CoOwnMarketHighlight,
} from '../components/coown';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { useConnectivity } from '../hooks/useConnectivity';
import { formatCoOwnIze } from '../utils/currency';

type NavT = NativeStackNavigationProp<RootStackParamList>;
type SortOption = 'progress' | 'closing' | 'roi';
type HubSegment = 'active' | 'new_issues' | 'watchlist';
type FundingFilter = 'all' | 'funding' | 'funded' | 'matured';

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
  settlementMode: 'ONEZE';
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
  | { kind: 'tabs'; key: 'tabs' }
  | { kind: 'positions'; key: 'positions' }
  | { kind: 'instrumentsHeader'; key: 'instruments-header' }
  | { kind: 'instrumentRow'; key: string; assets: HubAsset[] }
  | { kind: 'instrumentsEmpty'; key: 'instruments-empty' }
  | { kind: 'remaining'; key: 'remaining' };

const SEGMENTS: HubSegment[] = ['active', 'new_issues', 'watchlist'];
const SORT_OPTIONS: SortOption[] = ['progress', 'closing', 'roi'];
const FUNDING_FILTERS: FundingFilter[] = ['all', 'funding', 'funded', 'matured'];
const POSITION_CARD_WIDTH = COOWN_POSITION_CARD_WIDTH;
const POSITION_CARD_GAP = 12;
const POSITION_SNAP_INTERVAL = POSITION_CARD_WIDTH + POSITION_CARD_GAP;
const SEGMENT_LABELS: Record<HubSegment, string> = {
  active: 'Active',
  new_issues: 'New issues',
  watchlist: 'Watchlist',
};
const SORT_LABELS: Record<SortOption, string> = {
  progress: 'Progress',
  closing: 'Closing date',
  roi: 'ROI',
};
const FUNDING_FILTER_LABELS: Record<FundingFilter, string> = {
  all: 'All',
  funding: 'Funding',
  funded: 'Funded',
  matured: 'Matured',
};
const SECTION_TITLES: Record<HubSegment, string> = {
  active: 'Open markets',
  new_issues: 'New issues',
  watchlist: 'Watchlist',
};

function normalizeInitialSegment(value: 'active' | 'new_issues' | 'watchlist' | undefined): HubSegment {
  return value === 'new_issues' || value === 'watchlist' ? value : 'active';
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
  const route = useRoute<RouteProp<RootStackParamList, 'CoOwnHub'>>();
  const currentUser = useStore((state) => state.currentUser);
  const coOwnWatchlist = useStore((state) => state.coOwnWatchlist);
  const toggleCoOwnWatch = useStore((state) => state.toggleCoOwnWatch);
  const { formatFromFiat, currencyCode } = useFormattedPrice();
  const { show } = useToast();
  const { colors } = useAppTheme();
  const { width: screenWidth } = useWindowDimensions();
  const { listings } = useBackendData();
  const { isOffline } = useConnectivity();
  const actingUserId = currentUser?.id;

  const [query, setQuery] = React.useState('');
  const [isSearchExpanded, setIsSearchExpanded] = React.useState(false);
  const [isSortExpanded, setIsSortExpanded] = React.useState(false);
  const [sortBy, setSortBy] = React.useState<SortOption>('progress');
  const [fundingFilter, setFundingFilter] = React.useState<FundingFilter>('all');
  const [activeSegment, setActiveSegment] = React.useState<HubSegment>(normalizeInitialSegment(route.params?.initialSegment));
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

  // useFocusEffect ensures the hub re-fetches co-own assets whenever the
  // user navigates back to it (e.g., after creating a new co-own asset).
  useFocusEffect(
    React.useCallback(() => {
      const cleanup = loadData();
      return cleanup;
    }, [loadData])
  );

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
      </View>
    ),
    [colors, navigation, yourPositions.length]
  );

  const segmentCounts = React.useMemo<Record<HubSegment, number>>(() => {
    const now = Date.now();
    return {
      active: marketAssets.filter((asset) => asset.isOpen && asset.availableUnits > 0).length,
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
    // Segment filter — active, new_issues, or watchlist
    const segmentFiltered = marketAssets.filter((asset) => {
      if (activeSegment === 'active') return asset.isOpen && asset.availableUnits > 0;
      if (activeSegment === 'watchlist') return coOwnWatchlist.includes(asset.id);
      const createdAt = new Date(asset.createdAt).getTime();
      return Number.isFinite(createdAt) && now - createdAt <= 7 * 24 * 60 * 60 * 1000;
    });
    // Funding status filter — All, Funding, Funded, Matured
    const fundingFiltered = segmentFiltered.filter((asset) => {
      if (fundingFilter === 'all') return true;
      if (fundingFilter === 'funding') return asset.isOpen && asset.availableUnits > 0;
      if (fundingFilter === 'funded') return asset.isOpen && asset.availableUnits === 0;
      if (fundingFilter === 'matured') return !asset.isOpen;
      return true;
    });
    // Search filter
    const searched = normalized
      ? fundingFiltered.filter((asset) =>
          asset.title.toLowerCase().includes(normalized) ||
          asset.category.toLowerCase().includes(normalized) ||
          (asset.issuerJurisdiction ?? '').toLowerCase().includes(normalized)
        )
      : fundingFiltered;
    // Sort — by progress, closing date, or ROI
    return [...searched].sort((a, b) => {
      if (sortBy === 'progress') {
        const aProgress = a.totalUnits > 0 ? (a.totalUnits - a.availableUnits) / a.totalUnits : 0;
        const bProgress = b.totalUnits > 0 ? (b.totalUnits - b.availableUnits) / b.totalUnits : 0;
        return bProgress - aProgress;
      }
      if (sortBy === 'closing') {
        // Closing date proxy: oldest first (longest-running syndicates
        // are likely closest to closing). Falls back to newest when equal.
        const aDate = new Date(a.createdAt).getTime();
        const bDate = new Date(b.createdAt).getTime();
        return aDate - bDate;
      }
      if (sortBy === 'roi') {
        // ROI: sort by unrealized P&L percentage for held positions.
        // Assets without holdings sort last (ROI not applicable).
        const aRoi = a.avgEntryPriceGBP != null && a.avgEntryPriceGBP > 0 && a.yourUnits > 0
          ? ((a.unitPriceGBP - a.avgEntryPriceGBP) / a.avgEntryPriceGBP) * 100
          : -Infinity;
        const bRoi = b.avgEntryPriceGBP != null && b.avgEntryPriceGBP > 0 && b.yourUnits > 0
          ? ((b.unitPriceGBP - b.avgEntryPriceGBP) / b.avgEntryPriceGBP) * 100
          : -Infinity;
        return bRoi - aRoi;
      }
      return 0;
    });
  }, [activeSegment, coOwnWatchlist, fundingFilter, marketAssets, query, sortBy]);

  const format1ze = React.useCallback(
    (value1ze: number) => formatCoOwnIze(value1ze),
    []
  );

  const formatLocal = React.useCallback((valueGbp: number) => (
    formatFromFiat(valueGbp, currencyCode, { displayMode: 'fiat', fiatFractionDigits: 2 })
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

    // Holders: positions first (personal portfolio), then market tabs + grid.
    // Non-holders: market highlights first (education/discovery), then tabs + grid.
    // Per doc 42: "Do not always put generic highlights before existing holdings."
    // This keeps tabs at index 1 so stickyHeaderIndices={[1]} always pins the
    // market segment selector (holders: positions[0] → tabs[1]; non-holders:
    // highlights[0] → tabs[1]).
    if (hasPositions) {
      rows.push({ kind: 'positions', key: 'positions' });
    } else {
      rows.push({ kind: 'highlights', key: 'highlights' });
    }

    rows.push({ kind: 'tabs', key: 'tabs' });
    rows.push({ kind: 'instrumentsHeader', key: 'instruments-header' });

    if (instrumentRows.length === 0) {
      rows.push({ kind: 'instrumentsEmpty', key: 'instruments-empty' });
    } else {
      instrumentRows.forEach((assets, index) => {
        rows.push({ kind: 'instrumentRow', key: `instruments-${index}-${assets.map((asset) => asset.id).join('-')}`, assets });
      });
    }
    rows.push({ kind: 'remaining', key: 'remaining' });
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

  const renderTabs = React.useCallback(() => (
    <View style={[styles.tabsSurface, { backgroundColor: colors.background, borderBottomColor: colors.border, borderTopColor: colors.border }]}>
      <View style={styles.tabsRow} accessibilityRole="tablist">
        {SEGMENTS.map((segment) => {
          const isActive = activeSegment === segment;
          return (
            <AnimatedPressable
              key={segment}
              onPress={() => {
                haptics.selection();
                setActiveSegment(segment);
              }}
              style={styles.tab}
              scaleValue={0.98}
              activeOpacity={0.72}
              accessibilityRole="tab"
              accessibilityLabel={`${SEGMENT_LABELS[segment]} tab, ${segmentCounts[segment]} items`}
              accessibilityState={{ selected: isActive }}
            >
              <Text
                style={[
                  styles.tabText,
                  {
                    color: isActive ? colors.textPrimary : colors.textSecondary,
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
          <CoOwnMarketHighlightsCarousel items={highlights} onPressItem={handleHighlightPress} />
        </View>
      );
    }

    if (item.kind === 'tabs') return renderTabs();

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
                onPress={loadData}
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
                  placeholder="Search markets"
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
                  accessibilityLabel="Search open markets"
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
                accessibilityLabel="Search open markets"
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

          {/* Funding status filter — All | Funding | Funded | Matured.
              Secondary filter dimension within the instruments section.
              Flat chip row, no card chrome. */}
          <View style={styles.fundingFilterRow}>
            {FUNDING_FILTERS.map((filter) => {
              const isActive = fundingFilter === filter;
              return (
                <AnimatedPressable
                  key={filter}
                  onPress={() => {
                    haptics.selection();
                    setFundingFilter(filter);
                  }}
                  style={[
                    styles.fundingFilterChip,
                    {
                      backgroundColor: isActive ? colors.brandSubtle : 'transparent',
                      borderColor: isActive ? colors.brand : colors.border,
                    },
                  ]}
                  scaleValue={0.97}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel={`Filter by ${FUNDING_FILTER_LABELS[filter]}`}
                  accessibilityState={{ selected: isActive }}
                >
                  <Text
                    style={[
                      styles.fundingFilterText,
                      {
                        color: isActive ? colors.brand : colors.textSecondary,
                        fontFamily: isActive ? Typography.family.semibold : Typography.family.regular,
                      },
                    ]}
                    maxFontSizeMultiplier={1.25}
                  >
                    {FUNDING_FILTER_LABELS[filter]}
                  </Text>
                </AnimatedPressable>
              );
            })}
          </View>
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
              focalPoint={getCategoryFocalPoint(asset.category)}
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
        : query.trim()
          ? 'No matching markets'
          : 'No markets available';
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
          style={[styles.creatorLink, { borderBottomColor: colors.border }]}
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
          <Ionicons name="receipt-outline" size={18} color={colors.textSecondary} />
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
    fundingFilter,
    isSearchExpanded,
    isSortExpanded,
    loadData,
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
      <FlagshipScreen
        header={<FlagshipHeader title="Co-Own" onBack={handleBack} rightAction={headerRightAction} />}
      >
        <CoOwnHubSkeleton />
      </FlagshipScreen>
    );
  }

  if (isError && remoteAssets.length === 0) {
    return (
      <FlagshipScreen
        header={<FlagshipHeader title="Co-Own" onBack={handleBack} rightAction={headerRightAction} />}
      >
        <CoOwnStateCanvas variant="error" actionLabel="Try again" onAction={loadData} />
      </FlagshipScreen>
    );
  }

  if (remoteAssets.length === 0) {
    return (
      <FlagshipScreen
        header={<FlagshipHeader title="Co-Own" onBack={handleBack} rightAction={headerRightAction} />}
      >
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
      <CoOwnOfflineBanner isOffline={isOffline} />
      <CoOwnReconciliationBanner isActive={false} />
      <FlashList
        data={hubRows}
        renderItem={renderRow}
        keyExtractor={(item) => item.key}
        stickyHeaderIndices={[1]}
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
    fontSize: 10,
    fontFamily: Typography.family.bold,
  },
  highlightsSection: {
    paddingTop: Space.sm,
    paddingBottom: Space.md,
  },
  tabsSurface: {
    minHeight: Control.hit + 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderTopWidth: StyleSheet.hairlineWidth,
    justifyContent: 'flex-end',
  },
  tabsRow: {
    minHeight: Control.hit + 5,
    paddingHorizontal: Space.sm,
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  tab: {
    minWidth: 0,
    minHeight: Control.hit + 5,
    flex: 1,
    paddingHorizontal: Space.xs,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  tabText: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    letterSpacing: LetterSpacing.normal - 0.1,
    textAlign: 'center',
  },
  tabIndicator: {
    position: 'absolute',
    bottom: 0,
    width: Space.lg + 4,
    height: Stroke.emphasis,
    borderRadius: Stroke.hairline,
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
  // ── Funding status filter chips ──
  // Flat chip row below sort controls. Uses brandSubtle for selected state
  // per design tokens. No card chrome — flat canvas with hairline borders.
  fundingFilterRow: {
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    flexDirection: 'row',
    gap: Space.sm,
  },
  fundingFilterChip: {
    paddingHorizontal: Space.smMd,
    paddingVertical: Space.xs + 1,
    borderRadius: Radius.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
  fundingFilterText: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    letterSpacing: LetterSpacing.normal - 0.1,
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
  remainingContent: {
    paddingHorizontal: Space.md,
    paddingTop: Space.lg,
    gap: Space.md,
  },
  creatorLink: {
    minHeight: Space.xxl + Space.xl + Space.xs,
    paddingVertical: Space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  creatorIcon: {
    width: Control.hit,
    height: Control.hit,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  creatorBody: {
    flex: 1,
    minWidth: 0,
    gap: Space.xs / 2,
  },
  creatorTitle: {
    fontSize: TypographyV2.bodyStrong.size,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
  },
  creatorText: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
  },
  ledgerLink: {
    minHeight: Control.hit,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  ledgerLinkText: {
    flex: 1,
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: TypographyV2.body.fontFamily,
  },
});
