import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Space, FontFamily, Radius, PressScale } from '../../../theme/designTokens';
import { TypographyV2 } from '../../../theme/typography.v2';
import { useAppTheme } from '../../../theme/ThemeContext';
import { formatCoOwnIze } from '../../../utils/currency';
import type {
  MarketCoOwnAsset,
  CoOwnOrderBookSnapshot,
  CoOwnOrderBookEntry,
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
  marketSectionExpanded?: boolean;
  onToggleMarketSection?: () => void;
  orderBookExpanded?: boolean;
  onToggleOrderBook?: () => void;
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
      {/* ── 1. Transaction Surface with family="co_own" ── */}
      <CommerceDetailTransactionSurface
        family="co_own"
        primaryLabel={transactionPrimaryLabel}
        primaryValue={transactionPrimaryValue}
        secondaryLabel={transactionSecondaryLabel}
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
            {spreadGbp != null && spreadGbp > 0 ? (
              <Text style={[styles.spreadText, { color: colors.textMuted }]}>
                · Spread: {formatCoOwnIze(spreadGbp)}
              </Text>
            ) : null}
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

      {/* ── 3. Recent Market Executions ── */}
      <CommerceDetailSection label="Recent executions">
        {asset.marketSnapshot?.lastExecutionPriceGbp != null ? (
          <View style={styles.tradeExecutionRow}>
            <View style={styles.tradeExecutionLeft}>
              <Ionicons name="swap-horizontal" size={16} color={colors.brand} />
              <View>
                <Text style={[styles.tradeExecutionPrice, { color: colors.textPrimary }]}>
                  {formatCoOwnIze(asset.marketSnapshot.lastExecutionPriceGbp)}
                </Text>
                <Text style={[styles.tradeExecutionMeta, { color: colors.textMuted }]}>
                  {asset.marketSnapshot.lastExecutionAt
                    ? new Date(asset.marketSnapshot.lastExecutionAt).toLocaleString('en-GB', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : 'Recent trade'}
                </Text>
              </View>
            </View>
            <View style={styles.tradeExecutionRight}>
              <Text style={[styles.tradeVolumeText, { color: colors.textSecondary }]}>
                Settled · ONEZE
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.noTradesBox}>
            <Text style={[styles.noTradesText, { color: colors.textMuted }]}>
              No trades yet. Initial issuance is currently offered at {formatCoOwnIze(asset.unitPriceGbp)}.
            </Text>
          </View>
        )}
      </CommerceDetailSection>

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
  spreadText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.regular,
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
  tradeExecutionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Space.xs,
  },
  tradeExecutionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  tradeExecutionPrice: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: FontFamily.bold,
    fontVariant: ['tabular-nums'],
  },
  tradeExecutionMeta: {
    fontSize: 11,
    fontFamily: FontFamily.regular,
  },
  tradeExecutionRight: {
    alignItems: 'flex-end',
  },
  tradeVolumeText: {
    fontSize: TypographyV2.caption.size,
    fontFamily: FontFamily.medium,
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
