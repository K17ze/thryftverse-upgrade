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
import { SkeletonLoader } from '../components/SkeletonLoader';
import { AppButton } from '../components/ui/AppButton';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { Space, Radius, Typography } from '../theme/designTokens';
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

// ── State-specific presentation config ──
interface StatePresentation {
  stateLabel: string;
  stateColor: string;
  /** Leading operational line — the most important fact for this state */
  leadingLabel: string;
  leadingColor: string;
  /** One truthful next action */
  actionLabel: string;
  /** Whether to show the live signal dot on the image */
  showLiveDot: boolean;
  /** Whether to use danger colour for state text (genuine final urgency only) */
  useDangerState: boolean;
}

function resolveStatePresentation(
  item: AuctionHomeItem,
  timing: ReturnType<typeof resolveAuctionTiming>,
  urgency: ReturnType<typeof resolveUrgency>,
  timeLabel: string,
): StatePresentation {
  const isCancelled = timing.effectiveState === 'cancelled' || item.cancelledAt;
  const isSold = (timing.effectiveState === 'ended' || timing.effectiveState === 'settled') && item.bidCount > 0 && !isCancelled;
  const isUnsold = timing.effectiveState === 'ended' && item.bidCount === 0 && !isCancelled;
  const isLive = timing.effectiveState === 'live';
  const isScheduled = timing.effectiveState === 'upcoming';

  if (isCancelled) {
    const reason = item.terminalReason ? ` · ${item.terminalReason}` : '';
    return {
      stateLabel: 'Cancelled',
      stateColor: Colors.textMuted,
      leadingLabel: `Cancelled${reason}`,
      leadingColor: Colors.textMuted,
      actionLabel: 'View details',
      showLiveDot: false,
      useDangerState: false,
    };
  }
  if (isSold) {
    return {
      stateLabel: 'Sold',
      stateColor: Colors.success,
      leadingLabel: `Sold · ${item.bidCount} ${item.bidCount === 1 ? 'bid' : 'bids'}`,
      leadingColor: Colors.textSecondary,
      actionLabel: 'View sale',
      showLiveDot: false,
      useDangerState: false,
    };
  }
  if (isUnsold) {
    return {
      stateLabel: 'Unsold',
      stateColor: Colors.textMuted,
      leadingLabel: 'No bids received',
      leadingColor: Colors.textMuted,
      actionLabel: 'Review result',
      showLiveDot: false,
      useDangerState: false,
    };
  }
  if (isLive) {
    const finalUrgency = urgency === 'finalMinutes';
    return {
      stateLabel: finalUrgency ? 'Ending' : 'Live',
      stateColor: finalUrgency ? Colors.danger : Colors.textPrimary,
      leadingLabel: timeLabel,
      leadingColor: finalUrgency ? Colors.danger : Colors.textSecondary,
      actionLabel: 'View bids',
      showLiveDot: true,
      useDangerState: finalUrgency,
    };
  }
  if (isScheduled) {
    return {
      stateLabel: 'Scheduled',
      stateColor: Colors.textSecondary,
      leadingLabel: timeLabel,
      leadingColor: Colors.textSecondary,
      actionLabel: 'View schedule',
      showLiveDot: false,
      useDangerState: false,
    };
  }
  return {
    stateLabel: 'Ended',
    stateColor: Colors.textMuted,
    leadingLabel: timeLabel,
    leadingColor: Colors.textMuted,
    actionLabel: 'Review result',
    showLiveDot: false,
    useDangerState: false,
  };
}

