import React from 'react';
import { View, StyleSheet, StatusBar, RefreshControl } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { useAppTheme } from '../theme/ThemeContext';
import { Colors } from '../constants/colors';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { EmptyState } from '../components/EmptyState';
import {
  MarketHistoryCursor,
  MarketHistoryItem,
  listUserMarketHistory,
} from '../services/marketApi';
import { CO_OWN_FEE_RATE } from '../utils/tradeFlow';
import { useToast } from '../context/ToastContext';
import { TradeHeader, OrderHistoryRow } from '../components/trade';
import { AppSegmentControl } from '../components/ui/AppSegmentControl';
import { SkeletonLoader } from '../components/SkeletonLoader';
import { Space } from '../theme/designTokens';
import { Motion } from '../constants/motion';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { Meta, BodyEmphasis } from '../components/ui/Text';
import { parseApiError } from '../lib/apiClient';

type NavT = StackNavigationProp<RootStackParamList>;

type SideFilter = 'all' | 'buy' | 'sell';
type DateFilter = 'all' | '24h' | '7d' | '30d';

interface HistoryEntry {
  id: string;
  assetId: string;
  assetTitle: string;
  side: 'buy' | 'sell';
  type: 'market' | 'limit';
  quantity: number;
  pricePerShare: number;
  totalAmount: number;
  fee: number;
  status: 'open' | 'partially_filled' | 'filled' | 'cancelled' | 'rejected';
  filledQuantity: number;
  createdAt: string;
  source: 'seeded' | 'ledger' | 'backend';
}

const SIDE_FILTERS: Array<{ value: SideFilter; label: string; accessibilityLabel: string }> = [
  { value: 'all', label: 'ALL', accessibilityLabel: 'Show all sides' },
  { value: 'buy', label: 'BUY', accessibilityLabel: 'Show buy orders' },
  { value: 'sell', label: 'SELL', accessibilityLabel: 'Show sell orders' },
];

const DATE_FILTERS: Array<{ value: DateFilter; label: string; accessibilityLabel: string }> = [
  { value: 'all', label: 'ALL', accessibilityLabel: 'Show all time' },
  { value: '24h', label: '24H', accessibilityLabel: 'Show last 24 hours' },
  { value: '7d', label: '7D', accessibilityLabel: 'Show last 7 days' },
  { value: '30d', label: '30D', accessibilityLabel: 'Show last 30 days' },
];

const PAGE_SIZE = 80;

function getFilterWindowMs(dateFilter: DateFilter) {
  if (dateFilter === '24h') return 24 * 60 * 60 * 1000;
  if (dateFilter === '7d') return 7 * 24 * 60 * 60 * 1000;
  if (dateFilter === '30d') return 30 * 24 * 60 * 60 * 1000;
  return null;
}

function sortHistoryEntriesDesc(a: HistoryEntry, b: HistoryEntry) {
  const tsDiff = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  if (tsDiff !== 0) return tsDiff;
  return b.id.localeCompare(a.id);
}

function mapRemoteHistoryToEntries(history: MarketHistoryItem[]): HistoryEntry[] {
  return history
    .filter((item) => item.channel === 'co-own' && (item.action === 'buy-units' || item.action === 'sell-units'))
    .map<HistoryEntry>((item) => {
      const quantity = Math.max(0, item.units ?? 0);
      const pricePerShare = item.unitPriceGbp ?? (quantity > 0 ? Number((item.amountGbp / quantity).toFixed(4)) : 0);
      // Preserve the exact backend status — never map open/partial/cancelled to filled.
      const rawStatus = item.status;
      const status: HistoryEntry['status'] =
        rawStatus === 'open' || rawStatus === 'partially_filled' || rawStatus === 'filled' || rawStatus === 'cancelled' || rawStatus === 'rejected'
          ? rawStatus
          : 'open';
      return {
        id: item.id,
        assetId: item.referenceId,
        // The backend joins sa.title as note — use it instead of the raw asset ID.
        // Do not fabricate a title by slicing the reference UUID.
        assetTitle: item.note ?? 'Co-Own asset',
        side: item.action === 'buy-units' ? 'buy' : 'sell',
        // Preserve the real order type from the backend, default to market when null.
        type: item.orderType === 'limit' ? 'limit' : 'market',
        quantity,
        pricePerShare,
        totalAmount: item.amountGbp,
        fee: item.feeGbp ?? Number((item.amountGbp * CO_OWN_FEE_RATE).toFixed(2)),
        status,
        filledQuantity: status === 'filled' ? quantity : 0,
        createdAt: item.timestamp,
        source: 'backend',
      };
    })
    .sort(sortHistoryEntriesDesc);
}

