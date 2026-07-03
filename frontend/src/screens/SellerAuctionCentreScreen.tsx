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
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
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
import { AnimatedPressable } from '../components/AnimatedPressable';
import { Space, Radius, Typography, Elevation } from '../theme/designTokens';
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

  // Single state badge config — no duplicate pills
  const stateConfig: { label: string; bg: string; fg: string; dot?: boolean } = isCancelled
    ? { label: 'CANCELLED', bg: 'rgba(220,38,38,0.14)', fg: Colors.danger }
    : isSold
    ? { label: 'SOLD', bg: 'rgba(22,163,74,0.14)', fg: Colors.success }
    : isUnsold
    ? { label: 'UNSOLD', bg: 'rgba(255,255,255,0.08)', fg: Colors.textMuted }
    : timing.effectiveState === 'live'
    ? { label: 'LIVE', bg: 'rgba(220,38,38,0.15)', fg: Colors.danger, dot: true }
    : timing.effectiveState === 'upcoming'
    ? { label: 'SCHEDULED', bg: 'rgba(255,255,255,0.08)', fg: Colors.textSecondary }
    : { label: 'ENDED', bg: 'rgba(255,255,255,0.06)', fg: Colors.textMuted };

  const amount = item.currentBidGbp > 0 ? item.currentBidGbp : item.startingBidGbp;
  const izeText = amount > 0 ? formatIzeAmount(toIze(amount, 'GBP', goldRates)) : null;

  return (
    <AnimatedPressable
      style={styles.card}
      scaleValue={0.985}
      activeOpacity={0.96}
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
            <Ionicons name="image-outline" size={28} color={Colors.textMuted} />
          </View>
        )}
        {/* Bottom gradient for badge legibility */}
        <LinearGradient
          colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.4)']}
          locations={[0.5, 1]}
          style={styles.cardGradient}
        />
        {/* Single state badge — top-left, no duplication */}
        <View style={styles.cardStateBadge}>
          {stateConfig.dot && <View style={styles.cardStateDot} />}
          <Text style={[styles.cardStateText, { color: stateConfig.fg }]}>{stateConfig.label}</Text>
        </View>
        {/* Urgency flag — only when live + final minutes, top-right */}
        {urgency === 'finalMinutes' && timing.effectiveState === 'live' && (
          <View style={styles.cardUrgencyFlag}>
            <Ionicons name="flash" size={10} color="#FFFFFF" />
            <Text style={styles.cardUrgencyText}>ENDING</Text>
          </View>
        )}
      </View>
      <View style={styles.cardBody}>
        {item.brand && <Text style={styles.cardBrand} numberOfLines={1}>{item.brand}</Text>}
        <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
        <View style={styles.cardMetaRow}>
          <View style={styles.cardPriceCol}>
            <Text style={styles.cardPriceLabel}>{priceLabel}</Text>
            <Text style={styles.cardPriceValue}>{priceText}</Text>
            {izeText && <Text style={styles.cardPriceIze}>{izeText}</Text>}
          </View>
          <View style={styles.cardStatusCol}>
            <Text style={styles.cardBidCount}>
              {item.bidCount} {item.bidCount === 1 ? 'bid' : 'bids'}
            </Text>
            <Text style={styles.cardTimeLabel}>{timeLabel}</Text>
          </View>
        </View>
      </View>
    </AnimatedPressable>
  );
}

function StatPill({ label, value, accent, accentColor }: { label: string; value: string | number; accent?: boolean; accentColor?: string }) {
  return (
    <View style={[styles.statPill, accent && styles.statPillAccent]}>
      <Text style={[styles.statPillValue, accent && accentColor ? { color: accentColor } : undefined]}>{value}</Text>
      <Text style={[styles.statPillLabel, accent && accentColor ? { color: accentColor } : undefined]}>{label}</Text>
    </View>
  );
}

