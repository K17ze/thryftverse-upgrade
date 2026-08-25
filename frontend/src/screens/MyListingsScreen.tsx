import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, RefreshControl, Pressable } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, RouteProp, useRoute, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { TypeStyles, Space, Radius, Type, Typography } from '../theme/designTokens';
import { RootStackParamList } from '../navigation/types';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { EmptyState } from '../components/EmptyState';
import { FlagshipScreen, FlagshipHeader, FlagshipState } from '../components/flagship';
import { CachedImage } from '../components/CachedImage';
import { SellerStandardsBadges } from '../components/profile/SellerStandardsBadges';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { useSellerTrust } from '../platform/product';
import { fetchUserListingsFromApi, ListingApiItem } from '../services/listingsApi';
import { haptics } from '../utils/haptics';
import { OfflineBanner } from '../components/OfflineBanner';
import { t } from '../i18n';


type NavT = NativeStackNavigationProp<RootStackParamList>;
type RouteT = RouteProp<RootStackParamList, 'MyListings'>;

// ── Filter tab type ──
type FilterTab = 'all' | 'active' | 'draft' | 'sold' | 'paused';

interface TabConfig {
  key: FilterTab;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
}

const TABS: TabConfig[] = [
  { key: 'all', label: 'All', icon: 'list-outline' },
  { key: 'active', label: 'Active', icon: 'pricetag-outline' },
  { key: 'draft', label: 'Draft', icon: 'document-text-outline' },
  { key: 'sold', label: 'Sold', icon: 'checkmark-done' },
  { key: 'paused', label: 'Paused', icon: 'pause-outline' },
];

// ── Listing row with views count and improved hierarchy ──
function ListingRow({ item, onPress }: { item: ListingApiItem; onPress: () => void }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const statusColor =
    item.status === 'active' ? colors.success
    : item.status === 'paused' ? colors.textMuted
    : item.status === 'sold' ? colors.brand
    : colors.danger;

  const views = item.engagement?.views ?? 0;
  const likes = item.engagement?.likes ?? 0;
  const hasEngagement = views > 0 || likes > 0;
  const hasMissingDetails = !item.brand || !item.size || !item.condition || !item.category;

  return (
    <AnimatedPressable
      style={styles.row}
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityLabel={`${item.title}, £${item.priceGbp.toFixed(2)}, status: ${item.status}${views > 0 ? `, ${views} views` : ''}`}
      accessibilityRole="button"
      accessibilityHint="Tap to view listing details"
    >
      {item.images[0] ? (
        <CachedImage uri={item.images[0]} style={styles.rowImage} containerStyle={styles.rowImageWrap} contentFit="cover" />
      ) : (
        <View style={[styles.rowImageWrap, styles.rowImageFallback]}>
          <Ionicons name="bag-handle-outline" size={20} color={colors.textMuted} />
        </View>
      )}
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle} numberOfLines={1}>{item.title}</Text>
        <Text style={styles.rowPrice}>£{item.priceGbp.toFixed(2)}</Text>
        <View style={styles.rowMeta}>
          {/* Status pill — only visible containment on this row (status boundary) */}
          <View style={[styles.statusBadge, { backgroundColor: statusColor + '20', borderColor: statusColor + '40' }]}>
            <Text style={[styles.statusText, { color: statusColor }]}>{item.status}</Text>
          </View>
          {item.category ? <Text style={styles.rowCategory} numberOfLines={1}>{item.category}</Text> : null}
        </View>
        {/* Engagement metrics — views and likes from real backend data */}
        {hasEngagement && (
          <View style={styles.engagementRow}>
            {views > 0 && (
              <View style={styles.engagementItem}>
                <Ionicons name="eye-outline" size={12} color={colors.textMuted} />
                <Text style={styles.engagementText}>{views > 999 ? `${(views / 1000).toFixed(1)}k` : views}</Text>
              </View>
            )}
            {likes > 0 && (
              <View style={styles.engagementItem}>
                <Ionicons name="heart-outline" size={12} color={colors.textMuted} />
                <Text style={styles.engagementText}>{likes > 999 ? `${(likes / 1000).toFixed(1)}k` : likes}</Text>
              </View>
            )}
          </View>
        )}
        {/* Missing details warning — only for active listings with incomplete data */}
        {item.status === 'active' && hasMissingDetails && (
          <View style={styles.missingDetailsRow}>
            <Ionicons name="alert-circle-outline" size={11} color={colors.warning} />
            <Text style={styles.missingDetailsText}>Missing details</Text>
          </View>
        )}
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </AnimatedPressable>
  );
}