// ── Inventory row — horizontal, operations-studio layout ──
function SellerAuctionRow({
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
  const presentation = resolveStatePresentation(item, timing, urgency, timeLabel);

  const amount = item.currentBidGbp > 0 ? item.currentBidGbp : item.startingBidGbp;
  const izeText = amount > 0 ? `${formatIzeAmount(toIze(amount, 'GBP', goldRates))} 1ZE` : null;
  const localText = priceLabel === 'No bids' ? null : priceText;

  // Value prefix depends on state
  const valuePrefix =
    priceLabel === 'Starting bid' ? 'Starts '
    : priceLabel === 'Final bid' ? 'Final '
    : priceLabel === 'Current bid' ? 'Current '
    : '';

  return (
    <AnimatedPressable
      style={styles.row}
      scaleValue={0.992}
      activeOpacity={0.94}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={buildAuctionAccessibilityLabel(item, timing, priceLabel, priceText)}
    >
      {/* Media — controlled radius, scanable size */}
      <View style={styles.rowImageWrap}>
        {item.imageUrl ? (
          <CachedImage
            uri={item.imageUrl}
            style={styles.rowImage}
            containerStyle={styles.rowImageContainer}
            contentFit="cover"
          />
        ) : (
          <View style={styles.rowImagePlaceholder}>
            <Ionicons name="image-outline" size={22} color={Colors.textMuted} />
          </View>
        )}
        {presentation.showLiveDot && <View style={styles.rowLiveDot} />}
      </View>

      {/* Body — identity + operational block */}
      <View style={styles.rowBody}>
        {/* Identity */}
        <View style={styles.rowIdentity}>
          <Text style={styles.rowTitle} numberOfLines={2}>{item.title}</Text>
          <Text style={[styles.rowStateText, { color: presentation.stateColor }]}>
            {presentation.stateLabel}
          </Text>
        </View>
        {item.brand && <Text style={styles.rowBrand} numberOfLines={1}>{item.brand}</Text>}

        {/* Hairline separator — identity → operational */}
        <View style={styles.rowHairline} />

        {/* Operational block — value + leading op + action */}
        <View style={styles.rowOperational}>
          <View style={styles.rowValueCol}>
            <Text style={styles.rowIze} numberOfLines={1}>
              {valuePrefix && <Text style={styles.rowValuePrefix}>{valuePrefix}</Text>}
              {izeText ?? 'No value'}
            </Text>
            {localText && (
              <Text style={styles.rowLocal} numberOfLines={1}>{localText}</Text>
            )}
          </View>
          <View style={styles.rowActionCol}>
            <Text style={styles.rowActionLabel}>{presentation.actionLabel}</Text>
            <Ionicons name="chevron-forward" size={13} color={Colors.textMuted} style={styles.rowActionChevron} />
          </View>
        </View>
        <View style={styles.rowLeadingRow}>
          <Text
            style={[styles.rowLeading, { color: presentation.leadingColor }]}
            numberOfLines={1}
          >
            {presentation.leadingLabel}
          </Text>
          {item.bidCount > 0 && presentation.stateLabel !== 'Sold' && (
            <Text style={styles.rowBidCount}>
              {item.bidCount} {item.bidCount === 1 ? 'bid' : 'bids'}
            </Text>
          )}
        </View>
      </View>
    </AnimatedPressable>
  );
}

function SellerSummary({
  stats,
  formatFromFiat,
  goldRates,
}: {
  stats: SellerStats;
  formatFromFiat: (amount: number, currency?: any, opts?: any) => string;
  goldRates: any;
}) {
  const active = stats.live;
  const activeColor = active > 0 ? Colors.danger : Colors.textPrimary;
  const hasBidContext = stats.totalBids > 0 && stats.highestBid > 0;
  const highestBidIze = hasBidContext
    ? `${formatIzeAmount(toIze(stats.highestBid, 'GBP', goldRates))} 1ZE`
    : null;
  const highestBidLocal = hasBidContext
    ? formatFromFiat(stats.highestBid, 'GBP')
    : null;

  return (
    <View style={styles.summary}>
      <View style={styles.summaryRow}>
        {/* Primary measure — Active auctions */}
        <View style={styles.summaryPrimary}>
          <Text style={[styles.summaryPrimaryValue, { color: activeColor }]}>{active}</Text>
          <Text style={[styles.summaryPrimaryLabel, { color: active > 0 ? Colors.danger : Colors.textMuted }]}>
            Active auctions
          </Text>
        </View>
        {/* Vertical hairline divider */}
        <View style={styles.summaryPrimaryDivider} />
        {/* Secondary measures — hairline-divided compact row */}
        <View style={styles.summarySecondary}>
          <View style={styles.summarySecondaryItem}>
            <Text style={styles.summarySecondaryValue}>{stats.scheduled}</Text>
            <Text style={styles.summarySecondaryLabel}>Scheduled</Text>
          </View>
          <View style={styles.summarySecondaryItem}>
            <Text style={styles.summarySecondaryValue}>{stats.sold}</Text>
            <Text style={styles.summarySecondaryLabel}>Sold</Text>
          </View>
          <View style={styles.summarySecondaryItem}>
            <Text style={styles.summarySecondaryValue}>{stats.unsold}</Text>
            <Text style={styles.summarySecondaryLabel}>Unsold</Text>
          </View>
        </View>
      </View>
      {/* Quiet context — total bids + highest bid, only when authoritative */}
      {hasBidContext && (
        <View style={styles.summaryContext}>
          <Text style={styles.summaryContextText}>
            {stats.totalBids} {stats.totalBids === 1 ? 'bid' : 'bids'} · Highest {highestBidIze}
            {highestBidLocal ? ` · ${highestBidLocal}` : ''}
          </Text>
        </View>
      )}
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

  // Refs for sticky-tab scroll architecture
  const listRef = useRef<SectionList>(null);
  const tabScrollRef = useRef<ScrollView>(null);
  const tabLayoutsRef = useRef<Record<string, { x: number; width: number }>>({});

  // Tab press: switch tab + scroll list to top for predictable positioning
  const handleTabPress = useCallback((key: SellerTab) => {
    setActiveTab(key);
    // Scroll to top so summary reappears — predictable on tab switch
    requestAnimationFrame(() => {
      listRef.current?.getScrollResponder()?.scrollTo({ x: 0, y: 0, animated: false });
    });
  }, []);

  // Auto-scroll selected tab into view when it changes
  React.useEffect(() => {
    const layout = tabLayoutsRef.current[activeTab];
    if (layout && tabScrollRef.current) {
      tabScrollRef.current.scrollTo({
        x: Math.max(0, layout.x - 40),
        animated: false,
      });
    }
  }, [activeTab]);

  const tabs: { key: SellerTab; label: string; count: number }[] = [
    { key: 'scheduled', label: 'Scheduled', count: stats.scheduled },
    { key: 'live', label: 'Live', count: stats.live },
    { key: 'sold', label: 'Sold', count: stats.sold },
    { key: 'unsold', label: 'Unsold', count: stats.unsold },
    { key: 'cancelled', label: 'Cancelled', count: stats.cancelled },
  ];

  const renderItem = useCallback(({ item }: { item: AuctionHomeItem }) => (
    <SellerAuctionRow
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
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={styles.loadingRow}>
              <SkeletonLoader width={96} height={96} borderRadius={Radius.md} />
              <View style={styles.loadingBody}>
                <View style={styles.loadingTitleRow}>
                  <SkeletonLoader width="70%" height={15} borderRadius={4} />
                  <SkeletonLoader width={40} height={12} borderRadius={4} />
                </View>
                <SkeletonLoader width="40%" height={11} borderRadius={4} />
                <View style={styles.loadingHairline} />
                <SkeletonLoader width="55%" height={17} borderRadius={4} />
                <SkeletonLoader width="35%" height={11} borderRadius={4} />
              </View>
            </View>
          ))}
        </View>
      );
    }
    if (error) {
      return (
        <View style={styles.inlineStateWrap}>
          <Text style={styles.inlineStateTitle}>Couldn't load auctions</Text>
          <Text style={styles.inlineStateMessage}>
            Check your connection and try again.
          </Text>
          <Pressable
            style={({ pressed }) => [
              styles.retryBtn,
              pressed && styles.retryBtnPressed,
            ]}
            onPress={() => void fetchAuctions(false)}
            accessibilityRole="button"
            accessibilityLabel="Retry loading auctions"
          >
            <Text style={styles.retryBtnText}>Retry</Text>
          </Pressable>
        </View>
      );
    }
    const emptyConfig: Record<SellerTab, { title: string; message: string; cta?: string }> = {
      scheduled: {
        title: 'No auctions scheduled',
        message: 'Create an auction when you are ready to sell.',
        cta: 'Create Auction',
      },
      live: {
        title: 'Nothing live right now',
        message: 'Scheduled auctions will appear here when they begin.',
      },
      sold: {
        title: 'No completed sales yet',
        message: 'Auctions sold with bids will appear here.',
      },
      unsold: {
        title: 'No unsold auctions',
        message: 'Auctions ending without bids will appear here.',
      },
      cancelled: {
        title: 'No cancelled auctions',
        message: 'Cancelled auctions will remain available here.',
      },
    };
    const cfg = emptyConfig[activeTab];
    return (
      <View style={styles.inlineStateWrap}>
        <Text style={styles.inlineStateTitle}>{cfg.title}</Text>
        <Text style={styles.inlineStateMessage}>{cfg.message}</Text>
        {cfg.cta && (
          <Pressable
            style={({ pressed }) => [
              styles.inlineCtaBtn,
              pressed && styles.inlineCtaPressed,
            ]}
            onPress={navigateToCreate}
            accessibilityRole="button"
            accessibilityLabel={cfg.cta}
          >
            <Text style={styles.inlineCtaText}>{cfg.cta}</Text>
            <Ionicons name="add" size={15} color={Colors.brand} style={styles.inlineCtaIcon} />
          </Pressable>
        )}
      </View>
    );
  }, [loading, error, activeTab, fetchAuctions, navigateToCreate]);

  // Tab rail — rendered as sticky section header
  const renderSectionHeader = useCallback(() => (
    <View style={styles.tabBarContainer}>
      <ScrollView
        ref={tabScrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabBar}
      >
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <Pressable
              key={tab.key}
              style={({ pressed }) => [
                styles.tab,
                pressed && styles.tabPressed,
              ]}
              onPress={() => handleTabPress(tab.key)}
              onLayout={(e) => {
                tabLayoutsRef.current[tab.key] = {
                  x: e.nativeEvent.layout.x,
                  width: e.nativeEvent.layout.width,
                };
              }}
              accessibilityRole="tab"
              accessibilityLabel={tab.label}
              accessibilityState={{ selected: isActive }}
            >
              <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
                {tab.label}
              </Text>
              {tab.count > 0 && (
                <Text style={[styles.tabCount, isActive && styles.tabCountActive]}>
                  {tab.count}
                </Text>
              )}
              {isActive && <View style={styles.tabIndicator} />}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  ), [tabs, activeTab, handleTabPress]);

  // Summary — scrolls away as ListHeaderComponent
  const listHeader = useMemo(() => {
    if (stats.total === 0) return null;
    return (
      <SellerSummary
        stats={stats}
        formatFromFiat={formatFromFiat}
        goldRates={goldRates}
      />
    );
  }, [stats, formatFromFiat, goldRates]);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={Colors.background}
      />

      {/* Header — native, deliberate, 44pt touch targets, no filled icon backgrounds */}
      <View style={[styles.header, { paddingTop: insets.top + Space.sm }]}>
        <View style={styles.headerRow}>
          <Pressable
            onPress={handleBack}
            hitSlop={{ top: 8, bottom: 8, left: 12, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            style={({ pressed }) => [
              styles.headerIconBtn,
              pressed && styles.headerIconPressed,
            ]}
          >
            <Ionicons name="chevron-back" size={26} color={Colors.textPrimary} />
          </Pressable>
          <View style={styles.headerTitleWrap}>
            <Text style={styles.headerTitle} numberOfLines={1}>Seller Centre</Text>
            <Text style={styles.headerSubtitle} numberOfLines={1}>
              {stats.total > 0 ? `${stats.total} auctions` : 'Manage your auctions'}
            </Text>
          </View>
          <Pressable
            onPress={navigateToCreate}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel="Create new auction"
            style={({ pressed }) => [
              styles.headerIconBtn,
              pressed && styles.headerIconPressed,
            ]}
          >
            <Ionicons name="add" size={26} color={Colors.textPrimary} />
          </Pressable>
        </View>
      </View>

      {/* Single authoritative virtualised list:
          - ListHeaderComponent: summary (scrolls away)
          - renderSectionHeader: tab rail (sticky beneath header)
          - items: inventory rows */}
      <SectionList
        ref={listRef}
        sections={[{ key: activeTab, data: filteredItems }]}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        renderSectionHeader={renderSectionHeader}
        stickySectionHeadersEnabled
        ListHeaderComponent={listHeader}
        ItemSeparatorComponent={() => <View style={styles.rowSeparator} />}
        ListEmptyComponent={renderEmpty}
        contentContainerStyle={[
          styles.listContent,
          stats.total === 0 && !loading && !error && { paddingBottom: 120 + insets.bottom },
        ]}
        showsVerticalScrollIndicator={false}
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

      {/* Floating create CTA — only when no auctions exist; safe-area aware, controlled elevation */}
      {stats.total === 0 && !loading && !error && (
        <View style={[styles.floatingCta, { bottom: Space.lg + insets.bottom }]}>
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

const ROW_IMAGE_SIZE = 96;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  // ── Header ──
  header: {
    paddingBottom: Space.sm,
    paddingHorizontal: Space.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    minHeight: 44,
  },
  headerIconBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerIconPressed: {
    opacity: 0.5,
  },
  headerTitleWrap: {
    flex: 1,
    marginLeft: Space.xs,
  },
  headerTitle: {
    fontFamily: Typography.family.bold,
    fontSize: 26,
    color: Colors.textPrimary,
    letterSpacing: -0.6,
    lineHeight: 30,
  },
  headerSubtitle: {
    fontFamily: Typography.family.regular,
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 1,
    letterSpacing: -0.1,
  },
  // ── Seller summary — one integrated surface ──
  summary: {
    paddingHorizontal: Space.md,
    paddingTop: Space.md,
    paddingBottom: Space.sm,
  },
  summaryContext: {
    marginTop: Space.sm,
    paddingTop: Space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
  },
  summaryContextText: {
    fontSize: 12,
    color: Colors.textMuted,
    fontFamily: Typography.family.regular,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.1,
  },
  summaryPrimary: {
    alignItems: 'flex-start',
  },
  summaryPrimaryValue: {
    fontSize: 32,
    fontFamily: Typography.family.bold,
    letterSpacing: -0.8,
    fontVariant: ['tabular-nums'],
    lineHeight: 34,
  },
  summaryPrimaryLabel: {
    fontSize: 11,
    fontFamily: Typography.family.medium,
    marginTop: 3,
    letterSpacing: 0.1,
  },
  summaryPrimaryDivider: {
    width: StyleSheet.hairlineWidth,
    height: 36,
    backgroundColor: Colors.border,
  },
  summarySecondary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  summarySecondaryItem: {
    alignItems: 'center',
    flex: 1,
  },
  summarySecondaryValue: {
    fontSize: 17,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.3,
  },
  summarySecondaryLabel: {
    fontSize: 10,
    color: Colors.textMuted,
    fontFamily: Typography.family.regular,
    marginTop: 3,
    letterSpacing: 0.1,
  },
  // ── Tab bar — text-first, underline indicator, sticky container ──
  tabBarContainer: {
    backgroundColor: Colors.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: Space.md,
    gap: Space.md,
    height: 44,
    alignItems: 'center',
  },
  tab: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 2,
    position: 'relative',
  },
  tabPressed: {
    opacity: 0.5,
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
  tabCount: {
    fontSize: 12,
    color: Colors.textMuted,
    fontFamily: Typography.family.regular,
    fontVariant: ['tabular-nums'],
  },
  tabCountActive: {
    color: Colors.textSecondary,
  },
  tabIndicator: {
    position: 'absolute',
    bottom: -1,
    left: 2,
    right: 2,
    height: 2,
    backgroundColor: Colors.textPrimary,
    borderRadius: 1,
  },
  // ── List ──
  listContent: {
    paddingBottom: Space.xl,
  },
  // ── Inventory row — horizontal, operations studio ──
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.md,
    paddingVertical: Space.sm,
    paddingHorizontal: Space.md,
  },
  rowImageWrap: {
    position: 'relative',
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  rowImageContainer: {
    width: ROW_IMAGE_SIZE,
    height: ROW_IMAGE_SIZE,
  },
  rowImage: {
    width: ROW_IMAGE_SIZE,
    height: ROW_IMAGE_SIZE,
  },
  rowImagePlaceholder: {
    width: ROW_IMAGE_SIZE,
    height: ROW_IMAGE_SIZE,
    backgroundColor: Colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.md,
  },
  rowLiveDot: {
    position: 'absolute',
    top: 6,
    left: 6,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.danger,
    borderWidth: 1.5,
    borderColor: Colors.background,
  },
  rowBody: {
    flex: 1,
    minHeight: ROW_IMAGE_SIZE,
    justifyContent: 'space-between',
  },
  rowIdentity: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Space.sm,
  },
  rowTitle: {
    flex: 1,
    fontSize: 15,
    color: Colors.textPrimary,
    fontFamily: Typography.family.semibold,
    lineHeight: 19,
    letterSpacing: -0.2,
  },
  rowStateText: {
    fontSize: 11,
    fontFamily: Typography.family.semibold,
    letterSpacing: 0.2,
    paddingTop: 3,
  },
  rowBrand: {
    fontSize: 12,
    color: Colors.textMuted,
    fontFamily: Typography.family.regular,
    marginTop: 2,
  },
  rowHairline: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border,
    marginVertical: Space.sm - 2,
  },
  rowOperational: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: Space.sm,
  },
  rowValueCol: {
    flex: 1,
    gap: 1,
  },
  rowIze: {
    fontSize: 17,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.4,
    lineHeight: 21,
  },
  rowValuePrefix: {
    fontSize: 11,
    fontFamily: Typography.family.medium,
    color: Colors.textSecondary,
    fontVariant: ['tabular-nums'],
    letterSpacing: 0.1,
  },
  rowLocal: {
    fontSize: 11,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.1,
  },
  rowActionCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 1,
    paddingBottom: 1,
  },
  rowActionLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontFamily: Typography.family.medium,
    letterSpacing: 0.1,
  },
  rowActionChevron: {
    marginTop: 1,
  },
  rowLeadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Space.sm,
    marginTop: 4,
  },
  rowLeading: {
    flex: 1,
    fontSize: 12,
    fontFamily: Typography.family.regular,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.1,
  },
  rowBidCount: {
    fontSize: 12,
    color: Colors.textMuted,
    fontFamily: Typography.family.regular,
    fontVariant: ['tabular-nums'],
  },
  rowSeparator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border,
    marginHorizontal: Space.md,
  },
  // ── Loading ──
  loadingWrap: {
    paddingTop: Space.md,
    gap: Space.md,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.md,
    paddingVertical: Space.sm,
    paddingHorizontal: Space.md,
  },
  loadingBody: {
    flex: 1,
    gap: Space.xs,
  },
  loadingTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Space.sm,
  },
  loadingHairline: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border,
    marginVertical: Space.xs,
  },
  // ── Inline empty / error states ──
  inlineStateWrap: {
    paddingTop: Space.xl * 2,
    paddingHorizontal: Space.md,
    alignItems: 'flex-start',
  },
  inlineStateTitle: {
    fontSize: 17,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
    letterSpacing: -0.3,
  },
  inlineStateMessage: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontFamily: Typography.family.regular,
    marginTop: 6,
    lineHeight: 20,
  },
  retryBtn: {
    marginTop: Space.md,
    paddingVertical: Space.sm,
    paddingHorizontal: Space.lg,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceAlt,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryBtnPressed: {
    opacity: 0.6,
  },
  retryBtnText: {
    fontSize: 14,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
  },
  inlineCtaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: Space.md,
    paddingVertical: Space.sm,
    paddingHorizontal: Space.lg,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.brand,
    minHeight: 44,
  },
  inlineCtaPressed: {
    opacity: 0.6,
  },
  inlineCtaText: {
    fontSize: 14,
    fontFamily: Typography.family.semibold,
    color: Colors.brand,
  },
  inlineCtaIcon: {
    marginTop: 1,
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
    left: Space.md,
    right: Space.md,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.12,
        shadowRadius: 12,
      },
      android: {
        elevation: 4,
      },
    }),
  },
});
