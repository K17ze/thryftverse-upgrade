import React from 'react';
import { Alert, View, Text, StyleSheet, RefreshControl } from 'react-native';
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
  MarketHistoryCursor,
  MarketHistoryItem,
  cancelCoOwnOrder,
  listUserMarketHistory,
} from '../services/marketApi';
import { CO_OWN_FEE_RATE } from '../utils/tradeFlow';
import { useToast } from '../context/ToastContext';
import { OrderHistoryRow } from '../components/trade';
import { BottomSheetPicker } from '../components/BottomSheetPicker';
import { SkeletonLoader } from '../components/SkeletonLoader';
import { Space, Radius, Type, Typography } from '../theme/designTokens';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { parseApiError } from '../lib/apiClient';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { haptics } from '../utils/haptics';
import { formatCoOwnIze } from '../utils/currency';
import { CoOwnMarketHeader, CoOwnStateCanvas } from '../components/coown';
import type { OrderStatus } from '../data/coOwnModels';

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
  status: OrderStatus;
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
  { value: 'all', label: 'All time', accessibilityLabel: 'Show all time' },
  { value: '24h', label: 'Past 24 hours', accessibilityLabel: 'Show last 24 hours' },
  { value: '7d', label: 'Past 7 days', accessibilityLabel: 'Show last 7 days' },
  { value: '30d', label: 'Past 30 days', accessibilityLabel: 'Show last 30 days' },
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
      const rawStatus = item.status;
      // Map backend status to canonical OrderStatus. If the backend sends
      // a legacy 'partially_filled', map it to 'partial' (canonical).
      const status: HistoryEntry['status'] =
        rawStatus === 'partially_filled' ? 'partial'
        : rawStatus === 'open' || rawStatus === 'filled' || rawStatus === 'cancelled' || rawStatus === 'rejected'
          ? rawStatus
          : 'open';
      return {
        id: item.id,
        assetId: item.referenceId,
        assetTitle: item.note ?? 'Co-Own asset',
        side: item.action === 'buy-units' ? 'buy' : 'sell',
        type: item.orderType === 'limit' ? 'limit' : 'market',
        quantity,
        pricePerShare,
        totalAmount: item.amountGbp,
        fee: item.feeGbp ?? Number((item.amountGbp * CO_OWN_FEE_RATE).toFixed(2)),
        status,
        filledQuantity: Math.max(0, item.filledUnits ?? (status === 'filled' ? quantity : 0)),
        createdAt: item.timestamp,
        source: 'backend',
      };
    })
    .sort(sortHistoryEntriesDesc);
}