export default function CoOwnOrderHistoryScreen() {
  const navigation = useNavigation<NavT>();
  const currentUser = useStore((state) => state.currentUser);
  const { formatFromFiat } = useFormattedPrice();
  const { isDark } = useAppTheme();
  const viewerId = currentUser?.id;
  const reducedMotionEnabled = useReducedMotion();

  const [sideFilter, setSideFilter] = React.useState<SideFilter>('all');
  const [dateFilter, setDateFilter] = React.useState<DateFilter>('all');
  const [remoteEntries, setRemoteEntries] = React.useState<HistoryEntry[]>([]);
  const [isSyncingRemote, setIsSyncingRemote] = React.useState(false);
  const [isRemoteAvailable, setIsRemoteAvailable] = React.useState(false);
  const [hasMoreRemote, setHasMoreRemote] = React.useState(false);
  const [nextCursor, setNextCursor] = React.useState<MarketHistoryCursor | null>(null);
  const [isLoadingMore, setIsLoadingMore] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);

  const syncRemoteHistory = React.useCallback(async () => {
    if (!viewerId) {
      setIsSyncingRemote(false);
      return;
    }
    setIsSyncingRemote(true);
    try {
      const page = await listUserMarketHistory(viewerId, { channel: 'co-own', limit: PAGE_SIZE });
      setRemoteEntries(mapRemoteHistoryToEntries(page.items));
      setIsRemoteAvailable(true);
      setHasMoreRemote(page.pageInfo.hasMore);
      setNextCursor(page.pageInfo.nextCursor ?? null);
    } catch {
      setIsRemoteAvailable(false);
      setRemoteEntries([]);
      setHasMoreRemote(false);
      setNextCursor(null);
    } finally {
      setIsSyncingRemote(false);
    }
  }, [viewerId]);

  const loadMoreRemoteHistory = React.useCallback(async () => {
    if (!isRemoteAvailable || !hasMoreRemote || !nextCursor || isLoadingMore || isSyncingRemote) return;
    if (!viewerId) return;
    setIsLoadingMore(true);
    try {
      const page = await listUserMarketHistory(viewerId, {
        channel: 'co-own',
        limit: PAGE_SIZE,
        cursorTs: nextCursor.cursorTs,
        cursorId: nextCursor.cursorId,
      });
      const pageEntries = mapRemoteHistoryToEntries(page.items);
      setRemoteEntries((previous) => {
        const merged = [...previous, ...pageEntries];
        const deduped = new Map<string, HistoryEntry>();
        for (const item of merged) deduped.set(item.id, item);
        return [...deduped.values()].sort(sortHistoryEntriesDesc);
      });
      setHasMoreRemote(page.pageInfo.hasMore);
      setNextCursor(page.pageInfo.nextCursor ?? null);
    } catch {
      setHasMoreRemote(false);
      setNextCursor(null);
    } finally {
      setIsLoadingMore(false);
    }
  }, [hasMoreRemote, isLoadingMore, isRemoteAvailable, isSyncingRemote, nextCursor, viewerId]);

  React.useEffect(() => { void syncRemoteHistory(); }, [syncRemoteHistory]);

  const handleRefresh = React.useCallback(async () => {
    setRefreshing(true);
    await syncRemoteHistory();
    setRefreshing(false);
  }, [syncRemoteHistory]);

  const entries = React.useMemo(() => {
    const all = [...remoteEntries];
    const windowMs = getFilterWindowMs(dateFilter);
    return all.filter((entry) => {
      if (sideFilter !== 'all' && entry.side !== sideFilter) return false;
      if (windowMs) {
        const entryTs = new Date(entry.createdAt).getTime();
        if (Date.now() - entryTs > windowMs) return false;
      }
      return true;
    });
  }, [remoteEntries, sideFilter, dateFilter]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <TradeHeader title="Order History" onBack={() => navigation.goBack()} />

      <View style={styles.filtersWrap}>
        <AppSegmentControl options={SIDE_FILTERS} value={sideFilter} onChange={setSideFilter} fullWidth />
        <View style={styles.filterRow}>
          <AppSegmentControl options={DATE_FILTERS} value={dateFilter} onChange={setDateFilter} fullWidth />
        </View>
      </View>

      <FlashList
        data={entries}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        onEndReached={() => void loadMoreRemoteHistory()}
        onEndReachedThreshold={0.5}
        renderItem={({ item, index }) => {
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
              <OrderHistoryRow
                id={item.id}
                side={item.side}
                type={item.type}
                assetTitle={item.assetTitle}
                quantity={item.quantity}
                pricePerShare={formatFromFiat(item.pricePerShare, 'GBP')}
                totalAmount={formatFromFiat(item.totalAmount, 'GBP')}
                status={item.status}
                timestamp={item.createdAt}
                onPress={() => navigation.navigate('AssetDetail', { assetId: item.assetId })}
              />
            </Reanimated.View>
          );
        }}
        ListEmptyComponent={
          isSyncingRemote ? (
            <View style={styles.loadingWrap}>
              {[0, 1, 2].map((i) => (
                <View key={i} style={styles.loadingRow}>
                  <SkeletonLoader width={36} height={36} borderRadius={8} />
                  <View style={{ flex: 1, marginLeft: Space.sm }}>
                    <SkeletonLoader width="60%" height={14} borderRadius={7} />
                    <SkeletonLoader width="40%" height={10} borderRadius={5} style={{ marginTop: 6 }} />
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <EmptyState
              icon="receipt-outline"
              title="No orders yet"
              subtitle="Your co-own trade history will appear here."
              ctaLabel="Open Hub"
              onCtaPress={() => navigation.navigate('CoOwnHub')}
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
  filtersWrap: {
    paddingHorizontal: Space.md,
    marginBottom: Space.sm,
    gap: Space.sm,
  },
  filterRow: {
    marginTop: Space.xs,
  },
  listContent: {
    paddingBottom: Space.xl,
  },
  loadingWrap: {
    paddingHorizontal: Space.md,
    gap: Space.sm,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
});