import { MarketActivityRow } from '../components/coown/MarketActivityRow';
import React, { useCallback } from 'react';
import { View, Text, StyleSheet, RefreshControl, Pressable } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAppTheme } from '../theme/ThemeContext';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import {
  MarketHistoryItem,
  MarketHistoryCursor,
  listUserMarketHistory,
} from '../services/marketApi';
import { Space, Radius, Stroke } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { AppSegmentControl } from '../components/ui/AppSegmentControl';
import { SkeletonLoader } from '../components/SkeletonLoader';
import { resolveCommerceDestination, type CommerceDestinationSource } from '../platform/commerce';
import { haptics } from '../utils/haptics';
import { formatCoOwnIze } from '../utils/currency';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { CoOwnStateCanvas, CoOwnActivitySkeleton, CoOwnOfflineBanner } from '../components/coown';
import { useConnectivity } from '../hooks/useConnectivity';
import { useScreenCaptureProtection } from '../platform/screenCapture';
import { useFormattedPrice } from '../hooks/useFormattedPrice';

type NavT = NativeStackNavigationProp<RootStackParamList>;
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
  status?: MarketHistoryItem['status'];
};

const FILTER_OPTIONS: Array<{ value: LedgerFilter; label: string; accessibilityLabel: string }> = [
  { value: 'ALL', label: 'All', accessibilityLabel: 'Show all channels' },
  { value: 'AUCTION', label: 'Auctions', accessibilityLabel: 'Show auction activity' },
  { value: 'CO-OWN', label: 'Co-own', accessibilityLabel: 'Show co-own activity' },
];

const PAGE_SIZE = 80;

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
      status: item.status,
    }))
    .sort(sortLedgerEntriesDesc);
}

