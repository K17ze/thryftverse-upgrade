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
  CommerceDetailUnavailableInline,
} from '../../commerce/detail';
import { CoOwnOrderBook, CoOwnDepthChart } from '../';
import type { AssetLifecycleState } from './types';

type OrderBookView = 'ladder' | 'depth' | 'tape';

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
  onRetryOpenOrders?: () => void;
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
  onRetryOpenOrders,
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
  const [orderBookView, setOrderBookView] = React.useState<OrderBookView>('ladder');

  const executionRequest = React.useRef(0);
  const loadExecutions = React.useCallback(() => {
    const request = ++executionRequest.current;
    setExecutionsLoading(true);
    setExecutionsFailed(false);
    // Clear the previous asset's tape immediately so a slow response for the
    // old asset can never overwrite the new asset's feed.
    setExecutions(null);
    void listCoOwnExecutions(asset.id, { limit: 25 })
      .then((result) => {
        if (request !== executionRequest.current) return;
        const settled = result.items
          .filter((e) => e.settlementStatus == null || e.settlementStatus === 'settled')
          .slice(0, 12);
        setExecutions(settled);
        setExecutionsLoading(false);
      })
      .catch(() => {
        if (request !== executionRequest.current) return;
        setExecutions(null);
        setExecutionsFailed(true);
        setExecutionsLoading(false);
      });

  }, [asset.id]);

  React.useEffect(() => {
    loadExecutions();
    return () => { executionRequest.current += 1; };
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

  // ── Cumulative depth for the depth chart view ──
  // Bids sorted descending (best bid first), asks sorted ascending (best
  // ask first). Cumulative units accumulate from the best price outward.
  const depthBids = React.useMemo(() => {
    let cumulative = 0;
    return mappedBids.map((b) => {
      cumulative += b.size;
      return { price: b.price, cumulativeUnits: cumulative, orderCount: b.orderCount ?? 1 };
    });
  }, [mappedBids]);

  const depthAsks = React.useMemo(() => {
    let cumulative = 0;
    return mappedAsks.map((a) => {
      cumulative += a.size;
      return { price: a.price, cumulativeUnits: cumulative, orderCount: a.orderCount ?? 1 };
    });
  }, [mappedAsks]);

  const midPrice = bestBid && bestAsk
    ? (bestBid.unitPriceGbp + bestAsk.unitPriceGbp) / 2
    : null;

  // Reference vs execution price semantics (spec 03_COOWN §2)
  const lastExecutionPriceGbp = asset.marketSnapshot?.lastExecutionPriceGbp ?? null;

  // ── Quote freshness stamp — the age of the data actually rendered ──
  // Prefer the book's serverTimestamp (transport truth), then the market
  // snapshot's source watermark, then the parent's age label. When none
  // exist the line is omitted entirely — never a fabricated "just now".
  const freshnessLabel = React.useMemo(() => {
    const iso = orderBook?.serverTimestamp || snapshot?.sourceAsOf || null;
    if (iso) {
      const stamp = new Date(iso);
      if (Number.isFinite(stamp.getTime())) {
        const sameDay = stamp.toDateString() === new Date().toDateString();
        const formatted = sameDay
          ? stamp.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
          : stamp.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
        return `Updated ${formatted}`;
      }
    }
    return marketDataAgeLabel ? `Updated ${marketDataAgeLabel}` : null;
  }, [orderBook?.serverTimestamp, snapshot?.sourceAsOf, marketDataAgeLabel]);

  // Top-of-book state label — one honest status, never fake numbers.
  const quoteStateLabel = isOffline
    ? 'Offline'
    : orderBookError
      ? 'Quote error'
      : orderBookStreaming && !hasBidsOrAsks
        ? 'Synchronizing'
        : reconciliationActive
          ? 'Orders paused'
          : isSecondaryMarket && marketDataStale
            ? 'Stale quotes'
            : !isMarketOpen && isSecondaryMarket
              ? 'Market closed'
              : null;

  // Connection dot — colour reinforces the text label, never replaces it:
  // live → success, stale/degraded/errored/paused → warning, closed /
  // offline / synchronizing → muted.
  const connectionDotColor = quoteStateLabel == null
    ? colors.success
    : quoteStateLabel === 'Offline' || quoteStateLabel === 'Market closed' || quoteStateLabel === 'Synchronizing'
      ? colors.textMuted
      : colors.warning;

  // When offline or the source watermark is stale, rendered bid/ask values
  // are last-known, not live — mute them so the numbers read as quotes,
  // not actionable prices.
  const quotesMuted = isOffline || (isSecondaryMarket && marketDataStale);

  return (
    <View style={styles.container}>
      {/* ── 1. Top-of-Book Quote Strip ──
          Pillar 3: replaces the former CommerceDetailTransactionSurface
          (which duplicated the identity's 32pt price hero). The identity
          block already owns the dominant price; the market tab shows the
          broker quote header: best bid | spread | best ask, with market
          state and 24h stats on a compact status line below. Flat on
          canvas, hairline-separated, tabular numerals throughout. Per
          Design.md `top-of-book-strip` component contract. */}
      <View style={[styles.topOfBookStrip, { borderBottomColor: colors.borderSubtle }]}>
        {/* Connection state + freshness — shown when quotes are loading,
         * offline, errored, paused or stale, plus the source timestamp of
         * the data on screen (Robinhood "15 min delayed" / Coinbase `time`
         * pattern). The dot reinforces the label; text always carries the
         * truth. Never show fake numbers — show an honest state label
         * until real data resolves. */}
        {quoteStateLabel != null || freshnessLabel != null ? (
          <View style={styles.topOfBookMetaRow}>
            <View
              style={[styles.topOfBookMetaDot, { backgroundColor: connectionDotColor }]}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            />
            {quoteStateLabel != null ? (
              <Text
                style={[styles.topOfBookStateText, { color: colors.textMuted }]}
                numberOfLines={1}
                accessibilityRole="text"
                accessibilityLabel={`Market state: ${quoteStateLabel}`}
              >
                {quoteStateLabel}
              </Text>
            ) : null}
            {freshnessLabel != null ? (
              <Text
                style={[styles.topOfBookFreshness, { color: colors.textMuted }]}
                numberOfLines={1}
                accessibilityRole="text"
                accessibilityLiveRegion="polite"
                accessibilityLabel={freshnessLabel}
              >
                {quoteStateLabel != null ? `· ${freshnessLabel}` : freshnessLabel}
              </Text>
            ) : null}
          </View>
        ) : null}
        <View style={styles.topOfBookQuoteRow}>
          <View style={styles.topOfBookSide}>
            <Text style={[styles.topOfBookLabel, { color: colors.textMuted }]} numberOfLines={1}>
              Bid
            </Text>
            <Text
              style={[styles.topOfBookValue, { color: quotesMuted ? colors.textMuted : colors.coownUp }]}
              numberOfLines={1}
              accessibilityRole="text"
              accessibilityLabel={bestBid
                ? `Bid price ${formatCoOwnIze(bestBid.unitPriceGbp)}${quotesMuted ? ', last known' : ''}`
                : 'Bid price unavailable'}
            >
              {bestBid ? formatCoOwnIze(bestBid.unitPriceGbp) : '—'}
            </Text>
            {bestBid ? (
              <Text
                style={[styles.topOfBookSize, { color: colors.textMuted }]}
                numberOfLines={1}
                accessibilityLabel={`${bestBid.units.toLocaleString('en-GB')} units at bid`}
              >
                {bestBid.units.toLocaleString('en-GB')}u
              </Text>
            ) : null}
          </View>

          <View style={styles.topOfBookSpread}>
            <Text style={[styles.topOfBookLabel, { color: colors.textMuted }]} numberOfLines={1}>
              Spread
            </Text>
            <Text
              style={[styles.topOfBookValue, { color: colors.textSecondary }]}
              numberOfLines={1}
            >
              {spreadGbp != null ? formatCoOwnIze(spreadGbp) : '—'}
            </Text>
          </View>

          <View style={[styles.topOfBookSide, styles.topOfBookAskSide]}>
            <Text style={[styles.topOfBookLabel, { color: colors.textMuted }]} numberOfLines={1}>
              Ask
            </Text>
            <Text
              style={[styles.topOfBookValue, { color: quotesMuted ? colors.textMuted : colors.coownDown }]}
              numberOfLines={1}
              accessibilityRole="text"
              accessibilityLabel={bestAsk
                ? `Ask price ${formatCoOwnIze(bestAsk.unitPriceGbp)}${quotesMuted ? ', last known' : ''}`
                : 'Ask price unavailable'}
            >
              {bestAsk ? formatCoOwnIze(bestAsk.unitPriceGbp) : '—'}
            </Text>
            {bestAsk ? (
              <Text
                style={[styles.topOfBookSize, { color: colors.textMuted }]}
                numberOfLines={1}
                accessibilityLabel={`${bestAsk.units.toLocaleString('en-GB')} units at ask`}
              >
                {bestAsk.units.toLocaleString('en-GB')}u
              </Text>
            ) : null}
          </View>
        </View>
      </View>

      {/* Market state + 24h stats — compact status line */}
      <View style={[styles.marketStatusRow, { borderBottomColor: colors.borderSubtle }]}>
        <View style={styles.marketStateDotWrap}>
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
            {isOffline
              ? 'Offline · last known market'
              : reconciliationActive
              ? 'Orders paused'
              : isSecondaryMarket && marketDataStale
                ? 'Market data stale'
              : isMarketOpen
                ? 'Market open'
                : 'Market closed'}
          </Text>
        </View>
        {hasStatsStrip ? (
          <View style={styles.statsStrip}>
            <Text style={[styles.statsLabel, { color: colors.textMuted }]}>24h</Text>
            {movePct24h != null ? (
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
            ) : null}
            {volume24hGbp != null ? (
              <Text style={[styles.statsValue, { color: colors.textMuted }]}>
                Vol {formatCoOwnIze(volume24hGbp)}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>

      {/* Venue metadata — truthful market model label. Co-Own is an
          issuer-run fractional market, not a public exchange. This line
          makes the market model explicit so users cannot mistake it for
          a regulated securities exchange. */}
      <View style={styles.venueMetadataRow}>
        <Text style={[styles.venueMetadataText, { color: colors.textMuted }]}>
          Issuer-run fractional market · Not a public exchange
        </Text>
      </View>

      {/* ── Status row above the card (depth status + alert) ── */}
      <View style={styles.orderBookStatusRow}>
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

      {/* ── 3. Order Book card — Ladder / Depth / Tape in one rectangle ──
          A single card wraps all three order-flow views. The segmented
          control lives in the card header. Contents stay flat — no nested
          cards. Hairline border + surface fill, no shadow (flat canvas). */}
      <View style={[styles.orderBookCard, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
        {/* Card header: Order Book label + Ladder/Depth/Tape segmented control */}
        <View style={[styles.orderBookCardHeader, { borderBottomColor: colors.borderSubtle }]}>
          <Text
            style={[styles.orderBookCardTitle, { color: colors.textPrimary }]}
            accessibilityRole="header"
          >
            Market depth
          </Text>
          <View style={styles.orderBookTabs}>
            {(['ladder', 'depth', 'tape'] as const).map((view) => {
              const isActive = orderBookView === view;
              return (
                <Pressable
                  key={view}
                  onPress={() => setOrderBookView(view)}
                  hitSlop={4}
                  style={({ pressed }) => [styles.orderBookTab, pressed && { opacity: 0.7 }]}
                  accessibilityRole="tab"
                  accessibilityLabel={`Order book view: ${view}`}
                  accessibilityState={{ selected: isActive }}
                >
                  <Text
                    style={[
                      styles.orderBookTabText,
                      { color: isActive ? colors.textPrimary : colors.textSecondary },
                      isActive && { fontFamily: FontFamily.semibold },
                    ]}
                  >
                    {view === 'ladder' ? 'Orders' : view === 'depth' ? 'Depth' : 'Trades'}
                  </Text>
                  {isActive && <View style={[styles.orderBookTabUnderline, { backgroundColor: colors.brand }]} />}
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Card content — flat, no nested cards.
            The Tape view is independent of the order book state (it shows
            settled executions, not resting liquidity). Ladder and Depth
            are subject to the order book error/stale/sync/empty states. */}
        <View style={styles.orderBookCardContent}>
          {orderBookView === 'tape' ? (
            executionsLoading ? (
              <View style={styles.tapeLoadingRow}>
                <ActivityIndicator size="small" color={colors.textMuted} />
                <Text style={[styles.tapeLoadingText, { color: colors.textMuted }]}>
                  Loading recent trades…
                </Text>
              </View>
            ) : executionsFailed ? (
              <CommerceDetailUnavailableInline
                title="Executions unavailable"
                body={isOffline
                  ? 'Recent trades could not be loaded while offline.'
                  : 'Recent trades could not be loaded.'}
                onRetry={loadExecutions}
              />
            ) : tapeExecutions.length > 0 ? (
              <View>
                {isOffline ? (
                  <Text style={[styles.offlineNoteText, { color: colors.textMuted }]}>
                    Offline — last known trades
                  </Text>
                ) : null}
                {tapeExecutions.map((execution, idx) => {
                  const prev = tapeExecutions[idx + 1] ?? null;
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
            ) : (
              <Text style={[styles.noTradesText, { color: colors.textMuted }]}>
                No trades yet
              </Text>
            )
          ) : orderBookError || (orderBook != null && !orderBookIsLive) ? (
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
            orderBookView === 'ladder' ? (
              <View>
                <CoOwnOrderBook
                  bids={mappedBids}
                  asks={mappedAsks}
                  mode={lifecycleState === 'secondaryTrading' ? 'continuous' : 'call_auction'}
                  onSelectLevel={onSelectOrderBookLevel}
                  embedded
                />
              </View>
            ) : orderBookView === 'depth' ? (
              <CoOwnDepthChart
                bids={depthBids}
                asks={depthAsks}
                midPrice={midPrice}
                lastPrice={lastExecutionPriceGbp}
                compact
              />
            ) : null
          ) : orderBook == null && !orderBookError && isMarketOpen ? (
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
        </View>
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
            <View>
            <CommerceDetailUnavailableInline
              title="Open orders unavailable"
              body={isOffline
                ? 'Your resting orders could not be loaded while offline.'
                : 'Your resting orders could not be loaded.'}
            />
            {onRetryOpenOrders && <Pressable onPress={onRetryOpenOrders} disabled={isOffline}
              accessibilityRole="button" accessibilityLabel="Retry loading your open orders"
              accessibilityState={{ disabled: isOffline }}
              style={({ pressed }) => [styles.retryLink, { opacity: isOffline ? 0.4 : pressed ? 0.7 : 1 }]}>
              <Text style={[styles.retryLinkText, { color: colors.textPrimary }]}>Retry</Text>
            </Pressable>}
            </View>
          ) : yourOpenOrdersLoading ? (
            <View style={styles.openOrdersLoadingRow}>
              <ActivityIndicator size="small" color={colors.textMuted} />
            </View>
          ) : yourOpenOrders != null && yourOpenOrders.length > 0 ? (
            <View>
              {isOffline ? (
                <Text style={[styles.offlineNoteText, { color: colors.textMuted }]}>
                  Offline — last known orders
                </Text>
              ) : null}
              {yourOpenOrders.map((order, idx) => {
                const isBuy = order.action === 'buy-units';
                const isCancelling = cancellingOrderId != null && order.orderId != null && cancellingOrderId === order.orderId;
                const canCancel = onCancelOrder != null && order.orderId != null && !isCancelling && !isOffline;
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
    gap: Space.md,
  },
  // ── Order book card ──
  orderBookStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Space.sm,
  },
  orderBookCard: {
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  orderBookCardHeader: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  orderBookCardTitle: {
    fontSize: TypographyV2.body.size,
    fontFamily: FontFamily.semibold,
  },
  orderBookTabs: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    gap: Space.sm,
  },
  orderBookTab: {
    flex: 1,
    paddingVertical: Space.xs,
    paddingHorizontal: Space.xs,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  orderBookTabText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
  orderBookTabUnderline: {
    position: 'absolute',
    bottom: 0,
    left: Space.xs,
    right: Space.xs,
    height: 2,
    borderRadius: 1,
  },
  orderBookCardContent: {
    padding: Space.md,
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
    minHeight: 44,
    paddingHorizontal: Space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xxs,
  },
  alertActionText: {
    fontSize: TypographyV2.caption.size,
    fontFamily: FontFamily.medium,
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
    minHeight: 44,
    justifyContent: 'center',
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
  noTradesText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.regular,
    lineHeight: 18,
  },
  // Offline qualifier above cached tape/open-orders content — quiet meta
  // line so last-known data is never mistaken for live.
  offlineNoteText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.regular,
    lineHeight: 18,
    paddingBottom: Space.xs,
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
  marketStateDotWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    flexShrink: 0,
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
  // ── Pillar 3: Top-of-Book Quote Strip ──
  // Flat on canvas, hairline-separated from the order book below.
  // Bid/ask use coownUp/coownDown; spread is neutral. Tabular numerals.
  topOfBookStrip: {
    flexDirection: 'column',
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  // Meta row: connection dot + state label + freshness stamp, one line.
  topOfBookMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    paddingBottom: Space.xs,
  },
  topOfBookMetaDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  topOfBookFreshness: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
    fontVariant: ['tabular-nums'] as ['tabular-nums'],
    flexShrink: 1,
  },
  topOfBookStateText: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
  topOfBookQuoteRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'space-between',
    gap: Space.sm,
  },
  topOfBookSide: {
    flexDirection: 'column',
    gap: 2,
    flex: 1,
  },
  topOfBookAskSide: {
    alignItems: 'flex-end',
  },
  topOfBookSpread: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: 2,
    flex: 1,
  },
  topOfBookLabel: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
  topOfBookValue: {
    fontSize: TypographyV2.priceList.size,
    lineHeight: TypographyV2.priceList.lineHeight,
    fontFamily: TypographyV2.priceList.fontFamily,
    letterSpacing: TypographyV2.priceList.letterSpacing,
    fontVariant: ['tabular-nums'] as ['tabular-nums'],
  },
  topOfBookSize: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
    fontVariant: ['tabular-nums'] as ['tabular-nums'],
  },
  marketStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingVertical: Space.xs + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: Space.sm,
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
