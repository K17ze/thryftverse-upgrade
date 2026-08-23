/**
 * TradeHubScreen — central trading surface for Co-Own markets.
 *
 * Layout family: denseUtilityList
 *
 * Shows:
 *   1. Your open orders (if any) — actionable rows with cancel
 *   2. Tradeable assets — flat rows with price, availability, Buy/Sell actions
 *   3. Recent trade history — compact ledger entries
 *
 * Per 2026 UX research:
 *   - The trade button must be reachable in one tap from anywhere
 *   - Clear visual hierarchy: price dominates, secondary metrics muted
 *   - Progressive disclosure: full order book lives on AssetDetail
 *   - No gamification — calm, factual presentation
 */

import React, { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  RefreshControl,
  Pressable,
  Alert,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAppTheme } from '../theme/ThemeContext';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import {
  listCoOwnAssets,
  listUserMarketHistory,
  cancelCoOwnOrder,
  type MarketCoOwnAsset,
  type MarketHistoryItem,
  type MarketHistoryCursor,
} from '../services/marketApi';
import { parseApiError } from '../lib/apiClient';
import { useToast } from '../context/ToastContext';
import { Space, Radius, Type, Typography, Stroke, Control, FontFamily } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { RadiusRoleValue } from '../theme/surfaceRadiusRules';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { CachedImage } from '../components/CachedImage';
import { CoOwnStateCanvas, CoOwnActivitySkeleton } from '../components/coown';
import { haptics } from '../utils/haptics';
import { formatCoOwnIze } from '../utils/currency';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useConnectivity } from '../hooks/useConnectivity';
import { useReducedMotion } from '../hooks/useReducedMotion';

type NavT = NativeStackNavigationProp<RootStackParamList>;

type HubFilter = 'all' | 'open_orders' | 'history';

interface TradeableAsset {
  id: string;
  title: string;
  image: string;
  totalUnits: number;
  availableUnits: number;
  unitPriceGbp: number;
  isOpen: boolean;
  holders: number;
  createdAt: string;
}

interface OpenOrderEntry {
  id: string;
  assetId: string;
  assetTitle: string;
  side: 'buy' | 'sell';
  units: number;
  filledUnits: number;
  remainingUnits: number;
  unitPriceGbp: number;
  totalGbp: number;
  status: string;
  createdAt: string;
  orderId: number;
}

interface HistoryEntry {
  id: string;
  assetId: string;
  assetTitle: string;
  side: 'buy' | 'sell';
  units: number;
  unitPriceGbp: number;
  totalGbp: number;
  status: string;
  timestamp: string;
}

const FILTERS: Array<{ value: HubFilter; label: string; accessibilityLabel: string }> = [
  { value: 'all', label: 'Markets', accessibilityLabel: 'Show all tradeable markets' },
  { value: 'open_orders', label: 'Open orders', accessibilityLabel: 'Show your open orders' },
  { value: 'history', label: 'History', accessibilityLabel: 'Show trade history' },
];

const PAGE_SIZE = 40;

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.max(1, Math.floor(diffMs / 60_000));
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function mapOpenOrders(history: MarketHistoryItem[]): OpenOrderEntry[] {
  return history
    .filter(
      (item) =>
        item.channel === 'co-own' &&
        (item.action === 'buy-units' || item.action === 'sell-units') &&
        (item.status === 'open' || item.status === 'partially_filled'),
    )
    .map((item) => {
      // Extract numeric order ID from the history item ID. The backend
      // doesn't currently expose a separate orderId field on MarketHistoryItem,
      // so we parse the trailing digits. This handles formats like
      // "co-own-order-12345" and "order:12345" but falls back to 0
      // (which the cancel handler guards against) for unparseable IDs.
      const orderIdMatch = item.id.match(/(\d+)$/);
      const orderId = orderIdMatch ? parseInt(orderIdMatch[1], 10) : 0;
      return {
        id: item.id,
        assetId: item.referenceId,
        assetTitle: item.note ?? 'Co-Own asset',
        side: item.action === 'buy-units' ? 'buy' : 'sell',
        units: item.units ?? 0,
        filledUnits: item.filledUnits ?? 0,
        remainingUnits: item.remainingUnits ?? (item.units ?? 0),
        unitPriceGbp: item.unitPriceGbp ?? 0,
        totalGbp: item.amountGbp,
        status: item.status ?? 'open',
        createdAt: item.timestamp,
        orderId,
      };
    });
}

