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
import {
  MarketHistoryItem,
  MarketHistoryCursor,
  listUserMarketHistory,
} from '../services/marketApi';
import { Space } from '../theme/designTokens';
import { Motion } from '../constants/motion';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { TradeHeader, MetricGrid, OrderHistoryRow } from '../components/trade';
import { AppSegmentControl } from '../components/ui/AppSegmentControl';
import { SkeletonLoader } from '../components/SkeletonLoader';
import { EmptyState } from '../components/EmptyState';
import { Meta } from '../components/ui/Text';

type NavT = StackNavigationProp<RootStackParamList>;
type LedgerFilter = 'ALL' | 'AUCTION' | 'CO-OWN';

type LedgerEntry = {
  id: string;
  timestamp: string;
  channel: 'auction' | 'co-own';
  action: 'bid' | 'win' | 'buy-units' | 'sell-units';
  referenceId: string;
  amountGBP: number;
  units?: number;
  note?: string;
};

const FILTER_OPTIONS: Array<{ value: LedgerFilter; label: string; accessibilityLabel: string }> = [
  { value: 'ALL', label: 'ALL', accessibilityLabel: 'Show all channels' },
  { value: 'AUCTION', label: 'AUCTION', accessibilityLabel: 'Show auction activity' },
  { value: 'CO-OWN', label: 'CO-OWN', accessibilityLabel: 'Show co-own activity' },
];

const PAGE_SIZE = 80;

function getEntryCashflow(entry: { action: 'bid' | 'win' | 'buy-units' | 'sell-units'; amountGBP: number }) {
  if (entry.action === 'sell-units') return entry.amountGBP;
  if (entry.action === 'buy-units' || entry.action === 'win') return -entry.amountGBP;
  return 0;
}

function formatMoney(value: number) {
  return `£${value.toFixed(2)}`;
}

function formatSignedMoney(value: number) {
  const sign = value >= 0 ? '+' : '-';
  return `${sign}${formatMoney(Math.abs(value))}`;
}

