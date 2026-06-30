import React from 'react';
import { View, StyleSheet, StatusBar, RefreshControl, Text } from 'react-native';
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
import { AppSegmentControl } from '../components/ui/AppSegmentControl';
import { SkeletonLoader } from '../components/SkeletonLoader';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { CachedImage } from '../components/CachedImage';
import { Meta, Body, BodyEmphasis } from '../components/ui/Text';
import { Space, Radius } from '../theme/designTokens';
import { Motion } from '../constants/motion';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { getMyAuctionBids, type MyAuctionBid } from '../services/marketApi';

type NavT = StackNavigationProp<RootStackParamList>;

type BidFilter = 'all' | 'active' | 'won' | 'lost';

const FILTER_OPTIONS: Array<{ value: BidFilter; label: string; accessibilityLabel: string }> = [
  { value: 'all', label: 'ALL', accessibilityLabel: 'Show all activity' },
  { value: 'active', label: 'ACTIVE', accessibilityLabel: 'Show active bids' },
  { value: 'won', label: 'WON', accessibilityLabel: 'Show won auctions' },
  { value: 'lost', label: 'LOST', accessibilityLabel: 'Show lost bids' },
];

function getNextAction(bidState: MyAuctionBid['bidState']): { label: string; icon: keyof typeof Ionicons.glyphMap } {
  if (bidState === 'won') return { label: 'View result', icon: 'ribbon-outline' };
  if (bidState === 'lost') return { label: 'Browse more', icon: 'search-outline' };
  if (bidState === 'outbid') return { label: 'Bid again', icon: 'trending-up' };
  if (bidState === 'leading') return { label: 'View auction', icon: 'eye-outline' };
  return { label: 'View auction', icon: 'eye-outline' };
}