function mapHistory(history: MarketHistoryItem[]): HistoryEntry[] {
  return history
    .filter(
      (item) =>
        item.channel === 'co-own' &&
        (item.action === 'buy-units' || item.action === 'sell-units') &&
        (item.status === 'filled' || item.status === 'partially_filled'),
    )
    .map((item) => ({
      id: item.id,
      assetId: item.referenceId,
      assetTitle: item.note ?? 'Co-Own asset',
      side: item.action === 'buy-units' ? 'buy' : 'sell',
      units: item.units ?? 0,
      unitPriceGbp: item.unitPriceGbp ?? 0,
      totalGbp: item.amountGbp,
      status: item.status ?? 'filled',
      timestamp: item.timestamp,
    }));
}

type TradeRow =
  | { kind: 'filter'; key: 'filter' }
  | { kind: 'sectionHeader'; key: string; title: string; count?: number }
  | { kind: 'openOrder'; key: string; order: OpenOrderEntry }
  | { kind: 'tradeable'; key: string; asset: TradeableAsset }
  | { kind: 'history'; key: string; entry: HistoryEntry }
  | { kind: 'empty'; key: 'empty' };

export default function TradeHubScreen() {
  const navigation = useNavigation<NavT>();
  const { colors } = useAppTheme();
  const { formatFromFiat } = useFormattedPrice();
  const { show } = useToast();
  const { isOffline } = useConnectivity();
  const reducedMotion = useReducedMotion();
  const currentUser = useStore((state) => state.currentUser);
  const viewerId = currentUser?.id ?? '';

  const [activeFilter, setActiveFilter] = React.useState<HubFilter>('all');
  const [assets, setAssets] = React.useState<TradeableAsset[]>([]);
  const [openOrders, setOpenOrders] = React.useState<OpenOrderEntry[]>([]);
  const [historyEntries, setHistoryEntries] = React.useState<HistoryEntry[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [cancellingOrderId, setCancellingOrderId] = React.useState<string | null>(null);
  const [hasMoreHistory, setHasMoreHistory] = React.useState(false);
  const [nextCursor, setNextCursor] = React.useState<MarketHistoryCursor | null>(null);
  const [isLoadingMore, setIsLoadingMore] = React.useState(false);

  const loadData = React.useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    if (mode === 'refresh') setIsRefreshing(true);
    else setIsLoading(true);

    try {
      const [assetResult, historyResult] = await Promise.all([
        listCoOwnAssets({ limit: 120 }),
        viewerId
          ? listUserMarketHistory(viewerId, { channel: 'co-own', limit: PAGE_SIZE })
          : Promise.resolve({ items: [] as MarketHistoryItem[], pageInfo: { hasMore: false, nextCursor: undefined } }),
      ]);

      setAssets(
        assetResult.map((item: MarketCoOwnAsset) => ({
          id: item.id,
          title: item.title,
          image: item.imageUrl ?? '',
          totalUnits: item.totalUnits,
          availableUnits: item.availableUnits,
          unitPriceGbp: item.unitPriceGbp,
          isOpen: item.isOpen,
          holders: item.holders,
          createdAt: item.createdAt,
        })),
      );

      const allHistory = historyResult.items;
      setOpenOrders(mapOpenOrders(allHistory));
      setHistoryEntries(mapHistory(allHistory));
      setHasMoreHistory(historyResult.pageInfo.hasMore);
      setNextCursor(historyResult.pageInfo.nextCursor ?? null);
    } catch (err) {
      const parsed = parseApiError(err, 'Unable to load trade hub');
      show(parsed.message, 'error');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [viewerId, show]);

  React.useEffect(() => {
    void loadData();
  }, [loadData]);

  const loadMoreHistory = React.useCallback(async () => {
    if (!hasMoreHistory || !nextCursor || isLoadingMore || !viewerId) return;
    setIsLoadingMore(true);
    try {
      const page = await listUserMarketHistory(viewerId, {
        channel: 'co-own',
        limit: PAGE_SIZE,
        cursorTs: nextCursor.cursorTs,
        cursorId: nextCursor.cursorId,
      });
      const newHistory = mapHistory(page.items);
      setHistoryEntries((prev) => {
        const merged = [...prev, ...newHistory];
        const deduped = new Map<string, HistoryEntry>();
        for (const item of merged) deduped.set(item.id, item);
        return [...deduped.values()];
      });
      setHasMoreHistory(page.pageInfo.hasMore);
      setNextCursor(page.pageInfo.nextCursor ?? null);
    } catch {
      setHasMoreHistory(false);
    } finally {
      setIsLoadingMore(false);
    }
  }, [hasMoreHistory, nextCursor, isLoadingMore, viewerId]);

  const handleRefresh = React.useCallback(() => {
    void loadData('refresh');
  }, [loadData]);

  const handleCancelOrder = React.useCallback((order: OpenOrderEntry) => {
    if (!viewerId || order.orderId <= 0) return;
    Alert.alert(
      'Cancel order?',
      `Cancel the remaining ${order.remainingUnits} ${order.side === 'buy' ? 'buy' : 'sell'} units?`,
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Cancel order',
          style: 'destructive',
          onPress: () => {
            setCancellingOrderId(order.id);
            void cancelCoOwnOrder(order.assetId, order.orderId, viewerId)
              .then(() => {
                setOpenOrders((prev) =>
                  prev.map((o) =>
                    o.id === order.id ? { ...o, status: 'cancelled', remainingUnits: 0 } : o,
                  ),
                );
                show('Order cancelled', 'success');
              })
              .catch((error) => {
                const parsed = parseApiError(error, 'Unable to cancel order');
                show(parsed.message, 'error');
              })
              .finally(() => setCancellingOrderId(null));
          },
        },
      ],
    );
  }, [viewerId, show]);

  const handleBack = React.useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    navigation.navigate('MainTabs');
  }, [navigation]);

  // ── Build flat row list for FlashList ──
  const rows = React.useMemo<TradeRow[]>(() => {
    const result: TradeRow[] = [];

    // Filter tabs always first
    result.push({ kind: 'filter', key: 'filter' });

    if (activeFilter === 'all') {
      // Open orders first (if any), then tradeable markets
      if (openOrders.length > 0) {
        result.push({ kind: 'sectionHeader', key: 'open-header', title: 'Your open orders', count: openOrders.length });
        for (const order of openOrders) {
          result.push({ kind: 'openOrder', key: `order-${order.id}`, order });
        }
      }

      const tradeable = assets.filter((a) => a.isOpen && a.availableUnits > 0);
      result.push({ kind: 'sectionHeader', key: 'markets-header', title: 'Tradeable markets', count: tradeable.length });
      for (const asset of tradeable) {
        result.push({ kind: 'tradeable', key: `asset-${asset.id}`, asset });
      }

      if (tradeable.length === 0 && openOrders.length === 0) {
        result.push({ kind: 'empty', key: 'empty' });
      }
    } else if (activeFilter === 'open_orders') {
      if (openOrders.length > 0) {
        result.push({ kind: 'sectionHeader', key: 'open-header', title: 'Open orders', count: openOrders.length });
        for (const order of openOrders) {
          result.push({ kind: 'openOrder', key: `order-${order.id}`, order });
        }
      } else {
        result.push({ kind: 'empty', key: 'empty' });
      }
    } else if (activeFilter === 'history') {
      if (historyEntries.length > 0) {
        result.push({ kind: 'sectionHeader', key: 'history-header', title: 'Trade history', count: historyEntries.length });
        for (const entry of historyEntries) {
          result.push({ kind: 'history', key: `history-${entry.id}`, entry });
        }
      } else {
        result.push({ kind: 'empty', key: 'empty' });
      }
    }

    return result;
  }, [activeFilter, assets, openOrders, historyEntries]);

  // ── Loading state ──
  if (isLoading) {
    return (
      <FlagshipScreen
        header={
          <FlagshipHeader
            title="Trade"
            subtitle="Co-Own markets"
            onBack={handleBack}
          />
        }
        scrollEnabled={false}
        contentStyle={{ paddingHorizontal: 0, paddingTop: 0 }}
      >
        <CoOwnActivitySkeleton />
      </FlagshipScreen>
    );
  }

  const renderFilter = useCallback(() => (
    <View style={[styles.filterBar, { borderBottomColor: colors.border }]}>
      {FILTERS.map((filter) => {
        const isActive = activeFilter === filter.value;
        const count =
          filter.value === 'open_orders'
            ? openOrders.length
            : filter.value === 'history'
              ? historyEntries.length
              : assets.filter((a) => a.isOpen && a.availableUnits > 0).length;
        return (
          <Pressable
            key={filter.value}
            onPress={() => { haptics.selection(); setActiveFilter(filter.value); }}
            style={({ pressed }) => [
              styles.filterTab,
              isActive && { borderBottomColor: colors.textPrimary },
              pressed && { opacity: 0.7 },
            ]}
            accessibilityRole="tab"
            accessibilityLabel={filter.accessibilityLabel}
            accessibilityState={{ selected: isActive }}
          >
            <Text
              style={[
                styles.filterTabText,
                {
                  color: isActive ? colors.textPrimary : colors.textSecondary,
                  fontFamily: isActive ? FontFamily.semibold : FontFamily.regular,
                },
              ]}
            >
              {filter.label}
            </Text>
            {count > 0 && (
              <View style={[styles.filterBadge, { backgroundColor: colors.surfaceAlt }]}>
                <Text style={[styles.filterBadgeText, { color: colors.textSecondary }]}>
                  {count}
                </Text>
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  ), [activeFilter, colors, openOrders.length, historyEntries.length, assets]);

  const renderSectionHeader = useCallback((title: string, count?: number) => (
    <View style={styles.sectionHeader}>
      <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{title}</Text>
      {count != null && (
        <Text style={[styles.sectionCount, { color: colors.textMuted }]}>{count}</Text>
      )}
    </View>
  ), [colors]);

  const renderOpenOrder = useCallback((order: OpenOrderEntry) => {
    const isBuy = order.side === 'buy';
    const sideColor = isBuy ? colors.success : colors.danger;
    const isCancelling = cancellingOrderId === order.id;
    const fillPct = order.units > 0 ? Math.round((order.filledUnits / order.units) * 100) : 0;

    return (
      <View style={[styles.orderRow, { borderBottomColor: colors.border }]}>
        <View style={[styles.orderSideIndicator, { backgroundColor: sideColor }]} />
        <Pressable
          style={({ pressed }) => [styles.orderInfo, pressed && { opacity: 0.7 }]}
          onPress={() => { haptics.tap(); navigation.navigate('AssetDetail', { assetId: order.assetId }); }}
          accessibilityRole="button"
          accessibilityLabel={`${isBuy ? 'Buy' : 'Sell'} order, ${order.remainingUnits} units remaining, ${formatCoOwnIze(order.unitPriceGbp)} per unit, ${order.assetTitle}`}
        >
          <View style={styles.orderHeaderRow}>
            <Text style={[styles.orderSide, { color: sideColor }]}>
              {isBuy ? 'Buy' : 'Sell'}
            </Text>
            <Text style={[styles.orderAsset, { color: colors.textPrimary }]} numberOfLines={1}>
              {order.assetTitle}
            </Text>
          </View>
          <View style={styles.orderMetrics}>
            <Text style={[styles.orderMetricValue, { color: colors.textPrimary }]}>
              {order.remainingUnits}
            </Text>
            <Text style={[styles.orderMetricLabel, { color: colors.textMuted }]}>remaining</Text>
            <Text style={[styles.orderMetricSeparator, { color: colors.border }]}>·</Text>
            <Text style={[styles.orderMetricValue, { color: colors.textPrimary }]}>
              {formatCoOwnIze(order.unitPriceGbp)}
            </Text>
            <Text style={[styles.orderMetricLabel, { color: colors.textMuted }]}>/unit</Text>
          </View>
          {order.filledUnits > 0 && (
            <View style={styles.orderFillRow}>
              <View style={[styles.orderFillTrack, { backgroundColor: colors.surfaceAlt }]}>
                <View style={[styles.orderFillBar, { width: `${fillPct}%`, backgroundColor: sideColor }]} />
              </View>
              <Text style={[styles.orderFillText, { color: colors.textMuted }]}>
                {order.filledUnits}/{order.units} filled
              </Text>
            </View>
          )}
          <Text style={[styles.orderTime, { color: colors.textMuted }]}>
            {formatRelativeTime(order.createdAt)}
          </Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.cancelBtn, pressed && { opacity: 0.5 }]}
          onPress={() => { haptics.tap(); handleCancelOrder(order); }}
          disabled={isCancelling}
          accessibilityRole="button"
          accessibilityLabel="Cancel order"
          hitSlop={12}
        >
          <Ionicons
            name={isCancelling ? 'hourglass-outline' : 'close-circle-outline'}
            size={22}
            color={colors.danger}
          />
        </Pressable>
      </View>
    );
  }, [colors, cancellingOrderId, handleCancelOrder, navigation]);

  const renderTradeable = useCallback((asset: TradeableAsset) => {
    const allocatedPct = asset.totalUnits > 0
      ? Math.round(((asset.totalUnits - asset.availableUnits) / asset.totalUnits) * 100)
      : 0;

    return (
      <View style={[styles.tradeableRow, { borderBottomColor: colors.border }]}>
        <Pressable
          style={({ pressed }) => [styles.tradeableInfo, pressed && { opacity: 0.7 }]}
          onPress={() => { haptics.tap(); navigation.navigate('AssetDetail', { assetId: asset.id }); }}
          accessibilityRole="button"
          accessibilityLabel={`${asset.title}, ${formatCoOwnIze(asset.unitPriceGbp)} per unit, ${asset.availableUnits} available`}
        >
          <CachedImage
            uri={asset.image}
            style={styles.tradeableThumb}
            containerStyle={styles.tradeableThumbContainer}
            contentFit="cover"
            emptyLabel={asset.title}
            emptyIcon="diamond-outline"
          />
          <View style={styles.tradeableBody}>
            <Text style={[styles.tradeableTitle, { color: colors.textPrimary }]} numberOfLines={1}>
              {asset.title}
            </Text>
            <View style={styles.tradeablePriceRow}>
              <Text style={[styles.tradeablePrice, { color: colors.textPrimary }]}>
                {formatCoOwnIze(asset.unitPriceGbp)}
              </Text>
              <Text style={[styles.tradeablePriceUnit, { color: colors.textMuted }]}>/unit</Text>
            </View>
            <View style={styles.tradeableMetaRow}>
              <View style={[styles.tradeableAvailabilityDot, {
                backgroundColor: asset.isOpen ? colors.success : colors.textMuted,
              }]} />
              <Text style={[styles.tradeableMeta, { color: colors.textSecondary }]}>
                {asset.availableUnits} available
              </Text>
              <Text style={[styles.tradeableMetaSeparator, { color: colors.border }]}>·</Text>
              <Text style={[styles.tradeableMeta, { color: colors.textSecondary }]}>
                {allocatedPct}% funded
              </Text>
            </View>
          </View>
        </Pressable>
        <View style={styles.tradeableActions}>
          <AnimatedPressable
            style={[styles.tradeActionBtn, { backgroundColor: colors.successSubtle, borderColor: colors.successBorder }]}
            onPress={() => { haptics.tap(); navigation.navigate('Trade', { assetId: asset.id, side: 'buy' }); }}
            scaleValue={reducedMotion ? 1 : 0.95}
            hapticFeedback="light"
            accessibilityRole="button"
            accessibilityLabel={`Buy ${asset.title}`}
          >
            <Text style={[styles.tradeActionText, { color: colors.success }]}>Buy</Text>
          </AnimatedPressable>
          <AnimatedPressable
            style={[styles.tradeActionBtn, { backgroundColor: colors.dangerSubtle, borderColor: colors.dangerBorder }]}
            onPress={() => { haptics.tap(); navigation.navigate('Trade', { assetId: asset.id, side: 'sell' }); }}
            scaleValue={reducedMotion ? 1 : 0.95}
            hapticFeedback="light"
            accessibilityRole="button"
            accessibilityLabel={`Sell ${asset.title}`}
          >
            <Text style={[styles.tradeActionText, { color: colors.danger }]}>Sell</Text>
          </AnimatedPressable>
        </View>
      </View>
    );
  }, [colors, navigation, reducedMotion]);

  const renderHistory = useCallback((entry: HistoryEntry) => {
    const isBuy = entry.side === 'buy';
    const sideColor = isBuy ? colors.success : colors.danger;

    return (
      <Pressable
        style={({ pressed }) => [styles.historyRow, { borderBottomColor: colors.border }, pressed && { opacity: 0.7 }]}
        onPress={() => { haptics.tap(); navigation.navigate('AssetDetail', { assetId: entry.assetId }); }}
        accessibilityRole="button"
        accessibilityLabel={`${isBuy ? 'Buy' : 'Sell'} filled, ${entry.units} units, ${formatCoOwnIze(entry.totalGbp)}, ${entry.assetTitle}`}
      >
        <View style={[styles.historySideIndicator, { backgroundColor: sideColor }]} />
        <View style={styles.historyBody}>
          <View style={styles.historyHeaderRow}>
            <Text style={[styles.historySide, { color: sideColor }]}>
              {isBuy ? 'Buy' : 'Sell'}
            </Text>
            <Text style={[styles.historyAsset, { color: colors.textPrimary }]} numberOfLines={1}>
              {entry.assetTitle}
            </Text>
          </View>
          <View style={styles.historyMetrics}>
            <Text style={[styles.historyMetric, { color: colors.textSecondary }]}>
              {entry.units} units
            </Text>
            <Text style={[styles.historyMetricSeparator, { color: colors.border }]}>·</Text>
            <Text style={[styles.historyMetric, { color: colors.textSecondary }]}>
              {formatCoOwnIze(entry.unitPriceGbp)}/unit
            </Text>
          </View>
        </View>
        <View style={styles.historyRight}>
          <Text style={[styles.historyTotal, { color: colors.textPrimary }]}>
            {formatCoOwnIze(entry.totalGbp)}
          </Text>
          <Text style={[styles.historyTime, { color: colors.textMuted }]}>
            {formatRelativeTime(entry.timestamp)}
          </Text>
        </View>
      </Pressable>
    );
  }, [colors, navigation]);

  const renderItem = useCallback(({ item }: { item: TradeRow }) => {
    if (item.kind === 'filter') return renderFilter();
    if (item.kind === 'sectionHeader') return renderSectionHeader(item.title, item.count);
    if (item.kind === 'openOrder') return renderOpenOrder(item.order);
    if (item.kind === 'tradeable') return renderTradeable(item.asset);
    if (item.kind === 'history') return renderHistory(item.entry);
    if (item.kind === 'empty') {
      const emptyTitle =
        activeFilter === 'open_orders' ? 'No open orders'
        : activeFilter === 'history' ? 'No trade history'
        : 'No tradeable markets';
      const emptySubtitle =
        activeFilter === 'open_orders' ? 'Your open orders will appear here.'
        : activeFilter === 'history' ? 'Your filled trades will appear here.'
        : 'Tradeable markets will appear here once assets are listed.';
      return (
        <CoOwnStateCanvas
          variant="empty"
          title={emptyTitle}
          subtitle={emptySubtitle}
          actionLabel="Browse items"
          onAction={() => navigation.navigate('CoOwnHub')}
          emptyGraphicVariant="box"
        />
      );
    }
    return null;
  }, [activeFilter, navigation, renderFilter, renderSectionHeader, renderOpenOrder, renderTradeable, renderHistory]);

  return (
    <FlagshipScreen
      header={
        <FlagshipHeader
          title="Trade"
          subtitle="Co-Own markets"
          onBack={handleBack}
          rightAction={
            <AnimatedPressable
              onPress={() => navigation.navigate('CoOwnOrderHistory')}
              scaleValue={0.9}
              hapticFeedback="light"
              accessibilityRole="button"
              accessibilityLabel="Activity"
              accessibilityHint="View order history"
              hitSlop={8}
            >
              <Ionicons name="receipt-outline" size={22} color={colors.textPrimary} />
            </AnimatedPressable>
          }
        />
      }
      scrollEnabled={false}
      contentStyle={{ paddingHorizontal: 0, paddingTop: 0 }}
    >
      <FlashList
        data={rows}
        keyExtractor={(item) => item.key}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        renderItem={renderItem}
        onEndReached={() => { if (activeFilter === 'history') void loadMoreHistory(); }}
        onEndReachedThreshold={0.5}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
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
  listContent: {
    paddingBottom: Space.xl,
  },

  // ── Filter bar ──
  filterBar: {
    flexDirection: 'row',
    paddingHorizontal: Space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  filterTab: {
    paddingVertical: Space.sm + 2,
    paddingHorizontal: Space.md,
    alignItems: 'center',
    borderBottomWidth: Stroke.emphasis,
    borderBottomColor: 'transparent',
    flexDirection: 'row',
    gap: Space.xs,
  },
  filterTabText: {
    fontSize: Type.bodyStrong.size,
    lineHeight: Type.bodyStrong.lineHeight,
  },
  filterBadge: {
    borderRadius: Radius.full,
    paddingHorizontal: Space.xs + 2,
    paddingVertical: Space.xxs,
    minWidth: 20,
    alignItems: 'center',
  },
  filterBadgeText: {
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: FontFamily.semibold,
    fontVariant: ['tabular-nums'],
  },

  // ── Section header ──
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    paddingTop: Space.lg,
    paddingBottom: Space.sm,
  },
  sectionTitle: {
    fontSize: Type.subtitle.size,
    lineHeight: Type.subtitle.lineHeight,
    fontFamily: FontFamily.semibold,
    letterSpacing: Type.subtitle.letterSpacing,
  },
  sectionCount: {
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    fontFamily: FontFamily.medium,
    fontVariant: ['tabular-nums'],
  },

  // ── Open order row ──
  orderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.md,
    paddingVertical: Space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: Control.hit,
  },
  orderSideIndicator: {
    width: 3,
    alignSelf: 'stretch',
    borderRadius: Radius.sm,
    marginRight: Space.sm,
  },
  orderInfo: {
    flex: 1,
    minWidth: 0,
  },
  orderHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  orderSide: {
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    fontFamily: FontFamily.bold,
    textTransform: 'uppercase',
    letterSpacing: Type.label.letterSpacing,
  },
  orderAsset: {
    flex: 1,
    fontSize: Type.bodyStrong.size,
    lineHeight: Type.bodyStrong.lineHeight,
    fontFamily: FontFamily.semibold,
    letterSpacing: Type.bodyStrong.letterSpacing,
  },
  orderMetrics: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Space.xs,
    marginTop: Space.xs,
  },
  orderMetricValue: {
    fontSize: Type.bodyStrong.size,
    lineHeight: Type.bodyStrong.lineHeight,
    fontFamily: FontFamily.bold,
    fontVariant: ['tabular-nums'],
  },
  orderMetricLabel: {
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: FontFamily.regular,
  },
  orderMetricSeparator: {
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
  },
  orderFillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    marginTop: Space.xs,
  },
  orderFillTrack: {
    flex: 1,
    height: 3,
    borderRadius: Radius.sm,
    overflow: 'hidden',
  },
  orderFillBar: {
    height: '100%',
    borderRadius: Radius.sm,
  },
  orderFillText: {
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: FontFamily.medium,
    fontVariant: ['tabular-nums'],
  },
  orderTime: {
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: FontFamily.regular,
    marginTop: Space.xs,
  },
  cancelBtn: {
    width: Control.hit,
    height: Control.hit,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // ── Tradeable asset row ──
  tradeableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: Control.hit + Space.sm,
  },
  tradeableInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    minWidth: 0,
  },
  tradeableThumbContainer: {
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  tradeableThumb: {
    width: Space.xxl + Space.xs,
    height: Space.xxl + Space.xs,
  },
  tradeableBody: {
    flex: 1,
    minWidth: 0,
    gap: Space.xs / 2,
  },
  tradeableTitle: {
    fontSize: Type.bodyStrong.size,
    lineHeight: Type.bodyStrong.lineHeight,
    fontFamily: FontFamily.semibold,
    letterSpacing: Type.bodyStrong.letterSpacing,
  },
  tradeablePriceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Space.xs,
  },
  tradeablePrice: {
    fontSize: Type.priceList.size,
    lineHeight: Type.priceList.lineHeight,
    fontFamily: FontFamily.bold,
    fontVariant: ['tabular-nums'],
    letterSpacing: Type.priceList.letterSpacing,
  },
  tradeablePriceUnit: {
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: FontFamily.regular,
  },
  tradeableMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  tradeableAvailabilityDot: {
    width: Space.xs,
    height: Space.xs,
    borderRadius: Radius.sm,
  },
  tradeableMeta: {
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    fontFamily: FontFamily.regular,
  },
  tradeableMetaSeparator: {
    fontSize: Type.caption.size,
  },
  tradeableActions: {
    flexDirection: 'row',
    gap: Space.xs,
  },
  tradeActionBtn: {
    paddingHorizontal: Space.sm + 2,
    paddingVertical: Space.xs + 2,
    borderRadius: RadiusRoleValue.compactControl,
    borderWidth: Stroke.standard,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tradeActionText: {
    fontSize: Type.bodyStrong.size,
    lineHeight: Type.bodyStrong.lineHeight,
    fontFamily: FontFamily.bold,
  },

  // ── History row ──
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: Control.hit,
  },
  historySideIndicator: {
    width: 3,
    alignSelf: 'stretch',
    borderRadius: Radius.sm,
    marginRight: Space.sm,
  },
  historyBody: {
    flex: 1,
    minWidth: 0,
  },
  historyHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  historySide: {
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    fontFamily: FontFamily.bold,
    textTransform: 'uppercase',
    letterSpacing: Type.label.letterSpacing,
  },
  historyAsset: {
    flex: 1,
    fontSize: Type.bodyStrong.size,
    lineHeight: Type.bodyStrong.lineHeight,
    fontFamily: FontFamily.semibold,
    letterSpacing: Type.bodyStrong.letterSpacing,
  },
  historyMetrics: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Space.xs,
    marginTop: Space.xs / 2,
  },
  historyMetric: {
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    fontFamily: FontFamily.regular,
  },
  historyMetricSeparator: {
    fontSize: Type.caption.size,
  },
  historyRight: {
    alignItems: 'flex-end',
    gap: Space.xs / 2,
  },
  historyTotal: {
    fontSize: Type.bodyStrong.size,
    lineHeight: Type.bodyStrong.lineHeight,
    fontFamily: FontFamily.bold,
    fontVariant: ['tabular-nums'],
    letterSpacing: Type.bodyStrong.letterSpacing,
  },
  historyTime: {
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: FontFamily.regular,
  },
});
