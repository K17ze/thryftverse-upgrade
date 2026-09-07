import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Space, FontFamily, Radius } from '../../../theme/designTokens';
import { TypographyV2 } from '../../../theme/typography.v2';
import { useAppTheme } from '../../../theme/ThemeContext';
import { formatCoOwnIze } from '../../../utils/currency';
import {
  listCoOwnExecutions,
  type MarketCoOwnAsset,
  type MarketCoOwnExecution,
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
  marketSnapshotLabel?: string;
  isOffline: boolean;
  refreshing: boolean;
  dataStale: boolean;
  dataStaleAgeLabel?: string;
  onRefresh: () => void;
  allocatedPct: number;
  availableUnits: number;
  totalUnits: number;
  onOpenSupply: () => void;
  onOpenPriceAlert: () => void;
  onSelectOrderBookLevel: (side: 'bid' | 'ask', price: number) => void;
  holdingsError: boolean;
  onRetryHoldings: () => void;
  lifecycleState: AssetLifecycleState;
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
  isOffline,
  onOpenPriceAlert,
  onSelectOrderBookLevel,
  lifecycleState,
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

  const isMarketOpen = asset.isOpen && !reconciliationActive && !isOffline;
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
  const hasSettledTrade = asset.marketSnapshot?.lastExecutionPriceGbp != null;
  const transactionPrimaryLabel =
    lifecycleState === 'initialOffering'
      ? 'Offering price'
      : hasSettledTrade
        ? 'Last trade'
        : 'Reference price';
  const transactionPrimaryValue = hasSettledTrade && lifecycleState !== 'initialOffering'
    ? formatCoOwnIze(asset.marketSnapshot!.lastExecutionPriceGbp!)
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
                : isMarketOpen
                  ? 'Market open'
                  : 'Market closed'}
            </Text>
          </View>
        }
      />

      {/* ── 2. Live Order Book Ladder ── */}
      <CommerceDetailSection label="Market depth">
        <View style={styles.sectionHeaderRow}>
          <View style={styles.depthStatusRow}>
            <View
              style={[
                styles.liveIndicatorDot,
                { backgroundColor: orderBookStreaming ? colors.success : colors.textMuted },
              ]}
            />
            <Text style={[styles.depthStatusText, { color: colors.textSecondary }]}>
              {depthStatusLabel}
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

        {orderBookError ? (
          <View style={[styles.errorBox, { backgroundColor: colors.surfaceAlt }]}>
            <Ionicons name="cloud-offline-outline" size={24} color={colors.warning} />
            <Text style={[styles.errorTitle, { color: colors.textPrimary }]}>Order book unavailable</Text>
            <Text style={[styles.errorSubtitle, { color: colors.textSecondary }]}>
              Could not synchronize live market depth.
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
          <View style={[styles.emptyDepthNotice, { backgroundColor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)' }]}>
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
                Marketable orders automatically reject if execution deviates by more than 10% from prevailing quote.
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
                All fills and distributions clear through 1ZE balance at exact 1:1 GBP backing.
              </Text>
            </View>
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
});
