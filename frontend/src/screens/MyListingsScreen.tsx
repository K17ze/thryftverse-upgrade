import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, RefreshControl, ActivityIndicator } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useNavigation, RouteProp, useRoute, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { Space, Radius, Typography } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { RootStackParamList } from '../navigation/types';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { EmptyState } from '../components/EmptyState';
import { FlagshipScreen, FlagshipHeader, FlagshipState } from '../components/flagship';
import { CachedImage } from '../components/CachedImage';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { fetchUserListingsFromApi, ListingApiItem } from '../services/listingsApi';
import { fetchSellerInventoryTotals, type SellerInventoryTotals } from '../services/sellerHubApi';
import { haptics } from '../utils/haptics';
import { OfflineBanner } from '../components/OfflineBanner';
import { t } from '../i18n';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { AppIcon } from '../components/common/AppIcon';
import { IconSize, IconHitTarget } from '../theme/iconTokens';
import { SellerPromotionsPanel } from '../components/promotions';
import { useSellerPromotions } from '../hooks/inventory';


type NavT = NativeStackNavigationProp<RootStackParamList>;
type RouteT = RouteProp<RootStackParamList, 'MyListings'>;

// ── Filter tab type ──
type FilterTab = 'all' | 'active' | 'draft' | 'sold' | 'paused';

interface TabConfig {
  key: FilterTab;
  label: string;
}

const TABS: TabConfig[] = [
  { key: 'all', label: t('myListings.tabAll') },
  { key: 'active', label: t('myListings.tabActive') },
  { key: 'draft', label: t('myListings.tabDraft') },
  { key: 'sold', label: t('myListings.tabSold') },
  { key: 'paused', label: t('myListings.tabPaused') },
];

