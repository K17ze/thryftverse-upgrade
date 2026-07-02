import React, { useCallback, useMemo, useRef } from 'react';
import {
  View,
  StyleSheet,
  RefreshControl,
  Pressable,
  StatusBar,
  Text,
  SectionList,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../constants/colors';
import { RootStackParamList } from '../navigation/types';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useCurrencyContext } from '../context/CurrencyContext';
import { toIze, formatIzeAmount } from '../utils/currency';
import { useBucketedServerClock, resolveAuctionTiming } from '../hooks/useServerClock';
import {
  resolvePriceLabel,
  resolvePriceText,
  resolveTimeLabel,
  resolveUrgency,
  buildAuctionAccessibilityLabel,
  type AuctionHomeItem,
} from '../utils/auctionHomeLogic';
import { useAppTheme } from '../theme/ThemeContext';
import { CachedImage } from '../components/CachedImage';
import { EmptyState } from '../components/EmptyState';
import { SkeletonLoader } from '../components/SkeletonLoader';
import { Meta } from '../components/ui/Text';
import { AppButton } from '../components/ui/AppButton';
import { Space, Radius } from '../theme/designTokens';
import {
  listAuctions,
  type MarketAuction,
} from '../services/marketApi';

type NavT = StackNavigationProp<RootStackParamList>;

type SellerTab = 'scheduled' | 'live' | 'sold' | 'unsold' | 'cancelled';

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
  };
}

interface SellerStats {
  total: number;
  live: number;
  scheduled: number;
  sold: number;
  unsold: number;
  cancelled: number;
  totalBids: number;
  highestBid: number;
}

function computeStats(items: AuctionHomeItem[], clockMs: number): SellerStats {
  let live = 0, scheduled = 0, sold = 0, unsold = 0, cancelled = 0, totalBids = 0, highestBid = 0;
  for (const item of items) {
    const timing = resolveAuctionTiming(item, clockMs);
    if (timing.effectiveState === 'live') live++;
    else if (timing.effectiveState === 'upcoming') scheduled++;
    else if (timing.effectiveState === 'cancelled') cancelled++;
    else if (timing.effectiveState === 'ended' || timing.effectiveState === 'settled') {
      if (item.bidCount > 0) sold++;
      else unsold++;
    }
    totalBids += item.bidCount;
    if (item.currentBidGbp > highestBid) highestBid = item.currentBidGbp;
  }
  return { total: items.length, live, scheduled, sold, unsold, cancelled, totalBids, highestBid };
}

