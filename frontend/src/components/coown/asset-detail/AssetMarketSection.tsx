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
  const { colors } = useAppTheme();

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
          .slice(0, 3);
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
          <View style={styles.marketStateRow}>
            <View
              style={[
                styles.marketStateDot,
                {
                  backgroundColor: reconciliationActive
                    ? colors.warning
                    : isMarketOpen
                      ? colors.success
                      : colors.textMuted,
                },
              ]}
            />
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
          Issuer-run fractional market · Not a public exchange
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
                const isCancelling = cancellingOrderId != null && order.orderId != null && cancellingOrderId === order.orderId;
                const canCancel = onCancelOrder != null && order.orderId != null && !isCancelling;
                const sideColor = isBuy ? colors.coownUp : colors.coownDown;
                const typeLabel = order.orderType
                  ? order.orderType === 'protected_market' ? 'protected' : order.orderType
                  : 'limit';
                return (
                  <View
                    key={order.id}
                    style={[
                      styles.openOrderRow,
                      idx > 0 && { borderTopColor: colors.borderSubtle },
                    ]}
                  >
                    {/* Compact leading token: colored dot + side · type */}
                    <View style={styles.openOrderLeading}>
                      <View style={[styles.sideDot, { backgroundColor: sideColor }]} />
                      <Text style={[styles.openOrderSideType, { color: colors.textPrimary }]}>
                        {isBuy ? 'Buy' : 'Sell'} · {typeLabel}
                      </Text>
                    </View>

                    {/* Price and units inline */}
                    <Text style={[styles.openOrderPrice, { color: colors.textPrimary }]}>
                      {order.unitPriceGbp != null ? formatCoOwnIze(order.unitPriceGbp) : '—'}
                    </Text>
                    <Text style={[styles.openOrderUnits, { color: colors.textSecondary }]}>
                      {order.remainingUnits != null
                        ? `${order.remainingUnits}/${order.units ?? order.remainingUnits}u`
                        : `${order.units ?? '—'}u`}
                    </Text>

                    {canCancel ? (
                      <Pressable
                        onPress={() => onCancelOrder!(order.orderId!)}
                        hitSlop={8}
                        style={({ pressed }) => [styles.cancelLink, pressed && { opacity: 0.6 }]}
                        accessibilityRole="button"
                        accessibilityLabel={`Cancel ${isBuy ? 'buy' : 'sell'} order ${order.orderId}`}
                      >
                        <Text style={[styles.cancelLinkText, { color: colors.warning }]}>
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
            hitSlop={8}
            style={({ pressed }) => [styles.alertActionBtn, pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
            accessibilityLabel="Set price alert"
          >
            <Ionicons name="notifications-outline" size={14} color={colors.brand} />
            <Text style={[styles.alertActionText, { color: colors.brand }]}>Alert</Text>
          </Pressable>
        </View>

        {orderBookError || (orderBook != null && !orderBookIsLive) ? (
          <View style={styles.depthNoticeBlock}>
            <Text style={[styles.depthNoticeTitle, { color: colors.textPrimary }]}>Live market unavailable</Text>
            <Text style={[styles.depthNoticeBody, { color: colors.textSecondary }]}>
              {orderBookError ? 'Could not synchronize live market depth.' : 'This view is not backed by a live market snapshot.'}
            </Text>
            <Pressable
              onPress={onRetryOrderBook}
              hitSlop={8}
              style={({ pressed }) => [styles.retryLink, pressed && { opacity: 0.7 }]}
              accessibilityRole="button"
              accessibilityLabel="Retry order book"
            >
              <Text style={[styles.retryLinkText, { color: colors.brand }]}>Retry</Text>
            </Pressable>
          </View>
        ) : isSecondaryMarket && marketDataStale ? (
          <View style={styles.depthNoticeBlock}>
            <Text style={[styles.depthNoticeTitle, { color: colors.textPrimary }]}>Market data is stale</Text>
            <Text style={[styles.depthNoticeBody, { color: colors.textSecondary }]}>
              {marketDataAgeLabel
                ? `Last verified source: ${marketDataAgeLabel}. Trading paused until a fresh snapshot arrives.`
                : 'Trading paused until a fresh market snapshot arrives.'}
            </Text>
            <Pressable
              onPress={onRetryOrderBook}
              hitSlop={8}
              style={({ pressed }) => [styles.retryLink, pressed && { opacity: 0.7 }]}
              accessibilityRole="button"
              accessibilityLabel="Refresh market data"
            >
              <Text style={[styles.retryLinkText, { color: colors.brand }]}>Refresh</Text>
            </Pressable>
          </View>
        ) : isMarketOpen && hasBidsOrAsks ? (
          <View style={styles.orderBookWrapper}>
            {/* Top-of-book quote strip — best bid/ask with resting size and
                the spread between them. Summarizes the ladder below the way
                broker quote headers do. */}
            <View style={styles.topOfBookRow}>
              <View style={styles.tobCell}>
                <Text style={[styles.tobLabel, { color: colors.textMuted }]}>Bid</Text>
                <Text style={[styles.tobPrice, { color: colors.coownUp }]}>
                  {bestBid ? formatCoOwnIze(bestBid.unitPriceGbp) : '—'}
                </Text>
                <Text style={[styles.tobSize, { color: colors.textMuted }]}>
                  {bestBid ? `${bestBid.units}u` : '—'}
                </Text>
              </View>
              <View style={styles.tobSpreadCell}>
                <Text style={[styles.tobSpreadValue, { color: colors.textSecondary }]} numberOfLines={1}>
                  {spreadGbp != null ? formatCoOwnIze(spreadGbp) : '—'}
                </Text>
                <Text style={[styles.tobSpreadLabel, { color: colors.textMuted }]}>spread</Text>
              </View>
              <View style={[styles.tobCell, styles.tobCellRight]}>
                <Text style={[styles.tobLabel, { color: colors.textMuted }]}>Ask</Text>
                <Text style={[styles.tobPrice, { color: colors.coownDown }]}>
                  {bestAsk ? formatCoOwnIze(bestAsk.unitPriceGbp) : '—'}
                </Text>
                <Text style={[styles.tobSize, { color: colors.textMuted }]}>
                  {bestAsk ? `${bestAsk.units}u` : '—'}
                </Text>
              </View>
            </View>
            <CoOwnOrderBook
              bids={mappedBids}
              asks={mappedAsks}
              mode={lifecycleState === 'secondaryTrading' ? 'continuous' : 'call_auction'}
              onSelectLevel={onSelectOrderBookLevel}
              embedded
            />
          </View>
        ) : orderBook == null && !orderBookError && isMarketOpen ? (
          // First snapshot still in flight — loading, not empty. A live
          // book with zero levels arrives as a non-null snapshot with
          // empty arrays, which falls through to the empty branch below.
          <View style={styles.depthNoticeBlock}>
            <Text style={[styles.depthNoticeTitle, { color: colors.textPrimary }]}>
              Synchronizing depth…
            </Text>
            <Text style={[styles.depthNoticeBody, { color: colors.textSecondary }]}>
              Waiting for the first live market snapshot.
            </Text>
          </View>
        ) : (
          <View style={styles.depthNoticeBlock}>
            <Text style={[styles.depthNoticeTitle, { color: colors.textPrimary }]}>
              {lifecycleState === 'initialOffering' ? 'Primary offering' : 'No bids or asks'}
            </Text>
            <Text style={[styles.depthNoticeBody, { color: colors.textSecondary }]}>
              {lifecycleState === 'initialOffering'
                ? `Initial allocation at ${formatCoOwnIze(asset.unitPriceGbp)} per unit. Secondary trading activates once distribution closes.`
                : 'No bids or asks on the book. Place the first limit order or buy available float directly.'}
            </Text>
          </View>
        )}
      </CommerceDetailSection>

      {/* ── 3. Execution tape — last settled trades ── */}
      {executionsLoading ? (
        <CommerceDetailSection label="Recent executions">
          <View style={styles.tapeLoadingRow}>
            <ActivityIndicator size="small" color={colors.textMuted} />
            <Text style={[styles.tapeLoadingText, { color: colors.textMuted }]}>
              Loading recent trades…
            </Text>
          </View>
        </CommerceDetailSection>
      ) : executionsFailed ? (
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
            {tapeExecutions.map((execution, idx) => {
              // Uptick/downtick vs the previous settled execution — the
              // classic tape presentation. The oldest row is neutral.
              const prev = idx > 0 ? tapeExecutions[idx - 1] : null;
              const tick = prev == null || execution.unitPriceGbp === prev.unitPriceGbp
                ? 0
                : execution.unitPriceGbp > prev.unitPriceGbp ? 1 : -1;
              const tickColor = tick === 0
                ? colors.textPrimary
                : tick > 0 ? colors.coownUp : colors.coownDown;
              return (
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
                  <Text style={[styles.tapePrice, { color: tickColor }]}>
                    {tick > 0 ? '▲ ' : tick < 0 ? '▼ ' : ''}
                    {formatCoOwnIze(execution.unitPriceGbp)}
                  </Text>
                  <Text style={[styles.tapeUnits, { color: colors.textSecondary }]}>
                    {execution.units} units
                  </Text>
                </View>
              );
            })}
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

      {/* ── 4. Trading Rules — compact disclosure row ──
          Replaces the verbose 4-row icon+title+description list with a
          single tappable row. The full rules are shown in a sheet when
          expanded. This follows the stock-broker pattern of keeping
          reference text off the main trading surface. */}
      <CommerceDetailSection label="Trading rules">
        <View style={styles.rulesCompactList}>
          <View style={[styles.ruleCompactRow, { borderTopColor: colors.borderSubtle }]}>
            <Text style={[styles.ruleCompactLabel, { color: colors.textSecondary }]}>Price protection</Text>
            <Text style={[styles.ruleCompactValue, { color: colors.textPrimary }]} numberOfLines={1}>
              Circuit breaker on protected orders
            </Text>
          </View>
          <View style={[styles.ruleCompactRow, { borderTopColor: colors.borderSubtle }]}>
            <Text style={[styles.ruleCompactLabel, { color: colors.textSecondary }]}>Settlement</Text>
            <Text style={[styles.ruleCompactValue, { color: colors.textPrimary }]} numberOfLines={1}>
              1ZE{asset.tradingFeeRate != null ? ` · ${(asset.tradingFeeRate * 100).toFixed(2).replace(/\.00$/, '')}% fee` : ''}
            </Text>
          </View>
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
  // ── Top-of-book quote strip ──
  topOfBookRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Space.xs + 2,
    marginBottom: Space.xs,
  },
  tobCell: {
    flex: 1,
    gap: 1,
  },
  tobCellRight: {
    alignItems: 'flex-end',
  },
  tobLabel: {
    fontSize: 11,
    fontFamily: FontFamily.medium,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  tobPrice: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: FontFamily.bold,
    fontVariant: ['tabular-nums'],
  },
  tobSize: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.regular,
    fontVariant: ['tabular-nums'],
  },
  tobSpreadCell: {
    alignItems: 'center',
    paddingHorizontal: Space.sm,
  },
  tobSpreadValue: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.medium,
    fontVariant: ['tabular-nums'],
  },
  tobSpreadLabel: {
    fontSize: 10,
    fontFamily: FontFamily.regular,
  },
  // ── Flat depth notice — left-aligned text, no centered icon box ──
  depthNoticeBlock: {
    paddingVertical: Space.md,
    gap: 4,
  },
  depthNoticeTitle: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: FontFamily.semibold,
  },
  depthNoticeBody: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.regular,
    lineHeight: 18,
  },
  retryLink: {
    marginTop: Space.xs,
    alignSelf: 'flex-start',
  },
  retryLinkText: {
    fontSize: TypographyV2.captionElevated.size,
    fontFamily: FontFamily.semibold,
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
  tapeLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.sm,
  },
  tapeLoadingText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.regular,
  },
  venueMetadataText: {
    fontSize: TypographyV2.caption.size,
    lineHeight: TypographyV2.caption.lineHeight,
    fontFamily: TypographyV2.caption.fontFamily,
    letterSpacing: TypographyV2.caption.letterSpacing,
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
  // ── Compact trading rules — flat hairline-separated rows ──
  rulesCompactList: {
    marginTop: Space.xs,
  },
  ruleCompactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  ruleCompactLabel: {
    fontSize: TypographyV2.captionElevated.size,
    fontFamily: FontFamily.medium,
  },
  ruleCompactValue: {
    fontSize: TypographyV2.captionElevated.size,
    fontFamily: FontFamily.regular,
    flex: 1,
    textAlign: 'right',
    marginLeft: Space.md,
  },
  marketStateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  marketStateDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  marketStateText: {
    fontSize: TypographyV2.caption.size,
    fontFamily: FontFamily.medium,
  },
  // ── Compact open orders — one-line rows, colored dot + inline text ──
  openOrderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'transparent',
    paddingVertical: Space.sm,
  },
  openOrderLeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: 90,
  },
  sideDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  openOrderSideType: {
    fontSize: TypographyV2.captionElevated.size,
    fontFamily: FontFamily.medium,
    textTransform: 'capitalize',
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
    flex: 1,
  },
  cancelLink: {
    paddingHorizontal: Space.xs,
    paddingVertical: 2,
  },
  cancelLinkText: {
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