// ── Listing row with views count and improved hierarchy ──
function ListingRow({ item, onPress }: { item: ListingApiItem; onPress: () => void }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { currencySymbol, formatFromFiat } = useFormattedPrice();

  const statusColor =
    item.status === 'active' ? colors.successText
    : item.status === 'paused' ? colors.textMuted
    : item.status === 'sold' ? colors.brand
    : colors.dangerText;

  const views = item.engagement?.views ?? 0;
  const likes = item.engagement?.likes ?? 0;
  const hasMissingDetails = !item.brand || !item.size || !item.condition || !item.category;

  // One meta line: status word in its semantic colour, then category and
  // engagement collapse into muted tail segments — no pill, no icon row.
  const metaTail: string[] = [];
  if (item.category) metaTail.push(item.category);
  if (views > 0) metaTail.push(`${views > 999 ? `${(views / 1000).toFixed(1)}k` : views} views`);
  if (likes > 0) metaTail.push(`${likes > 999 ? `${(likes / 1000).toFixed(1)}k` : likes} likes`);

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
        <Text style={styles.rowPrice}>{formatFromFiat(item.priceGbp, 'GBP')}</Text>
        <Text style={styles.rowMeta} numberOfLines={1}>
          <Text style={[styles.statusText, { color: statusColor }]}>{item.status}</Text>
          {metaTail.length > 0 ? (
            <Text style={styles.rowMetaTail}>{'  ·  '}{metaTail.join('  ·  ')}</Text>
          ) : null}
        </Text>
        {/* Missing details warning — only for active listings with incomplete data */}
        {item.status === 'active' && hasMissingDetails && (
          <View style={styles.missingDetailsRow}>
            <AppIcon name="warning" size={IconSize.micro} color="warningText" opticalCenter accessible={false} />
            <Text style={styles.missingDetailsText}>{t('myListings.missingDetails')}</Text>
          </View>
        )}
      </View>
      <AppIcon name="forward" size={IconSize.sm} color="textMuted" opticalCenter accessible={false} />
    </AnimatedPressable>
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

  const [listings, setListings] = useState<ListingApiItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [totals, setTotals] = useState<SellerInventoryTotals | null>(null);
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  // Promotions management surface — lazy: the panel fetches on open.
  const [promotionsOpen, setPromotionsOpen] = useState(false);
  const promotions = useSellerPromotions();
  // Lets the focus effect revalidate silently once rows exist.
  const listingsRef = useRef<ListingApiItem[]>([]);

  const headerTitle =
    filterType === 'coown' ? t('myListings.titleCoOwn') : t('myListings.title');
  const emptySubtitle =
    filterType === 'coown'
      ? t('myListings.emptyCoOwn')
      : t('myListings.empty');

  const PAGE_SIZE = 50;

  const load = useCallback(async () => {
    if (!currentUser?.id) return;
    setCursor(null);
    setHasMore(false);
    try {
      const [res, invTotals] = await Promise.all([
        fetchUserListingsFromApi(currentUser.id, { limit: PAGE_SIZE }),
        fetchSellerInventoryTotals().catch(() => null),
      ]);
      setListings(res.items);
      listingsRef.current = res.items;
      setCursor(res.nextCursor ?? null);
      setHasMore(Boolean(res.nextCursor));
      if (invTotals) setTotals(invTotals);
    } catch (e) {
      show(t('myListings.couldNotLoad'), 'error');
    }
  }, [currentUser?.id, show]);

  const loadMore = useCallback(async () => {
    if (!currentUser?.id || isLoadingMore || !hasMore || !cursor) return;
    setIsLoadingMore(true);
    try {
      const res = await fetchUserListingsFromApi(currentUser.id, { limit: PAGE_SIZE, cursor });
      setListings((prev) => {
        const next = [...prev, ...res.items];
        listingsRef.current = next;
        return next;
      });
      setCursor(res.nextCursor ?? null);
      setHasMore(Boolean(res.nextCursor));
    } catch {
      // Non-fatal — user can pull to refresh to retry
    } finally {
      setIsLoadingMore(false);
    }
  }, [currentUser?.id, isLoadingMore, hasMore, cursor]);

  // useFocusEffect ensures listings re-fetch when the user navigates back
  // (e.g., after editing or managing a listing from this screen).
  // Silent revalidate: once rows exist the list stays mounted and updates
  // in place — no full-screen loading flash on every return.
  useFocusEffect(
    useCallback(() => {
      let mounted = true;
      const showLoading = listingsRef.current.length === 0;
      if (showLoading) setIsLoading(true);
      load().finally(() => { if (mounted && showLoading) setIsLoading(false); });
      return () => { mounted = false; };
    }, [load])
  );

  const onRefresh = async () => {
    setIsRefreshing(true);
    await load();
    setIsRefreshing(false);
  };

  // Tab counts — server totals when reachable (uncapped), loaded-page
  // counts otherwise; the partial note below discloses the fallback.
  const tabCounts = useMemo(() => {
    if (totals) {
      return {
        all: totals.active + totals.drafts + totals.paused + totals.sold,
        active: totals.active,
        draft: totals.drafts,
        sold: totals.sold,
        paused: totals.paused };
    }
    const count = (status: FilterTab) => listings.filter((l) => l.status === status).length;
    return {
      all: listings.length,
      active: count('active'),
      draft: count('draft'),
      sold: count('sold'),
      paused: count('paused') };
  }, [listings, totals]);

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
        {/* Seller action cluster — one primary action + a quiet icon row.
            Status counts live on the filter tabs below, not restated as
            stat rows; value metrics compress to a single muted line. */}
        <View style={styles.actionCluster}>
          <AnimatedPressable
            style={styles.primaryAction}
            onPress={() => { haptics.tap(); navigation.navigate('Sell'); }}
            activeOpacity={0.88}
            accessibilityLabel="Create new listing"
            accessibilityRole="button"
          >
            <AppIcon name="plus" size={IconSize.sm} color="textInverse" opticalCenter accessible={false} />
            <Text style={styles.primaryActionText}>{t('myListings.newListing')}</Text>
          </AnimatedPressable>
          <View style={styles.secondaryActions}>
            <AnimatedPressable
              style={styles.iconAction}
              onPress={() => { haptics.tap(); navigation.navigate('SellerAnalytics'); }}
              activeOpacity={0.7}
              accessibilityLabel={t('myListings.analytics')}
              accessibilityRole="button"
            >
              <AppIcon name="analytics" size={IconSize.md} color="textPrimary" opticalCenter accessible={false} />
            </AnimatedPressable>
            <AnimatedPressable
              style={styles.iconAction}
              onPress={() => { haptics.tap(); navigation.navigate('SellerAuctionCentre'); }}
              activeOpacity={0.7}
              accessibilityLabel={t('myListings.auctions')}
              accessibilityRole="button"
            >
              <AppIcon name="hammer" size={IconSize.md} color="textPrimary" opticalCenter accessible={false} />
            </AnimatedPressable>
            <AnimatedPressable
              style={styles.iconAction}
              onPress={() => { haptics.tap(); navigation.navigate('Wallet'); }}
              activeOpacity={0.7}
              accessibilityLabel={t('myListings.payouts')}
              accessibilityRole="button"
            >
              <AppIcon name="wallet" size={IconSize.md} color="textPrimary" opticalCenter accessible={false} />
            </AnimatedPressable>
          </View>
        </View>

        {/* Truthful partial label — server totals endpoint unreachable, so
            the tab counts below cover the loaded page window only. */}
        {!totals ? (
          <Text style={styles.partialNote}>{t('myListings.partialCounts')}</Text>
        ) : null}
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
            <AnimatedPressable
              key={tab.key}
              style={styles.filterTab}
              onPress={() => { haptics.tap(); setActiveTab(tab.key); }}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
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
            </AnimatedPressable>
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
        <Text style={[styles.filteredEmptyTitle, { color: colors.textSecondary }]}>
          {t('myListings.noTabListings', { tab: tabLabel.toLowerCase() })}
        </Text>
        <AnimatedPressable
          onPress={() => { haptics.tap(); setActiveTab('all'); }}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('myListings.showAll')}
        >
          <Text style={[styles.filteredEmptyAction, { color: colors.brand }]}>
            {t('myListings.showAll')}
          </Text>
        </AnimatedPressable>
      </View>
    );
  };

  return (
    <FlagshipScreen
      header={
        <FlagshipHeader
          title={headerTitle}
          onBack={() => navigation.goBack()}
          rightAction={
            <AnimatedPressable
              onPress={() => { haptics.tap(); setPromotionsOpen(true); }}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t('myListings.promotions')}
              style={styles.headerAction}
            >
              <AppIcon name="megaphone-outline" size={IconSize.lg} color="textPrimary" opticalCenter accessible={false} />
            </AnimatedPressable>
          }
        />
      }
      scrollEnabled={false}
      contentStyle={{ paddingHorizontal: 0, paddingTop: 0 }}
    >
      <OfflineBanner onRetry={() => void onRefresh()} />
      {listings.length === 0 ? (
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
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          ListHeaderComponent={
            <View>
              {renderHeader()}
              {renderFilterBar()}
            </View>
          }
          ListEmptyComponent={renderFilteredEmpty()}
          ListFooterComponent={
            isLoadingMore ? (
              <View style={{ paddingVertical: Space.md, alignItems: 'center' }}>
                <ActivityIndicator size="small" color={colors.textMuted} />
              </View>
            ) : null
          }
          renderItem={renderListingItem}
          // Performance: long seller lists; FlashList v2 handles recycling
          // automatically.
        />
      )}

      {/* Promotions management — full-screen modal surface */}
      <SellerPromotionsPanel
        visible={promotionsOpen}
        controller={promotions}
        onClose={() => setPromotionsOpen(false)}
      />
    </FlagshipScreen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  body: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center' },
  headerAction: {
    minWidth: IconHitTarget.min,
    minHeight: IconHitTarget.min,
    alignItems: 'flex-end',
    justifyContent: 'center' },
  partialNote: {
    paddingTop: Space.xs,
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textMuted },
  list: {
    paddingHorizontal: Space.md,
    paddingTop: Space.xs,
    paddingBottom: Space.xl },
  headerSection: {
    gap: Space.xs,
    marginBottom: Space.sm },
  /* ── Seller action cluster — one filled primary + transparent icon row ── */
  actionCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between' },
  primaryAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
    height: 40,
    paddingHorizontal: Space.md,
    borderRadius: Radius.md,
    backgroundColor: colors.brand },
  primaryActionText: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    color: colors.textInverse },
  secondaryActions: {
    flexDirection: 'row',
    alignItems: 'center' },
  // Quiet secondary actions — transparent 44pt targets, glyph only.
  iconAction: {
    width: IconHitTarget.min,
    height: IconHitTarget.min,
    alignItems: 'center',
    justifyContent: 'center' },

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
  // Price is the row's second anchor — strong, not a caption.
  rowPrice: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    color: colors.textPrimary },
  // One meta line: status word in semantic colour + muted tail.
  rowMeta: {
    marginTop: Space.xs / 2 },
  statusText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    textTransform: 'capitalize' },
  rowMetaTail: {
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
    color: colors.warningText } });
}
