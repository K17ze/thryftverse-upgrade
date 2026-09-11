import React, { useCallback } from 'react';
import { View, Text, StyleSheet, RefreshControl, Animated } from 'react-native';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, useFocusEffect, type RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAppTheme } from '../theme/ThemeContext';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import {
  MarketHistoryCursor,
  MarketHistoryItem,
  cancelCoOwnOrder,
  listUserMarketHistory,
  lookupCoOwnOrderByIdempotencyKey,
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
import { useInvalidateCoOwnAsset } from '../platform/server';
import type { OrderStatus } from '../data/coOwnModels';
import { t } from '../i18n';


type NavT = NativeStackNavigationProp<RootStackParamList>;

// CoOwnOrderHistory is typed as `undefined` in the shared RootStackParamList
// (navigation/types.ts — owned by another team). TradeConfirmScreen navigates
// here with orderId / assetId / idempotencyKey so the just-submitted order can
// be highlighted. Widen the route locally to read those params type-safely
// without editing the shared types (same pattern as TradeConfirmScreen).
type LocalRouteParams = { orderId?: string; assetId?: string; idempotencyKey?: string };
type LocalStackParamList = Omit<RootStackParamList, 'CoOwnOrderHistory'> & {
  CoOwnOrderHistory: LocalRouteParams | undefined;
};
type CoOwnOrderHistoryRoute = RouteProp<RootStackParamList, 'CoOwnOrderHistory'>;

type SideFilter = 'all' | 'buy' | 'sell';
type DateFilter = 'all' | '24h' | '7d' | '30d';

interface HistoryEntry {
  id: string;
  orderId: number | null;
  assetId: string;
  assetTitle: string;
  side: 'buy' | 'sell';
  type: 'market' | 'limit' | 'protected';
  quantity: number;
  pricePerShare: number;
  totalAmount: number;
  fee: number;
  status: OrderStatus;
  filledQuantity: number;
  // U36: Remaining unfilled units. Null when the backend does not report it
  // (we fall back to quantity − filledQuantity at render time).
  remainingQuantity: number | null;
  // U36: Average execution price across fills. MarketHistoryItem does not
  // expose this, so it is null until the backend provides it.
  averageExecutionPrice: number | null;
  // U36: Last update timestamp. MarketHistoryItem does not expose this, so
  // it is null until the backend provides it.
  updatedAt: string | null;
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

// U36: Derive a human-readable terminal reason from the order status. Only
// terminal states produce a reason; open orders return null (not terminal).
function deriveTerminalReason(status: OrderStatus): string | null {
  switch (status) {
    case 'filled': return 'Filled';
    case 'partially_filled': return 'Partially filled';
    case 'cancelled': return 'Cancelled';
    case 'expired': return 'Expired';
    case 'rejected': return 'Rejected';
    default: return null;
  }
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
        orderId: item.orderId ?? null,
        assetId: item.referenceId,
        assetTitle: item.note ?? 'Co-Own asset',
        side: item.action === 'buy-units' ? 'buy' : 'sell',
        type: item.orderType === 'limit'
          ? 'limit'
          : item.orderType === 'protected_market'
            ? 'protected'
            : 'market',
        quantity,
        pricePerShare,
        totalAmount: item.amountGbp,
        fee: item.feeGbp ?? Number((item.amountGbp * CO_OWN_FEE_RATE).toFixed(2)),
        status,
        filledQuantity: Math.max(0, item.filledUnits ?? (status === 'filled' ? quantity : 0)),
        // U36: remainingUnits is optional on the backend; null when absent.
        remainingQuantity: item.remainingUnits != null ? Math.max(0, item.remainingUnits) : null,
        // U36: MarketHistoryItem does not expose average execution price or
        // updatedAt. Do not fabricate — label as "Not available" at render.
        averageExecutionPrice: null,
        updatedAt: null,
        createdAt: item.timestamp,
        source: 'backend',
      };
    })
    .sort(sortHistoryEntriesDesc);
}

