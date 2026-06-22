import React from 'react';
import { View, StyleSheet, StatusBar, RefreshControl } from 'react-native';
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
import { TradeHeader, OrderHistoryRow } from '../components/trade';
import { AppSegmentControl } from '../components/ui/AppSegmentControl';
import { SkeletonLoader } from '../components/SkeletonLoader';
import { Space } from '../theme/designTokens';
import { Motion } from '../constants/motion';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { getMyAuctionBids, type MyAuctionBid } from '../services/marketApi';

type NavT = StackNavigationProp<RootStackParamList>;

type BidFilter = 'all' | 'active' | 'won' | 'lost';

const FILTER_OPTIONS: Array<{ value: BidFilter; label: string; accessibilityLabel: string }> = [
  { value: 'all', label: 'ALL', accessibilityLabel: 'Show all bids' },
  { value: 'active', label: 'ACTIVE', accessibilityLabel: 'Show active bids' },
  { value: 'won', label: 'WON', accessibilityLabel: 'Show won auctions' },
  { value: 'lost', label: 'LOST', accessibilityLabel: 'Show lost bids' },
];

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

  const statusLabel = (bidState: MyAuctionBid['bidState']): 'pending' | 'filled' | 'cancelled' => {
    if (bidState === 'won') return 'filled';
    if (bidState === 'lost') return 'cancelled';
    return 'pending';
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'} />

      <TradeHeader title="My Bids" onBack={() => navigation.goBack()} />

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
            <OrderHistoryRow
              id={String(item.id)}
              side="buy"
              type="market"
              assetTitle={item.auction.title}
              quantity={1}
              pricePerShare={formatFromFiat(item.amountGbp, 'GBP')}
              totalAmount={formatFromFiat(item.amountGbp, 'GBP')}
              status={statusLabel(item.bidState)}
              timestamp={item.createdAt}
              onPress={() => navigation.navigate('AuctionDetail', { auctionId: item.auctionId })}
            />
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
              title="No bids yet"
              subtitle="Bids you place on auctions will appear here."
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
    paddingBottom: Space.xl,
  },
  loadingWrap: {
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
  },
});