function relativeTime(isoTs: string) {
  const diffMs = Date.now() - new Date(isoTs).getTime();
  const mins = Math.max(1, Math.floor(diffMs / (60 * 1000)));
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function sortLedgerEntriesDesc(a: LedgerEntry, b: LedgerEntry) {
  const tsDiff = new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
  if (tsDiff !== 0) return tsDiff;
  return b.id.localeCompare(a.id);
}

function mapHistoryToLedgerEntries(items: MarketHistoryItem[]): LedgerEntry[] {
  return items
    .filter((item) => item.action === 'bid' || item.action === 'buy-units' || item.action === 'sell-units')
    .map<LedgerEntry>((item) => ({
      id: item.id,
      timestamp: item.timestamp,
      channel: item.channel,
      action: item.action,
      referenceId: item.referenceId,
      amountGBP: item.amountGbp,
      units: item.units ?? undefined,
      note: item.note ?? undefined,
    }))
    .sort(sortLedgerEntriesDesc);
}

export default function MarketLedgerScreen() {
  const navigation = useNavigation<NavT>();
  const { isDark } = useAppTheme();
  const localEntries = useStore((state) => state.marketLedger);
  const currentUser = useStore((state) => state.currentUser);
  const coOwnRuntime = useStore((state) => state.coOwnRuntime);
  const viewerId = currentUser?.id ?? 'u1';
  const reducedMotionEnabled = useReducedMotion();

  const [filter, setFilter] = React.useState<LedgerFilter>('ALL');
  const [remoteEntries, setRemoteEntries] = React.useState<LedgerEntry[]>([]);
  const [isSyncingLedger, setIsSyncingLedger] = React.useState(false);
  const [isRemoteAvailable, setIsRemoteAvailable] = React.useState(false);
  const [hasMoreRemote, setHasMoreRemote] = React.useState(false);
  const [nextCursor, setNextCursor] = React.useState<MarketHistoryCursor | null>(null);
  const [isLoadingMore, setIsLoadingMore] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);

  const refreshRemoteLedger = React.useCallback(async () => {
    setIsSyncingLedger(true);
    try {
      const page = await listUserMarketHistory(viewerId, { channel: 'all', limit: PAGE_SIZE });
      setRemoteEntries(mapHistoryToLedgerEntries(page.items));
      setIsRemoteAvailable(true);
      setHasMoreRemote(page.pageInfo.hasMore);
      setNextCursor(page.pageInfo.nextCursor ?? null);
    } catch {
      setIsRemoteAvailable(false);
      setRemoteEntries([]);
      setHasMoreRemote(false);
      setNextCursor(null);
    } finally {
      setIsSyncingLedger(false);
    }
  }, [viewerId]);

  const loadMoreRemoteLedger = React.useCallback(async () => {
    if (!isRemoteAvailable || !hasMoreRemote || !nextCursor || isLoadingMore || isSyncingLedger) return;
    setIsLoadingMore(true);
    try {
      const page = await listUserMarketHistory(viewerId, {
        channel: 'all',
        limit: PAGE_SIZE,
        cursorTs: nextCursor.cursorTs,
        cursorId: nextCursor.cursorId,
      });
      const pageEntries = mapHistoryToLedgerEntries(page.items);
      setRemoteEntries((previous) => {
        const merged = [...previous, ...pageEntries];
        const deduped = new Map<string, LedgerEntry>();
        for (const item of merged) deduped.set(item.id, item);
        return [...deduped.values()].sort(sortLedgerEntriesDesc);
      });
      setHasMoreRemote(page.pageInfo.hasMore);
      setNextCursor(page.pageInfo.nextCursor ?? null);
    } catch {
      setHasMoreRemote(false);
      setNextCursor(null);
    } finally {
      setIsLoadingMore(false);
    }
  }, [hasMoreRemote, isLoadingMore, isRemoteAvailable, isSyncingLedger, nextCursor, viewerId]);

  React.useEffect(() => { void refreshRemoteLedger(); }, [refreshRemoteLedger]);

  const entries = React.useMemo(() => (isRemoteAvailable ? remoteEntries : localEntries), [isRemoteAvailable, localEntries, remoteEntries]);

  const filteredEntries = React.useMemo(() => {
    if (filter === 'ALL') return entries;
    const channel = filter === 'AUCTION' ? 'auction' : 'co-own';
    return entries.filter((entry) => entry.channel === channel);
  }, [entries, filter]);

  const totalMarketValue = React.useMemo(
    () => filteredEntries.reduce((sum, entry) => sum + entry.amountGBP, 0),
    [filteredEntries]
  );

  const realizedCoOwnPL = React.useMemo(
    () => Object.values(coOwnRuntime).reduce((sum, runtime) => sum + runtime.realizedProfitGBP, 0),
    [coOwnRuntime]
  );

  const netCashflow = React.useMemo(
    () => filteredEntries.reduce((sum, entry) => sum + getEntryCashflow(entry), 0),
    [filteredEntries]
  );

  const handleRefresh = React.useCallback(async () => {
    setRefreshing(true);
    await refreshRemoteLedger();
    setRefreshing(false);
  }, [refreshRemoteLedger]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <TradeHeader title="Market Ledger" onBack={() => navigation.goBack()} />

      <Reanimated.View
        entering={reducedMotionEnabled ? undefined : FadeInDown.duration(350).delay(0)}
      >
        <MetricGrid
          metrics={[
            { label: 'Volume', value: formatMoney(totalMarketValue) },
            { label: 'Net Cashflow', value: formatSignedMoney(netCashflow), tone: netCashflow >= 0 ? 'positive' : 'negative' },
            { label: 'Realized P&L', value: formatSignedMoney(realizedCoOwnPL), tone: realizedCoOwnPL >= 0 ? 'positive' : 'negative' },
          ]}
          columns={3}
        />
      </Reanimated.View>

      <Reanimated.View
        entering={reducedMotionEnabled ? undefined : FadeInDown.duration(350).delay(80)}
      >
        <View style={styles.filterWrap}>
          <AppSegmentControl options={FILTER_OPTIONS} value={filter} onChange={setFilter} fullWidth />
        </View>
      </Reanimated.View>

      <FlashList
        data={filteredEntries}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        onEndReached={() => void loadMoreRemoteLedger()}
        onEndReachedThreshold={0.5}
        renderItem={({ item, index }) => {
          const isAuction = item.channel === 'auction';
          const side = item.action === 'sell-units' ? 'sell' as const : 'buy' as const;
          const title = item.action === 'bid' ? 'Bid Submitted' : item.action === 'win' ? 'Auction Settlement' : item.action === 'sell-units' ? 'Units Sold' : 'Units Purchased';

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
                side={side}
                type="market"
                assetTitle={title}
                quantity={item.units ?? 1}
                pricePerShare={formatMoney(item.amountGBP)}
                totalAmount={formatSignedMoney(getEntryCashflow(item))}
                status={item.action === 'bid' ? 'pending' : 'filled'}
                timestamp={relativeTime(item.timestamp)}
              />
            </Reanimated.View>
          );
        }}
        ListEmptyComponent={
          isSyncingLedger ? (
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
              icon="pulse-outline"
              title="No activity"
              subtitle="Trading activity will appear here."
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
    marginHorizontal: Space.md,
    marginBottom: Space.sm,
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
    paddingVertical: Space.sm,
  },
});