export default function MyBidsScreen() {
  const navigation = useNavigation<NavT>();
  const { formatFromFiat } = useFormattedPrice();
  const reducedMotionEnabled = useReducedMotion();

  const [filter, setFilter] = React.useState<BidFilter>('all');
  const [refreshing, setRefreshing] = React.useState(false);
  const [bids, setBids] = React.useState<MyAuctionBid[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const fetchBids = React.useCallback(async () => {
    try {
      const result = await getMyAuctionBids('all');
      setBids(result.items);
      setError(null);
    } catch (err) {
      setError('Failed to load bids');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  React.useEffect(() => {
    void fetchBids();
  }, [fetchBids]);

  const handleRefresh = React.useCallback(() => {
    setRefreshing(true);
    void fetchBids();
  }, [fetchBids]);

  const filteredBids = React.useMemo(() => {
    if (filter === 'all') return bids;
    if (filter === 'active') return bids.filter((b) => b.bidState === 'active' || b.bidState === 'leading' || b.bidState === 'outbid');
    return bids.filter((b) => b.bidState === filter);
  }, [bids, filter]);

  const statusLabel = (bidState: MyAuctionBid['bidState']): string => {
    if (bidState === 'won') return 'Won';
    if (bidState === 'lost') return 'Lost';
    if (bidState === 'leading') return 'Leading';
    if (bidState === 'outbid') return 'Outbid';
    return 'Active';
  };

  const statusColor = (bidState: MyAuctionBid['bidState']): string => {
    if (bidState === 'won') return Colors.success;
    if (bidState === 'lost') return Colors.textMuted;
    if (bidState === 'leading') return Colors.success;
    if (bidState === 'outbid') return Colors.danger;
    return Colors.brand;
  };

  const statusIcon = (bidState: MyAuctionBid['bidState']): keyof typeof Ionicons.glyphMap => {
    if (bidState === 'won') return 'trophy-outline';
    if (bidState === 'lost') return 'close-circle-outline';
    if (bidState === 'leading') return 'trending-up';
    if (bidState === 'outbid') return 'trending-down';
    return 'hammer-outline';
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'} />

      <TradeHeader title="Auction Activity" onBack={() => navigation.goBack()} />

      <Reanimated.View
        entering={reducedMotionEnabled ? undefined : FadeInDown.duration(350).delay(0)}
      >
        <View style={styles.filterWrap}>
          <AppSegmentControl
            options={FILTER_OPTIONS}
            value={filter}
            onChange={setFilter}
            fullWidth
          />
        </View>
      </Reanimated.View>

      <FlashList
        data={filteredBids}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        renderItem={({ item, index }) => (
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
              style={styles.bidCard}
              onPress={() => navigation.navigate('AuctionDetail', { auctionId: item.auctionId })}
              activeOpacity={0.92}
              scaleValue={0.985}
              accessibilityRole="button"
              accessibilityLabel={`${item.auction.title}, ${statusLabel(item.bidState)}, your bid ${formatFromFiat(item.amountGbp, 'GBP')}`}
              accessibilityHint="Opens auction details"
            >
              <View style={styles.bidCardImageWrap}>
                {item.auction.imageUrl ? (
                  <CachedImage
                    uri={item.auction.imageUrl}
                    style={styles.bidCardImage}
                    containerStyle={styles.bidCardImageContainer}
                    contentFit="cover"
                  />
                ) : (
                  <View style={styles.bidCardImagePlaceholder}>
                    <Ionicons name="image-outline" size={20} color={Colors.textMuted} />
                  </View>
                )}
              </View>
              <View style={styles.bidCardBody}>
                <BodyEmphasis style={styles.bidCardTitle} numberOfLines={1}>{item.auction.title}</BodyEmphasis>
                <View style={styles.bidCardStatusRow}>
                  <Ionicons name={statusIcon(item.bidState)} size={12} color={statusColor(item.bidState)} />
                  <Text style={[styles.bidCardStatus, { color: statusColor(item.bidState) }]}>
                    {statusLabel(item.bidState)}
                  </Text>
                </View>
                <View style={styles.bidCardPriceRow}>
                  <View>
                    <Meta style={styles.bidCardPriceLabel}>Your bid</Meta>
                    <Body style={styles.bidCardPriceValue}>{formatFromFiat(item.amountGbp, 'GBP')}</Body>
                  </View>
                  {item.auction.currentBidGbp > 0 && (
                    <View style={styles.bidCardCurrentCol}>
                      <Meta style={styles.bidCardPriceLabel}>Current</Meta>
                      <Body style={styles.bidCardPriceValue}>{formatFromFiat(item.auction.currentBidGbp, 'GBP')}</Body>
                    </View>
                  )}
                </View>
                <View style={styles.bidCardNextAction}>
                  <Ionicons name={getNextAction(item.bidState).icon} size={12} color={Colors.brand} />
                  <Text style={styles.bidCardNextActionText}>{getNextAction(item.bidState).label}</Text>
                </View>
              </View>
            </AnimatedPressable>
          </Reanimated.View>
        )}
        ListEmptyComponent={
          loading ? (
            <View style={styles.loadingWrap}>
              {[0, 1, 2].map((i) => (
                <SkeletonLoader key={i} width="100%" height={72} borderRadius={12} style={{ marginBottom: Space.sm }} />
              ))}
            </View>
          ) : (
            <EmptyState
              icon="hammer-outline"
              title={filter === 'won' ? 'No wins yet' : filter === 'lost' ? 'No lost bids' : filter === 'active' ? 'No active bids' : 'No bids yet'}
              subtitle={filter === 'won' ? 'Auctions you win will appear here.' : filter === 'lost' ? 'Bids you did not win will appear here.' : filter === 'active' ? 'Your active bids will appear here.' : 'Bids you place on auctions will appear here.'}
            />
          )
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
  filterWrap: {
    paddingHorizontal: Space.md,
    marginBottom: Space.sm,
  },
  listContent: {
    paddingHorizontal: Space.md,
    paddingBottom: Space.xl,
  },
  loadingWrap: {
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
  },
  bidCard: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Space.sm,
    marginBottom: Space.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  bidCardImageWrap: {
    marginRight: Space.sm,
  },
  bidCardImage: {
    width: 64,
    height: 64,
    borderRadius: Radius.sm,
  },
  bidCardImageContainer: {
    width: 64,
    height: 64,
    borderRadius: Radius.sm,
  },
  bidCardImagePlaceholder: {
    width: 64,
    height: 64,
    borderRadius: Radius.sm,
    backgroundColor: Colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bidCardBody: {
    flex: 1,
  },
  bidCardTitle: {
    fontSize: 14,
    marginBottom: 4,
  },
  bidCardStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 6,
  },
  bidCardStatus: {
    fontSize: 12,
    fontWeight: '600',
    fontFamily: 'Inter_600SemiBold',
  },
  bidCardPriceRow: {
    flexDirection: 'row',
    gap: Space.md,
  },
  bidCardCurrentCol: {
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: Colors.border,
    paddingLeft: Space.md,
  },
  bidCardPriceLabel: {
    fontSize: 11,
    color: Colors.textMuted,
    marginBottom: 2,
  },
  bidCardPriceValue: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimary,
    fontFamily: 'Inter_600SemiBold',
  },
  bidCardNextAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
  },
  bidCardNextActionText: {
    fontSize: 12,
    color: Colors.brand,
    fontFamily: 'Inter_600SemiBold',
  },
});
