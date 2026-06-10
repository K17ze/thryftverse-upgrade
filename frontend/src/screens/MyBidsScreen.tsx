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
import { useStore } from '../store/useStore';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { EmptyState } from '../components/EmptyState';
import { TradeHeader, OrderHistoryRow } from '../components/trade';
import { AppSegmentControl } from '../components/ui/AppSegmentControl';
import { Space } from '../theme/designTokens';
import { Motion } from '../constants/motion';
import { useReducedMotion } from '../hooks/useReducedMotion';

type NavT = StackNavigationProp<RootStackParamList>;

type BidFilter = 'all' | 'active' | 'won' | 'lost';

const FILTER_OPTIONS: Array<{ value: BidFilter; label: string; accessibilityLabel: string }> = [
  { value: 'all', label: 'ALL', accessibilityLabel: 'Show all bids' },
  { value: 'active', label: 'ACTIVE', accessibilityLabel: 'Show active bids' },
  { value: 'won', label: 'WON', accessibilityLabel: 'Show won auctions' },
  { value: 'lost', label: 'LOST', accessibilityLabel: 'Show lost bids' },
];

interface BidEntry {
  id: string;
  auctionId: string;
  title: string;
  amount: number;
  timestamp: string;
  status: 'active' | 'won' | 'lost';
}

export default function MyBidsScreen() {
  const navigation = useNavigation<NavT>();
  const { formatFromFiat } = useFormattedPrice();
  const currentUser = useStore((state) => state.currentUser);
  const marketLedger = useStore((state) => state.marketLedger);
  const customAuctions = useStore((state) => state.customAuctions);
  const auctionRuntime = useStore((state) => state.auctionRuntime);
  const reducedMotionEnabled = useReducedMotion();

  const viewerId = currentUser?.id ?? 'u1';
  const [filter, setFilter] = React.useState<BidFilter>('all');
  const [refreshing, setRefreshing] = React.useState(false);

  const bids = React.useMemo(() => {
    const entries: BidEntry[] = [];
    const auctionMap = new Map(customAuctions.map((a) => [a.id, a]));

    for (const entry of marketLedger) {
      if (entry.channel !== 'auction') continue;
      if (entry.action !== 'bid' && entry.action !== 'win') continue;

      const auction = auctionMap.get(entry.referenceId);
      const runtime = auctionRuntime[entry.referenceId];
      const isClosed = runtime?.closedAtMs || (auction?.endsAt ? new Date(auction.endsAt).getTime() < Date.now() : false);

      let status: BidEntry['status'] = 'active';
      if (entry.action === 'win') {
        status = 'won';
      } else if (isClosed) {
        const isWinner = runtime?.lastBidderId === viewerId;
        status = isWinner ? 'won' : 'lost';
      }

      entries.push({
        id: entry.id,
        auctionId: entry.referenceId,
        title: auction?.title ?? `Auction ${entry.referenceId.slice(0, 8)}`,
        amount: entry.amountGBP,
        timestamp: entry.timestamp,
        status,
      });
    }

    return entries;
  }, [marketLedger, customAuctions, auctionRuntime, viewerId]);

  const filteredBids = React.useMemo(() => {
    if (filter === 'all') return bids;
    return bids.filter((b) => b.status === filter);
  }, [bids, filter]);

  const handleRefresh = React.useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 800);
  }, []);

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
        keyExtractor={(item) => item.id}
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
              id={item.id}
              side={item.status === 'won' ? 'buy' : 'buy'}
              type="market"
              assetTitle={item.title}
              quantity={1}
              pricePerShare={formatFromFiat(item.amount, 'GBP')}
              totalAmount={formatFromFiat(item.amount, 'GBP')}
              status={item.status === 'active' ? 'pending' : item.status === 'won' ? 'filled' : 'cancelled'}
              timestamp={item.timestamp}
              onPress={() => navigation.navigate('ItemDetail', { itemId: item.auctionId })}
            />
          </Reanimated.View>
        )}
        ListEmptyComponent={
          <EmptyState
            icon="hammer-outline"
            title="No bids yet"
            subtitle="Bids you place on auctions will appear here."
          />
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
});
