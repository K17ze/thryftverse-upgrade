import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, RefreshControl, Pressable } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useNavigation, RouteProp, useRoute, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { TypeStyles, Space, Radius, Typography, Stroke } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { RootStackParamList } from '../navigation/types';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { EmptyState } from '../components/EmptyState';
import { FlagshipScreen, FlagshipHeader, FlagshipState, DenseListScreen } from '../components/flagship';
import { CachedImage } from '../components/CachedImage';
import { SellerStandardsBadges } from '../components/profile/SellerStandardsBadges';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { useSellerTrust } from '../platform/product';
import { fetchUserListingsFromApi, ListingApiItem } from '../services/listingsApi';
import { haptics } from '../utils/haptics';
import { OfflineBanner } from '../components/OfflineBanner';
import { t } from '../i18n';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { AppIcon } from '../components/common/AppIcon';
import { IconSize, type SemanticIconName, type IoniconsGlyphName } from '../theme/iconTokens';


type NavT = NativeStackNavigationProp<RootStackParamList>;
type RouteT = RouteProp<RootStackParamList, 'MyListings'>;

// ── Filter tab type ──
type FilterTab = 'all' | 'active' | 'draft' | 'sold' | 'paused';

interface TabConfig {
  key: FilterTab;
  label: string;
  icon: SemanticIconName | IoniconsGlyphName;
}

const TABS: TabConfig[] = [
  { key: 'all', label: t('myListings.tabAll'), icon: 'list' },
  { key: 'active', label: t('myListings.tabActive'), icon: 'bag-handle-outline' },
  { key: 'draft', label: t('myListings.tabDraft'), icon: 'document' },
  { key: 'sold', label: t('myListings.tabSold'), icon: 'verified' },
  { key: 'paused', label: t('myListings.tabPaused'), icon: 'pause' },
];

// ── Listing row with views count and improved hierarchy ──
function ListingRow({ item, onPress }: { item: ListingApiItem; onPress: () => void }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { currencyCode, currencySymbol, formatFromFiat } = useFormattedPrice();

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
      accessibilityLabel={`${item.title}, ${currencySymbol}${item.priceGbp.toFixed(2)}, status: ${item.status}${views > 0 ? `, ${views} views` : ''}`}
      accessibilityRole="button"
      accessibilityHint="Tap to view listing details"
    >
      {item.images[0] ? (
        <CachedImage uri={item.images[0]} style={styles.rowImage} containerStyle={styles.rowImageWrap} contentFit="cover" />
      ) : (
        <View style={[styles.rowImageWrap, styles.rowImageFallback]}>
          <AppIcon name="cart" size={IconSize.md} color="textMuted" opticalCenter accessible={false} />
        </View>
      )}
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle} numberOfLines={1}>{item.title}</Text>
        <Text style={styles.rowPrice}>{formatFromFiat(item.priceGbp, currencyCode, { displayMode: 'fiat' })}</Text>
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
                <AppIcon name="eye" size={IconSize.micro} color="textMuted" opticalCenter accessible={false} />
                <Text style={styles.engagementText}>{views > 999 ? `${(views / 1000).toFixed(1)}k` : views}</Text>
              </View>
            )}
            {likes > 0 && (
              <View style={styles.engagementItem}>
                <AppIcon name="heart" size={IconSize.micro} color="textMuted" opticalCenter accessible={false} />
                <Text style={styles.engagementText}>{likes > 999 ? `${(likes / 1000).toFixed(1)}k` : likes}</Text>
              </View>
            )}
          </View>
        )}
        {/* Missing details warning — only for active listings with incomplete data */}
        {item.status === 'active' && hasMissingDetails && (
          <View style={styles.missingDetailsRow}>
            <AppIcon name="warning" size={IconSize.micro} color="warning" opticalCenter accessible={false} />
            <Text style={styles.missingDetailsText}>{t('myListings.missingDetails')}</Text>
          </View>
        )}
      </View>
      <AppIcon name="forward" size={IconSize.sm} color="textMuted" opticalCenter accessible={false} />
    </AnimatedPressable>
  );
}

