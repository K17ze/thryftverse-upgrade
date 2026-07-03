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
import { AuctionValueLockup } from '../components/auction/AuctionValueLockup';
import { BodyEmphasis } from '../components/ui/Text';
import { Space, Radius, Typography } from '../theme/designTokens';
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

function getStateInfo(state: ActivityItem['bidState']): { label: string; color: string; nextAction: string } {
  if (state === 'won') return { label: 'Won', color: Colors.success, nextAction: 'View result' };
  if (state === 'lost') return { label: 'Lost', color: Colors.textMuted, nextAction: 'View result' };
  if (state === 'outbid') return { label: 'Outbid', color: Colors.danger, nextAction: 'Bid again' };
  if (state === 'leading') return { label: 'Leading', color: Colors.success, nextAction: 'View auction' };
  if (state === 'watching') return { label: 'Watching', color: Colors.textSecondary, nextAction: 'View auction' };
  return { label: 'Active', color: Colors.brand, nextAction: 'View auction' };
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
  const { goldRates } = useCurrencyContext();
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

      {/* State rail — text-first with underline indicator */}
      <Reanimated.View
        entering={reducedMotionEnabled ? undefined : FadeInDown.duration(350).delay(0)}
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.stateRailContent}
        >
          {BID_FILTERS.map((opt) => {
            const isActive = filter === opt.value;
            return (
              <Pressable
                key={opt.value}
                style={({ pressed }) => [styles.stateRailTab, pressed && styles.stateRailTabPressed]}
                onPress={() => setFilter(opt.value)}
                accessibilityRole="tab"
                accessibilityLabel={opt.accessibilityLabel}
                accessibilityState={{ selected: isActive }}
              >
                <Text style={[styles.stateRailText, isActive && styles.stateRailTextActive]}>
                  {opt.label}
                </Text>
                {isActive && <View style={styles.stateRailIndicator} />}
              </Pressable>
            );
          })}
          <View style={styles.filterDivider} />
          <Pressable
            key={WATCHING_FILTER.value}
            style={({ pressed }) => [styles.stateRailTab, pressed && styles.stateRailTabPressed]}
            onPress={() => setFilter(WATCHING_FILTER.value)}
            accessibilityRole="tab"
            accessibilityLabel={WATCHING_FILTER.accessibilityLabel}
            accessibilityState={{ selected: filter === WATCHING_FILTER.value }}
          >
            <Text style={[styles.stateRailText, filter === WATCHING_FILTER.value && styles.stateRailTextActive]}>
              {WATCHING_FILTER.label}
            </Text>
            {filter === WATCHING_FILTER.value && <View style={styles.stateRailIndicator} />}
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
          const isWatching = item.bidState === 'watching';
          const isTerminal = item.bidState === 'won' || item.bidState === 'lost';

          // Primary value: current for active/watching, final for terminal
          const primaryAmount = isTerminal
            ? item.currentBidGbp
            : item.currentBidGbp > 0 ? item.currentBidGbp : item.amountGbp;
          const primaryIze = primaryAmount > 0
            ? `${formatIzeAmount(toIze(primaryAmount, 'GBP', goldRates))} 1ZE`
            : null;
          const primaryLocal = primaryAmount > 0 ? formatFromFiat(primaryAmount, 'GBP') : null;
          const primaryState: 'current' | 'final' = isTerminal ? 'final' : 'current';

          // Secondary value: your bid for active, outcome for terminal
          const showYourBid = item.amountGbp > 0 && !isTerminal;
          const yourBidIze = showYourBid
            ? `${formatIzeAmount(toIze(item.amountGbp, 'GBP', goldRates))} 1ZE`
            : null;
          const yourBidLocal = showYourBid ? formatFromFiat(item.amountGbp, 'GBP') : null;

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
                accessibilityLabel={`${item.title}, ${stateInfo.label}, ${primaryLocal ?? 'no value'}`}
                accessibilityHint="Opens auction details"
              >
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

                <View style={styles.activityBody}>
                  {/* Title + personal state */}
                  <View style={styles.activityTitleRow}>
                    <BodyEmphasis style={styles.activityTitle} numberOfLines={2}>{item.title}</BodyEmphasis>
                    <Text style={[styles.activityStateBadge, { color: stateInfo.color }]}>
                      {stateInfo.label}
                    </Text>
                  </View>

                  {/* Primary value — AuctionValueLockup */}
                  {primaryIze && (
                    <AuctionValueLockup
                      izeText={primaryIze}
                      localText={primaryLocal}
                      state={primaryState}
                      scale="compact"
                    />
                  )}

                  {/* Secondary value — your bid or outcome */}
                  {showYourBid && yourBidIze && (
                    <Text style={styles.activitySecondaryValue}>
                      Your bid {yourBidIze}
                      {yourBidLocal ? ` · ${yourBidLocal}` : ''}
                    </Text>
                  )}

                  {/* Time + next action */}
                  <View style={styles.activityMetaRow}>
                    <Text style={styles.activityMetaValue}>
                      {formatActivityTime(item.endsAt, item.lifecycle)}
                    </Text>
                    <View style={styles.activityNextRow}>
                      <Text style={[styles.activityNextText, { color: stateInfo.color }]}>
                        {stateInfo.nextAction}
                      </Text>
                      <Ionicons name="chevron-forward" size={11} color={stateInfo.color} />
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
    gap: Space.md,
    paddingBottom: 0,
    height: 44,
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  stateRailTab: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 2,
    position: 'relative',
  },
  stateRailTabPressed: {
    opacity: 0.5,
  },
  stateRailText: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontFamily: 'Inter_500Medium',
  },
  stateRailTextActive: {
    color: Colors.textPrimary,
    fontFamily: 'Inter_600SemiBold',
  },
  stateRailIndicator: {
    position: 'absolute',
    bottom: -1,
    left: 2,
    right: 2,
    height: 2,
    backgroundColor: Colors.textPrimary,
    borderRadius: 1,
  },
  filterDivider: {
    width: StyleSheet.hairlineWidth,
    height: 20,
    backgroundColor: Colors.border,
    alignSelf: 'center',
    marginHorizontal: Space.xs,
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
  // ── Activity row — personal auction ledger ──
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
    gap: 4,
  },
  activityTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Space.sm,
  },
  activityTitle: {
    flex: 1,
    fontSize: 14,
    marginBottom: 0,
  },
  activityStateBadge: {
    fontSize: 12,
    fontFamily: Typography.family.semibold,
    paddingTop: 2,
  },
  activitySecondaryValue: {
    fontSize: 12,
    color: Colors.textMuted,
    fontFamily: Typography.family.regular,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.1,
  },
  activityMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Space.sm,
    marginTop: 2,
  },
  activityMetaValue: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontFamily: Typography.family.medium,
    fontVariant: ['tabular-nums'],
  },
  activityNextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  activityNextText: {
    fontSize: 12,
    fontFamily: Typography.family.medium,
  },
});