export default function MarketLedgerScreen() {
  useScreenCaptureProtection();
  const navigation = useNavigation<NavT>();
  const { colors } = useAppTheme();
  const localEntries = useStore((state) => state.marketLedger);
  const currentUser = useStore((state) => state.currentUser);
  const viewerId = currentUser?.id ?? '';
  const { isOffline } = useConnectivity();
  const { formatFromFiat } = useFormattedPrice();

  const formatMoney = useCallback(
    (value: number) => formatFromFiat(value, 'GBP'),
    [formatFromFiat]
  );

  const [filter, setFilter] = React.useState<LedgerFilter>('ALL');
  const [remoteEntries, setRemoteEntries] = React.useState<LedgerEntry[]>([]);
  const [isSyncingLedger, setIsSyncingLedger] = React.useState(false);
  const [isRemoteAvailable, setIsRemoteAvailable] = React.useState(false);
  const [remoteError, setRemoteError] = React.useState(false);
  const [hasMoreRemote, setHasMoreRemote] = React.useState(false);
  const [nextCursor, setNextCursor] = React.useState<MarketHistoryCursor | null>(null);
  const [isLoadingMore, setIsLoadingMore] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);
  const [pageError, setPageError] = React.useState(false);
  const requestEpoch = React.useRef(0);
  const pageInFlight = React.useRef(false);

  const refreshRemoteLedger = React.useCallback(async () => {
    if (!viewerId) {
      setIsSyncingLedger(false);
      setRemoteError(false);
      return;
    }
    const epoch = ++requestEpoch.current;
    setIsSyncingLedger(true);
    setPageError(false);
    try {
      const page = await listUserMarketHistory(viewerId, { channel: 'all', limit: PAGE_SIZE });
      if (epoch !== requestEpoch.current) return;
      setRemoteEntries(mapHistoryToLedgerEntries(page.items));
      setIsRemoteAvailable(true);
      setRemoteError(false);
      setHasMoreRemote(page.pageInfo.hasMore);
      setNextCursor(page.pageInfo.nextCursor ?? null);
    } catch {
      if (epoch !== requestEpoch.current) return;
      setRemoteError(true);
    } finally {
      if (epoch === requestEpoch.current) setIsSyncingLedger(false);
    }
  }, [viewerId]);

  const loadMoreRemoteLedger = React.useCallback(async () => {
    if (!isRemoteAvailable || !hasMoreRemote || !nextCursor || isLoadingMore || isSyncingLedger || pageInFlight.current) return;
    const epoch = requestEpoch.current;
    pageInFlight.current = true;
    setIsLoadingMore(true);
    try {
      const page = await listUserMarketHistory(viewerId, {
        channel: 'all',
        limit: PAGE_SIZE,
        cursorTs: nextCursor.cursorTs,
        cursorId: nextCursor.cursorId,
      });
      if (epoch !== requestEpoch.current) return;
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
      if (epoch === requestEpoch.current) setPageError(true);
    } finally {
      pageInFlight.current = false;
      if (epoch === requestEpoch.current) setIsLoadingMore(false);
    }
  }, [pageError, hasMoreRemote, isLoadingMore, isRemoteAvailable, isSyncingLedger, nextCursor, viewerId]);

  React.useEffect(() => {
    setRemoteEntries([]);
    setIsRemoteAvailable(false);
    setNextCursor(null);
    setHasMoreRemote(false);
  }, [viewerId]);
  useFocusEffect(React.useCallback(() => {
    void refreshRemoteLedger();
    return () => { requestEpoch.current += 1; };
  }, [refreshRemoteLedger]));

  // Local entries are only a safe fallback when the device is offline. While
  // online, a failed history request must remain an explicit recoverable
  // state instead of silently presenting a partial client cache as complete.
  const entries = React.useMemo(
    () => (isRemoteAvailable || isOffline || !viewerId ? (isRemoteAvailable ? remoteEntries : localEntries) : []),
    [isOffline, isRemoteAvailable, localEntries, remoteEntries, viewerId],
  );

  const filteredEntries = React.useMemo(() => {
    if (filter === 'ALL') return entries;
    const channel = filter === 'AUCTION' ? 'auction' : 'co-own';
    return entries.filter((entry) => entry.channel === channel);
  }, [entries, filter]);

  const handleRefresh = React.useCallback(async () => {
    setRefreshing(true);
    await refreshRemoteLedger();
    setRefreshing(false);
  }, [refreshRemoteLedger]);

  const handleBack = React.useCallback(() => {
    if (navigation.canGoBack()) { navigation.goBack(); return; }
    navigation.navigate('CoOwnHub');
  }, [navigation]);

  // FlashList v2 performance: memoized renderItem prevents full re-render of
  // all visible ledger rows on every parent state change.
  // (Audit §FlashList v2 / LIST_RENDERING_POLICY.md §3.1)
  const renderLedgerItem = useCallback(({ item }: { item: LedgerEntry }) => {
    const isAuction = item.channel === 'auction';
    const title = item.action === 'bid' ? 'Auction bid' : item.action === 'win' ? 'Auction result' : item.action === 'sell-units' ? 'Sell order' : 'Buy order';
    const stateLabel = item.status === 'filled' ? 'Filled'
      : item.status === 'partially_filled' ? 'Partially filled'
      : item.status === 'cancelled' ? 'Cancelled'
      : item.status === 'rejected' ? 'Rejected'
      : item.status === 'open' ? 'Open'
      : 'Status unavailable';
    return (
      <MarketActivityRow
        title={title}
        detail={[item.note, item.units != null ? `${item.units} units` : null].filter(Boolean).join(' · ')}
        amount={isAuction ? formatMoney(item.amountGBP) : formatCoOwnIze(item.amountGBP)}
        status={stateLabel}
        timestamp={item.timestamp}
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
    );
  }, [navigation, formatMoney]);

  // ── Loading state (initial sync, no entries yet) ──
  if (isSyncingLedger && entries.length === 0) {
    return (
      <FlagshipScreen
        header={
          <FlagshipHeader
            title="Market activity"
            onBack={handleBack}
          />
        }
        scrollEnabled={false}
      >
        <CoOwnActivitySkeleton />
      </FlagshipScreen>
    );
  }

  return (
    <FlagshipScreen
      header={
        <FlagshipHeader
          title="Market activity"
          onBack={handleBack}
        />
      }
      scrollEnabled={false}
    >
      <CoOwnOfflineBanner isOffline={isOffline} />
      {remoteError && !isOffline && entries.length > 0 && (
        <Pressable onPress={handleRefresh} accessibilityRole="button" accessibilityLabel="History could not refresh. Retry"
          style={{ minHeight: 44, padding: Space.md }}>
          <Text style={{ color: colors.textSecondary }}>Couldn’t refresh · Showing last loaded history · Retry</Text>
        </Pressable>
      )}

      <View style={{ paddingHorizontal: Space.md, paddingBottom: Space.md }}>
        <Text style={{ color: colors.textSecondary, fontFamily: TypographyV2.meta.fontFamily, fontSize: TypographyV2.meta.size }}>
          {filteredEntries.length} loaded {filteredEntries.length === 1 ? 'entry' : 'entries'}{hasMoreRemote ? ' · more below' : ''}
        </Text>
        <Text style={{ color: colors.textMuted, fontFamily: TypographyV2.meta.fontFamily, fontSize: TypographyV2.meta.size, marginTop: Space.xxs }}>
          Order values do not represent settled cash movements.
        </Text>
      </View>

      {/* Filter */}
      <View style={styles.filterWrap}>
        <AppSegmentControl
          options={FILTER_OPTIONS}
          value={filter}
          onChange={setFilter}
          fullWidth
        />
      </View>

      <FlashList
        data={filteredEntries}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        onEndReached={() => { if (!pageError) void loadMoreRemoteLedger(); }}
        onEndReachedThreshold={0.5}
        renderItem={renderLedgerItem}
        ListFooterComponent={pageError ? (
          <Pressable onPress={() => { setPageError(false); void loadMoreRemoteLedger(); }} accessibilityRole="button"
            accessibilityLabel="Retry loading more history" style={{ minHeight: 48, padding: Space.md }}>
            <Text style={{ color: colors.textPrimary }}>Couldn’t load more · Retry</Text>
          </Pressable>
        ) : isLoadingMore ? <Text style={{ color: colors.textMuted, padding: Space.md }}>Loading more…</Text> : null}
        ListEmptyComponent={
          isSyncingLedger ? (
            <View style={styles.loadingWrap}>
              {[0, 1, 2].map((i) => (
                <View key={i} style={styles.loadingRow}>
                  <SkeletonLoader width={36} height={36} borderRadius={Radius.md} />
                  <View style={{ flex: 1, marginLeft: Space.sm }}>
                    <SkeletonLoader width="60%" height={14} borderRadius={Radius.md} />
                    <SkeletonLoader width="40%" height={10} borderRadius={Radius.sm} style={{ marginTop: 6 }} />
                  </View>
                </View>
              ))}
            </View>
          ) : remoteError && !isOffline ? (
            <CoOwnStateCanvas
              variant="error"
              title="Ledger unavailable"
              subtitle="Your history could not be loaded. Check your connection and retry."
              actionLabel="Retry"
              onAction={handleRefresh}
            />
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
    </FlagshipScreen>
  );
}

const styles = StyleSheet.create({
  summaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Space.md,
    marginBottom: Space.md,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Space.md,
  },
  summaryStat: {
    flex: 1,
    minWidth: 0,
    gap: Space.xs,
  },
  summaryStatLabel: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  summaryStatValue: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    letterSpacing: TypographyV2.body.letterSpacing,
    fontVariant: ['tabular-nums'],
  },
  summaryStatDivider: {
    width: Stroke.standard,
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
    paddingVertical: Space.sm + 2,
  },
});