// Subtle, temporary highlight wrapper for the just-submitted order. Renders a
// brand-colored left accent and a faint background tint that fades out over a
// few seconds so the highlight is non-permanent. OrderHistoryRow does not
// accept an isHighlighted prop, so the wrapper is the visual vehicle.
function HighlightRowWrapper({
  children,
  isHighlighted,
  brandColor,
}: {
  children: React.ReactNode;
  isHighlighted: boolean;
  brandColor: string;
}) {
  const fade = React.useRef(new Animated.Value(isHighlighted ? 1 : 0)).current;
  React.useEffect(() => {
    if (isHighlighted) {
      fade.setValue(1);
      const anim = Animated.timing(fade, {
        toValue: 0,
        duration: 3000,
        useNativeDriver: false,
      });
      anim.start();
      return () => anim.stop();
    }
    fade.setValue(0);
  }, [isHighlighted, fade]);

  const backgroundColor = fade.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(0,0,0,0)', `${brandColor}14`],
  });
  const borderLeftColor = fade.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(0,0,0,0)', brandColor],
  });

  return (
    <Animated.View
      style={{
        backgroundColor,
        borderLeftColor,
        // A persistent 3pt left border keeps row geometry identical across
        // highlighted and non-highlighted rows; only the color animates.
        borderLeftWidth: 3,
      }}
    >
      {children}
    </Animated.View>
  );
}