export default function SellerAuctionCentreScreen() {
  const navigation = useNavigation<NavT>();
  const { formatFromFiat } = useFormattedPrice();
  const { goldRates } = useCurrencyContext();
  const { isDark } = useAppTheme();
  const insets = useSafeAreaInsets();

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
              <SkeletonLoader width="100%" height={180} borderRadius={Radius.lg} />
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
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={Colors.background}
      />

      {/* Header — flagship language: chevron-back, 30px title, brand-tinted create */}
      <View style={[styles.header, { paddingTop: insets.top + Space.xs }]}>
        <View style={styles.headerRow}>
          <Pressable
            onPress={handleBack}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            style={styles.headerIconBtn}
          >
            <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
          </Pressable>
          <View style={styles.headerTitleWrap}>
            <Text style={styles.headerTitle} numberOfLines={1}>Seller Centre</Text>
            <Text style={styles.headerSubtitle} numberOfLines={1}>
              {stats.total > 0 ? `${stats.total} auctions` : 'Manage your auctions'}
            </Text>
          </View>
          <Pressable
            onPress={navigateToCreate}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="Create new auction"
            style={styles.headerCreateBtn}
          >
            <Ionicons name="add" size={22} color={Colors.brand} />
          </Pressable>
        </View>
      </View>

      {/* Stats summary — editorial hierarchy, live accent in danger */}
      {stats.total > 0 && (
        <View style={styles.statsRow}>
          <StatPill label="Live" value={stats.live} accent={stats.live > 0} accentColor={Colors.danger} />
          <StatPill label="Scheduled" value={stats.scheduled} />
          <StatPill label="Sold" value={stats.sold} />
          <StatPill label="Unsold" value={stats.unsold} />
        </View>
      )}

      {/* Tab bar — underline indicator, active weight, count badges */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabBar}
      >
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <Pressable
              key={tab.key}
              style={styles.tab}
              onPress={() => setActiveTab(tab.key)}
              accessibilityRole="tab"
              accessibilityLabel={tab.label}
              accessibilityState={{ selected: isActive }}
            >
              <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
                {tab.label}
              </Text>
              {tab.count > 0 && (
                <View style={[styles.tabBadge, isActive && styles.tabBadgeActive]}>
                  <Text style={[styles.tabBadgeText, isActive && styles.tabBadgeTextActive]}>
                    {tab.count}
                  </Text>
                </View>
              )}
              {isActive && <View style={styles.tabIndicator} />}
            </Pressable>
          );
        })}
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
              <AnimatedPressable
                style={styles.loadMoreBtn}
                onPress={() => void handleLoadMore()}
                disabled={loadingMore}
                scaleValue={0.97}
                activeOpacity={0.9}
                accessibilityRole="button"
                accessibilityLabel="Load more auctions"
              >
                {loadingMore ? (
                  <Text style={styles.loadMoreText}>Loading…</Text>
                ) : (
                  <>
                    <Ionicons name="chevron-down" size={14} color={Colors.brand} />
                    <Text style={styles.loadMoreText}>Load more</Text>
                  </>
                )}
              </AnimatedPressable>
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
  // ── Header — flagship language ──
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
  headerTitleWrap: {
    flex: 1,
  },
  headerTitle: {
    fontFamily: Typography.family.bold,
    fontSize: 30,
    color: Colors.textPrimary,
    letterSpacing: -0.8,
  },
  headerSubtitle: {
    fontFamily: Typography.family.regular,
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 0,
    letterSpacing: -0.1,
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
  // ── Stats — editorial hierarchy ──
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: Space.md,
    paddingBottom: Space.sm,
    gap: Space.xs,
  },
  statPill: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Space.sm + 2,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  statPillAccent: {
    backgroundColor: 'rgba(220,38,38,0.08)',
    borderColor: 'rgba(220,38,38,0.20)',
  },
  statPillValue: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.textPrimary,
    fontFamily: Typography.family.bold,
    letterSpacing: -0.4,
    fontVariant: ['tabular-nums'],
  },
  statPillLabel: {
    fontSize: 10,
    color: Colors.textMuted,
    fontFamily: Typography.family.medium,
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  // ── Tab bar — underline indicator ──
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: Space.md,
    paddingBottom: 0,
    gap: Space.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  tab: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: Space.sm,
    paddingHorizontal: Space.sm + 2,
    position: 'relative',
  },
  tabText: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontFamily: Typography.family.medium,
  },
  tabTextActive: {
    color: Colors.textPrimary,
    fontFamily: Typography.family.semibold,
  },
  tabBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceAlt,
  },
  tabBadgeActive: {
    backgroundColor: Colors.brand,
  },
  tabBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.textMuted,
    fontFamily: Typography.family.bold,
  },
  tabBadgeTextActive: {
    color: Colors.textInverse,
  },
  tabIndicator: {
    position: 'absolute',
    bottom: 0,
    left: Space.sm + 2,
    right: Space.sm + 2,
    height: 2,
    backgroundColor: Colors.textPrimary,
    borderRadius: 1,
  },
  // ── List ──
  listContent: {
    paddingHorizontal: Space.md,
    paddingTop: Space.md,
    paddingBottom: Space.xl,
  },
  // ── Card — elevated product card ──
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 12 },
      android: { elevation: 4 },
    }),
  },
  cardImageWrap: {
    position: 'relative',
  },
  cardImageContainer: {
    width: '100%',
    height: 220,
  },
  cardImage: {
    width: '100%',
    height: 220,
  },
  cardImagePlaceholder: {
    width: '100%',
    height: 220,
    backgroundColor: Colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 80,
  },
  // Single state badge — top-left, no duplication
  cardStateBadge: {
    position: 'absolute',
    top: Space.sm,
    left: Space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: Space.sm,
    paddingVertical: 4,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  cardStateDot: {
    width: 5,
    height: 5,
    borderRadius: 999,
    backgroundColor: Colors.danger,
  },
  cardStateText: {
    fontSize: 10,
    fontWeight: '700',
    fontFamily: Typography.family.bold,
    letterSpacing: 0.8,
    color: '#FFFFFF',
  },
  // Urgency flag — top-right, only for live + final minutes
  cardUrgencyFlag: {
    position: 'absolute',
    top: Space.sm,
    right: Space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(220,38,38,0.92)',
  },
  cardUrgencyText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '700',
    fontFamily: Typography.family.bold,
    letterSpacing: 0.6,
  },
  // ── Card body ──
  cardBody: {
    padding: Space.md,
    gap: Space.xs,
  },
  cardBrand: {
    fontSize: 11,
    color: Colors.textMuted,
    fontFamily: Typography.family.medium,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  cardTitle: {
    fontSize: 16,
    color: Colors.textPrimary,
    fontFamily: Typography.family.semibold,
    lineHeight: 21,
    letterSpacing: -0.2,
  },
  cardMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: Space.xs,
  },
  cardPriceCol: {
    flex: 1,
    gap: 1,
  },
  cardPriceLabel: {
    fontSize: 10,
    color: Colors.textMuted,
    fontFamily: Typography.family.semibold,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  cardPriceValue: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.textPrimary,
    fontFamily: Typography.family.bold,
    letterSpacing: -0.4,
    fontVariant: ['tabular-nums'],
    marginTop: 2,
  },
  cardPriceIze: {
    fontSize: 12,
    color: Colors.textMuted,
    fontFamily: Typography.family.regular,
    marginTop: 1,
    fontVariant: ['tabular-nums'],
  },
  cardStatusCol: {
    alignItems: 'flex-end',
    gap: 2,
  },
  cardBidCount: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontFamily: Typography.family.medium,
    fontVariant: ['tabular-nums'],
  },
  cardTimeLabel: {
    fontSize: 11,
    color: Colors.textMuted,
    fontFamily: Typography.family.regular,
  },
  // ── Loading ──
  loadingWrap: {
    paddingTop: Space.md,
    gap: Space.md,
  },
  loadingCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  // ── Load more ──
  loadMoreWrap: {
    paddingVertical: Space.lg,
    alignItems: 'center',
  },
  loadMoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: Space.sm,
    paddingHorizontal: Space.lg,
    borderRadius: Radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  loadMoreText: {
    fontSize: 14,
    color: Colors.brand,
    fontFamily: Typography.family.semibold,
  },
  // ── Floating CTA ──
  floatingCta: {
    position: 'absolute',
    bottom: Space.lg,
    left: Space.md,
    right: Space.md,
  },
});