// Flat metric row — label left, value right, hairline separator below.
// Replaces the 2x2 StatCard grid (generic dashboard silhouette) with an
// inline list that passes the thumbnail test: the eye reads a labelled
// ledger, not four identical grey tiles.
function FlagshipMetricLine({ icon, label, value, tone }: { icon: SemanticIconName | IoniconsGlyphName; label: string; value: string; tone?: 'default' | 'success' | 'brand' }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const valueColor = tone === 'success' ? colors.success : tone === 'brand' ? colors.brand : colors.textPrimary;
  return (
    <View style={styles.metricRow}>
      <View style={styles.metricLabel}>
        <AppIcon name={icon} size={IconSize.sm} color="textMuted" opticalCenter accessible={false} />
        <Text style={styles.metricLabelText} numberOfLines={1}>{label}</Text>
      </View>
      <Text style={[styles.metricValue, { color: valueColor }]} numberOfLines={1}>{value}</Text>
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
  const { currencyCode, formatFromFiat } = useFormattedPrice();

  const [listings, setListings] = useState<ListingApiItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<FilterTab>('all');

  const headerTitle =
    filterType === 'coown' ? t('myListings.titleCoOwn') : t('myListings.title');
  const emptySubtitle =
    filterType === 'coown'
      ? t('myListings.emptyCoOwn')
      : t('myListings.empty');

  const load = useCallback(async () => {
    if (!currentUser?.id) return;
    try {
      const res = await fetchUserListingsFromApi(currentUser.id, { limit: 100 });
      setListings(res.items);
    } catch (e) {
      show(t('myListings.couldNotLoad'), 'error');
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
      avgSoldPrice };
  }, [listings]);

  // ── Tab counts for filter badges ──
  const tabCounts = useMemo(() => ({
    all: listings.length,
    active: analytics.activeCount,
    draft: analytics.draftCount,
    sold: analytics.soldCount,
    paused: analytics.pausedCount }), [listings, analytics]);

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
        {/* Analytics summary — flat metric ledger, no card chrome */}
        <View style={styles.metricList}>
          <FlagshipMetricLine
            icon="bag-handle-outline"
            label={t('myListings.statActive')}
            value={String(analytics.activeCount)}
            tone="success"
          />
          <FlagshipMetricLine
            icon="verified"
            label={t('myListings.statSold')}
            value={String(analytics.soldCount)}
            tone="brand"
          />
          <FlagshipMetricLine
            icon="wallet"
            label={t('myListings.statAvgPrice')}
            value={formatFromFiat(analytics.avgActivePrice, currencyCode, { displayMode: 'fiat' })}
          />
          <FlagshipMetricLine
            icon="trending"
            label={t('myListings.statActiveValue')}
            value={formatFromFiat(analytics.totalActiveValue, currencyCode, { displayMode: 'fiat' })}
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
            <AppIcon name="plus" size={IconSize.sm} color="brand" opticalCenter accessible={false} />
            <Text style={styles.quickActionText}>{t('myListings.newListing')}</Text>
          </AnimatedPressable>
          <AnimatedPressable
            style={styles.quickActionBtn}
            onPress={() => { haptics.tap(); navigation.navigate('SellerAnalytics'); }}
            activeOpacity={0.85}
            accessibilityLabel={t('myListings.analytics')}
            accessibilityRole="button"
          >
            <AppIcon name="analytics" size={IconSize.sm} color="brand" opticalCenter accessible={false} />
            <Text style={styles.quickActionText}>{t('myListings.analytics')}</Text>
          </AnimatedPressable>
          <AnimatedPressable
            style={styles.quickActionBtn}
            onPress={() => { haptics.tap(); navigation.navigate('SellerAuctionCentre'); }}
            activeOpacity={0.85}
            accessibilityLabel={t('myListings.auctions')}
            accessibilityRole="button"
          >
            <AppIcon name="hammer" size={IconSize.sm} color="brand" opticalCenter accessible={false} />
            <Text style={styles.quickActionText}>{t('myListings.auctions')}</Text>
          </AnimatedPressable>
          <AnimatedPressable
            style={styles.quickActionBtn}
            onPress={() => { haptics.tap(); navigation.navigate('Wallet'); }}
            activeOpacity={0.85}
            accessibilityLabel={t('myListings.payouts')}
            accessibilityRole="button"
          >
            <AppIcon name="wallet" size={IconSize.sm} color="brand" opticalCenter accessible={false} />
            <Text style={styles.quickActionText}>{t('myListings.payouts')}</Text>
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
              style={({ pressed }) => [styles.filterTab, pressed && { opacity: 0.85 }]}
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
        <AppIcon name="filter" size={IconSize.hero} color="textMuted" opticalCenter accessible={false} />
        <Text style={[styles.filteredEmptyTitle, { color: colors.textSecondary }]}>
          {t('myListings.noTabListings', { tab: tabLabel.toLowerCase() })}
        </Text>
        <Pressable
          onPress={() => { haptics.tap(); setActiveTab('all'); }}
          hitSlop={8}
          style={({ pressed }) => pressed && { opacity: 0.85 }}
          accessibilityRole="button"
          accessibilityLabel={t('myListings.showAll')}
        >
          <Text style={[styles.filteredEmptyAction, { color: colors.brand }]}>
            {t('myListings.showAll')}
          </Text>
        </Pressable>
      </View>
    );
  };

  return (
    <DenseListScreen
      testID="my-listings-screen"
      header={<FlagshipHeader title={headerTitle} onBack={() => navigation.goBack()} />}
      banner={<OfflineBanner onRetry={() => void onRefresh()} />}
      list={
        listings.length === 0 ? (
          <View style={styles.body}>
            <EmptyState
              icon="bag-handle-outline"
              title={t('myListings.noListings')}
              subtitle={emptySubtitle}
              ctaLabel={t('myListings.startSelling')}
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
                    {t('myListings.listingCount', { count: filteredListings.length, word: filteredListings.length === 1 ? t('myListings.listingWord') : t('myListings.listingWordPlural') })}
                    {activeTab !== 'all' ? ` · ${TABS.find(t2 => t2.key === activeTab)?.label}` : ''}
                  </Text>
                </View>
              </View>
            }
            ListEmptyComponent={renderFilteredEmpty()}
            renderItem={renderListingItem}
            // Performance: long seller lists; FlashList v2 handles recycling
            // automatically.
          />
        )
      }
    />
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background },
  body: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center' },
  list: {
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    gap: Space.sm,
    paddingBottom: Space.xl },
  headerSection: {
    gap: Space.sm,
    marginBottom: Space.sm },
  metricList: {
    // Flat ledger — no fill, no shadow, no card chrome.
    // Hairline separators between rows provide the only visible structure.
    marginBottom: Space.xs },
  metricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Space.sm,
    borderBottomWidth: Stroke.hairline,
    borderBottomColor: colors.border },
  metricLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    flexShrink: 1 },
  metricLabelText: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    color: colors.textSecondary },
  metricValue: {
    fontSize: TypographyV2.sectionTitle.size,
    fontFamily: TypographyV2.sectionTitle.fontFamily,
    letterSpacing: TypographyV2.sectionTitle.letterSpacing },
  quickActionsRow: {
    flexDirection: 'row',
    gap: Space.xs },
  quickActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.xs + 2,
    paddingVertical: Space.sm },
  quickActionText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.brand },

  /* ── Filter tab bar ── */
  filterBar: {
    flexDirection: 'row',
    gap: Space.sm,
    paddingVertical: Space.xs,
    marginBottom: Space.xs },
  filterTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs - 1,
    paddingVertical: Space.xs + 2,
    paddingHorizontal: Space.xs,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent' },
  filterTabText: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily },
  filterTabTextActive: {
    fontFamily: Typography.family.bold },
  filterTabCount: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily },
  filterTabIndicator: {
    position: 'absolute',
    bottom: 0,
    left: Space.xs,
    right: Space.xs,
    height: 2,
    borderRadius: 1 },

  /* ── Filtered empty state ── */
  filteredEmpty: {
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.xxl },
  filteredEmptyTitle: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily },
  filteredEmptyAction: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily },

  listingsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Space.xs,
    marginBottom: Space.xs },
  listingsHeaderText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: TypographyV2.label.letterSpacing },

  /* ── Listing row ── */
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingVertical: Space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border },
  rowImageWrap: {
    width: Space.xxl + Space.md,
    height: Space.xxl + Space.md,
    borderRadius: Radius.md,
    overflow: 'hidden',
    backgroundColor: colors.surfaceAlt },
  rowImage: {
    width: Space.xxl + Space.md,
    height: Space.xxl + Space.md },
  rowImageFallback: {
    alignItems: 'center',
    justifyContent: 'center' },
  rowBody: {
    flex: 1,
    gap: Space.xs / 2 },
  rowTitle: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    color: colors.textPrimary },
  rowPrice: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textSecondary },
  rowMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    marginTop: Space.xs / 2 },
  statusBadge: {
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs / 2,
    borderRadius: Radius.sm,
    borderWidth: StyleSheet.hairlineWidth },
  statusText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    textTransform: 'capitalize' },
  rowCategory: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textMuted },

  /* ── Engagement metrics in row ── */
  engagementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    marginTop: Space.xs / 2 },
  engagementItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xxs },
  engagementText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textMuted },

  /* ── Missing details warning ── */
  missingDetailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xxs,
    marginTop: Space.xs / 2 },
  missingDetailsText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.warning } });
}
