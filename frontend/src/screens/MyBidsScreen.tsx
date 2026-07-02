import React from 'react';
import { View, StyleSheet, StatusBar, RefreshControl, Text, Pressable, ScrollView } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { ActiveTheme, Colors } from '../constants/colors';
import { RootStackParamList } from '../navigation/types';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { EmptyState } from '../components/EmptyState';
import { TradeHeader } from '../components/trade';
import { SkeletonLoader } from '../components/SkeletonLoader';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { CachedImage } from '../components/CachedImage';
import { Meta, Body, BodyEmphasis } from '../components/ui/Text';
import { Space, Radius } from '../theme/designTokens';
import { Motion } from '../constants/motion';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { getMyAuctionBids, getWatchlist, type MyAuctionBid, type MarketAuction } from '../services/marketApi';
import { useCurrencyContext } from '../context/CurrencyContext';
import { toIze, formatIzeAmount } from '../utils/currency';

type NavT = StackNavigationProp<RootStackParamList>;

type BidFilter = 'all' | 'watching' | 'leading' | 'outbid' | 'won' | 'lost';

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
  { value: 'all', label: 'All', accessibilityLabel: 'Show all bid activity' },
  { value: 'leading', label: 'Leading', accessibilityLabel: 'Show bids where you are leading' },
  { value: 'outbid', label: 'Outbid', accessibilityLabel: 'Show bids where you have been outbid' },
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

function getStateInfo(state: ActivityItem['bidState']): { label: string; color: string; icon: keyof typeof Ionicons.glyphMap; nextAction: string } {
  if (state === 'won') return { label: 'Won', color: Colors.success, icon: 'trophy-outline', nextAction: 'View result' };
  if (state === 'lost') return { label: 'Lost', color: Colors.textMuted, icon: 'close-circle-outline', nextAction: 'Browse more' };
  if (state === 'outbid') return { label: 'Outbid', color: Colors.danger, icon: 'trending-down', nextAction: 'Bid again' };
  if (state === 'leading') return { label: 'Leading', color: Colors.success, icon: 'trending-up', nextAction: 'View auction' };
  if (state === 'watching') return { label: 'Watching', color: Colors.textSecondary, icon: 'eye-outline', nextAction: 'View auction' };
  return { label: 'Active', color: Colors.brand, icon: 'hammer-outline', nextAction: 'View auction' };
}

