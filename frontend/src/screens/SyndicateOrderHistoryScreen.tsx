import React, { useCallback } from 'react';
import { View, Text, StyleSheet, RefreshControl } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
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
import { Space, Radius, Typography, Stroke } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { parseApiError } from '../lib/apiClient';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { haptics } from '../utils/haptics';
import { formatCoOwnIze } from '../utils/currency';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { ConfirmationSheet } from '../components/ConfirmationSheet';
import { CoOwnStateCanvas } from '../components/coown';
import type { OrderStatus } from '../data/coOwnModels';
import { t } from '../i18n';


type NavT = NativeStackNavigationProp<RootStackParamList>;

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
      // Preserve the backend's display status verbatim. The canonical
      // OrderStatus type includes 'partially_filled' so the order history
      // row can show "X of Y filled" without a lossy downgrade to the
      // internal lifecycle label.
      const status: HistoryEntry['status'] =
        rawStatus === 'partially_filled' ? 'partially_filled'
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
  const { colors } = useAppTheme();
  const { show } = useToast();
  const currentUser = useStore((state) => state.currentUser);
  const viewerId = currentUser?.id;

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
  const [confirmSheet, setConfirmSheet] = React.useState<{
    visible: boolean;
    title: string;
    message: string;
    confirmLabel: string;
    cancelLabel: string;
    onConfirm: () => void;
    variant: 'default' | 'danger';
  }>({ visible: false, title: '', message: '', confirmLabel: 'Confirm', cancelLabel: 'Cancel', onConfirm: () => {}, variant: 'default' });

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
    setConfirmSheet({
      visible: true,
      title: 'Cancel remaining order?',
      message: `Any unfilled ${item.side} units will be cancelled and the reserved ${item.side === 'buy' ? '1ZE' : 'units'} released.`,
      confirmLabel: 'Cancel remaining',
      cancelLabel: 'Keep order',
      onConfirm: () => {
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
      variant: 'danger',
    });
  }, [show, viewerId]);

  React.useEffect(() => { void syncRemoteHistory(); }, [syncRemoteHistory]);

  const handleRefresh = React.useCallback(async () => {
    setRefreshing(true);
    await syncRemoteHistory();
    setRefreshing(false);
  }, [syncRemoteHistory]);

  const handleBack = React.useCallback(() => {
    if (navigation.canGoBack()) { navigation.goBack(); return; }
    navigation.navigate('CoOwnHub');
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

  // FlashList v2 performance: memoized renderItem prevents full re-render of
  // all visible order history rows on every parent state change.
  // (Audit §FlashList v2 / LIST_RENDERING_POLICY.md §3.1)
  const renderOrderItem = useCallback(({ item }: { item: HistoryEntry }) => (
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
      onCancel={item.source === 'backend' && (item.status === 'open' || item.status === 'partially_filled')
        ? () => requestCancelOrder(item)
        : undefined}
      isCancelling={cancellingOrderId === item.id}
      onPress={() => { haptics.tap(); navigation.navigate('AssetDetail', { assetId: item.assetId }); }}
    />
  ), [
    formatCoOwnIze,
    requestCancelOrder,
    cancellingOrderId,
    haptics,
    navigation,
  ]);

  return (
    <FlagshipScreen
      scrollEnabled={false}
      contentStyle={{ paddingHorizontal: 0, paddingTop: 0 }}
      header={
        <FlagshipHeader
          title="Activity"
          subtitle="Orders and executions"
          onBack={handleBack}
        />
      }
    >
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
        renderItem={renderOrderItem}
        ListEmptyComponent={
          isSyncingRemote ? (
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

      <ConfirmationSheet
        visible={confirmSheet.visible}
        onDismiss={() => setConfirmSheet((prev) => ({ ...prev, visible: false }))}
        title={confirmSheet.title}
        message={confirmSheet.message}
        confirmLabel={confirmSheet.confirmLabel}
        cancelLabel={confirmSheet.cancelLabel}
        onConfirm={confirmSheet.onConfirm}
        variant={confirmSheet.variant}
      />
    </FlagshipScreen>
  );
}

const styles = StyleSheet.create({
  filterToolbar: {
    minHeight: Space.xxl + Space.xs + 2,
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
    minWidth: Space.xxl + Space.xs + 2,
    minHeight: Space.xxl + Space.xs + 2,
    paddingHorizontal: Space.sm,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  sideTabText: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
  },
  sideTabTextActive: {
    fontFamily: Typography.family.semibold,
  },
  sideTabIndicator: {
    position: 'absolute',
    bottom: -StyleSheet.hairlineWidth,
    width: Space.lg + 4,
    height: Stroke.emphasis,
    borderRadius: Stroke.hairline,
  },
  periodButton: {
    minWidth: Space.xxl + Space.xxl + Space.xxl + Space.xxl + Space.xxl + 2,
    maxWidth: Space.xxl + Space.xxl + Space.xxl + Space.xxl + Space.xxl + Space.xxl + Space.xxl + 12,
    minHeight: Space.xl + Space.xs + 4,
    paddingHorizontal: Space.sm,
    borderRadius: Radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.xs + 2,
  },
  periodButtonText: {
    flexShrink: 1,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
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