export default function CoOwnOrderHistoryScreen() {
  const navigation = useNavigation<NavT>();
  const route = useRoute<CoOwnOrderHistoryRoute>();
  const { colors } = useAppTheme();
  const { show } = useToast();
  const invalidateCoOwnAsset = useInvalidateCoOwnAsset();
  const currentUser = useStore((state) => state.currentUser);
  const viewerId = currentUser?.id;

  // Highlight params are passed by TradeConfirmScreen after a successful order
  // submission (orderId) or a network error (idempotencyKey). Cast through the
  // local widening type since the shared RootStackParamList types this route
  // as `undefined`.
  const routeParams = route.params as unknown as LocalRouteParams | undefined;
  const highlightOrderId = routeParams?.orderId;
  const highlightAssetId = routeParams?.assetId;
  const highlightIdempotencyKey = routeParams?.idempotencyKey;

  const listRef = React.useRef<FlashListRef<HistoryEntry>>(null);
  const [highlightedEntryId, setHighlightedEntryId] = React.useState<string | null>(null);
  const highlightConsumedRef = React.useRef(false);
  const [recoveryStatus, setRecoveryStatus] = React.useState<
    'idle' | 'checking' | 'processing' | 'acknowledged' | 'safe_to_retry' | 'error'
  >('idle');
  const [recoveredOrderId, setRecoveredOrderId] = React.useState<number | null>(null);
  // U33: persist the recovery key locally so it survives navigation param
  // clearing. "Check result", focus refresh, and pull-to-refresh all invoke
  // the same exact-key reconciliation command via runReconciliation.
  const [recoveryKey, setRecoveryKey] = React.useState<string | null>(null);
  const [recoveryAssetId, setRecoveryAssetId] = React.useState<string | null>(null);

  const [sideFilter, setSideFilter] = React.useState<SideFilter>('all');
  const [dateFilter, setDateFilter] = React.useState<DateFilter>('all');
  const [isPeriodPickerVisible, setIsPeriodPickerVisible] = React.useState(false);
  const [remoteEntries, setRemoteEntries] = React.useState<HistoryEntry[]>([]);
  const [isSyncingRemote, setIsSyncingRemote] = React.useState(false);
  const [hasRemoteError, setHasRemoteError] = React.useState(false);
  const [isRemoteAvailable, setIsRemoteAvailable] = React.useState(false);
  const [hasMoreRemote, setHasMoreRemote] = React.useState(false);
  const [nextCursor, setNextCursor] = React.useState<MarketHistoryCursor | null>(null);
  const [isLoadingMore, setIsLoadingMore] = React.useState(false);
  // U35: A failed "load more" must not clear the cursor or hasMore — that
  // would silently turn a transient error into a false end-of-history. The
  // cursor/hasMore are preserved so the same page can be retried; the list
  // footer surfaces a retry affordance while this flag is set.
  const [loadMoreError, setLoadMoreError] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);
  const [cancellingOrderId, setCancellingOrderId] = React.useState<string | null>(null);
  // U26: orders whose cancel was definitively rejected by the server.
  // The row stays visible with a "Cancel failed — retry" control so the
  // user can re-attempt without losing context.
  const [cancelFailedOrderIds, setCancelFailedOrderIds] = React.useState<Set<string>>(new Set());
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
      setHasRemoteError(false);
      return;
    }
    setIsSyncingRemote(true);
    // A fresh sync replaces the whole list, so any prior load-more error
    // is no longer relevant.
    setLoadMoreError(false);
    try {
      const page = await listUserMarketHistory(viewerId, { channel: 'co-own', limit: PAGE_SIZE });
      setRemoteEntries(mapRemoteHistoryToEntries(page.items));
      setIsRemoteAvailable(true);
      setHasRemoteError(false);
      setHasMoreRemote(page.pageInfo.hasMore);
      setNextCursor(page.pageInfo.nextCursor ?? null);
    } catch {
      setHasRemoteError(true);
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
      setLoadMoreError(false);
    } catch {
      // U35: Preserve the already-loaded rows, the cursor and the hasMore
      // flag. Clearing them would silently turn a transient fetch failure
      // into a false end-of-history. The list footer surfaces a retry
      // affordance (driven by `loadMoreError`) so the user can re-attempt
      // the exact same cursor-based fetch.
      setLoadMoreError(true);
    } finally {
      setIsLoadingMore(false);
    }
  }, [hasMoreRemote, isLoadingMore, isRemoteAvailable, isSyncingRemote, nextCursor, viewerId]);

  const requestCancelOrder = React.useCallback((item: HistoryEntry) => {
    if (!viewerId || item.source !== 'backend') return;
    const orderId = item.orderId ?? Number(item.id.replace(/^coOwn_order_/, ''));
    if (!Number.isInteger(orderId) || orderId <= 0) return;
    setConfirmSheet({
      visible: true,
      title: 'Cancel remaining order?',
      message: `Any unfilled ${item.side} units will be cancelled and the reserved ${item.side === 'buy' ? '1ZE' : 'units'} released.`,
      confirmLabel: 'Cancel remaining',
      cancelLabel: 'Keep order',
      onConfirm: () => {
        // U26: clear any prior failure marker and enter the pending state.
        // The row stays visible with "Cancelling…" and its filled quantity
        // retained — it is never removed before acknowledgment.
        setCancelFailedOrderIds((prev) => {
          if (!prev.has(item.id)) return prev;
          const next = new Set(prev);
          next.delete(item.id);
          return next;
        });
        setCancellingOrderId(item.id);
        void cancelCoOwnOrder(item.assetId, orderId, viewerId)
          .then(() => {
            // U26: only transition to "cancelled" on explicit acknowledgment.
            setCancellingOrderId(null);
            setRemoteEntries((previous) => previous.map((entry) => (
              entry.id === item.id ? { ...entry, status: 'cancelled' as const } : entry
            )));
            // F21: one cancellation contract — reconcile the same cached
            // projections the detail screen reconciles, so holdings, book
            // and depth agree when the user returns to the asset.
            invalidateCoOwnAsset(item.assetId, viewerId);
            show('Remaining order cancelled and reservation released.', 'success');
          })
          .catch((error) => {
            const parsed = parseApiError(error, 'Unable to cancel this order');
            if (parsed.isNetworkError) {
              // U26: lost response — the cancel may have succeeded but we
              // never received the acknowledgment. Keep the row in the
              // "Cancelling…" state so the user does not assume success or
              // failure. A subsequent reconciliation (refresh / focus) will
              // resolve the true state.
              show('Checking cancel result…', 'info');
            } else {
              // U26: definitive rejection — show "Cancel failed — retry"
              // with the order still visible.
              setCancellingOrderId(null);
              setCancelFailedOrderIds((prev) => new Set(prev).add(item.id));
              show(parsed.message, 'error');
            }
          });
      },
      variant: 'danger',
    });
  }, [show, viewerId, invalidateCoOwnAsset]);

  React.useEffect(() => { void syncRemoteHistory(); }, [syncRemoteHistory]);

  // U33: persist the recovery key locally so it survives navigation param
  // clearing. The initial reconciliation effect (below) and all manual
  // triggers ("Check result", focus, pull-to-refresh) share this key.
  React.useEffect(() => {
    if (highlightIdempotencyKey && highlightAssetId && !recoveryKey) {
      setRecoveryKey(highlightIdempotencyKey);
      setRecoveryAssetId(highlightAssetId);
    }
  }, [highlightIdempotencyKey, highlightAssetId, recoveryKey]);

  // U33: single exact-key reconciliation command shared by "Check result",
  // focus refresh, and pull-to-refresh. Performs one lookup (no polling) —
  // the initial effect below handles the exponential-backoff polling.
  const runReconciliation = React.useCallback(async () => {
    if (!recoveryKey || !recoveryAssetId) return;
    setRecoveryStatus('checking');
    try {
      const result = await lookupCoOwnOrderByIdempotencyKey(recoveryAssetId, recoveryKey);
      if (result.status === 'acknowledged') {
        setRecoveredOrderId(result.order.id);
        setRecoveryStatus('acknowledged');
        return;
      }
      setRecoveryStatus(result.status);
    } catch {
      setRecoveryStatus('error');
    }
  }, [recoveryKey, recoveryAssetId]);

  // Resolve an ambiguous submission by its exact operation key. A recent
  // order is never a valid substitute. The API's 202 state is polled briefly
  // with the same key, then remains visibly unresolved.
  React.useEffect(() => {
    if (!highlightIdempotencyKey || highlightOrderId || !highlightAssetId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;

    const reconcile = async () => {
      if (cancelled) return;
      setRecoveryStatus(attempts === 0 ? 'checking' : 'processing');
      try {
        const result = await lookupCoOwnOrderByIdempotencyKey(
          highlightAssetId,
          highlightIdempotencyKey,
        );
        if (cancelled) return;
        if (result.status === 'acknowledged') {
          setRecoveredOrderId(result.order.id);
          setRecoveryStatus('acknowledged');
          return;
        }
        if (result.status === 'processing' && attempts < 5) {
          attempts += 1;
          setRecoveryStatus('processing');
          timer = setTimeout(() => void reconcile(), Math.min(1000 * 2 ** (attempts - 1), 8000));
          return;
        }
        setRecoveryStatus(result.status);
      } catch {
        if (!cancelled) setRecoveryStatus('error');
      }
    };

    void reconcile();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [highlightAssetId, highlightIdempotencyKey, highlightOrderId]);

  // Consume highlight params (orderId / idempotencyKey) once the remote history
  // has loaded. An idempotency key must first resolve to its authoritative order ID.
  // Never infer a result from recency. After consuming, clear
  // the params from navigation so a later refresh does not re-highlight.
  React.useEffect(() => {
    if (highlightConsumedRef.current) return;
    if (isSyncingRemote) return;
    const targetOrderId = highlightOrderId
      ? Number(highlightOrderId)
      : recoveredOrderId;
    if (!Number.isFinite(targetOrderId) || targetOrderId == null) return;
    if (remoteEntries.length === 0) return;

    const matchId = remoteEntries.find((e) => e.orderId === targetOrderId)?.id ?? null;

    if (matchId) {
      highlightConsumedRef.current = true;
      setHighlightedEntryId(matchId);
      // Clear the consumed params so a subsequent refresh won't re-highlight.
      (navigation as unknown as NativeStackNavigationProp<LocalStackParamList, 'CoOwnOrderHistory'>).setParams({
        orderId: undefined,
        assetId: undefined,
        idempotencyKey: undefined,
      });
    }
  }, [remoteEntries, isSyncingRemote, highlightOrderId, recoveredOrderId, navigation]);

  const handleRefresh = React.useCallback(async () => {
    setRefreshing(true);
    // U33: pull-to-refresh invokes the same exact-key reconciliation
    // command as "Check result" and focus refresh, then reloads history.
    await Promise.all([
      syncRemoteHistory(),
      recoveryStatus !== 'idle' && recoveryStatus !== 'acknowledged'
        ? runReconciliation()
        : Promise.resolve(),
    ]);
    setRefreshing(false);
  }, [syncRemoteHistory, runReconciliation, recoveryStatus]);

  const handleBack = React.useCallback(() => {
    if (navigation.canGoBack()) { navigation.goBack(); return; }
    navigation.navigate('CoOwnHub');
  }, [navigation]);

  // U33: focus refresh invokes the same exact-key reconciliation command
  // as "Check result" and pull-to-refresh, so returning to the screen after
  // a lost response re-checks the result without a duplicate submission.
  useFocusEffect(
    React.useCallback(() => {
      if (recoveryStatus !== 'idle' && recoveryStatus !== 'acknowledged' && recoveryKey) {
        void runReconciliation();
      }
    }, [recoveryStatus, recoveryKey, runReconciliation]),
  );

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

  // Auto-scroll to the highlighted row once it is present in the filtered list.
  React.useEffect(() => {
    if (!highlightedEntryId) return;
    const index = entries.findIndex((e) => e.id === highlightedEntryId);
    if (index < 0) return;
    // Defer until the list has laid out the target row.
    const timer = setTimeout(() => {
      try {
        listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.4 });
      } catch {
        // scrollToIndex may throw if the row hasn't been laid out yet; the
        // highlight alone is sufficient fallback.
      }
    }, 120);
    return () => clearTimeout(timer);
  }, [highlightedEntryId, entries]);

  // Clear the highlight after a few seconds so it is temporary.
  React.useEffect(() => {
    if (!highlightedEntryId) return;
    const timer = setTimeout(() => setHighlightedEntryId(null), 4000);
    return () => clearTimeout(timer);
  }, [highlightedEntryId]);

  // FlashList v2 performance: memoized renderItem prevents full re-render of
  // all visible order history rows on every parent state change.
  // (Audit §FlashList v2 / LIST_RENDERING_POLICY.md §3.1)
  const renderOrderItem = useCallback(({ item }: { item: HistoryEntry }) => (
    <HighlightRowWrapper
      isHighlighted={highlightedEntryId === item.id}
      brandColor={colors.brand}
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
        onCancel={item.source === 'backend' && (item.status === 'open' || item.status === 'partially_filled')
          ? () => requestCancelOrder(item)
          : undefined}
        isCancelling={cancellingOrderId === item.id}
        cancelFailed={cancelFailedOrderIds.has(item.id)}
        onPress={() => { haptics.tap(); navigation.navigate('AssetDetail', { assetId: item.assetId }); }}
        // U36: multi-fill receipt detail. Only surface the expandable receipt
        // for orders that have executed or reached a terminal state — open
        // orders with no fills have no execution receipt to show.
        showReceipt={item.source === 'backend' && item.status !== 'open'}
        remainingQuantity={item.remainingQuantity != null
          ? item.remainingQuantity
          : Math.max(0, item.quantity - item.filledQuantity)}
        fee={formatCoOwnIze(item.fee)}
        averageExecutionPrice={item.averageExecutionPrice != null
          ? formatCoOwnIze(item.averageExecutionPrice)
          : null}
        updatedAt={item.updatedAt}
        terminalReason={deriveTerminalReason(item.status)}
      />
    </HighlightRowWrapper>
  ), [
    formatCoOwnIze,
    requestCancelOrder,
    cancellingOrderId,
    cancelFailedOrderIds,
    haptics,
    navigation,
    highlightedEntryId,
    colors.brand,
  ]);

  // U35: List footer. Shows a "Load more" spinner while fetching the next
  // page, or a retry affordance when the last "load more" failed — without
  // clearing the already-loaded rows, cursor or hasMore flag.
  const renderListFooter = useCallback(() => {
    if (loadMoreError) {
      return (
        <View style={styles.footerRetryWrap}>
          <AnimatedPressable
            style={[styles.footerRetryButton, { backgroundColor: colors.surfaceAlt }]}
            onPress={() => { haptics.tap(); void loadMoreRemoteHistory(); }}
            activeOpacity={0.72}
            accessibilityRole="button"
            accessibilityLabel="Retry loading more orders"
          >
            <Ionicons name="refresh-outline" size={15} color={colors.textSecondary} />
            <Text style={[styles.footerRetryText, { color: colors.textSecondary }]} numberOfLines={1}>
              Couldn’t load more — retry
            </Text>
          </AnimatedPressable>
        </View>
      );
    }
    if (isLoadingMore) {
      return (
        <View style={styles.footerLoadingWrap}>
          <Text style={[styles.footerLoadingText, { color: colors.textMuted }]}>Loading more…</Text>
        </View>
      );
    }
    return null;
  }, [loadMoreError, isLoadingMore, colors.surfaceAlt, colors.textSecondary, colors.textMuted, loadMoreRemoteHistory]);

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

      {recoveryStatus !== 'idle' ? (
        <View
          style={[styles.recoveryBanner, { backgroundColor: colors.warningSubtle, borderBottomColor: colors.border }]}
          accessibilityRole="alert"
        >
          <Text style={[styles.recoveryBannerTitle, { color: colors.textPrimary }]}>
            {recoveryStatus === 'acknowledged'
              ? 'Order result recovered'
              : recoveryStatus === 'safe_to_retry'
                ? 'No order was found for that attempt'
                : recoveryStatus === 'error'
                  ? 'Order result needs checking'
                  : 'Checking order result…'}
          </Text>
          <Text style={[styles.recoveryBannerBody, { color: colors.textSecondary }]}>
            {recoveryStatus === 'acknowledged'
              ? 'The highlighted row is matched to the original submission key.'
              : recoveryStatus === 'safe_to_retry'
                ? 'Nothing was acknowledged for this operation. Review before retrying.'
                : recoveryStatus === 'error'
                  ? 'We could not verify the operation yet. Check result when your connection is stable.'
                  : 'The server has not confirmed this operation yet. Do not submit a duplicate order.'}
          </Text>
          {/* U33: "Check result" invokes the same exact-key reconciliation
              command as focus refresh and pull-to-refresh. Shown for
              unresolved states so the user can re-check without a duplicate. */}
          {recoveryStatus === 'error' || recoveryStatus === 'safe_to_retry' || recoveryStatus === 'processing' ? (
            <AnimatedPressable
              style={styles.recoveryCheckButton}
              onPress={() => { haptics.tap(); void runReconciliation(); }}
              activeOpacity={0.72}
              accessibilityRole="button"
              accessibilityLabel="Check order result"
            >
              <Text style={[styles.recoveryCheckText, { color: colors.textPrimary }]}>
                Check result
              </Text>
            </AnimatedPressable>
          ) : null}
        </View>
      ) : null}

      <FlashList
        ref={listRef as unknown as React.Ref<FlashListRef<HistoryEntry>>}
        data={entries}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        onEndReached={() => void loadMoreRemoteHistory()}
        onEndReachedThreshold={0.5}
        renderItem={renderOrderItem}
        ListFooterComponent={renderListFooter}
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
          ) : hasRemoteError ? (
            <CoOwnStateCanvas
              variant="error"
              title="Activity unavailable"
              subtitle="We could not verify your order history. Try again when your connection is stable."
              actionLabel="Retry"
              onAction={() => { void syncRemoteHistory(); }}
              emptyGraphicVariant="box"
            />
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
  recoveryBanner: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 2,
  },
  recoveryBannerTitle: {
    fontSize: TypographyV2.bodyStrong.size,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
  },
  recoveryBannerBody: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
  },
  recoveryCheckButton: {
    alignSelf: 'flex-start',
    marginTop: Space.xs,
    paddingVertical: Space.xs + 2,
    paddingHorizontal: Space.sm,
  },
  recoveryCheckText: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
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
  // U35: footer retry / loading affordances
  footerRetryWrap: {
    paddingVertical: Space.md,
    paddingHorizontal: Space.md,
    alignItems: 'center',
  },
  footerRetryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 1,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderRadius: Radius.md,
  },
  footerRetryText: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
  },
  footerLoadingWrap: {
    paddingVertical: Space.md,
    alignItems: 'center',
  },
  footerLoadingText: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
  },
});