function formatActivityTime(endsAt: string, lifecycle: string): string {
  const end = new Date(endsAt);
  const now = new Date();
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
  const { formatFromFiat } = useFormattedPrice();
  const { goldRates, displayMode } = useCurrencyContext();
  const reducedMotionEnabled = useReducedMotion();

  const [filter, setFilter] = React.useState<BidFilter>('all');
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

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'} />

      <TradeHeader title="Auction Activity" onBack={() => navigation.goBack()} />

      {/* State rail — separated bid filters and watching */}
      <Reanimated.View
        entering={reducedMotionEnabled ? undefined : FadeInDown.duration(350).delay(0)}
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.stateRailContent}
        >
          {BID_FILTERS.map((opt) => (
            <Pressable
              key={opt.value}
              style={[styles.stateRailChip, filter === opt.value && styles.stateRailChipActive]}
              onPress={() => setFilter(opt.value)}
              accessibilityRole="button"
              accessibilityLabel={opt.accessibilityLabel}
            >
              <Text style={[styles.stateRailText, filter === opt.value && styles.stateRailTextActive]}>
                {opt.label}
              </Text>
            </Pressable>
          ))}
          <View style={styles.filterDivider} />
          <Pressable
            key={WATCHING_FILTER.value}
            style={[styles.stateRailChip, filter === WATCHING_FILTER.value && styles.stateRailChipActive]}
            onPress={() => setFilter(WATCHING_FILTER.value)}
            accessibilityRole="button"
            accessibilityLabel={WATCHING_FILTER.accessibilityLabel}
          >
            <Text style={[styles.stateRailText, filter === WATCHING_FILTER.value && styles.stateRailTextActive]}>
              {WATCHING_FILTER.label}
            </Text>
          </Pressable>
        </ScrollView>
      </Reanimated.View>

      <FlashList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        renderItem={({ item, index }) => {
          const stateInfo = getStateInfo(item.bidState);
          return (
            <Reanimated.View
              entering={
                reducedMotionEnabled
                  ? undefined
                  : FadeInDown
                      .duration(Motion.list.enterDuration)
                      .delay(Math.min(index, Motion.list.maxStaggerItems) * Motion.list.staggerStep)
              }
            >
              <AnimatedPressable
                style={styles.activityRow}
                onPress={() => navigation.navigate('AuctionDetail', { auctionId: item.auctionId })}
                activeOpacity={0.92}
                scaleValue={0.985}
                accessibilityRole="button"
                accessibilityLabel={`${item.title}, ${stateInfo.label}, your bid ${formatFromFiat(item.amountGbp, 'GBP')}`}
                accessibilityHint="Opens auction details"
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
                      <Ionicons name="image-outline" size={18} color={Colors.textMuted} />
                    </View>
                  )}
                </View>

                {/* Content — answers all activity questions */}
                <View style={styles.activityBody}>
                  <BodyEmphasis style={styles.activityTitle} numberOfLines={1}>{item.title}</BodyEmphasis>
                  <View style={styles.activityStateRow}>
                    <Ionicons name={stateInfo.icon} size={12} color={stateInfo.color} />
                    <Text style={[styles.activityState, { color: stateInfo.color }]}>
                      {stateInfo.label}
                    </Text>
                  </View>
                  <View style={styles.activityPriceRow}>
                    {item.amountGbp > 0 && (
                      <View>
                        <Meta style={styles.activityPriceLabel}>Your bid</Meta>
                        <Body style={styles.activityPriceValue}>{formatFromFiat(item.amountGbp, 'GBP')}</Body>
                        {displayMode !== 'ize' && (
                          <Text style={styles.activityIzeText}>
                            {formatIzeAmount(toIze(item.amountGbp, 'GBP', goldRates))}
                          </Text>
                        )}
                      </View>
                    )}
                    {item.currentBidGbp > 0 && (
                      <View style={[item.amountGbp > 0 && styles.activityPriceCol]}>
                        <Meta style={styles.activityPriceLabel}>Current</Meta>
                        <Body style={styles.activityPriceValue}>{formatFromFiat(item.currentBidGbp, 'GBP')}</Body>
                        {displayMode !== 'ize' && (
                          <Text style={styles.activityIzeText}>
                            {formatIzeAmount(toIze(item.currentBidGbp, 'GBP', goldRates))}
                          </Text>
                        )}
                      </View>
                    )}
                  </View>
                  <View style={styles.activityMetaRow}>
                    <View style={styles.activityMetaCol}>
                      <Meta style={styles.activityMetaLabel}>Time</Meta>
                      <Text style={styles.activityMetaValue}>{formatActivityTime(item.endsAt, item.lifecycle)}</Text>
                    </View>
                    {(item.bidState === 'won' || item.bidState === 'lost') && (
                      <View style={styles.activityMetaCol}>
                        <Meta style={styles.activityMetaLabel}>Result</Meta>
                        <Text style={[styles.activityMetaValue, { color: stateInfo.color }]}>
                          {item.bidState === 'won' ? 'Won' : 'Lost'}
                        </Text>
                      </View>
                    )}
                    <View style={styles.activityNextRow}>
                      <Text style={styles.activityNextText}>{stateInfo.nextAction}</Text>
                      <Ionicons name="chevron-forward" size={11} color={Colors.brand} />
                    </View>
                  </View>
                </View>
              </AnimatedPressable>
            </Reanimated.View>
          );
        }}
        ListEmptyComponent={
          loading ? (
            <View style={styles.loadingWrap}>
              {[0, 1, 2].map((i) => (
                <SkeletonLoader key={i} width="100%" height={80} borderRadius={0} style={{ marginBottom: Space.sm }} />
              ))}
            </View>
          ) : (
            <EmptyState
              icon="hammer-outline"
              title={filter === 'won' ? 'No wins yet' : filter === 'lost' ? 'No lost bids' : filter === 'leading' ? 'Not leading any bids' : filter === 'outbid' ? 'No outbid bids' : filter === 'watching' ? 'Not watching anything' : 'No activity yet'}
              subtitle={filter === 'won' ? 'Auctions you win will appear here.' : filter === 'lost' ? 'Bids you did not win will appear here.' : filter === 'leading' ? 'Auctions where you have the top bid will appear here.' : filter === 'outbid' ? 'Auctions where someone outbid you will appear here.' : filter === 'watching' ? 'Auctions you watch will appear here.' : 'Bids you place on auctions will appear here.'}
            />
          )
        }
        ListFooterComponent={
          isLoadingMore ? (
            <View style={styles.loadMoreWrap}>
              <SkeletonLoader width="100%" height={80} borderRadius={0} />
            </View>
          ) : null
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={Colors.brand}
            colors={[Colors.brand]}
            progressBackgroundColor={Colors.surfaceAlt}
          />
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  stateRailContent: {
    paddingHorizontal: Space.md,
    gap: Space.xs,
    paddingBottom: Space.sm,
  },
  stateRailChip: {
    paddingHorizontal: Space.md,
    paddingVertical: 10,
    minHeight: 36,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  stateRailChipActive: {
    backgroundColor: Colors.brand,
    borderColor: Colors.brand,
  },
  stateRailText: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontFamily: 'Inter_500Medium',
  },
  stateRailTextActive: {
    color: Colors.textInverse,
    fontFamily: 'Inter_600SemiBold',
  },
  filterDivider: {
    width: 1,
    height: 20,
    backgroundColor: Colors.border,
    alignSelf: 'center',
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
    borderBottomColor: Colors.border,
    gap: Space.sm,
  },
  activityImageWrap: {
    marginRight: Space.sm,
  },
  activityImage: {
    width: 80,
    height: 80,
    borderRadius: Radius.md,
  },
  activityImageContainer: {
    width: 80,
    height: 80,
    borderRadius: Radius.md,
  },
  activityImagePlaceholder: {
    width: 80,
    height: 80,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityBody: {
    flex: 1,
    justifyContent: 'space-between',
  },
  activityTitle: {
    fontSize: 14,
    marginBottom: 4,
  },
  activityStateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 6,
  },
  activityState: {
    fontSize: 12,
    fontWeight: '600',
    fontFamily: 'Inter_600SemiBold',
  },
  activityPriceRow: {
    flexDirection: 'row',
    gap: Space.md,
    marginBottom: 4,
  },
  activityPriceCol: {
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: Colors.border,
    paddingLeft: Space.md,
  },
  activityPriceLabel: {
    fontSize: 10,
    color: Colors.textMuted,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  activityPriceValue: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimary,
    fontFamily: 'Inter_600SemiBold',
  },
  activityIzeText: {
    fontSize: 11,
    color: Colors.textMuted,
    fontFamily: 'Inter_400Regular',
    marginTop: 1,
  },
  activityMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    marginTop: 4,
  },
  activityMetaCol: {
    alignItems: 'flex-start',
  },
  activityMetaLabel: {
    fontSize: 10,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  activityMetaValue: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontFamily: 'Inter_500Medium',
    marginTop: 1,
  },
  activityNextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginLeft: 'auto',
  },
  activityNextText: {
    fontSize: 12,
    color: Colors.brand,
    fontFamily: 'Inter_600SemiBold',
  },
});