export default function CoOwnOrderHistoryScreen() {
  const navigation = useNavigation<NavT>();
  const { colors, isDark } = useAppTheme();
  const { show } = useToast();
  const currentUser = useStore((state) => state.currentUser);
  const viewerId = currentUser?.id;
  const reducedMotionEnabled = useReducedMotion();

  const [sideFilter, setSideFilter] = React.useState<SideFilter>('all');
  const [dateFilter, setDateFilter] = React.useState<DateFilter>('all');
  const [isPeriodPickerVisible, setIsPeriodPickerVisible] = React.useState(false);
  const [remoteEntries, setRemoteEntries] = React.useState<HistoryEntry[]>([]);
  const [isSyncingRemote, setIsSyncingRemote] = React.useState(false);
  const [isRemoteAvailable, setIsRemoteAvailable] = React.useState(false);
  const [hasMoreRemote, setHasMoreRemote] = React.useState(false);
  const [nextCursor, setNextCursor] = React.useState<MarketHistoryCursor | null>(null);
  const [isLoadingMore, setIsLoadingMore] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);
  const [cancellingOrderId, setCancellingOrderId] = React.useState<string | null>(null);

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

  const requestCancelOrder = React.useCallback((item: HistoryEntry) => {
    if (!viewerId || item.source !== 'backend') return;
    const orderId = Number(item.id.replace(/^coOwn_order_/, ''));
    if (!Number.isInteger(orderId) || orderId <= 0) return;
    Alert.alert(
      'Cancel remaining order?',
      `Any unfilled ${item.side} units will be cancelled and the reserved ${item.side === 'buy' ? '1ZE' : 'units'} released.`,
      [
        { text: 'Keep order', style: 'cancel' },
        {
          text: 'Cancel remaining',
          style: 'destructive',
          onPress: () => {
            setCancellingOrderId(item.id);
            void cancelCoOwnOrder(item.assetId, orderId, viewerId)
              .then(() => {
                setRemoteEntries((previous) => previous.map((entry) => (
                  entry.id === item.id ? { ...entry, status: 'cancelled' as const } : entry
                )));
                show('Remaining order cancelled and reservation released.', 'success');
              })
              .catch((error) => {
                const parsed = parseApiError(error, 'Unable to cancel this order');
                show(parsed.message, 'error');
              })
              .finally(() => setCancellingOrderId(null));
          },
        },
      ]
    );
  }, [show, viewerId]);

  React.useEffect(() => { void syncRemoteHistory(); }, [syncRemoteHistory]);

  const handleRefresh = React.useCallback(async () => {
    setRefreshing(true);
    await syncRemoteHistory();
    setRefreshing(false);
  }, [syncRemoteHistory]);

  const handleBack = React.useCallback(() => {
    if (navigation.canGoBack()) { navigation.goBack(); return; }
    navigation.navigate('Portfolio');
  }, [navigation]);

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
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      <CoOwnMarketHeader
        title="Activity"
        subtitle="Orders and executions"
        onBack={handleBack}
      />

      <View style={[styles.filterToolbar, { borderBottomColor: colors.border }]}>
        <View style={styles.sideTabs} accessibilityRole="tablist">
          {SIDE_FILTERS.map((filter) => {
            const selected = sideFilter === filter.value;
            return (
              <AnimatedPressable
                key={filter.value}
                style={styles.sideTab}
                onPress={() => {
                  haptics.selection();
                  setSideFilter(filter.value);
                }}
                activeOpacity={0.68}
                accessibilityRole="tab"
                accessibilityLabel={filter.accessibilityLabel}
                accessibilityState={{ selected }}
              >
                <Text style={[
                  styles.sideTabText,
                  { color: selected ? colors.textPrimary : colors.textMuted },
                  selected && styles.sideTabTextActive,
                ]}>
                  {filter.label.charAt(0) + filter.label.slice(1).toLowerCase()}
                </Text>
                {selected ? <View style={[styles.sideTabIndicator, { backgroundColor: colors.textPrimary }]} /> : null}
              </AnimatedPressable>
            );
          })}
        </View>
        <AnimatedPressable
          style={[styles.periodButton, { backgroundColor: colors.surfaceAlt }]}
          onPress={() => {
            haptics.tap();
            setIsPeriodPickerVisible(true);
          }}
          activeOpacity={0.72}
          accessibilityRole="button"
          accessibilityLabel={`Time period, ${DATE_FILTERS.find((filter) => filter.value === dateFilter)?.label ?? 'All time'}`}
          accessibilityState={{ expanded: isPeriodPickerVisible }}
        >
          <Ionicons name="calendar-clear-outline" size={16} color={colors.textSecondary} />
          <Text style={[styles.periodButtonText, { color: colors.textSecondary }]} numberOfLines={1}>
            {DATE_FILTERS.find((filter) => filter.value === dateFilter)?.label ?? 'All time'}
          </Text>
          <Ionicons name="chevron-down" size={14} color={colors.textMuted} />
        </AnimatedPressable>
      </View>

      <FlashList
        data={entries}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        onEndReached={() => void loadMoreRemoteHistory()}
        onEndReachedThreshold={0.5}
        renderItem={({ item, index }) => (
          <Reanimated.View
            entering={
              reducedMotionEnabled
                ? undefined
                : FadeInDown.duration(300).delay(Math.min(index, 8) * 40)
            }
          >
            <OrderHistoryRow
              id={item.id}
              side={item.side}
              type={item.type}
              assetTitle={item.assetTitle}
              quantity={item.quantity}
              filledQuantity={item.filledQuantity}
              pricePerShare={formatCoOwnIze(item.pricePerShare)}
              totalAmount={formatCoOwnIze(item.totalAmount)}
              status={item.status}
              timestamp={item.createdAt}
              onCancel={item.source === 'backend' && (item.status === 'open' || item.status === 'partial')
                ? () => requestCancelOrder(item)
                : undefined}
              isCancelling={cancellingOrderId === item.id}
              onPress={() => { haptics.tap(); navigation.navigate('AssetDetail', { assetId: item.assetId }); }}
            />
          </Reanimated.View>
        )}
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
            <CoOwnStateCanvas
              variant="empty"
              title="No orders yet"
              subtitle="Your Co-Own trade history will appear here."
              actionLabel="Browse items"
              onAction={() => navigation.navigate('CoOwnHub')}
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

      <BottomSheetPicker
        visible={isPeriodPickerVisible}
        onClose={() => setIsPeriodPickerVisible(false)}
        title="Time period"
        options={DATE_FILTERS.map((filter) => filter.label)}
        selectedValue={DATE_FILTERS.find((filter) => filter.value === dateFilter)?.label}
        onSelect={(label) => {
          const selected = DATE_FILTERS.find((filter) => filter.label === label);
          if (selected) {
            haptics.selection();
            setDateFilter(selected.value);
          }
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  filterToolbar: {
    minHeight: 54,
    paddingHorizontal: Space.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sideTabs: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  sideTab: {
    minWidth: 54,
    minHeight: 54,
    paddingHorizontal: Space.sm,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  sideTabText: {
    fontSize: Type.captionElevated.size,
    lineHeight: Type.captionElevated.lineHeight,
    fontFamily: Typography.family.medium,
  },
  sideTabTextActive: {
    fontFamily: Typography.family.semibold,
  },
  sideTabIndicator: {
    position: 'absolute',
    bottom: -StyleSheet.hairlineWidth,
    width: 24,
    height: 2,
    borderRadius: 1,
  },
  periodButton: {
    minWidth: 106,
    maxWidth: 148,
    minHeight: 40,
    paddingHorizontal: Space.sm,
    borderRadius: Radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  periodButtonText: {
    flexShrink: 1,
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    fontFamily: Typography.family.medium,
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
