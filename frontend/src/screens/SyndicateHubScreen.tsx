import React from 'react';
import { View, Text, StyleSheet, StatusBar, useWindowDimensions, RefreshControl, ScrollView } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { useAppTheme } from '../theme/ThemeContext';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { listCoOwnAssets, fetchCoOwnHoldings } from '../services/marketApi';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useToast } from '../context/ToastContext';
import { Space, Radius, Type, Typography } from '../theme/designTokens';
import { haptics } from '../utils/haptics';
import { AppInput } from '../components/ui/AppInput';
import { AnimatedPressable } from '../components/AnimatedPressable';
import {
  CoOwnMarketHeader,
  CoOwnFeaturedAsset,
  CoOwnAssetTile,
  CoOwnEducationCard,
  CoOwnHubSkeleton,
  CoOwnStateCanvas,
  type CoOwnAssetStatus,
} from '../components/coown';

type NavT = StackNavigationProp<RootStackParamList>;

type HubTab = 'discover' | 'portfolio' | 'activity';

type SortOption = 'newest' | 'available' | 'allocation';

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
  holders: number;
  yourUnits: number;
  avgEntryPriceGBP?: number;
  realizedProfitGBP?: number;
  isOpen: boolean;
  createdAt: string;
}

const SORT_LABELS: Record<SortOption, string> = {
  newest: 'Newest',
  available: 'Most available',
  allocation: 'Most allocated',
};

