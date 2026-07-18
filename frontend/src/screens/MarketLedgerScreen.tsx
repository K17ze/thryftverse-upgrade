import React from 'react';
import { View, Text, StyleSheet, RefreshControl } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { FlashList } from '@shopify/flash-list';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { useAppTheme } from '../theme/ThemeContext';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import {
  MarketHistoryItem,
  MarketHistoryCursor,
  listUserMarketHistory,
} from '../services/marketApi';
import { Space, Radius, Type, Typography } from '../theme/designTokens';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { OrderHistoryRow } from '../components/trade';
import { AppSegmentControl } from '../components/ui/AppSegmentControl';
import { SkeletonLoader } from '../components/SkeletonLoader';
import { resolveCommerceDestination, type CommerceDestinationSource } from '../platform/commerce';
import { haptics } from '../utils/haptics';
import { CoOwnMarketHeader, CoOwnStateCanvas, CoOwnLedgerSummary, CoOwnActivitySkeleton, CoOwnOfflineBanner, CoOwnReconciliationBanner } from '../components/coown';
import { useConnectivity } from '../hooks/useConnectivity';

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
  const { colors, isDark } = useAppTheme();
  const localEntries = useStore((state) => state.marketLedger);
  const currentUser = useStore((state) => state.currentUser);
  const coOwnRuntime = useStore((state) => state.coOwnRuntime);
  const viewerId = currentUser?.id ?? '';
  const reducedMotionEnabled = useReducedMotion();
  const { isOffline } = useConnectivity();

  const [filter, setFilter] = React.useState<LedgerFilter>('ALL');
  const [remoteEntries, setRemoteEntries] = React.useState<LedgerEntry[]>([]);
  const [isSyncingLedger, setIsSyncingLedger] = React.useState(false);
  const [isRemoteAvailable, setIsRemoteAvailable] = React.useState(false);
  const [hasMoreRemote, setHasMoreRemote] = React.useState(false);
  const [nextCursor, setNextCursor] = React.useState<MarketHistoryCursor | null>(null);
  const [isLoadingMore, setIsLoadingMore] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);

  const refreshRemoteLedger = React.useCallback(async () => {
    if (!viewerId) {
      setIsSyncingLedger(false);
      return;
    }
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

  const handleBack = React.useCallback(() => {
    if (navigation.canGoBack()) { navigation.goBack(); return; }
    navigation.navigate('Portfolio');
  }, [navigation]);

  // ── Loading state (initial sync, no entries yet) ──
  if (isSyncingLedger && entries.length === 0) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <CoOwnMarketHeader
          title="Ledger"
          subtitle="Market activity and trade history"
          onBack={handleBack}
        />
        <CoOwnActivitySkeleton />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      <CoOwnMarketHeader
        title="Ledger"
        subtitle="Market activity and trade history"
        onBack={handleBack}
      />

      <CoOwnOfflineBanner isOffline={isOffline} />
      <CoOwnReconciliationBanner isActive={false} />

      {/* Summary card */}
      <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300)}>
        <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.summaryStat}>
            <Text style={[styles.summaryStatLabel, { color: colors.textMuted }]} numberOfLines={1}>Volume</Text>
            <Text style={[styles.summaryStatValue, { color: colors.textPrimary }]} numberOfLines={1}>{formatMoney(totalMarketValue)}</Text>
          </View>
          <View style={[styles.summaryStatDivider, { backgroundColor: colors.border }]} />
          <View style={styles.summaryStat}>
            <Text style={[styles.summaryStatLabel, { color: colors.textMuted }]} numberOfLines={1}>Net cashflow</Text>
            <Text style={[styles.summaryStatValue, { color: netCashflow >= 0 ? colors.success : colors.danger }]} numberOfLines={1}>
              {formatSignedMoney(netCashflow)}
            </Text>
          </View>
          <View style={[styles.summaryStatDivider, { backgroundColor: colors.border }]} />
          <View style={styles.summaryStat}>
            <Text style={[styles.summaryStatLabel, { color: colors.textMuted }]} numberOfLines={1}>Realized P&L</Text>
            <Text style={[styles.summaryStatValue, { color: realizedCoOwnPL >= 0 ? colors.success : colors.danger }]} numberOfLines={1}>
              {formatSignedMoney(realizedCoOwnPL)}
            </Text>
          </View>
        </View>
      </Reanimated.View>

      {/* Phase 4: Ledger summary with mark-used + window labels */}
      <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300).delay(40)}>
        <CoOwnLedgerSummary
          issuedCount={filteredEntries.filter((e) => e.action === 'buy-units' && e.channel === 'co-own').length}
          boughtCount={filteredEntries.filter((e) => e.action === 'buy-units').length}
          soldCount={filteredEntries.filter((e) => e.action === 'sell-units').length}
          pausedCount={0}
          markUsedLabel="Last trade"
          windowLabel="All time"
          markTimestamp={undefined}
          isStaleMark={false}
        />
      </Reanimated.View>

      {/* Filter */}
      <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300).delay(80)}>
        <View style={styles.filterWrap}>
          <AppSegmentControl
            options={FILTER_OPTIONS}
            value={filter}
            onChange={(v) => { haptics.selection(); setFilter(v); }}
            fullWidth
          />
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
          const title = item.action === 'bid' ? 'Bid submitted' : item.action === 'win' ? 'Auction settlement' : item.action === 'sell-units' ? 'Units sold' : 'Units purchased';

          return (
            <Reanimated.View
              entering={
                reducedMotionEnabled
                  ? undefined
                  : FadeInDown.duration(300).delay(Math.min(index, 8) * 40)
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
                status={item.action === 'bid' ? 'open' : 'filled'}
                timestamp={relativeTime(item.timestamp)}
                onPress={() => {
                  haptics.tap();
                  const source: CommerceDestinationSource = isAuction
                    ? { commerceMode: 'auction', auctionId: item.referenceId }
                    : { commerceMode: 'co_own', assetId: item.referenceId };
                  const destination = resolveCommerceDestination(source);
                  if (destination.ok) {
                    if (destination.screen === 'ItemDetail') {
                      navigation.navigate('ItemDetail', destination.params);
                    } else if (destination.screen === 'AuctionDetail') {
                      navigation.navigate('AuctionDetail', destination.params);
                    } else if (destination.screen === 'AssetDetail') {
                      navigation.navigate('AssetDetail', destination.params);
                    }
                  }
                }}
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
            <CoOwnStateCanvas
              variant="empty"
              title="No activity"
              subtitle="Trading activity will appear here."
              emptyGraphicVariant="box"
            />
          )
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  summaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Space.md,
    marginBottom: Space.md,
    borderRadius: Radius.lg,
    borderWidth: 0.5,
    padding: Space.md,
  },
  summaryStat: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  summaryStatLabel: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.medium,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  summaryStatValue: {
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.bold,
    letterSpacing: -0.2,
  },
  summaryStatDivider: {
    width: 1,
    alignSelf: 'stretch',
    marginHorizontal: Space.sm,
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
    gap: Space.sm,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
});
