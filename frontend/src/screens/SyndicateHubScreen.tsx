import React from 'react';
import { View, Text, StyleSheet, StatusBar, useWindowDimensions } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { useAppTheme } from '../theme/ThemeContext';
import { Colors } from '../constants/colors';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { listCoOwnAssets, fetchCoOwnHoldings } from '../services/marketApi';
import { EmptyState } from '../components/EmptyState';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { AppSegmentControl } from '../components/ui/AppSegmentControl';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { Motion } from '../constants/motion';
import { useToast } from '../context/ToastContext';
import { Space, Radius, Type, Typography } from '../theme/designTokens';
import { haptics } from '../utils/haptics';
import { AppInput } from '../components/ui/AppInput';
import { Meta, Body, BodyEmphasis } from '../components/ui/Text';
import { FlagshipEmptyGraphic } from '../components/flagship';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { CoOwnFeaturedHero, CoOwnDiscoveryCard } from '../components/coown';

type NavT = StackNavigationProp<RootStackParamList>;

type HubSort = 'value' | 'movers' | 'latest';
const SORT_OPTIONS: Array<{ value: HubSort; label: string; accessibilityLabel: string }> = [
  { value: 'latest', label: 'NEW', accessibilityLabel: 'Sort by newest' },
  { value: 'value', label: 'VALUE', accessibilityLabel: 'Sort by market value' },
  { value: 'movers', label: 'MOVERS', accessibilityLabel: 'Sort by price movers' },
];

interface HubAsset {
  id: string;
  listingId: string;
  issuerId: string;
  title: string;
  image: string;
  totalUnits: number;
  availableUnits: number;
  unitPriceGBP: number;
  unitPriceStable: number;
  settlementMode: 'GBP' | 'TVUSD' | 'HYBRID';
  issuerJurisdiction?: string;
  marketMovePct24h: number;
  holders: number;
  volume24hGBP: number;
  yourUnits: number;
  avgEntryPriceGBP?: number;
  realizedProfitGBP?: number;
  isOpen: boolean;
  createdAt: string;
}