export default function CoOwnHubScreen() {
  const navigation = useNavigation<NavT>();
  const currentUser = useStore((state) => state.currentUser);
  const { formatFromFiat } = useFormattedPrice();
  const { show } = useToast();
  const reducedMotion = useReducedMotion();
  const { colors, isDark } = useAppTheme();
  const { width: screenWidth } = useWindowDimensions();
  const actingUserId = currentUser?.id;

  const [query, setQuery] = React.useState('');
  const [sortBy, setSortBy] = React.useState<SortOption>('newest');
  const [activeTab, setActiveTab] = React.useState<HubTab>('discover');
  const [remoteAssets, setRemoteAssets] = React.useState<HubAsset[]>([]);
  const [holdings, setHoldings] = React.useState<Map<string, { units: number; avgEntry: number; realized: number }>>(new Map());
  const [isSyncing, setIsSyncing] = React.useState(true);
  const [isError, setIsError] = React.useState(false);
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  const loadData = React.useCallback(() => {
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
          holders: item.holders,
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
        show('Failed to load marketplace', 'error');
        setIsError(true);
      })
      .finally(() => {
        if (!cancelled) setIsSyncing(false);
      });

    return () => { cancelled = true; };
  }, [actingUserId, show]);

  React.useEffect(() => {
    const cleanup = loadData();
    return cleanup;
  }, [loadData]);

  const handleBack = React.useCallback(() => {
    if (navigation.canGoBack()) { navigation.goBack(); return; }
    navigation.navigate('MainTabs');
  }, [navigation]);

  const handleRefresh = React.useCallback(() => {
    setIsRefreshing(true);
    loadData();
    setTimeout(() => setIsRefreshing(false), 800);
  }, [loadData]);

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
      return (
        asset.title.toLowerCase().includes(normalized) ||
        (asset.issuerJurisdiction ?? '').toLowerCase().includes(normalized)
      );
    });
    const sorted = [...filtered];
    if (sortBy === 'allocation') {
      sorted.sort((a, b) => {
        const aAlloc = a.totalUnits > 0 ? (a.totalUnits - a.availableUnits) / a.totalUnits : 0;
        const bAlloc = b.totalUnits > 0 ? (b.totalUnits - b.availableUnits) / b.totalUnits : 0;
        return bAlloc - aAlloc;
      });
    } else if (sortBy === 'available') {
      sorted.sort((a, b) => b.availableUnits - a.availableUnits);
    } else {
      sorted.sort((a, b) => b.createdAt?.localeCompare(a.createdAt ?? '') ?? 0);
    }
    return sorted;
  }, [marketAssets, query, sortBy]);

  const featuredAsset = React.useMemo(() => {
    if (filteredAssets.length === 0) return null;
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

  // ── Horizontal rail data: newest, most available, most allocated ──
  const newestRail = React.useMemo(() => {
    const open = marketAssets.filter((a) => a.isOpen && a.availableUnits > 0);
    return [...open]
      .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
      .slice(0, 10);
  }, [marketAssets]);

  const mostAvailableRail = React.useMemo(() => {
    const open = marketAssets.filter((a) => a.isOpen && a.availableUnits > 0);
    return [...open]
      .sort((a, b) => b.availableUnits - a.availableUnits)
      .slice(0, 10);
  }, [marketAssets]);

  const mostAllocatedRail = React.useMemo(() => {
    const open = marketAssets.filter((a) => a.isOpen && a.totalUnits > 0);
    return [...open]
      .sort((a, b) => {
        const aPct = (a.totalUnits - a.availableUnits) / a.totalUnits;
        const bPct = (b.totalUnits - b.availableUnits) / b.totalUnits;
        return bPct - aPct;
      })
      .slice(0, 10);
  }, [marketAssets]);

  const isSearching = query.trim().length > 0;

  const gridColumns = screenWidth < 360 ? 1 : 2;

  // Real market context — no fabricated volume/growth figures
  const marketContext = React.useMemo(() => {
    const openItems = marketAssets.filter((a) => a.isOpen && a.availableUnits > 0).length;
    const totalAvailableUnits = marketAssets.reduce((sum, a) => sum + Math.max(0, a.availableUnits), 0);
    return { openItems, totalAvailableUnits };
  }, [marketAssets]);

  const formatStatus = (asset: HubAsset): CoOwnAssetStatus => {
    if (!asset.isOpen) return 'paused';
    return asset.availableUnits > 0 ? 'open' : 'closed';
  };

  // ── Loading state ──
  if (isSyncing && remoteAssets.length === 0) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <CoOwnMarketHeader
          title="Co-Own"
          subtitle="Shared ownership of desirable items"
          onBack={handleBack}
          actions={[
            { icon: 'receipt-outline', label: 'Ledger', onPress: () => navigation.navigate('MarketLedger') },
            { icon: 'add-circle-outline', label: 'Create', onPress: () => { haptics.tap(); navigation.navigate('CreateCoOwn'); } },
          ]}
        />
        <CoOwnHubSkeleton />
      </SafeAreaView>
    );
  }

  // ── Error state ──
  if (isError && remoteAssets.length === 0) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <CoOwnMarketHeader
          title="Co-Own"
          subtitle="Shared ownership of desirable items"
          onBack={handleBack}
          actions={[
            { icon: 'receipt-outline', label: 'Ledger', onPress: () => navigation.navigate('MarketLedger') },
            { icon: 'add-circle-outline', label: 'Create', onPress: () => { haptics.tap(); navigation.navigate('CreateCoOwn'); } },
          ]}
        />
        <CoOwnStateCanvas
          variant="error"
          actionLabel="Try again"
          onAction={loadData}
        />
      </SafeAreaView>
    );
  }

  // ── Empty state ──
  if (remoteAssets.length === 0) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <CoOwnMarketHeader
          title="Co-Own"
          subtitle="Shared ownership of desirable items"
          onBack={handleBack}
          actions={[
            { icon: 'receipt-outline', label: 'Ledger', onPress: () => navigation.navigate('MarketLedger') },
            { icon: 'add-circle-outline', label: 'Create', onPress: () => { haptics.tap(); navigation.navigate('CreateCoOwn'); } },
          ]}
        />
        <CoOwnStateCanvas
          variant="empty"
          title="No items yet"
          subtitle="When issuers list items for shared ownership, you will find them here."
          actionLabel="Issue a Co-Own"
          onAction={() => { haptics.tap(); navigation.navigate('CreateCoOwn'); }}
          secondaryActionLabel="Learn how it works"
          onSecondaryAction={() => navigation.navigate('CoOwnOnboarding')}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      <CoOwnMarketHeader
        title="Co-Own"
        subtitle="Shared ownership of desirable items"
        onBack={handleBack}
        actions={[
          { icon: 'receipt-outline', label: 'Ledger', onPress: () => navigation.navigate('MarketLedger') },
          { icon: 'add-circle-outline', label: 'Create', onPress: () => { haptics.tap(); navigation.navigate('CreateCoOwn'); } },
        ]}
      />

      <FlashList
        key={`hub-grid-${gridColumns}`}
        data={isSearching ? filteredAssets : []}
        keyExtractor={(item) => item.id}
        numColumns={gridColumns}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={colors.textSecondary}
          />
        }
        ListHeaderComponent={
          <View>
            {/* Search */}
            <View style={styles.searchWrap}>
              <AppInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search items, brands, categories..."
                prefix={<Ionicons name="search-outline" size={16} color={colors.textMuted} />}
                accessibilityLabel="Search Co-Own marketplace"
              />
            </View>

            {/* Tab rail: Discover / Portfolio / Activity */}
            <View style={styles.tabRail}>
              <TabButton
                label="Discover"
                active={activeTab === 'discover' && !isSearching}
                onPress={() => { setActiveTab('discover'); setQuery(''); haptics.selection(); }}
                colors={colors}
              />
              <TabButton
                label="Portfolio"
                badge={yourPositions.length}
                active={activeTab === 'portfolio'}
                onPress={() => { haptics.tap(); navigation.navigate('Portfolio'); }}
                colors={colors}
              />
              <TabButton
                label="Activity"
                active={activeTab === 'activity'}
                onPress={() => { haptics.tap(); navigation.navigate('CoOwnOrderHistory'); }}
                colors={colors}
              />
            </View>

            {/* Market context — quiet, real data only */}
            {!isSearching && marketContext.openItems > 0 && (
              <Text style={[styles.marketContext, { color: colors.textMuted }]} numberOfLines={1}>
                {marketContext.openItems} {marketContext.openItems === 1 ? 'item' : 'items'} open · {marketContext.totalAvailableUnits} units available
                {yourPositions.length > 0 ? ` · ${yourPositions.length} ${yourPositions.length === 1 ? 'position' : 'positions'} held` : ''}
              </Text>
            )}

            {/* Sort control — only in search mode */}
            {isSearching && (
              <View style={styles.sortRow}>
                {(['newest', 'available', 'allocation'] as SortOption[]).map((opt) => (
                  <AnimatedPressable
                    key={opt}
                    onPress={() => { setSortBy(opt); haptics.selection(); }}
                    style={[
                      styles.sortChip,
                      {
                        backgroundColor: sortBy === opt ? colors.brand : colors.surfaceAlt,
                        borderColor: sortBy === opt ? colors.brand : colors.border,
                      },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={`Sort by ${SORT_LABELS[opt]}`}
                    accessibilityState={{ selected: sortBy === opt }}
                  >
                    <Text style={[
                      styles.sortChipText,
                      { color: sortBy === opt ? colors.background : colors.textSecondary },
                    ]} numberOfLines={1}>
                      {SORT_LABELS[opt]}
                    </Text>
                  </AnimatedPressable>
                ))}
              </View>
            )}

            {/* Featured asset — media-first, product desire */}
            {!isSearching && featuredAsset && (
              <View style={styles.featuredWrap}>
                <CoOwnFeaturedAsset
                  imageUri={featuredAsset.image}
                  title={featuredAsset.title}
                  categoryEyebrow="Featured Co-Own"
                  unitPriceLabel={formatFromFiat(featuredAsset.unitPriceGBP, 'GBP')}
                  availableUnits={featuredAsset.availableUnits}
                  totalUnits={featuredAsset.totalUnits}
                  status={formatStatus(featuredAsset)}
                  onPress={() => navigation.navigate('AssetDetail', { assetId: featuredAsset.id })}
                  onAction={() => navigation.navigate('AssetDetail', { assetId: featuredAsset.id })}
                  actionLabel="View item"
                />
              </View>
            )}

            {/* Your positions preview */}
            {!isSearching && yourPositions.length > 0 && (
              <View style={styles.sectionWrap}>
                <View style={styles.sectionHeader}>
                  <Text style={[styles.sectionTitle, { color: colors.textPrimary }]} numberOfLines={1}>Your positions</Text>
                  <AnimatedPressable
                    onPress={() => { haptics.tap(); navigation.navigate('Portfolio'); }}
                    accessibilityRole="button"
                    accessibilityLabel="View all positions"
                  >
                    <Text style={[styles.sectionLink, { color: colors.textSecondary }]} numberOfLines={1}>All {yourPositions.length}</Text>
                  </AnimatedPressable>
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.positionsRow}
                  accessibilityLabel="Your positions"
                >
                  {yourPositions.slice(0, 6).map((asset) => (
                    <View key={asset.id} style={styles.positionTileWrap}>
                      <CoOwnAssetTile
                        imageUri={asset.image}
                        title={asset.title}
                        unitPriceLabel={formatFromFiat(asset.unitPriceGBP, 'GBP')}
                        availableUnits={asset.availableUnits}
                        totalUnits={asset.totalUnits}
                        status={formatStatus(asset)}
                        onPress={() => navigation.navigate('AssetDetail', { assetId: asset.id })}
                      />
                    </View>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* ── Horizontal rails: Newest, Most available, Most allocated ── */}
            {!isSearching && newestRail.length > 0 && (
              <View style={styles.sectionWrap}>
                <View style={styles.sectionHeader}>
                  <Text style={[styles.sectionTitle, { color: colors.textPrimary }]} numberOfLines={1}>Newest</Text>
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.railContent}
                  accessibilityLabel="Newest Co-Own items"
                >
                  {newestRail.map((asset) => (
                    <View key={asset.id} style={styles.railTileWrap}>
                      <CoOwnAssetTile
                        imageUri={asset.image}
                        title={asset.title}
                        unitPriceLabel={formatFromFiat(asset.unitPriceGBP, 'GBP')}
                        availableUnits={asset.availableUnits}
                        totalUnits={asset.totalUnits}
                        status={formatStatus(asset)}
                        onPress={() => navigation.navigate('AssetDetail', { assetId: asset.id })}
                      />
                    </View>
                  ))}
                </ScrollView>
              </View>
            )}

            {!isSearching && mostAvailableRail.length > 0 && (
              <View style={styles.sectionWrap}>
                <View style={styles.sectionHeader}>
                  <Text style={[styles.sectionTitle, { color: colors.textPrimary }]} numberOfLines={1}>Most available</Text>
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.railContent}
                  accessibilityLabel="Most available Co-Own items"
                >
                  {mostAvailableRail.map((asset) => (
                    <View key={asset.id} style={styles.railTileWrap}>
                      <CoOwnAssetTile
                        imageUri={asset.image}
                        title={asset.title}
                        unitPriceLabel={formatFromFiat(asset.unitPriceGBP, 'GBP')}
                        availableUnits={asset.availableUnits}
                        totalUnits={asset.totalUnits}
                        status={formatStatus(asset)}
                        onPress={() => navigation.navigate('AssetDetail', { assetId: asset.id })}
                      />
                    </View>
                  ))}
                </ScrollView>
              </View>
            )}

            {!isSearching && mostAllocatedRail.length > 0 && (
              <View style={styles.sectionWrap}>
                <View style={styles.sectionHeader}>
                  <Text style={[styles.sectionTitle, { color: colors.textPrimary }]} numberOfLines={1}>Nearly allocated</Text>
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.railContent}
                  accessibilityLabel="Nearly allocated Co-Own items"
                >
                  {mostAllocatedRail.map((asset) => (
                    <View key={asset.id} style={styles.railTileWrap}>
                      <CoOwnAssetTile
                        imageUri={asset.image}
                        title={asset.title}
                        unitPriceLabel={formatFromFiat(asset.unitPriceGBP, 'GBP')}
                        availableUnits={asset.availableUnits}
                        totalUnits={asset.totalUnits}
                        status={formatStatus(asset)}
                        onPress={() => navigation.navigate('AssetDetail', { assetId: asset.id })}
                      />
                    </View>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* Search results header */}
            {isSearching && (
              <View style={styles.sectionWrap}>
                <View style={styles.sectionHeader}>
                  <Text style={[styles.sectionTitle, { color: colors.textPrimary }]} numberOfLines={1}>Results</Text>
                  <Text style={[styles.sectionCount, { color: colors.textMuted }]} numberOfLines={1}>{filteredAssets.length} items</Text>
                </View>
              </View>
            )}
          </View>
        }
        renderItem={({ item, index }) => (
          <View style={styles.tileWrap}>
            <CoOwnAssetTile
              imageUri={item.image}
              title={item.title}
              unitPriceLabel={formatFromFiat(item.unitPriceGBP, 'GBP')}
              availableUnits={item.availableUnits}
              totalUnits={item.totalUnits}
              status={formatStatus(item)}
              onPress={() => navigation.navigate('AssetDetail', { assetId: item.id })}
              index={index}
            />
          </View>
        )}
        ListEmptyComponent={
          <CoOwnStateCanvas
            variant="empty"
            title={isSearching ? 'No results' : 'No items available'}
            subtitle={isSearching ? 'Try a different search term.' : 'Check back soon for new Co-Own items.'}
            emptyGraphicVariant="search"
          />
        }
        ListFooterComponent={
          !isSearching ? (
            <View style={styles.footerWrap}>
              {/* Creator action — intentional, not a random admin button */}
              <AnimatedPressable
                onPress={() => { haptics.tap(); navigation.navigate('CreateCoOwn'); }}
                style={[styles.creatorCard, { borderColor: colors.brand + '40' }]}
                accessibilityRole="button"
                accessibilityLabel="Issue a new Co-Own item"
                scaleValue={0.98}
              >
                <View style={[styles.creatorIcon, { backgroundColor: colors.brand + '18' }]}>
                  <Ionicons name="add-circle-outline" size={22} color={colors.brand} />
                </View>
                <View style={styles.creatorBody}>
                  <Text style={[styles.creatorTitle, { color: colors.textPrimary }]} numberOfLines={1}>Issue a new Co-Own</Text>
                  <Text style={[styles.creatorSub, { color: colors.textSecondary }]} numberOfLines={2}>
                    List an item for shared ownership and invite co-owners
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </AnimatedPressable>

              {/* How Co-Own works */}
              <CoOwnEducationCard
                onLearnMore={() => navigation.navigate('CoOwnOnboarding')}
                learnMoreLabel="Read full guide"
              />

              {/* Ledger link */}
              <AnimatedPressable
                onPress={() => { haptics.tap(); navigation.navigate('MarketLedger'); }}
                style={[styles.ledgerLink, { borderColor: colors.border }]}
                accessibilityRole="button"
                accessibilityLabel="View market ledger"
              >
                <Ionicons name="receipt-outline" size={18} color={colors.textSecondary} />
                <Text style={[styles.ledgerLinkText, { color: colors.textSecondary }]} numberOfLines={1}>View market ledger</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
              </AnimatedPressable>

              <View style={{ height: Space.xxl }} />
            </View>
          ) : null
        }
        estimatedItemSize={gridColumns === 1 ? 480 : 300}
      />
    </SafeAreaView>
  );
}

// ── Tab button ──
function TabButton({
  label,
  active,
  onPress,
  badge,
  colors,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  badge?: number;
  colors: { brand: string; background: string; textPrimary: string; textSecondary: string; surfaceAlt: string; border: string };
}) {
  return (
    <AnimatedPressable
      onPress={onPress}
      style={[
        styles.tabBtn,
        {
          backgroundColor: active ? colors.brand : 'transparent',
          borderColor: active ? colors.brand : colors.border,
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
    >
      <Text style={[
        styles.tabBtnText,
        { color: active ? colors.background : colors.textSecondary },
      ]}>
        {label}
      </Text>
      {badge != null && badge > 0 ? (
        <View style={[styles.tabBadge, { backgroundColor: active ? colors.background : colors.brand }]}>
          <Text style={[styles.tabBadgeText, { color: active ? colors.brand : colors.background }]}>
            {badge}
          </Text>
        </View>
      ) : null}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: Space.md,
  },
  searchWrap: {
    marginBottom: Space.md,
  },
  tabRail: {
    flexDirection: 'row',
    gap: Space.sm,
    marginBottom: Space.md,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: Space.sm + 2,
    borderRadius: Radius.lg,
    borderWidth: 1,
  },
  tabBtnText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
  },
  tabBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabBadgeText: {
    fontSize: 10,
    fontFamily: Typography.family.bold,
  },
  sortRow: {
    flexDirection: 'row',
    gap: Space.xs,
    marginBottom: Space.lg,
  },
  marketContext: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    marginBottom: Space.md,
  },
  sortChip: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  sortChipText: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
  },
  featuredWrap: {
    marginBottom: Space.lg,
  },
  sectionWrap: {
    marginBottom: Space.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Space.md,
  },
  sectionTitle: {
    fontSize: Type.subtitle.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: -0.3,
  },
  sectionLink: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
  },
  sectionCount: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
  },
  positionsRow: {
    gap: Space.md,
    paddingRight: Space.md,
  },
  positionTileWrap: {
    width: 180,
    flex: 0,
  },
  railContent: {
    gap: Space.md,
    paddingRight: Space.md,
  },
  railTileWrap: {
    width: 160,
    flex: 0,
  },
  tileWrap: {
    flex: 1,
    paddingHorizontal: Space.xs,
    marginBottom: Space.lg,
  },
  footerWrap: {
    paddingTop: Space.lg,
  },
  creatorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingVertical: Space.md,
    paddingHorizontal: Space.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    marginBottom: Space.lg,
    minHeight: 64,
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
    fontFamily: Typography.family.semibold,
    letterSpacing: -0.2,
  },
  creatorSub: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    lineHeight: 18,
  },
  ledgerLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.md,
    paddingHorizontal: Space.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    marginTop: Space.lg,
  },
  ledgerLinkText: {
    flex: 1,
    fontSize: Type.body.size,
    fontFamily: Typography.family.medium,
  },
});
