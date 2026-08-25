import React, { useMemo, useCallback } from 'react';
import { View, StyleSheet, StatusBar, RefreshControl, Text, Pressable, ScrollView } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { RootStackParamList } from '../navigation/types';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { EmptyState } from '../components/EmptyState';
import { OfflineBanner } from '../components/OfflineBanner';
import { useConnectivity } from '../hooks/useConnectivity';
import { TradeHeader } from '../components/trade';
import { SkeletonLoader } from '../components/SkeletonLoader';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { CachedImage } from '../components/CachedImage';
import { Meta, Body, BodyEmphasis } from '../components/ui/Text';
import { Space, Radius, Type, Typography, Control, LetterSpacing } from '../theme/designTokens';
import { getMyAuctionBids, getWatchlist, type MyAuctionBid, type MarketAuction } from '../services/marketApi';
import { haptics } from '../utils/haptics';
import { useBucketedServerClock } from '../hooks/useServerClock';
import { DEFAULT_CURRENCY_CODE } from '../constants/currencies';

type NavT = NativeStackNavigationProp<RootStackParamList>;

type BidFilter = 'all' | 'active' | 'watching' | 'leading' | 'outbid' | 'won' | 'lost';

type ActivityItem = {
  id: string;
  auctionId: string;
  title: string;
  imageUrl: string | null;
  amountGbp: number;
  currentBidGbp: number;
  bidCount: number;
  bidState: MyAuctionBid['bidState'] | 'watching';
  endsAt: string;
  createdAt: string;
  sellerUsername: string;
  lifecycle: string;
  terminalReason: string | null;
};

const BID_FILTERS: Array<{ value: BidFilter; label: string; accessibilityLabel: string }> = [
  { value: 'active', label: 'Active', accessibilityLabel: 'Show active bids where you are leading or outbid' },
  { value: 'won', label: 'Won', accessibilityLabel: 'Show won auctions' },
  { value: 'lost', label: 'Lost', accessibilityLabel: 'Show lost bids' },
];

const WATCHING_FILTER: { value: BidFilter; label: string; accessibilityLabel: string } = {
  value: 'watching',
  label: 'Watching',
  accessibilityLabel: 'Show watched auctions',
};

function marketAuctionToActivity(a: MarketAuction): ActivityItem {
  return {
    id: a.id,
    auctionId: a.id,
    title: a.title,
    imageUrl: a.imageUrl,
    amountGbp: 0,
    currentBidGbp: a.currentBidGbp,
    bidCount: a.bidCount,
    bidState: 'watching',
    endsAt: a.endsAt,
    createdAt: a.createdAt,
    sellerUsername: a.seller.username,
    lifecycle: a.lifecycle,
    terminalReason: a.terminalReason,
  };
}

function bidToActivity(b: MyAuctionBid): ActivityItem {
  return {
    id: String(b.id),
    auctionId: b.auctionId,
    title: b.auction.title,
    imageUrl: b.auction.imageUrl,
    amountGbp: b.amountGbp,
    currentBidGbp: b.auction.currentBidGbp,
    bidCount: b.auction.bidCount,
    bidState: b.bidState,
    endsAt: b.auction.endsAt,
    createdAt: b.createdAt,
    sellerUsername: b.auction.sellerUsername,
    lifecycle: b.auction.lifecycle,
    terminalReason: b.auction.terminalReason,
  };
}

function getStateInfo(state: ActivityItem['bidState'], colors: ThemeColors): { label: string; color: string; icon: keyof typeof Ionicons.glyphMap; nextAction: string } {
  if (state === 'won') return { label: 'Won', color: colors.success, icon: 'trophy-outline', nextAction: 'View result' };
  if (state === 'lost') return { label: 'Lost', color: colors.textMuted, icon: 'close-circle-outline', nextAction: 'Browse more' };
  if (state === 'outbid') return { label: "You're outbid", color: colors.danger, icon: 'trending-down', nextAction: 'Bid again' };
  if (state === 'leading') return { label: "You're winning", color: colors.success, icon: 'trending-up', nextAction: 'View auction' };
  if (state === 'watching') return { label: 'Watching', color: colors.textSecondary, icon: 'eye-outline', nextAction: 'View auction' };
  return { label: 'Active', color: colors.brand, icon: 'hammer-outline', nextAction: 'View auction' };
}