export default function CoOwnHubScreen() {
  const navigation = useNavigation<NavT>();
  const currentUser = useStore((state) => state.currentUser);
  const { formatFromFiat } = useFormattedPrice();
  const { show } = useToast();
  const reducedMotionEnabled = useReducedMotion();
  const { isDark } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const actingUserId = currentUser?.id;

  const [query, setQuery] = React.useState('');
  const [sortBy, setSortBy] = React.useState<HubSort>('latest');
  const [remoteAssets, setRemoteAssets] = React.useState<HubAsset[]>([]);
  const [holdings, setHoldings] = React.useState<Map<string, { units: number; avgEntry: number; realized: number }>>(new Map());
  const [isSyncing, setIsSyncing] = React.useState(true);
  const [isError, setIsError] = React.useState(false);

  React.useEffect(() => {
    if (!actingUserId) { setIsSyncing(false); return; }
    let cancelled = false;
    setIsSyncing(true);
    setIsError(false);

    Promise.all([
      listCoOwnAssets({ limit: 120 }),
      fetchCoOwnHoldings(actingUserId).catch(() => []),
    ])
      .then(([items, holdingItems]) => {
        if (cancelled) return;
        const mapped: HubAsset[] = items.map((item) => ({
          id: item.id,
          listingId: item.listingId,
          issuerId: item.issuerId,
          title: item.title,
          image: item.imageUrl ?? '',
          totalUnits: item.totalUnits,
          availableUnits: item.availableUnits,
          unitPriceGBP: item.unitPriceGbp,
          unitPriceStable: item.unitPriceStable,
          settlementMode: item.settlementMode as 'GBP' | 'TVUSD' | 'HYBRID',
          issuerJurisdiction: item.issuerJurisdiction ?? undefined,
          marketMovePct24h: item.marketMovePct24h,
          holders: item.holders,
          volume24hGBP: item.volume24hGbp,
          yourUnits: 0,
          isOpen: item.isOpen,
          createdAt: item.createdAt,
        }));
        const holdingsMap = new Map<string, { units: number; avgEntry: number; realized: number }>();
        for (const h of holdingItems) {
          holdingsMap.set(h.assetId, { units: h.unitsOwned, avgEntry: h.avgEntryPriceGbp, realized: h.realizedPnlGbp });
        }
        setRemoteAssets(mapped);
        setHoldings(holdingsMap);
      })
      .catch(() => {
        if (cancelled) return;
        show('Failed to load co-own assets', 'error');
        setIsError(true);
      })
      .finally(() => {
        if (!cancelled) setIsSyncing(false);
      });

    return () => { cancelled = true; };
  }, [actingUserId, show]);

  const handleBack = React.useCallback(() => {
    if (navigation.canGoBack()) { navigation.goBack(); return; }
    navigation.navigate('MainTabs');
  }, [navigation]);

  const marketAssets = React.useMemo(
    () => remoteAssets.map((asset) => {
      const holding = holdings.get(asset.id);
      if (!holding) return asset;
      return {
        ...asset,
        yourUnits: holding.units,
        avgEntryPriceGBP: holding.avgEntry,
        realizedProfitGBP: holding.realized,
      };
    }),
    [remoteAssets, holdings]
  );

  const filteredAssets = React.useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const filtered = marketAssets.filter((asset) => {
      if (!normalized) return true;
      return asset.title.toLowerCase().includes(normalized);
    });
    const sorted = [...filtered];
    if (sortBy === 'movers') sorted.sort((a, b) => b.marketMovePct24h - a.marketMovePct24h);
    else if (sortBy === 'latest') sorted.sort((a, b) => b.createdAt?.localeCompare(a.createdAt ?? '') ?? 0);
    else sorted.sort((a, b) => b.totalUnits * b.unitPriceGBP - a.totalUnits * a.unitPriceGBP);
    return sorted;
  }, [marketAssets, query, sortBy]);

  const featuredAsset = React.useMemo(() => {
    if (filteredAssets.length === 0) return null;
    // Feature the asset with the most allocation momentum (most allocated, still open)
    const open = filteredAssets.filter((a) => a.isOpen && a.availableUnits > 0);
    if (open.length === 0) return filteredAssets[0];
    return open.reduce((best, current) => {
      const bestAllocated = best.totalUnits - best.availableUnits;
      const currentAllocated = current.totalUnits - current.availableUnits;
      return currentAllocated > bestAllocated ? current : best;
    });
  }, [filteredAssets]);

  const discoveryAssets = React.useMemo(() => {
    if (!featuredAsset) return [];
    return filteredAssets.filter((a) => a.id !== featuredAsset.id);
  }, [filteredAssets, featuredAsset]);

  const yourPositions = React.useMemo(
    () => marketAssets.filter((a) => a.yourUnits > 0),
    [marketAssets]
  );

  const isSearching = query.trim().length > 0;

  // ── Loading state ──
  if (isSyncing && remoteAssets.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={Colors.background} />
        <CoOwnHubHeader
          title="Co-Own"
          context="Shared ownership of fashion and collectibles"
          onBack={handleBack}
          insets={insets}
          onLedger={() => navigation.navigate('MarketLedger')}
          onCreate={() => { haptics.tap(); navigation.navigate('CreateCoOwn'); }}
        />
        <View style={styles.loadingWrap}>
          <View style={styles.skeletonHero} />
          <View style={styles.skeletonRow}>
            <View style={styles.skeletonCard} />
            <View style={styles.skeletonCard} />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // ── Error state ──
  if (isError && remoteAssets.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={Colors.background} />
        <CoOwnHubHeader
          title="Co-Own"
          context="Shared ownership of fashion and collectibles"
          onBack={handleBack}
          insets={insets}
          onLedger={() => navigation.navigate('MarketLedger')}
          onCreate={() => { haptics.tap(); navigation.navigate('CreateCoOwn'); }}
        />
        <EmptyState
          graphic={<FlagshipEmptyGraphic variant="bag" size={120} />}
          title="Unable to load"
          subtitle="Pull down to retry, or check your connection."
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={Colors.background} />

      <CoOwnHubHeader
        title="Co-Own"
        context="Shared ownership of fashion and collectibles"
        onBack={handleBack}
        insets={insets}
        onLedger={() => navigation.navigate('MarketLedger')}
        onCreate={() => { haptics.tap(); navigation.navigate('CreateCoOwn'); }}
      />

      <FlashList
        data={isSearching ? filteredAssets : discoveryAssets}
        keyExtractor={(item) => item.id}
        numColumns={2}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View>
            {/* Search */}
            <View style={styles.searchWrap}>
              <AppInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search Co-Own items..."
                prefix={<Ionicons name="search-outline" size={16} color={Colors.textMuted} />}
                accessibilityLabel="Search co-own assets"
              />
            </View>

            {/* Navigation tabs: Discover / Portfolio / Activity */}
            <View style={styles.navTabs}>
              <NavTab
                label="Discover"
                active={!isSearching}
                onPress={() => { setQuery(''); haptics.selection(); }}
              />
              <NavTab
                label="Portfolio"
                onPress={() => { haptics.tap(); navigation.navigate('Portfolio'); }}
              />
              <NavTab
                label="Activity"
                onPress={() => { haptics.tap(); navigation.navigate('CoOwnOrderHistory'); }}
              />
            </View>

            {/* Sort control */}
            <View style={styles.sortWrap}>
              <AppSegmentControl
                options={SORT_OPTIONS}
                value={sortBy}
                onChange={setSortBy}
                fullWidth
              />
            </View>

            {/* Featured hero (only when not searching) */}
            {!isSearching && featuredAsset && (
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Featured</Text>
              </View>
            )}
            {!isSearching && featuredAsset && (
              <CoOwnFeaturedHero
                imageUri={featuredAsset.image}
                title={featuredAsset.title}
                unitPrice={formatFromFiat(featuredAsset.unitPriceGBP, 'GBP')}
                availableUnits={featuredAsset.availableUnits}
                totalUnits={featuredAsset.totalUnits}
                status={featuredAsset.isOpen ? (featuredAsset.availableUnits > 0 ? 'open' : 'closed') : 'paused'}
                onPress={() => navigation.navigate('AssetDetail', { assetId: featuredAsset.id })}
                onAction={() => navigation.navigate('AssetDetail', { assetId: featuredAsset.id })}
                actionLabel="View details"
              />
            )}

            {/* Your positions (when authenticated and holdings exist) */}
            {!isSearching && yourPositions.length > 0 && (
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Your positions</Text>
                <AnimatedPressable
                  onPress={() => { haptics.tap(); navigation.navigate('Portfolio'); }}
                  accessibilityRole="button"
                  accessibilityLabel="View all positions"
                >
                  <Meta style={styles.sectionLink}>All</Meta>
                </AnimatedPressable>
              </View>
            )}
            {!isSearching && yourPositions.length > 0 && (
              <View style={styles.positionsRow}>
                {yourPositions.slice(0, 2).map((asset) => (
                  <CoOwnDiscoveryCard
                    key={asset.id}
                    imageUri={asset.image}
                    title={asset.title}
                    unitPrice={formatFromFiat(asset.unitPriceGBP, 'GBP')}
                    availableUnits={asset.availableUnits}
                    totalUnits={asset.totalUnits}
                    status={asset.isOpen ? (asset.availableUnits > 0 ? 'open' : 'closed') : 'paused'}
                    onPress={() => navigation.navigate('AssetDetail', { assetId: asset.id })}
                  />
                ))}
              </View>
            )}

            {/* Available now section header */}
            {!isSearching && discoveryAssets.length > 0 && (
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Available now</Text>
                <Meta style={styles.sectionCount}>{discoveryAssets.length} items</Meta>
              </View>
            )}

            {/* Search results header */}
            {isSearching && (
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Results</Text>
                <Meta style={styles.sectionCount}>{filteredAssets.length} items</Meta>
              </View>
            )}
          </View>
        }
        renderItem={({ item, index }) => (
          <View style={styles.discoveryCardWrap}>
            <CoOwnDiscoveryCard
              imageUri={item.image}
              title={item.title}
              unitPrice={formatFromFiat(item.unitPriceGBP, 'GBP')}
              availableUnits={item.availableUnits}
              totalUnits={item.totalUnits}
              status={item.isOpen ? (item.availableUnits > 0 ? 'open' : 'closed') : 'paused'}
              onPress={() => navigation.navigate('AssetDetail', { assetId: item.id })}
              index={index}
            />
          </View>
        )}
        ListEmptyComponent={
          <EmptyState
            graphic={<FlagshipEmptyGraphic variant="bag" size={120} />}
            title={isSearching ? "No results" : "No co-own assets"}
            subtitle={isSearching ? "Try a different search term." : "Assets will appear here once pools are issued."}
          />
        }
        ListFooterComponent={
          !isSearching ? (
            <View>
              {/* How it works module */}
              <View style={styles.educationModule}>
                <Text style={styles.educationTitle}>How Co-Own works</Text>
                <View style={styles.educationItem}>
                  <Ionicons name="cube-outline" size={18} color={Colors.brand} />
                  <View style={styles.educationTextWrap}>
                    <BodyEmphasis style={styles.educationItemTitle}>Buy units</BodyEmphasis>
                    <Body style={styles.educationItemBody}>Own a fraction of a fashion item through affordable units.</Body>
                  </View>
                </View>
                <View style={styles.educationItem}>
                  <Ionicons name="swap-horizontal-outline" size={18} color={Colors.brand} />
                  <View style={styles.educationTextWrap}>
                    <BodyEmphasis style={styles.educationItemTitle}>Trade units</BodyEmphasis>
                    <Body style={styles.educationItemBody}>List your units for sale or buy more from other co-owners.</Body>
                  </View>
                </View>
                <View style={styles.educationItem}>
                  <Ionicons name="shield-checkmark-outline" size={18} color={Colors.brand} />
                  <View style={styles.educationTextWrap}>
                    <BodyEmphasis style={styles.educationItemTitle}>Transparent rules</BodyEmphasis>
                    <Body style={styles.educationItemBody}>Fees, settlement, and risks are disclosed before every transaction.</Body>
                  </View>
                </View>
                <AnimatedPressable
                  style={styles.educationLink}
                  onPress={() => { haptics.tap(); navigation.navigate('CoOwnOnboarding'); }}
                  accessibilityRole="button"
                  accessibilityLabel="Learn more about co-own"
                >
                  <Text style={styles.educationLinkText}>Learn more</Text>
                  <Ionicons name="chevron-forward" size={14} color={Colors.brand} />
                </AnimatedPressable>
              </View>

              {/* Quick links */}
              <View style={styles.quickLinks}>
                <AnimatedPressable
                  style={styles.quickLink}
                  onPress={() => { haptics.tap(); navigation.navigate('Portfolio'); }}
                  accessibilityRole="button"
                  accessibilityLabel="Open portfolio"
                >
                  <Ionicons name="pie-chart-outline" size={20} color={Colors.textPrimary} />
                  <Meta style={styles.quickLinkLabel}>Portfolio</Meta>
                </AnimatedPressable>
                <AnimatedPressable
                  style={styles.quickLink}
                  onPress={() => { haptics.tap(); navigation.navigate('CoOwnOrderHistory'); }}
                  accessibilityRole="button"
                  accessibilityLabel="Open order history"
                >
                  <Ionicons name="time-outline" size={20} color={Colors.textPrimary} />
                  <Meta style={styles.quickLinkLabel}>Orders</Meta>
                </AnimatedPressable>
                <AnimatedPressable
                  style={styles.quickLink}
                  onPress={() => { haptics.tap(); navigation.navigate('MarketLedger'); }}
                  accessibilityRole="button"
                  accessibilityLabel="Open market ledger"
                >
                  <Ionicons name="pulse-outline" size={20} color={Colors.textPrimary} />
                  <Meta style={styles.quickLinkLabel}>Ledger</Meta>
                </AnimatedPressable>
              </View>
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

// ── Editorial header matching AuctionMarketHeader language ──
function CoOwnHubHeader({
  title,
  context,
  onBack,
  insets,
  onLedger,
  onCreate,
}: {
  title: string;
  context: string;
  onBack: () => void;
  insets: { top: number };
  onLedger: () => void;
  onCreate: () => void;
}) {
  return (
    <View style={[styles.header, { paddingTop: insets.top + Space.xs }]}>
      <View style={styles.headerRow}>
        <AnimatedPressable
          onPress={onBack}
          style={styles.headerIconBtn}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
        </AnimatedPressable>

        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
          <Text style={styles.headerContext} numberOfLines={1}>{context}</Text>
        </View>

        <View style={styles.headerActions}>
          <AnimatedPressable
            onPress={onLedger}
            style={styles.headerIconBtn}
            accessibilityRole="button"
            accessibilityLabel="Open market ledger"
          >
            <Ionicons name="pulse-outline" size={22} color={Colors.textPrimary} />
          </AnimatedPressable>
          <AnimatedPressable
            onPress={onCreate}
            style={styles.headerCreateBtn}
            accessibilityRole="button"
            accessibilityLabel="Issue new co-own"
          >
            <Ionicons name="add" size={22} color={Colors.brand} />
          </AnimatedPressable>
        </View>
      </View>
    </View>
  );
}

// ── Navigation tab ──
function NavTab({ label, active, onPress }: { label: string; active?: boolean; onPress: () => void }) {
  return (
    <AnimatedPressable
      onPress={onPress}
      style={[styles.navTab, active && styles.navTabActive]}
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!active }}
    >
      <Text style={[styles.navTabText, active && styles.navTabTextActive]}>{label}</Text>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  // Header
  header: {
    paddingBottom: Space.sm - 2,
    paddingHorizontal: Space.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    minHeight: 48,
  },
  headerIconBtn: {
    width: 36,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCreateBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(244,240,232,0.10)',
    marginLeft: 4,
  },
  headerTitleWrap: {
    flex: 1,
  },
  headerTitle: {
    fontFamily: Typography.family.bold,
    fontSize: 30,
    color: Colors.textPrimary,
    letterSpacing: -0.8,
  },
  headerContext: {
    fontFamily: Typography.family.regular,
    fontSize: 13,
    color: Colors.textSecondary,
    letterSpacing: -0.1,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  // Search
  searchWrap: {
    marginHorizontal: Space.md,
    marginBottom: Space.sm,
  },
  // Nav tabs
  navTabs: {
    flexDirection: 'row',
    marginHorizontal: Space.md,
    marginBottom: Space.sm,
    gap: Space.sm,
  },
  navTab: {
    paddingVertical: Space.xs + 2,
    paddingHorizontal: Space.md,
    borderRadius: Radius.full,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  navTabActive: {
    backgroundColor: Colors.brand,
    borderColor: Colors.brand,
  },
  navTabText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    color: Colors.textSecondary,
  },
  navTabTextActive: {
    color: Colors.background,
  },
  // Sort
  sortWrap: {
    marginHorizontal: Space.md,
    marginBottom: Space.md,
  },
  // Section headers
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    marginBottom: Space.sm,
    marginTop: Space.sm,
  },
  sectionTitle: {
    fontSize: Type.subtitle.size,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
    letterSpacing: -0.3,
  },
  sectionLink: {
    color: Colors.brand,
    fontWeight: '600',
  },
  sectionCount: {
    color: Colors.textSecondary,
  },
  // Discovery grid
  discoveryCardWrap: {
    flex: 1,
    paddingHorizontal: Space.sm / 2,
    marginBottom: Space.sm,
  },
  listContent: {
    paddingBottom: Space.xxl,
  },
  // Positions row
  positionsRow: {
    flexDirection: 'row',
    paddingHorizontal: Space.md - Space.sm / 2,
    marginBottom: Space.lg,
  },
  // Loading skeleton
  loadingWrap: {
    flex: 1,
    paddingHorizontal: Space.md,
    paddingTop: Space.md,
  },
  skeletonHero: {
    width: '100%',
    height: 280,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
    marginBottom: Space.lg,
  },
  skeletonRow: {
    flexDirection: 'row',
    gap: Space.sm,
  },
  skeletonCard: {
    flex: 1,
    height: 280,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
  },
  // Education module
  educationModule: {
    marginHorizontal: Space.md,
    marginTop: Space.lg,
    marginBottom: Space.md,
    padding: Space.lg,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  educationTitle: {
    fontSize: Type.subtitle.size,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
    marginBottom: Space.md,
  },
  educationItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.md,
    marginBottom: Space.md,
  },
  educationTextWrap: {
    flex: 1,
    gap: 2,
  },
  educationItemTitle: {
    fontSize: Type.body.size,
    color: Colors.textPrimary,
  },
  educationItemBody: {
    fontSize: Type.caption.size,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  educationLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: Space.xs,
  },
  educationLinkText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    color: Colors.brand,
  },
  // Quick links
  quickLinks: {
    flexDirection: 'row',
    marginHorizontal: Space.md,
    marginBottom: Space.lg,
    gap: Space.sm,
  },
  quickLink: {
    flex: 1,
    alignItems: 'center',
    gap: Space.xs,
    paddingVertical: Space.md,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  quickLinkLabel: {
    color: Colors.textSecondary,
  },
});
