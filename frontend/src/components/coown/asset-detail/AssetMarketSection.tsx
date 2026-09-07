import React from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Space, FontFamily, Radius } from '../../../theme/designTokens';
import { TypographyV2 } from '../../../theme/typography.v2';
import { useAppTheme } from '../../../theme/ThemeContext';
import { formatCoOwnIze } from '../../../utils/currency';
import {
  listCoOwnExecutions,
  type MarketCoOwnAsset,
  type MarketCoOwnExecution,
  type MarketHistoryItem,
  type CoOwnOrderBookSnapshot,
  type CoOwnOrderBookEntry,
} from '../../../services/marketApi';
import {
  CommerceDetailSection,
  CommerceDetailTransactionSurface,
  CommerceDetailUnavailableInline,
} from '../../commerce/detail';
import { CoOwnOrderBook } from '../';
import type { AssetLifecycleState } from './types';

export interface AssetMarketSectionProps {
  asset: MarketCoOwnAsset;
  orderBook: CoOwnOrderBookSnapshot | null;
  orderBookStreaming: boolean;
  orderBookHasGap: boolean;
  orderBookError: boolean;
  onRetryOrderBook: () => void;
  bestBid: CoOwnOrderBookEntry | null;
  bestAsk: CoOwnOrderBookEntry | null;
  spreadGbp: number | null;
  depthStatusLabel: string;
  reconciliationActive: boolean;
  /** True when the backend source watermark is stale or degraded. */
  marketDataStale?: boolean;
  marketDataAgeLabel?: string;
  isOffline: boolean;
  onOpenSupply: () => void;
  onOpenPriceAlert: () => void;
  onSelectOrderBookLevel: (side: 'bid' | 'ask', price: number) => void;
  lifecycleState: AssetLifecycleState;
  /** The viewer's open/partially_filled orders for this asset, or null while loading. */
  yourOpenOrders?: MarketHistoryItem[] | null;
  /** True when the open-orders fetch failed — panel shows a quiet unavailable line. */
  yourOpenOrdersFailed?: boolean;
  /** True while the open-orders fetch is in-flight — panel shows a loading indicator. */
  yourOpenOrdersLoading?: boolean;
  /** Cancel an open order by orderId. The parent handles auth, optimistic removal, and error toast. */
  onCancelOrder?: (orderId: number) => void;
  /** Whether a cancel is in-flight for the given orderId. */
  cancellingOrderId?: number | null;
}