function formatActivityTime(endsAt: string, lifecycle: string, nowMs: number): string {
  const end = new Date(endsAt);
  const now = new Date(nowMs);
  const diff = end.getTime() - now.getTime();

  if (lifecycle === 'ended' || lifecycle === 'settled') return 'Ended';
  if (lifecycle === 'cancelled') return 'Cancelled';
  if (diff <= 0) return 'Ended';

  const hours = Math.floor(diff / (60 * 60 * 1000));
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d left`;
  if (hours > 0) return `${hours}h left`;
  const minutes = Math.floor(diff / (60 * 1000));
  return `${minutes}m left`;
}

export default function MyBidsScreen() {
  const navigation = useNavigation<NavT>();
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { formatFromFiat } = useFormattedPrice();
  const { isOffline } = useConnectivity();
  const { minuteClock } = useBucketedServerClock(null);

  const [filter, setFilter] = React.useState<BidFilter>('active');
  const [endingSoonest, setEndingSoonest] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);
  const [items, setItems] = React.useState<ActivityItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [nextCursor, setNextCursor] = React.useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = React.useState(false);

  const fetchItems = React.useCallback(async (status: BidFilter, cursor?: string) => {
    try {
      if (status === 'watching') {
        const result = await getWatchlist(cursor);
        const mapped = result.items.map(marketAuctionToActivity);
        if (cursor) {
          setItems((prev) => [...prev, ...mapped]);
        } else {
          setItems(mapped);
        }
        setNextCursor(result.nextCursor);
      } else if (status === 'active') {
        // "Active" = leading + outbid, fetched in parallel
        const [leadingResult, outbidResult] = await Promise.all([
          getMyAuctionBids('leading', cursor),
          getMyAuctionBids('outbid', cursor),
        ]);
        const mapped = [
          ...leadingResult.items.map(bidToActivity),
          ...outbidResult.items.map(bidToActivity),
        ];
        if (cursor) {
          setItems((prev) => [...prev, ...mapped]);
        } else {
          setItems(mapped);
        }
        setNextCursor(leadingResult.nextCursor ?? outbidResult.nextCursor ?? null);
      } else {
        const apiStatus = status === 'all' ? 'all' : status;
        const result = await getMyAuctionBids(apiStatus as 'leading' | 'outbid' | 'won' | 'lost' | 'all', cursor);
        const mapped = result.items.map(bidToActivity);
        if (cursor) {
          setItems((prev) => [...prev, ...mapped]);
        } else {
          setItems(mapped);
        }
        setNextCursor(result.nextCursor);
      }
      setError(null);
    } catch {
      setError('Failed to load activity');
    } finally {
      setLoading(false);
      setRefreshing(false);
      setIsLoadingMore(false);
    }
  }, []);

  // Sort items by ending soonest when the toggle is active
  const sortedItems = React.useMemo(() => {
    if (!endingSoonest) return items;
    return [...items].sort((a, b) => {
      const aTime = new Date(a.endsAt ?? 0).getTime();
      const bTime = new Date(b.endsAt ?? 0).getTime();
      return aTime - bTime;
    });
  }, [items, endingSoonest]);

  React.useEffect(() => {
    setLoading(true);
    void fetchItems(filter);
  }, [filter, fetchItems]);

  const handleRefresh = React.useCallback(() => {
    setRefreshing(true);
    void fetchItems(filter);
  }, [fetchItems, filter]);

  const loadMore = React.useCallback(() => {
    if (!nextCursor || isLoadingMore) return;
    setIsLoadingMore(true);
    void fetchItems(filter, nextCursor);
  }, [nextCursor, isLoadingMore, fetchItems, filter]);

  const renderBidItem = useCallback(({ item }: { item: ActivityItem }) => {
    const stateInfo = getStateInfo(item.bidState, colors);
    return (
      <AnimatedPressable
        style={styles.activityRow}
        onPress={() => navigation.navigate('AuctionDetail', {
          auctionId: item.auctionId,
          // One-tap rebid: auto-open BidSheet when the user is outbid
          openBidSheet: item.bidState === 'outbid',
        })}
        activeOpacity={0.92}
        scaleValue={0.985}
        accessibilityRole="button"
        accessibilityLabel={`${item.title}, ${stateInfo.label}, your bid ${formatFromFiat(item.amountGbp, DEFAULT_CURRENCY_CODE)}`}
        accessibilityHint={item.bidState === 'outbid' ? 'Opens auction with bid sheet ready to place a new bid' : 'Opens auction details'}
      >
        {/* Edge-aligned imagery */}
        <View style={styles.activityImageWrap}>
          {item.imageUrl ? (
            <CachedImage
              uri={item.imageUrl}
              style={styles.activityImage}
              containerStyle={styles.activityImageContainer}
              contentFit="cover"
            />
          ) : (
            <View style={styles.activityImagePlaceholder}>
              <Ionicons name="image-outline" size={18} color={colors.textMuted} />
            </View>
          )}
        </View>

        {/* Content — answers all activity questions */}
        <View style={styles.activityBody}>
          <BodyEmphasis style={styles.activityTitle} numberOfLines={1}>{item.title}</BodyEmphasis>
          <View style={styles.activityStateRow}>
            <Ionicons name={stateInfo.icon} size={14} color={stateInfo.color} />
            <Text style={[styles.activityState, { color: stateInfo.color }]}>
              {stateInfo.label}
            </Text>
          </View>
          <View style={styles.activityPriceRow}>
            {item.amountGbp > 0 && (
              <View>
                <Meta style={styles.activityPriceLabel}>Your bid</Meta>
                <Body style={styles.activityPriceValue} numberOfLines={1}>
                  {formatFromFiat(item.amountGbp, DEFAULT_CURRENCY_CODE, { izeFractionDigits: 3 })}
                </Body>
              </View>
            )}
            {item.currentBidGbp > 0 && (
              <View style={[item.amountGbp > 0 && styles.activityPriceCol]}>
                <Meta style={styles.activityPriceLabel}>Current</Meta>
                <Body style={styles.activityPriceValue} numberOfLines={1}>
                  {formatFromFiat(item.currentBidGbp, DEFAULT_CURRENCY_CODE, { izeFractionDigits: 3 })}
                </Body>
              </View>
            )}
          </View>
          <View style={styles.activityMetaRow}>
            <View style={styles.activityMetaCol}>
              <Meta style={styles.activityMetaLabel}>Time</Meta>
              <Text style={styles.activityMetaValue}>{formatActivityTime(item.endsAt, item.lifecycle, minuteClock)}</Text>
            </View>
            {(item.bidState === 'won' || item.bidState === 'lost') && (
              <View style={styles.activityMetaCol}>
                <Meta style={styles.activityMetaLabel}>Result</Meta>
                <Text style={[styles.activityMetaValue, { color: stateInfo.color }]}>
                  {item.bidState === 'won' ? 'Won' : 'Lost'}
                </Text>
              </View>
            )}
            {item.bidState === 'outbid' && (
              <Pressable
                style={({ pressed }) => [styles.bidAgainBtn, pressed && { opacity: 0.8 }]}
                onPress={() => navigation.navigate('AuctionDetail', {
                  auctionId: item.auctionId,
                  openBidSheet: true,
                })}
                accessibilityRole="button"
                accessibilityLabel={`Bid again on ${item.title}`}
              >
                <Ionicons name="trending-up" size={12} color={colors.textInverse} />
                <Text style={styles.bidAgainText}>Bid again</Text>
              </Pressable>
            )}
            {item.bidState !== 'outbid' && (
              <View style={styles.activityNextRow}>
                <Text style={styles.activityNextText}>{stateInfo.nextAction}</Text>
                <Ionicons name="chevron-forward" size={14} color={colors.brand} />
              </View>
            )}
          </View>
        </View>
      </AnimatedPressable>
    );
  }, [
    colors,
    styles,
    navigation,
    formatFromFiat,
  ]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle={!isDark ? 'dark-content' : 'light-content'} />

      <TradeHeader title="Auction Activity" onBack={() => navigation.goBack()} />

      {/* State rail — separated bid filters and watching */}
      <ScrollView
        horizontal
        style={styles.stateRail}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.stateRailContent}
      >
          {BID_FILTERS.map((opt) => (
            <Pressable
              key={opt.value}
              style={({ pressed }) => [styles.stateRailTab, filter === opt.value && styles.stateRailTabActive, pressed && styles.stateRailTabPressed]}
              onPress={() => { haptics.selection(); setFilter(opt.value); }}
              accessibilityRole="button"
              accessibilityLabel={opt.accessibilityLabel}
              accessibilityState={{ selected: filter === opt.value }}
            >
              <Text style={[styles.stateRailText, filter === opt.value && styles.stateRailTextActive]}>
                {opt.label}
              </Text>
            </Pressable>
          ))}
          <Pressable
            key={WATCHING_FILTER.value}
            style={({ pressed }) => [styles.stateRailTab, filter === WATCHING_FILTER.value && styles.stateRailTabActive, pressed && styles.stateRailTabPressed]}
            onPress={() => { haptics.selection(); setFilter(WATCHING_FILTER.value); }}
            accessibilityRole="button"
            accessibilityLabel={WATCHING_FILTER.accessibilityLabel}
            accessibilityState={{ selected: filter === WATCHING_FILTER.value }}
          >
            <Text style={[styles.stateRailText, filter === WATCHING_FILTER.value && styles.stateRailTextActive]}>
              {WATCHING_FILTER.label}
            </Text>
          </Pressable>
          {/* Ending-soonest sort toggle — integrated into filter rail */}
          {(filter === 'all' || filter === 'active' || filter === 'outbid' || filter === 'leading') && items.length > 1 && (
            <>
              <Pressable
                style={[styles.stateRailTab, styles.sortChip, endingSoonest && styles.stateRailTabActive]}
                onPress={() => { haptics.selection(); setEndingSoonest((v) => !v); }}
                accessibilityRole="button"
                accessibilityLabel={endingSoonest ? 'Stop sorting by ending soonest' : 'Sort by ending soonest'}
                accessibilityState={{ checked: endingSoonest }}
              >
                <Ionicons name="time-outline" size={14} color={endingSoonest ? colors.textPrimary : colors.textMuted} />
                <Text style={[styles.stateRailText, endingSoonest && styles.stateRailTextActive]}>
                  Ending soonest
                </Text>
              </Pressable>
            </>
          )}
        </ScrollView>

      {isOffline && sortedItems.length > 0 ? (
        <OfflineBanner onRetry={() => void handleRefresh()} />
      ) : null}

      <FlashList
        data={sortedItems}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        renderItem={renderBidItem}
        ListEmptyComponent={
          loading ? (
            <View style={styles.loadingWrap}>
              {[0, 1, 2].map((i) => (
                <SkeletonLoader key={i} width="100%" height={80} borderRadius={Radius.none} style={{ marginBottom: Space.sm }} />
              ))}
            </View>
          ) : error ? (
            <EmptyState
              icon="cloud-offline-outline"
              title={isOffline ? 'You are offline' : "Couldn't load bids"}
              subtitle={isOffline ? 'Check your connection and try again.' : error}
              ctaLabel="Retry"
              onCtaPress={() => { setError(null); setLoading(true); void fetchItems(filter); }}
            />
          ) : (
            <EmptyState
              icon="hammer-outline"
              title={filter === 'won' ? 'No wins yet' : filter === 'lost' ? 'No lost bids' : filter === 'active' ? 'No active bids' : filter === 'watching' ? 'Not watching anything' : 'No activity yet'}
              subtitle={filter === 'won' ? 'Auctions you win appear here.' : filter === 'lost' ? "Bids you didn't win appear here." : filter === 'active' ? 'Active bids where you are leading or outbid appear here.' : filter === 'watching' ? 'Auctions you watch appear here.' : 'Bids you place appear here.'}
            />
          )
        }
        ListFooterComponent={
          isLoadingMore ? (
            <View style={styles.loadMoreWrap}>
              <SkeletonLoader width="100%" height={80} borderRadius={Radius.none} />
            </View>
          ) : null
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.brand}
            colors={[colors.brand]}
            progressBackgroundColor={colors.surfaceAlt}
          />
        }
      />
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  stateRail: {
    flexGrow: 0,
    flexShrink: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  stateRailContent: {
    paddingHorizontal: Space.md,
    alignItems: 'center',
    minHeight: Control.hit,
    gap: Space.md,
  },
  stateRailTab: {
    minHeight: Control.hit,
    paddingHorizontal: Space.xs,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  stateRailTabActive: {
    borderBottomColor: colors.brand,
  },
  stateRailTabPressed: {
    opacity: 0.62,
  },
  stateRailText: {
    fontSize: Type.caption.size,
    color: colors.textSecondary,
    fontFamily: Typography.family.medium,
  },
  stateRailTextActive: {
    color: colors.textPrimary,
    fontFamily: Typography.family.semibold,
  },
  sortChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs / 2 + 1,
  },
  listContent: {
    paddingHorizontal: Space.md,
    paddingBottom: Space.xl,
  },
  loadingWrap: {
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
  },
  loadMoreWrap: {
    paddingVertical: Space.sm,
  },
  // ── Activity row — edge-aligned imagery, no bordered card ──
  activityRow: {
    flexDirection: 'row',
    paddingVertical: Space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: Space.sm,
  },
  activityImageWrap: {
    marginRight: Space.sm,
  },
  activityImage: {
    width: Space.xxl + Space.xxl + Space.xl - 8,
    height: Space.xxl + Space.xxl + Space.xl - 8,
    borderRadius: Radius.md,
  },
  activityImageContainer: {
    width: Space.xxl + Space.xxl + Space.xl - 8,
    height: Space.xxl + Space.xxl + Space.xl - 8,
    borderRadius: Radius.md,
  },
  activityImagePlaceholder: {
    width: Space.xxl + Space.xxl + Space.xl - 8,
    height: Space.xxl + Space.xxl + Space.xl - 8,
    borderRadius: Radius.md,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityBody: {
    flex: 1,
    justifyContent: 'space-between',
  },
  activityTitle: {
    fontSize: Type.body.size,
    marginBottom: Space.xs,
  },
  activityStateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    marginBottom: Space.xs + 2,
  },
  activityState: {
    fontSize: Type.caption.size,
    fontWeight: '600',
    fontFamily: Typography.family.semibold,
  },
  activityPriceRow: {
    flexDirection: 'row',
    gap: Space.md,
    marginBottom: Space.xs,
  },
  activityPriceCol: {
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: colors.border,
    paddingLeft: Space.md,
  },
  activityPriceLabel: {
    fontSize: Type.meta.size - 1,
    color: colors.textMuted,
    fontFamily: Typography.family.semibold,
    letterSpacing: LetterSpacing.caps,
    textTransform: 'uppercase',
    marginBottom: Space.xs / 2,
  },
  activityPriceValue: {
    fontSize: Type.body.size,
    fontWeight: '600',
    color: colors.textPrimary,
    fontFamily: Typography.family.semibold,
    fontVariant: ['tabular-nums'],
  },
  activityMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    marginTop: Space.xs,
  },
  activityMetaCol: {
    alignItems: 'flex-start',
  },
  activityMetaLabel: {
    fontSize: Type.meta.size - 1,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: LetterSpacing.caps,
  },
  activityMetaValue: {
    fontSize: Type.caption.size,
    color: colors.textSecondary,
    fontFamily: Typography.family.medium,
    marginTop: Space.xs / 4,
  },
  activityNextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs / 2 + 1,
    marginLeft: 'auto',
  },
  activityNextText: {
    fontSize: Type.caption.size,
    color: colors.brand,
    fontFamily: Typography.family.semibold,
  },
  bidAgainBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs / 2 + 1,
    backgroundColor: colors.danger,
    borderRadius: Radius.full,
    paddingHorizontal: Space.sm + 2,
    paddingVertical: Space.xs + 2,
    minHeight: Control.chromeCompact,
    marginLeft: 'auto',
  },
  bidAgainText: {
    fontSize: Type.caption.size,
    color: colors.textInverse,
    fontFamily: Typography.family.bold,
  },
  });
}