function SellerAuctionCard({
  item,
  clockMs,
  onPress,
  formatFromFiat,
  goldRates,
}: {
  item: AuctionHomeItem;
  clockMs: number;
  onPress: () => void;
  formatFromFiat: (amount: number, currency?: any, opts?: any) => string;
  goldRates: any;
}) {
  const timing = resolveAuctionTiming(item, clockMs);
  const urgency = resolveUrgency(timing);
  const priceLabel = resolvePriceLabel(item, timing);
  const priceText = resolvePriceText(item, timing, priceLabel, formatFromFiat);
  const timeLabel = resolveTimeLabel(timing);
  const isTerminal = timing.effectiveState === 'ended' || timing.effectiveState === 'cancelled' || timing.effectiveState === 'settled';
  const isCancelled = timing.effectiveState === 'cancelled' || item.cancelledAt;
  const isSold = (timing.effectiveState === 'ended' || timing.effectiveState === 'settled') && item.bidCount > 0 && !isCancelled;
  const isUnsold = timing.effectiveState === 'ended' && item.bidCount === 0 && !isCancelled;

  return (
    <Pressable
      style={styles.card}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={buildAuctionAccessibilityLabel(item, timing, priceLabel, priceText)}
    >
      <View style={styles.cardImageWrap}>
        {item.imageUrl ? (
          <CachedImage
            uri={item.imageUrl}
            style={styles.cardImage}
            containerStyle={styles.cardImageContainer}
            contentFit="cover"
          />
        ) : (
          <View style={styles.cardImagePlaceholder}>
            <Ionicons name="image-outline" size={24} color={Colors.textMuted} />
          </View>
        )}
        {urgency === 'finalMinutes' && timing.effectiveState === 'live' && (
          <View style={styles.urgencyPill}>
            <Text style={styles.urgencyPillText}>ENDING</Text>
          </View>
        )}
        {isSold && (
          <View style={styles.soldPill}>
            <Text style={styles.soldPillText}>SOLD</Text>
          </View>
        )}
        {isUnsold && (
          <View style={styles.unsoldPill}>
            <Text style={styles.unsoldPillText}>UNSOLD</Text>
          </View>
        )}
        {isCancelled && (
          <View style={styles.cancelledPill}>
            <Text style={styles.cancelledPillText}>CANCELLED</Text>
          </View>
        )}
      </View>
      <View style={styles.cardBody}>
        {item.brand && <Text style={styles.cardBrand} numberOfLines={1}>{item.brand}</Text>}
        <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
        <View style={styles.cardMetaRow}>
          <View style={styles.cardPriceCol}>
            <Meta style={styles.cardPriceLabel}>{priceLabel}</Meta>
            <Text style={styles.cardPriceValue}>{priceText}</Text>
            {(() => {
              const amount = item.currentBidGbp > 0 ? item.currentBidGbp : item.startingBidGbp;
              if (amount <= 0) return null;
              return <Text style={styles.cardPriceIze}>{formatIzeAmount(toIze(amount, 'GBP', goldRates))}</Text>;
            })()}
          </View>
          <View style={styles.cardStatusCol}>
            <View style={[
              styles.statusBadge,
              timing.effectiveState === 'live' && styles.statusBadgeLive,
              timing.effectiveState === 'upcoming' && styles.statusBadgeUpcoming,
              isTerminal && styles.statusBadgeEnded,
            ]}>
              <Text style={[
                styles.statusBadgeText,
                timing.effectiveState === 'live' && styles.statusBadgeTextLive,
              ]}>
                {timing.effectiveState === 'live' ? 'LIVE'
                  : timing.effectiveState === 'upcoming' ? 'SCHEDULED'
                  : isCancelled ? 'CANCELLED'
                  : isSold ? 'SOLD'
                  : isUnsold ? 'UNSOLD'
                  : 'ENDED'}
              </Text>
            </View>
            <Text style={styles.cardBidCount}>
              {item.bidCount} {item.bidCount === 1 ? 'bid' : 'bids'}
            </Text>
            <Text style={styles.cardTimeLabel}>{timeLabel}</Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

function StatPill({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <View style={[styles.statPill, accent && styles.statPillAccent]}>
      <Text style={[styles.statPillValue, accent && styles.statPillValueAccent]}>{value}</Text>
      <Text style={[styles.statPillLabel, accent && styles.statPillLabelAccent]}>{label}</Text>
    </View>
  );
}

export default function SellerAuctionCentreScreen() {
  const navigation = useNavigation<NavT>();
  const { formatFromFiat } = useFormattedPrice();
  const { goldRates } = useCurrencyContext();
  const { isDark } = useAppTheme();

  const [activeTab, setActiveTab] = React.useState<SellerTab>('scheduled');
  const [allItems, setAllItems] = React.useState<AuctionHomeItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [cursor, setCursor] = React.useState<string | null>(null);
  const [loadingMore, setLoadingMore] = React.useState(false);

  const requestIdRef = useRef(0);

  const fetchAuctions = React.useCallback(async (isRefresh: boolean) => {
    const reqId = ++requestIdRef.current;
    if (!isRefresh) setLoading(true);
    setError(null);
    try {
      const result = await listAuctions({ seller: 'me', status: 'all', sort: 'endingSoon', limit: 50 });
      if (reqId !== requestIdRef.current) return;
      setAllItems(result.items.map(toViewModel));
      setCursor(result.nextCursor);
    } catch {
      if (reqId === requestIdRef.current) {
        setError('Unable to load your auctions');
      }
    } finally {
      if (reqId === requestIdRef.current) {
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
    }
  }, []);

  React.useEffect(() => {
    void fetchAuctions(false);
  }, [fetchAuctions]);

  const { secondClock, minuteClock, needsResync } =
    useBucketedServerClock(null);

  React.useEffect(() => {
    if (needsResync) void fetchAuctions(true);
  }, [needsResync, fetchAuctions]);

  const stats = useMemo(() => computeStats(allItems, minuteClock), [allItems, minuteClock]);

  const filteredItems = useMemo(() => {
    const clock = minuteClock;
    return allItems.filter((item) => {
      const timing = resolveAuctionTiming(item, clock);
      if (activeTab === 'live') return timing.effectiveState === 'live';
      if (activeTab === 'scheduled') return timing.effectiveState === 'upcoming';
      if (activeTab === 'sold') {
        return (timing.effectiveState === 'ended' || timing.effectiveState === 'settled') && item.bidCount > 0;
      }
      if (activeTab === 'unsold') {
        return timing.effectiveState === 'ended' && item.bidCount === 0;
      }
      if (activeTab === 'cancelled') {
        return timing.effectiveState === 'cancelled';
      }
      return false;
    });
  }, [allItems, activeTab, minuteClock]);

  const handleRefresh = React.useCallback(() => {
    setRefreshing(true);
    void fetchAuctions(true);
  }, [fetchAuctions]);

  const handleLoadMore = React.useCallback(async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const result = await listAuctions({ seller: 'me', status: 'all', sort: 'endingSoon', cursor, limit: 50 });
      setAllItems((prev) => {
        const existingIds = new Set(prev.map((a) => a.id));
        const newItems = result.items.map(toViewModel).filter((a) => !existingIds.has(a.id));
        return [...prev, ...newItems];
      });
      setCursor(result.nextCursor);
    } catch {
      // silent
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, loadingMore]);

  const handleBack = useCallback(() => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('AuctionHome');
  }, [navigation]);

  const navigateToDetail = useCallback((auctionId: string) => {
    navigation.navigate('AuctionDetail', { auctionId });
  }, [navigation]);

  const navigateToCreate = useCallback(() => {
    navigation.navigate('CreateAuction');
  }, [navigation]);

  const tabs: { key: SellerTab; label: string; count: number }[] = [
    { key: 'scheduled', label: 'Scheduled', count: stats.scheduled },
    { key: 'live', label: 'Live', count: stats.live },
    { key: 'sold', label: 'Sold', count: stats.sold },
    { key: 'unsold', label: 'Unsold', count: stats.unsold },
    { key: 'cancelled', label: 'Cancelled', count: stats.cancelled },
  ];

  const renderItem = useCallback(({ item }: { item: AuctionHomeItem }) => (
    <SellerAuctionCard
      item={item}
      clockMs={secondClock}
      onPress={() => navigateToDetail(item.id)}
      formatFromFiat={formatFromFiat}
      goldRates={goldRates}
    />
  ), [secondClock, navigateToDetail, formatFromFiat, goldRates]);

  const renderEmpty = useCallback(() => {
    if (loading) {
      return (
        <View style={styles.loadingWrap}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={styles.loadingCard}>
              <SkeletonLoader width="100%" height={140} borderRadius={Radius.lg} />
              <View style={{ padding: Space.sm }}>
                <SkeletonLoader width="70%" height={16} borderRadius={8} style={{ marginBottom: Space.xs }} />
                <SkeletonLoader width="40%" height={12} borderRadius={6} />
              </View>
            </View>
          ))}
        </View>
      );
    }
    if (error) {
      return (
        <EmptyState
          icon="cloud-offline-outline"
          title="Couldn't load auctions"
          subtitle="Pull to refresh and try again."
        />
      );
    }
    const messages: Record<SellerTab, { title: string; subtitle: string }> = {
      scheduled: { title: 'No scheduled auctions', subtitle: 'Create an auction to get started.' },
      live: { title: 'No live auctions', subtitle: 'Your scheduled auctions will appear here when they go live.' },
      sold: { title: 'No sold auctions', subtitle: 'Auctions that close with bids will appear here.' },
      unsold: { title: 'No unsold auctions', subtitle: 'Auctions that end without bids will appear here.' },
      cancelled: { title: 'No cancelled auctions', subtitle: 'Cancelled auctions will appear here.' },
    };
    return (
      <EmptyState
        icon="storefront-outline"
        title={messages[activeTab].title}
        subtitle={messages[activeTab].subtitle}
      />
    );
  }, [loading, error, activeTab]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={Colors.background}
      />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Pressable
            onPress={handleBack}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            style={styles.backBtn}
          >
            <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
          </Pressable>
          <View style={styles.headerTitleWrap}>
            <Text style={styles.headerTitle}>Seller Centre</Text>
            <Text style={styles.headerSubtitle}>
              {stats.total > 0 ? `${stats.total} auctions` : 'Manage your auctions'}
            </Text>
          </View>
          <Pressable
            onPress={navigateToCreate}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Create new auction"
            style={styles.createBtn}
          >
            <Ionicons name="add" size={24} color={Colors.brand} />
          </Pressable>
        </View>
      </View>

      {/* Stats summary */}
      {stats.total > 0 && (
        <View style={styles.statsRow}>
          <StatPill label="Live" value={stats.live} accent={stats.live > 0} />
          <StatPill label="Scheduled" value={stats.scheduled} />
          <StatPill label="Sold" value={stats.sold} />
          <StatPill label="Unsold" value={stats.unsold} />
        </View>
      )}

      {/* Tab bar */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabBar}
      >
        {tabs.map((tab) => (
          <Pressable
            key={tab.key}
            style={[styles.tab, activeTab === tab.key && styles.tabActive]}
            onPress={() => setActiveTab(tab.key)}
            accessibilityRole="tab"
            accessibilityLabel={tab.label}
            accessibilityState={{ selected: activeTab === tab.key }}
          >
            <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
              {tab.label}
            </Text>
            {tab.count > 0 && (
              <View style={[styles.tabBadge, activeTab === tab.key && styles.tabBadgeActive]}>
                <Text style={[styles.tabBadgeText, activeTab === tab.key && styles.tabBadgeTextActive]}>
                  {tab.count}
                </Text>
              </View>
            )}
          </Pressable>
        ))}
      </ScrollView>

      {/* List */}
      <SectionList
        sections={[{ key: activeTab, data: filteredItems }]}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ItemSeparatorComponent={() => <View style={{ height: Space.sm }} />}
        ListEmptyComponent={renderEmpty}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        stickyHeaderHiddenOnScroll
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={Colors.brand}
            colors={[Colors.brand]}
            progressBackgroundColor={Colors.surfaceAlt}
          />
        }
        renderSectionFooter={() =>
          cursor && !loading ? (
            <View style={styles.loadMoreWrap}>
              <Pressable
                style={styles.loadMoreBtn}
                onPress={() => void handleLoadMore()}
                disabled={loadingMore}
                accessibilityRole="button"
                accessibilityLabel="Load more auctions"
              >
                <Text style={styles.loadMoreText}>
                  {loadingMore ? 'Loading...' : 'Load More'}
                </Text>
              </Pressable>
            </View>
          ) : null
        }
      />

      {/* Floating create CTA when no auctions */}
      {stats.total === 0 && !loading && !error && (
        <View style={styles.floatingCta}>
          <AppButton
            onPress={navigateToCreate}
            variant="primary"
            size="md"
            align="center"
            title="Create your first auction"
            accessibilityLabel="Create your first auction"
          />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    paddingBottom: Space.sm,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleWrap: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.textPrimary,
    fontFamily: 'Inter_700Bold',
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontFamily: 'Inter_400Regular',
    marginTop: 2,
  },
  createBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: Space.md,
    paddingBottom: Space.sm,
    gap: Space.xs,
  },
  statPill: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Space.sm,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceAlt,
  },
  statPillAccent: {
    backgroundColor: 'rgba(244,63,94,0.08)',
  },
  statPillValue: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
    fontFamily: 'Inter_700Bold',
  },
  statPillValueAccent: {
    color: Colors.danger,
  },
  statPillLabel: {
    fontSize: 10,
    color: Colors.textMuted,
    fontFamily: 'Inter_400Regular',
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statPillLabelAccent: {
    color: Colors.danger,
  },
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: Space.md,
    paddingBottom: Space.sm,
    gap: Space.xs,
  },
  tab: {
    minWidth: 60,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: Space.sm,
    paddingHorizontal: Space.sm,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceAlt,
  },
  tabActive: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tabText: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontFamily: 'Inter_500Medium',
  },
  tabTextActive: {
    color: Colors.textPrimary,
    fontFamily: 'Inter_600SemiBold',
  },
  tabBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.border,
  },
  tabBadgeActive: {
    backgroundColor: Colors.brand,
  },
  tabBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  tabBadgeTextActive: {
    color: '#fff',
  },
  listContent: {
    paddingHorizontal: Space.md,
    paddingBottom: Space.xl,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    overflow: 'hidden',
  },
  cardImageWrap: {
    position: 'relative',
  },
  cardImageContainer: {
    width: '100%',
    height: 160,
  },
  cardImage: {
    width: '100%',
    height: 160,
  },
  cardImagePlaceholder: {
    width: '100%',
    height: 160,
    backgroundColor: Colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  urgencyPill: {
    position: 'absolute',
    top: Space.sm,
    right: Space.sm,
    backgroundColor: 'rgba(220,38,38,0.9)',
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  urgencyPillText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  soldPill: {
    position: 'absolute',
    top: Space.sm,
    right: Space.sm,
    backgroundColor: 'rgba(22,163,74,0.9)',
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  soldPillText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  unsoldPill: {
    position: 'absolute',
    top: Space.sm,
    right: Space.sm,
    backgroundColor: 'rgba(100,116,139,0.9)',
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  unsoldPillText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  cancelledPill: {
    position: 'absolute',
    top: Space.sm,
    right: Space.sm,
    backgroundColor: 'rgba(220,38,38,0.8)',
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  cancelledPillText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  cardBody: {
    padding: Space.sm,
    gap: Space.xs,
  },
  cardBrand: {
    fontSize: 11,
    color: Colors.textMuted,
    fontFamily: 'Inter_500Medium',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  cardTitle: {
    fontSize: 15,
    color: Colors.textPrimary,
    fontFamily: 'Inter_600SemiBold',
    lineHeight: 20,
  },
  cardMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginTop: 2,
  },
  cardPriceCol: {
    flex: 1,
  },
  cardPriceLabel: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  cardPriceValue: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
    fontFamily: 'Inter_700Bold',
    marginTop: 2,
  },
  cardPriceIze: {
    fontSize: 11,
    color: Colors.textMuted,
    fontFamily: 'Inter_400Regular',
    marginTop: 1,
  },
  cardStatusCol: {
    alignItems: 'flex-end',
    gap: 3,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceAlt,
  },
  statusBadgeLive: {
    backgroundColor: 'rgba(220,38,38,0.1)',
  },
  statusBadgeUpcoming: {
    backgroundColor: 'rgba(59,130,246,0.1)',
  },
  statusBadgeEnded: {
    backgroundColor: Colors.surfaceAlt,
  },
  statusBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
    color: Colors.textMuted,
  },
  statusBadgeTextLive: {
    color: Colors.danger,
  },
  cardBidCount: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontFamily: 'Inter_500Medium',
  },
  cardTimeLabel: {
    fontSize: 11,
    color: Colors.textMuted,
    fontFamily: 'Inter_400Regular',
  },
  loadingWrap: {
    paddingTop: Space.md,
    gap: Space.sm,
  },
  loadingCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    overflow: 'hidden',
  },
  loadMoreWrap: {
    paddingVertical: Space.md,
    alignItems: 'center',
  },
  loadMoreBtn: {
    paddingVertical: Space.sm,
    paddingHorizontal: Space.lg,
  },
  loadMoreText: {
    fontSize: 14,
    color: Colors.brand,
    fontFamily: 'Inter_600SemiBold',
  },
  floatingCta: {
    position: 'absolute',
    bottom: Space.lg,
    left: Space.md,
    right: Space.md,
  },
});