function StatCard({ icon, label, value, tone }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; value: string; tone?: 'default' | 'success' | 'brand' }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const color = tone === 'success' ? colors.success : tone === 'brand' ? colors.brand : colors.textPrimary;
  return (
    <View style={styles.statTile}>
      <Ionicons name={icon} size={18} color={color} />
      <Text style={styles.statTileValue} numberOfLines={1}>{value}</Text>
      <Text style={styles.statTileLabel} numberOfLines={1}>{label}</Text>
    </View>
  );
}

export default function MyListingsScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation<NavT>();
  const route = useRoute<RouteT>();
  const { show } = useToast();
  const currentUser = useStore((s) => s.currentUser);
  const filterType = route.params?.type;
  const { data: sellerTrust } = useSellerTrust(currentUser?.id);

  const [listings, setListings] = useState<ListingApiItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<FilterTab>('all');

  const headerTitle =
    filterType === 'coown' ? 'My Co-Own Listings' : 'My Listings';
  const emptySubtitle =
    filterType === 'coown'
      ? 'Co-own offerings you create will appear here.'
      : 'Items you list for sale will appear here.';

  const load = useCallback(async () => {
    if (!currentUser?.id) return;
    try {
      const res = await fetchUserListingsFromApi(currentUser.id, { limit: 100 });
      setListings(res.items);
    } catch (e) {
      show('Could not load listings', 'error');
    }
  }, [currentUser?.id, show]);

  // useFocusEffect ensures listings re-fetch when the user navigates back
  // (e.g., after editing or managing a listing from this screen).
  useFocusEffect(
    useCallback(() => {
      let mounted = true;
      setIsLoading(true);
      load().finally(() => { if (mounted) setIsLoading(false); });
      return () => { mounted = false; };
    }, [load])
  );

  const onRefresh = async () => {
    setIsRefreshing(true);
    await load();
    setIsRefreshing(false);
  };

  // Aggregate seller analytics derived from listings data
  const analytics = useMemo(() => {
    const active = listings.filter((l) => l.status === 'active');
    const sold = listings.filter((l) => l.status === 'sold');
    const totalActiveValue = active.reduce((sum, l) => sum + l.priceGbp, 0);
    const totalSoldValue = sold.reduce((sum, l) => sum + l.priceGbp, 0);
    const avgActivePrice = active.length > 0 ? totalActiveValue / active.length : 0;
    const avgSoldPrice = sold.length > 0 ? totalSoldValue / sold.length : 0;
    return {
      total: listings.length,
      activeCount: active.length,
      soldCount: sold.length,
      draftCount: listings.filter((l) => l.status === 'draft').length,
      pausedCount: listings.filter((l) => l.status === 'paused').length,
      totalActiveValue,
      totalSoldValue,
      avgActivePrice,
      avgSoldPrice,
    };
  }, [listings]);

  // ── Tab counts for filter badges ──
  const tabCounts = useMemo(() => ({
    all: listings.length,
    active: analytics.activeCount,
    draft: analytics.draftCount,
    sold: analytics.soldCount,
    paused: analytics.pausedCount,
  }), [listings, analytics]);

  // ── Filtered listings based on active tab ──
  const filteredListings = useMemo(() => {
    if (activeTab === 'all') return listings;
    return listings.filter((l) => l.status === activeTab);
  }, [listings, activeTab]);

  // FlashList v2 performance: memoized renderItem prevents full re-render of
  // all visible listing rows on every parent state change.
  const renderListingItem = useCallback(
    ({ item }: { item: ListingApiItem }) => (
      <ListingRow
        item={item}
        onPress={() => navigation.push('ManageListing', { itemId: item.id })}
      />
    ),
    [navigation],
  );

  if (isLoading) {
    return (
      <FlagshipScreen header={<FlagshipHeader title={headerTitle} onBack={() => navigation.goBack()} />}>
        <FlagshipState variant="loading" />
      </FlagshipScreen>
    );
  }

  const renderHeader = () => {
    if (listings.length === 0) return null;
    return (
      <View style={styles.headerSection}>
        {/* Analytics summary */}
        <View style={styles.statsGrid}>
          <StatCard
            icon="pricetag-outline"
            label="Active"
            value={String(analytics.activeCount)}
            tone="success"
          />
          <StatCard
            icon="checkmark-done"
            label="Sold"
            value={String(analytics.soldCount)}
            tone="brand"
          />
          <StatCard
            icon="cash-outline"
            label="Avg price"
            value={`£${analytics.avgActivePrice.toFixed(0)}`}
          />
          <StatCard
            icon="trending-up-outline"
            label="Active value"
            value={`£${analytics.totalActiveValue.toFixed(0)}`}
          />
        </View>

        {/* Seller standards badges */}
        {sellerTrust ? (
          <SellerStandardsBadges sellerTrust={sellerTrust} align="left" />
        ) : null}

        {/* Quick actions */}
        <View style={styles.quickActionsRow}>
          <AnimatedPressable
            style={styles.quickActionBtn}
            onPress={() => { haptics.tap(); navigation.navigate('Sell'); }}
            activeOpacity={0.85}
            accessibilityLabel="Create new listing"
            accessibilityRole="button"
          >
            <Ionicons name="add-circle-outline" size={18} color={colors.brand} />
            <Text style={styles.quickActionText}>New listing</Text>
          </AnimatedPressable>
          <AnimatedPressable
            style={styles.quickActionBtn}
            onPress={() => { haptics.tap(); navigation.navigate('SellerAnalytics'); }}
            activeOpacity={0.85}
            accessibilityLabel="View seller analytics"
            accessibilityRole="button"
          >
            <Ionicons name="bar-chart-outline" size={18} color={colors.brand} />
            <Text style={styles.quickActionText}>Analytics</Text>
          </AnimatedPressable>
          <AnimatedPressable
            style={styles.quickActionBtn}
            onPress={() => { haptics.tap(); navigation.navigate('SellerAuctionCentre'); }}
            activeOpacity={0.85}
            accessibilityLabel="Manage auctions"
            accessibilityRole="button"
          >
            <Ionicons name="trophy-outline" size={18} color={colors.brand} />
            <Text style={styles.quickActionText}>Auctions</Text>
          </AnimatedPressable>
          <AnimatedPressable
            style={styles.quickActionBtn}
            onPress={() => { haptics.tap(); navigation.navigate('Wallet'); }}
            activeOpacity={0.85}
            accessibilityLabel="View payout account"
            accessibilityRole="button"
          >
            <Ionicons name="wallet-outline" size={18} color={colors.brand} />
            <Text style={styles.quickActionText}>Payouts</Text>
          </AnimatedPressable>
        </View>
      </View>
    );
  };

  // ── Filter tab bar ──
  // Horizontal scrollable tabs with count badges. Per research: filter tabs
  // for All/Active/Draft/Sold/Paused. Uses transparent background with
  // underline indicator for active tab (no card chrome per AGENTS.md §4).
  const renderFilterBar = () => {
    if (listings.length === 0) return null;
    return (
      <View style={styles.filterBar}>
        {TABS.map((tab) => {
          const count = tabCounts[tab.key];
          const isActive = activeTab === tab.key;
          // Hide tabs with zero count (except 'all')
          if (tab.key !== 'all' && count === 0) return null;
          return (
            <Pressable
              key={tab.key}
              style={styles.filterTab}
              onPress={() => { haptics.tap(); setActiveTab(tab.key); }}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={`${tab.label} tab, ${count} listing${count === 1 ? '' : 's'}`}
            >
              <Text style={[
                styles.filterTabText,
                { color: isActive ? colors.textPrimary : colors.textMuted },
                isActive && styles.filterTabTextActive,
              ]}>
                {tab.label}
              </Text>
              {count > 0 && (
                <Text style={[
                  styles.filterTabCount,
                  { color: isActive ? colors.brand : colors.textMuted },
                ]}>
                  {count}
                </Text>
              )}
              {isActive && <View style={[styles.filterTabIndicator, { backgroundColor: colors.brand }]} />}
            </Pressable>
          );
        })}
      </View>
    );
  };

  // ── Empty state for filtered results (listings exist but filter has none) ──
  const renderFilteredEmpty = () => {
    if (listings.length === 0) return null;
    const tabLabel = TABS.find(t => t.key === activeTab)?.label ?? '';
    return (
      <View style={styles.filteredEmpty}>
        <Ionicons name="filter-outline" size={32} color={colors.textMuted} />
        <Text style={[styles.filteredEmptyTitle, { color: colors.textSecondary }]}>
          No {tabLabel.toLowerCase()} listings
        </Text>
        <Pressable
          onPress={() => { haptics.tap(); setActiveTab('all'); }}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Show all listings"
        >
          <Text style={[styles.filteredEmptyAction, { color: colors.brand }]}>
            Show all
          </Text>
        </Pressable>
      </View>
    );
  };

  return (
    <FlagshipScreen
      header={<FlagshipHeader title={headerTitle} onBack={() => navigation.goBack()} />}
      scrollEnabled={false}
      contentStyle={{ paddingHorizontal: 0, paddingTop: 0 }}
    >
      <OfflineBanner onRetry={() => void onRefresh()} />
      {listings.length === 0 ? (
        <View style={styles.body}>
          <EmptyState
            icon="pricetags-outline"
            title="No listings yet"
            subtitle={emptySubtitle}
            ctaLabel="Start selling"
            onCtaPress={() => navigation.navigate('Sell')}
          />
        </View>
      ) : (
        <FlashList
          data={filteredListings}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
          ListHeaderComponent={
            <View>
              {renderHeader()}
              {renderFilterBar()}
              {/* Listing count for current filter */}
              <View style={styles.listingsHeaderRow}>
                <Text style={styles.listingsHeaderText}>
                  {filteredListings.length} {filteredListings.length === 1 ? 'listing' : 'listings'}
                  {activeTab !== 'all' ? ` · ${TABS.find(t => t.key === activeTab)?.label}` : ''}
                </Text>
              </View>
            </View>
          }
          ListEmptyComponent={renderFilteredEmpty()}
          renderItem={renderListingItem}
          // Performance: long seller lists; FlashList v2 handles recycling
          // automatically.
        />
      )}
    </FlagshipScreen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  body: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  list: {
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    gap: Space.sm,
    paddingBottom: Space.xl,
  },
  headerSection: {
    gap: Space.sm,
    marginBottom: Space.sm,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.sm,
  },
  statTile: {
    width: '48%',
    flexGrow: 1,
    gap: 2,
    paddingVertical: Space.sm,
  },
  statTileValue: {
    fontSize: Type.subtitle.size,
    fontFamily: Typography.family.bold,
    color: colors.textPrimary,
    letterSpacing: Type.subtitle.letterSpacing,
  },
  statTileLabel: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.regular,
    color: colors.textMuted,
    letterSpacing: Type.meta.letterSpacing,
  },
  quickActionsRow: {
    flexDirection: 'row',
    gap: Space.xs,
  },
  quickActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.xs + 2,
    paddingVertical: Space.sm,
  },
  quickActionText: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
    color: colors.brand,
  },

  /* ── Filter tab bar ── */
  filterBar: {
    flexDirection: 'row',
    gap: Space.sm,
    paddingVertical: Space.xs,
    marginBottom: Space.xs,
  },
  filterTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs - 1,
    paddingVertical: Space.xs + 2,
    paddingHorizontal: Space.xs,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  filterTabText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
  },
  filterTabTextActive: {
    fontFamily: Typography.family.bold,
  },
  filterTabCount: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.semibold,
  },
  filterTabIndicator: {
    position: 'absolute',
    bottom: 0,
    left: Space.xs,
    right: Space.xs,
    height: 2,
    borderRadius: 1,
  },

  /* ── Filtered empty state ── */
  filteredEmpty: {
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.xxl,
  },
  filteredEmptyTitle: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
  },
  filteredEmptyAction: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
  },

  listingsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Space.xs,
    marginBottom: Space.xs,
  },
  listingsHeaderText: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: Type.label.letterSpacing,
  },

  /* ── Listing row ── */
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingVertical: Space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowImageWrap: {
    width: Space.xxl + Space.md,
    height: Space.xxl + Space.md,
    borderRadius: Radius.md,
    overflow: 'hidden',
    backgroundColor: colors.surfaceAlt,
  },
  rowImage: {
    width: Space.xxl + Space.md,
    height: Space.xxl + Space.md,
  },
  rowImageFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: {
    flex: 1,
    gap: Space.xs / 2,
  },
  rowTitle: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    color: colors.textPrimary,
  },
  rowPrice: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.medium,
    color: colors.textSecondary,
  },
  rowMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    marginTop: Space.xs / 2,
  },
  statusBadge: {
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs / 2,
    borderRadius: Radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
  statusText: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.semibold,
    textTransform: 'capitalize',
  },
  rowCategory: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    color: colors.textMuted,
  },

  /* ── Engagement metrics in row ── */
  engagementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    marginTop: Space.xs / 2,
  },
  engagementItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xxs,
  },
  engagementText: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.regular,
    color: colors.textMuted,
  },

  /* ── Missing details warning ── */
  missingDetailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xxs,
    marginTop: Space.xs / 2,
  },
  missingDetailsText: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.regular,
    color: colors.warning,
  },
  });
}