export function AssetMarketSection({
  asset,
  orderBook,
  orderBookStreaming,
  orderBookHasGap,
  orderBookError,
  onRetryOrderBook,
  bestBid,
  bestAsk,
  spreadGbp,
  depthStatusLabel,
  reconciliationActive,
  marketDataStale = false,
  marketDataAgeLabel,
  isOffline,
  onOpenPriceAlert,
  onSelectOrderBookLevel,
  lifecycleState,
  yourOpenOrders = null,
  yourOpenOrdersFailed = false,
  yourOpenOrdersLoading = false,
  onCancelOrder,
  cancellingOrderId = null,
}: AssetMarketSectionProps) {
  const { colors, isDark } = useAppTheme();

  // ── Execution tape — last settled trades for this asset ──
  // The public executions feed carries no counterparty or side data, so the
  // tape prints time · price · units only. Failed/reversed settlements are
  // not trades and never print.
  const [executions, setExecutions] = React.useState<MarketCoOwnExecution[] | null>(null);
  const [executionsLoading, setExecutionsLoading] = React.useState(true);
  const [executionsFailed, setExecutionsFailed] = React.useState(false);

  const loadExecutions = React.useCallback(() => {
    let cancelled = false;
    setExecutionsLoading(true);
    setExecutionsFailed(false);
    // Clear the previous asset's tape immediately so a slow response for the
    // old asset can never overwrite the new asset's feed.
    setExecutions(null);
    void listCoOwnExecutions(asset.id, { limit: 25 })
      .then((result) => {
        if (cancelled) return;
        const settled = result.items
          .filter((e) => e.settlementStatus == null || e.settlementStatus === 'settled')
          .slice(0, 8);
        setExecutions(settled);
        setExecutionsLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setExecutions(null);
        setExecutionsFailed(true);
        setExecutionsLoading(false);
      });
    return () => { cancelled = true; };
  }, [asset.id]);

  React.useEffect(() => {
    const cleanup = loadExecutions();
    return cleanup;
  }, [loadExecutions]);

  const tapeExecutions = executions ?? [];

  // ── 24h market stats — one compact strip under the transaction surface.
  // Null segments are omitted, never rendered as zeros.
  const snapshot = asset.marketSnapshot ?? null;
  const movePct24h = snapshot?.marketMovePct24h ?? asset.marketMovePct24h ?? null;
  const volume24hGbp = snapshot?.volume24hGbp ?? asset.volume24hGbp ?? null;
  const statsSpreadGbp = snapshot?.bestBidGbp != null && snapshot?.bestAskGbp != null
    ? Math.max(0, snapshot.bestAskGbp - snapshot.bestBidGbp)
    : spreadGbp;
  const hasStatsStrip = movePct24h != null || volume24hGbp != null || statsSpreadGbp != null;

  const isSecondaryMarket = lifecycleState === 'secondaryTrading';
  const orderBookIsLive = orderBook?.source === 'live';
  const depthStatus = isSecondaryMarket && marketDataStale
    ? `Stale depth${marketDataAgeLabel ? ` · ${marketDataAgeLabel}` : ''}`
    : depthStatusLabel;
  const isMarketOpen = asset.isOpen
    && !reconciliationActive
    && !isOffline
    && !(isSecondaryMarket && marketDataStale);
  const hasBidsOrAsks =
    (orderBook?.bids && orderBook.bids.length > 0) ||
    (orderBook?.asks && orderBook.asks.length > 0);

  const mappedBids = React.useMemo(() => (
    orderBook?.bids.map((b) => ({
      price: b.unitPriceGbp,
      size: b.units,
      orderCount: b.orderCount,
    })) ?? []
  ), [orderBook?.bids]);

  const mappedAsks = React.useMemo(() => (
    orderBook?.asks.map((a) => ({
      price: a.unitPriceGbp,
      size: a.units,
      orderCount: a.orderCount,
    })) ?? []
  ), [orderBook?.asks]);

  // Reference vs execution price semantics (spec 03_COOWN §2)
  const lastExecutionPriceGbp = asset.marketSnapshot?.lastExecutionPriceGbp ?? null;
  const hasSettledTrade = lastExecutionPriceGbp != null;
  const transactionPrimaryLabel =
    lifecycleState === 'initialOffering'
      ? 'Offering price'
      : hasSettledTrade
        ? 'Last trade'
        : 'Reference price';
  const transactionPrimaryValue = lifecycleState !== 'initialOffering' && lastExecutionPriceGbp != null
    ? formatCoOwnIze(lastExecutionPriceGbp)
    : formatCoOwnIze(asset.unitPriceGbp);
  const transactionSecondaryLabel = hasSettledTrade
    ? `Reference unit price: ${formatCoOwnIze(asset.unitPriceGbp)}`
    : bestBid && bestAsk
      ? `Bid ${formatCoOwnIze(bestBid.unitPriceGbp)} · Ask ${formatCoOwnIze(bestAsk.unitPriceGbp)}`
      : bestBid
        ? `Bid ${formatCoOwnIze(bestBid.unitPriceGbp)} · Ask —`
        : bestAsk
          ? `Bid — · Ask ${formatCoOwnIze(bestAsk.unitPriceGbp)}`
          : 'Spread unavailable';

  return (
    <View style={styles.container}>
      {/* ── 1. Transaction Surface with family="co_own" ──
          The 24h stats line rides the surface's status row — one compact
          label:value strip under the dominant price, hairline-separated.
          Null segments are omitted entirely. */}
      <CommerceDetailTransactionSurface
        family="co_own"
        primaryLabel={transactionPrimaryLabel}
        primaryValue={transactionPrimaryValue}
        secondaryLabel={transactionSecondaryLabel}
        statusRow={
          hasStatsStrip ? (
            <View style={styles.statsStrip}>
              {movePct24h != null ? (
                <>
                  <Text style={[styles.statsLabel, { color: colors.textMuted }]}>24h</Text>
                  <Text
                    style={[
                      styles.statsValue,
                      {
                        color: movePct24h > 0
                          ? colors.coownUp
                          : movePct24h < 0
                            ? colors.coownDown
                            : colors.textSecondary,
                      },
                    ]}
                  >
                    {movePct24h > 0 ? '+' : movePct24h < 0 ? '−' : ''}{Math.abs(movePct24h).toFixed(1)}%
                  </Text>
                </>
              ) : null}
              {volume24hGbp != null ? (
                <Text style={[styles.statsValue, { color: colors.textMuted }]}>
                  Vol {formatCoOwnIze(volume24hGbp)}
                </Text>
              ) : null}
              {statsSpreadGbp != null ? (
                <Text style={[styles.statsValue, { color: colors.textMuted }]}>
                  Spread {formatCoOwnIze(statsSpreadGbp)}
                </Text>
              ) : null}
            </View>
          ) : undefined
        }
        headlineAside={
          <View
            style={[
              styles.marketStatePill,
              {
                backgroundColor: reconciliationActive
                  ? colors.warningSubtle
                  : isMarketOpen
                    ? colors.coownUpSubtle
                    : colors.surfaceAlt,
              },
            ]}
          >
            <Text
              style={[
                styles.marketStateText,
                {
                  color: reconciliationActive
                    ? colors.warning
                    : isMarketOpen
                      ? colors.coownUp
                      : colors.textMuted,
                },
              ]}
            >
              {reconciliationActive
                ? 'Orders paused'
                : isSecondaryMarket && marketDataStale
                  ? 'Market data stale'
                : isMarketOpen
                  ? 'Market open'
                  : 'Market closed'}
            </Text>
          </View>
        }
      />

      {/* Venue metadata — truthful market model label. Co-Own is an
          issuer-run fractional market, not a public exchange. This line
          makes the market model explicit so users cannot mistake it for
          a regulated securities exchange. */}
      <View style={styles.venueMetadataRow}>
        <Text style={[styles.venueMetadataText, { color: colors.textMuted }]}>
          Issuer-run fractional market · No public exchange session
        </Text>
      </View>

      {/* ── 2. Your Open Orders — inline panel (Kalshi/Polymarket parity) ──
          Shows the viewer's resting orders for THIS asset only. Each row
          carries side, type, limit price, remaining/total units, and a
          cancel control. Loading/empty/error states are all explicit.
          Omitted entirely for anonymous viewers (yourOpenOrders = null
          with no failure and no loading → not rendered). */}
      {yourOpenOrders != null || yourOpenOrdersFailed || yourOpenOrdersLoading ? (
        <CommerceDetailSection label="Your open orders">
          {yourOpenOrdersFailed ? (
            <CommerceDetailUnavailableInline
              title="Open orders unavailable"
              body="Your resting orders could not be loaded."
            />
          ) : yourOpenOrdersLoading ? (
            <View style={styles.openOrdersLoadingRow}>
              <ActivityIndicator size="small" color={colors.textMuted} />
            </View>
          ) : yourOpenOrders != null && yourOpenOrders.length > 0 ? (
            <View>
              {yourOpenOrders.map((order, idx) => {
                const isBuy = order.action === 'buy-units';
                // P1 #4 fix: guard against orderId null — both must be non-null
                const isCancelling = cancellingOrderId != null && order.orderId != null && cancellingOrderId === order.orderId;
                const canCancel = onCancelOrder != null && order.orderId != null && !isCancelling;
                return (
                  <View
                    key={order.id}
                    style={[
                      styles.openOrderRow,
                      idx > 0 && { borderTopColor: colors.borderSubtle },
                    ]}
                  >
                    <View style={styles.openOrderSideCol}>
                      <View style={[
                        styles.sideBadge,
                        { backgroundColor: isBuy ? colors.coownUpSubtle : colors.coownDownSubtle },
                      ]}>
                        <Text style={[
                          styles.sideBadgeText,
                          { color: isBuy ? colors.coownUp : colors.coownDown },
                        ]}>
                          {isBuy ? 'BUY' : 'SELL'}
                        </Text>
                      </View>
                      {order.orderType ? (
                        <Text style={[styles.openOrderType, { color: colors.textMuted }]}>
                          {order.orderType === 'protected_market' ? 'protected' : order.orderType}
                        </Text>
                      ) : null}
                    </View>

                    <View style={styles.openOrderDetailCol}>
                      <Text style={[styles.openOrderPrice, { color: colors.textPrimary }]}>
                        {order.unitPriceGbp != null ? formatCoOwnIze(order.unitPriceGbp) : '—'}
                      </Text>
                      <Text style={[styles.openOrderUnits, { color: colors.textSecondary }]}>
                        {order.remainingUnits != null
                          ? `${order.remainingUnits}/${order.units ?? order.remainingUnits} units`
                          : `${order.units ?? '—'} units`}
                      </Text>
                    </View>

                    {canCancel ? (
                      <Pressable
                        onPress={() => onCancelOrder!(order.orderId!)}
                        hitSlop={8}
                        style={({ pressed }) => [
                          styles.cancelBtn,
                          { borderColor: colors.warning },
                          pressed && { opacity: 0.6 },
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel={`Cancel ${isBuy ? 'buy' : 'sell'} order ${order.orderId}`}
                      >
                        <Text style={[styles.cancelBtnText, { color: colors.warning }]}>
                          Cancel
                        </Text>
                      </Pressable>
                    ) : isCancelling ? (
                      <ActivityIndicator size="small" color={colors.textMuted} />
                    ) : null}
                  </View>
                );
              })}
            </View>
          ) : (
            <Text style={[styles.noOpenOrdersText, { color: colors.textMuted }]}>
              No resting orders on this asset
            </Text>
          )}
        </CommerceDetailSection>
      ) : null}

      {/* ── 3. Live Order Book Ladder ── */}
      <CommerceDetailSection label="Market depth">
        <View style={styles.sectionHeaderRow}>
          <View style={styles.depthStatusRow}>
            <View
              style={[
                styles.liveIndicatorDot,
                {
                  backgroundColor: isSecondaryMarket && marketDataStale
                    ? colors.warning
                    : orderBookStreaming
                      ? colors.success
                      : colors.textMuted,
                },
              ]}
            />
            <Text style={[styles.depthStatusText, { color: colors.textSecondary }]}>
              {depthStatus}
            </Text>
          </View>

          {/* Price alert action */}
          <Pressable
            onPress={onOpenPriceAlert}
            style={styles.alertActionBtn}
            accessibilityRole="button"
            accessibilityLabel="Set price alert"
          >
            <Ionicons name="notifications-outline" size={14} color={colors.brand} />
            <Text style={[styles.alertActionText, { color: colors.brand }]}>Alert</Text>
          </Pressable>
        </View>

        {orderBookError || (orderBook != null && !orderBookIsLive) ? (
          <View style={[styles.errorBox, { backgroundColor: colors.surfaceAlt }]}>
            <Ionicons name="cloud-offline-outline" size={24} color={colors.warning} />
            <Text style={[styles.errorTitle, { color: colors.textPrimary }]}>Live market unavailable</Text>
            <Text style={[styles.errorSubtitle, { color: colors.textSecondary }]}>
              {orderBookError ? 'Could not synchronize live market depth.' : 'This view is not backed by a live market snapshot.'}
            </Text>
            <Pressable
              onPress={onRetryOrderBook}
              style={[styles.retryBtn, { backgroundColor: colors.surface }]}
              accessibilityRole="button"
              accessibilityLabel="Retry order book"
            >
              <Text style={[styles.retryBtnText, { color: colors.brand }]}>Retry</Text>
            </Pressable>
          </View>
        ) : isSecondaryMarket && marketDataStale ? (
          <View style={[styles.emptyDepthNotice, { backgroundColor: colors.warningSubtle }]}>
            <Ionicons name="time-outline" size={26} color={colors.warning} />
            <Text style={[styles.emptyDepthTitle, { color: colors.textPrimary }]}>Market data is stale</Text>
            <Text style={[styles.emptyDepthBody, { color: colors.textSecondary }]}>
              {marketDataAgeLabel
                ? `Last verified market source: ${marketDataAgeLabel}. Trading stays paused until a fresh snapshot arrives.`
                : 'Trading stays paused until a fresh market snapshot arrives.'}
            </Text>
            <Pressable
              onPress={onRetryOrderBook}
              style={[styles.retryBtn, { backgroundColor: colors.surface }]}
              accessibilityRole="button"
              accessibilityLabel="Refresh market data"
            >
              <Text style={[styles.retryBtnText, { color: colors.brand }]}>Refresh</Text>
            </Pressable>
          </View>
        ) : isMarketOpen && hasBidsOrAsks ? (
          <View style={styles.orderBookWrapper}>
            <CoOwnOrderBook
              bids={mappedBids}
              asks={mappedAsks}
              mode={lifecycleState === 'secondaryTrading' ? 'continuous' : 'call_auction'}
              onSelectLevel={onSelectOrderBookLevel}
            />
          </View>
        ) : (
          <View style={[styles.emptyDepthNotice, { backgroundColor: colors.surfaceAlt }]}>
            <Ionicons name="layers-outline" size={26} color={colors.textMuted} />
            <Text style={[styles.emptyDepthTitle, { color: colors.textPrimary }]}>
              {lifecycleState === 'initialOffering' ? 'Primary Offering Mode' : 'Sparse Order Book'}
            </Text>
            <Text style={[styles.emptyDepthBody, { color: colors.textSecondary }]}>
              {lifecycleState === 'initialOffering'
                ? `Initial allocation underway at ${formatCoOwnIze(asset.unitPriceGbp)} per unit. Secondary bids and asks activate once initial distribution closes.`
                : 'No resting bids or asks currently on the book. You can place the first limit order or buy available float directly.'}
            </Text>
          </View>
        )}
      </CommerceDetailSection>

      {/* ── 3. Execution tape — last settled trades ── */}
      {executionsLoading ? null : executionsFailed ? (
        <CommerceDetailSection label="Recent executions">
          <CommerceDetailUnavailableInline
            title="Executions unavailable"
            body="Recent trades could not be loaded."
            onRetry={loadExecutions}
          />
        </CommerceDetailSection>
      ) : tapeExecutions.length > 0 ? (
        <CommerceDetailSection label="Recent executions">
          <View>
            {tapeExecutions.map((execution, idx) => (
              <View
                key={execution.id}
                style={[styles.tapeRow, idx > 0 && { borderTopColor: colors.borderSubtle }]}
              >
                <Text style={[styles.tapeTime, { color: colors.textMuted }]}>
                  {new Date(execution.executedAt).toLocaleTimeString('en-GB', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </Text>
                <Text style={[styles.tapePrice, { color: colors.textPrimary }]}>
                  {formatCoOwnIze(execution.unitPriceGbp)}
                </Text>
                <Text style={[styles.tapeUnits, { color: colors.textSecondary }]}>
                  {execution.units} units
                </Text>
              </View>
            ))}
          </View>
        </CommerceDetailSection>
      ) : (
        <CommerceDetailSection label="Recent executions">
          <View style={styles.noTradesBox}>
            <Text style={[styles.noTradesText, { color: colors.textMuted }]}>
              No trades yet
            </Text>
          </View>
        </CommerceDetailSection>
      )}

      {/* ── 4. Trading Rules & Circuit Breakers ── */}
      <CommerceDetailSection label="Trading parameters">
        <View style={styles.rulesList}>
          <View style={styles.ruleItem}>
            <Ionicons name="shield-outline" size={16} color={colors.brand} />
            <View style={styles.ruleTextCol}>
              <Text style={[styles.ruleTitle, { color: colors.textPrimary }]}>Price Protection (Circuit Breaker)</Text>
              <Text style={[styles.ruleDesc, { color: colors.textSecondary }]}>
                Protected instant orders use your maximum buy price or minimum sell price. Any quantity outside that protection is cancelled.
              </Text>
            </View>
          </View>

          <View style={styles.ruleItem}>
            <Ionicons name="time-outline" size={16} color={colors.brand} />
            <View style={styles.ruleTextCol}>
              <Text style={[styles.ruleTitle, { color: colors.textPrimary }]}>Remainder Handling</Text>
              <Text style={[styles.ruleDesc, { color: colors.textSecondary }]}>
                Instant orders cancel unfilled remainders immediately. Limit orders rest on the central limit order book.
              </Text>
            </View>
          </View>

          <View style={styles.ruleItem}>
            <Ionicons name="wallet-outline" size={16} color={colors.brand} />
            <View style={styles.ruleTextCol}>
              <Text style={[styles.ruleTitle, { color: colors.textPrimary }]}>Settlement Currency</Text>
              <Text style={[styles.ruleDesc, { color: colors.textSecondary }]}>
                Fills and distributions settle in 1ZE. Review the asset's settlement documents for the applicable conversion and custody terms.
              </Text>
            </View>
          </View>

          {asset.tradingFeeRate != null ? (
            <View style={styles.ruleItem}>
              <Ionicons name="receipt-outline" size={16} color={colors.brand} />
              <View style={styles.ruleTextCol}>
                <Text style={[styles.ruleTitle, { color: colors.textPrimary }]}>Trading fee</Text>
                <Text style={[styles.ruleDesc, { color: colors.textSecondary }]}>
                  {(asset.tradingFeeRate * 100).toFixed(2).replace(/\.00$/, '')}% per execution, reflected in the order review.
                </Text>
              </View>
            </View>
          ) : null}
        </View>
      </CommerceDetailSection>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Space.md,
    gap: Space.lg,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Space.sm,
  },
  depthStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  liveIndicatorDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  depthStatusText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.medium,
  },
  alertActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xxs,
  },
  alertActionText: {
    fontSize: TypographyV2.caption.size,
    fontFamily: FontFamily.medium,
  },
  orderBookWrapper: {
    marginTop: Space.xs,
  },
  errorBox: {
    alignItems: 'center',
    padding: Space.md,
    borderRadius: Radius.sm,
    gap: Space.xs,
  },
  errorTitle: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: FontFamily.semibold,
  },
  errorSubtitle: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.regular,
    textAlign: 'center',
  },
  retryBtn: {
    marginTop: Space.xs,
    paddingHorizontal: Space.md,
    paddingVertical: Space.xs,
    borderRadius: Radius.sm,
  },
  retryBtnText: {
    fontSize: TypographyV2.captionElevated.size,
    fontFamily: FontFamily.semibold,
  },
  emptyDepthNotice: {
    alignItems: 'center',
    padding: Space.md,
    borderRadius: Radius.sm,
    gap: Space.xs,
  },
  emptyDepthTitle: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: FontFamily.semibold,
  },
  emptyDepthBody: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.regular,
    textAlign: 'center',
    lineHeight: 18,
  },
  statsStrip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    gap: Space.xs,
  },
  venueMetadataRow: {
    paddingTop: Space.xs,
  },
  venueMetadataText: {
    fontSize: TypographyV2.meta.size - 1,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: 0.2,
  },
  statsLabel: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.medium,
    letterSpacing: TypographyV2.meta.letterSpacing,
    fontVariant: ['tabular-nums'],
  },
  statsValue: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.semibold,
    letterSpacing: TypographyV2.meta.letterSpacing,
    fontVariant: ['tabular-nums'],
  },
  tapeRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'transparent',
    paddingVertical: Space.xs + 2,
    gap: Space.sm,
  },
  tapeTime: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.regular,
    letterSpacing: TypographyV2.meta.letterSpacing,
    fontVariant: ['tabular-nums'],
    flexShrink: 0,
  },
  tapePrice: {
    flex: 1,
    fontSize: TypographyV2.captionElevated.size,
    lineHeight: TypographyV2.captionElevated.lineHeight,
    fontFamily: FontFamily.semibold,
    fontVariant: ['tabular-nums'],
  },
  tapeUnits: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.regular,
    letterSpacing: TypographyV2.meta.letterSpacing,
    fontVariant: ['tabular-nums'],
    flexShrink: 0,
  },
  noTradesBox: {
    paddingVertical: Space.sm,
  },
  noTradesText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.regular,
    lineHeight: 18,
  },
  rulesList: {
    gap: Space.sm,
    marginTop: Space.xs,
  },
  ruleItem: {
    flexDirection: 'row',
    gap: Space.sm,
    alignItems: 'flex-start',
  },
  ruleTextCol: {
    flex: 1,
  },
  ruleTitle: {
    fontSize: TypographyV2.captionElevated.size,
    fontFamily: FontFamily.semibold,
    marginBottom: 2,
  },
  ruleDesc: {
    fontSize: 12,
    fontFamily: FontFamily.regular,
    lineHeight: 16,
  },
  marketStatePill: {
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xxs,
    borderRadius: Radius.full,
  },
  marketStateText: {
    fontSize: TypographyV2.caption.size,
    fontFamily: FontFamily.medium,
  },
  // ── Open Orders panel ──
  openOrderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'transparent',
    paddingVertical: Space.sm,
  },
  openOrderSideCol: {
    flexDirection: 'column',
    gap: 3,
    minWidth: 64,
  },
  sideBadge: {
    paddingHorizontal: Space.xs,
    paddingVertical: 2,
    borderRadius: Radius.sm,
    alignSelf: 'flex-start',
  },
  sideBadgeText: {
    fontSize: 10,
    fontFamily: FontFamily.bold,
    letterSpacing: 0.4,
  },
  openOrderType: {
    fontSize: 10,
    fontFamily: FontFamily.regular,
    textTransform: 'capitalize',
  },
  openOrderDetailCol: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Space.sm,
  },
  openOrderPrice: {
    fontSize: TypographyV2.captionElevated.size,
    fontFamily: FontFamily.semibold,
    fontVariant: ['tabular-nums'],
  },
  openOrderUnits: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.regular,
    fontVariant: ['tabular-nums'],
  },
  cancelBtn: {
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs,
    borderRadius: Radius.sm,
    borderWidth: 1,
  },
  cancelBtnText: {
    fontSize: TypographyV2.caption.size,
    fontFamily: FontFamily.semibold,
  },
  noOpenOrdersText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.regular,
    lineHeight: 18,
    paddingVertical: Space.xs,
  },
  openOrdersLoadingRow: {
    paddingVertical: Space.sm,
    alignItems: 'center',
  },
});
