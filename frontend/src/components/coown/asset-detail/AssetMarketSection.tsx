import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Space, FontFamily, Radius, PressScale } from '../../../theme/designTokens';
import { TypographyV2 } from '../../../theme/typography.v2';
import { RadiusRoleValue } from '../../../theme/surfaceRadiusRules';
import { useAppTheme } from '../../../theme/ThemeContext';
import { formatCoOwnIze } from '../../../utils/currency';
import type {
  MarketCoOwnAsset,
  CoOwnOrderBookSnapshot,
  CoOwnOrderBookEntry,
} from '../../../services/marketApi';
import {
  CommerceDetailDisclosureRow,
  CommerceDetailSection,
  CommerceDetailTransactionSurface,
  CommerceDetailUnavailableInline,
  CommerceDetailOfflineBanner,
  CommerceDetailFreshnessBanner,
} from '../../commerce/detail';
import { MarketBookRow } from '../../trade';
import { CoOwnOrderBook } from '../';
import type { AssetLifecycleState } from './types';

/**
 * Asset market section — bid/ask depth, executed trades, spread,
 * quantity available, and price alert entry.
 *
 * The dominant price lives in the orchestrator's identity header;
 * this section shows executable market depth and recent trade context.
 */
export interface AssetMarketSectionProps {
  asset: MarketCoOwnAsset;
  // Order book
  orderBook: CoOwnOrderBookSnapshot | null;
  orderBookStreaming: boolean;
  orderBookHasGap: boolean;
  orderBookError: boolean;
  onRetryOrderBook: () => void;
  // Market data
  bestBid: CoOwnOrderBookEntry | null;
  bestAsk: CoOwnOrderBookEntry | null;
  spreadGbp: number | null;
  depthStatusLabel: string;
  reconciliationActive: boolean;
  marketSnapshotLabel: string | undefined;
  // Connectivity / freshness
  isOffline: boolean;
  refreshing: boolean;
  dataStale: boolean;
  dataStaleAgeLabel: string | undefined;
  onRefresh: () => void;
  // Expansion state
  marketSectionExpanded: boolean;
  onToggleMarketSection: () => void;
  orderBookExpanded: boolean;
  onToggleOrderBook: () => void;
  // Supply / allocation
  allocatedPct: number;
  availableUnits: number;
  totalUnits: number;
  onOpenSupply: () => void;
  // Price alert
  onOpenPriceAlert: () => void;
  // Trade interaction
  onSelectOrderBookLevel: (side: 'bid' | 'ask', price: number) => void;
  // Holdings error
  holdingsError: boolean;
  onRetryHoldings: () => void;
  // Lifecycle
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
  marketSnapshotLabel,
  isOffline,
  refreshing,
  dataStale,
  dataStaleAgeLabel,
  onRefresh,
  marketSectionExpanded,
  onToggleMarketSection,
  orderBookExpanded,
  onToggleOrderBook,
  allocatedPct,
  availableUnits,
  onOpenSupply,
  onOpenPriceAlert,
  onSelectOrderBookLevel,
  holdingsError,
  onRetryHoldings,
  lifecycleState,
}: AssetMarketSectionProps) {
  const { colors } = useAppTheme();
  const marketSnapshot = asset.marketSnapshot ?? null;
  const hasTrades = marketSnapshot?.lastExecutionPriceGbp != null;

  // Lifecycle-aware summary for the disclosure row.
  const sectionSummary = (() => {
    if (lifecycleState === 'initialOffering') {
      return `${availableUnits} units available · ${allocatedPct}% allocated`;
    }
    if (hasTrades) {
      return `Last ${formatCoOwnIze(marketSnapshot!.lastExecutionPriceGbp!)}${spreadGbp != null ? ` · Spread ${formatCoOwnIze(spreadGbp)}` : ''}`;
    }
    return 'Price · depth';
  })();

  return (
    <>
      <CommerceDetailDisclosureRow
        label={marketSectionExpanded ? 'Hide market details' : 'Market details'}
        summary={sectionSummary}
        onPress={onToggleMarketSection}
        leadingIcon="trending-up-outline"
        accessibilityLabel="Toggle market details"
      />
      {marketSectionExpanded ? (
        <CommerceDetailSection label="Market details" variant="continuation">
          {/* Connectivity + freshness notices */}
          <CommerceDetailOfflineBanner isOffline={isOffline} />
          <CommerceDetailFreshnessBanner
            isRefreshing={refreshing}
            isStale={dataStale && !refreshing}
            onRetry={onRefresh}
          />

          {/* Executed trade / reference context */}
          <CommerceDetailTransactionSurface
            family="co_own"
            flush
            surfaceColor="transparent"
            primaryLabel={hasTrades ? 'Last trade' : 'Reference price'}
            primaryValue={formatCoOwnIze(marketSnapshot?.lastExecutionPriceGbp ?? asset.unitPriceGbp)}
            secondaryLabel={hasTrades && marketSnapshot?.lastExecutionAt ? 'Executed' : undefined}
            secondaryValue={
              hasTrades && marketSnapshot?.lastExecutionAt
                ? new Date(marketSnapshot.lastExecutionAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
                : undefined
            }
            statusRow={
              <View style={styles.marketStatusRow}>
                <View style={styles.marketStatusCluster}>
                  <View
                    style={[
                      styles.marketStatusDot,
                      {
                        backgroundColor: reconciliationActive
                          ? colors.warning
                          : asset.isOpen
                            ? colors.success
                            : colors.textMuted,
                      },
                    ]}
                  />
                  <Text style={[styles.marketStatusText, { color: colors.textPrimary }]} maxFontSizeMultiplier={1.4}>
                    {reconciliationActive ? 'Trading paused · settling' : asset.isOpen ? 'Market open' : 'Market closed'}
                  </Text>
                  {dataStale && dataStaleAgeLabel && (
                    <Text style={[styles.marketStatusStale, { color: colors.warning }]}>Stale {dataStaleAgeLabel}</Text>
                  )}
                </View>
                <Text style={[styles.marketStatusRights, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.4}>
                  {orderBookError
                    ? 'Depth unavailable'
                    : `${depthStatusLabel} \u00b7 spread ${spreadGbp != null ? formatCoOwnIze(spreadGbp) : 'n/a'}`}
                </Text>
              </View>
            }
          >
            {/* Allocation indicator — supply quantity available */}
            <Pressable
              style={({ pressed }) => [
                styles.allocationIndicatorRow,
                { borderTopColor: colors.border },
                pressed && { opacity: 0.85, transform: [{ scale: PressScale.gentle }] },
              ]}
              onPress={onOpenSupply}
              accessibilityRole="button"
              accessibilityLabel={`Supply details · ${allocatedPct}% allocated, ${availableUnits} units available`}
            >
              <View style={[styles.allocationBar, { backgroundColor: colors.surfaceAlt, flex: 1 }]}>
                <View
                  style={[
                    styles.allocationFill,
                    { backgroundColor: colors.brand, width: `${Math.min(100, allocatedPct)}%` },
                  ]}
                />
              </View>
              <Text style={[styles.allocationIndicatorText, { color: colors.textSecondary }]} numberOfLines={1} maxFontSizeMultiplier={1.4}>
                {allocatedPct}% allocated · {availableUnits} units available
              </Text>
              <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
            </Pressable>
          </CommerceDetailTransactionSurface>

          {/* Holdings error — position unavailable */}
          {holdingsError ? (
            <CommerceDetailUnavailableInline
              title="Position unavailable"
              body="We could not verify your settled units. Trading is disabled until this refreshes."
              onRetry={onRetryHoldings}
            />
          ) : null}

          {/* Best bid / best ask — with available quantity */}
          {orderBookError ? (
            <CommerceDetailUnavailableInline
              title="Live market unavailable"
              body="Bid and ask depth could not be loaded."
              onRetry={onRetryOrderBook}
            />
          ) : (
            <MarketBookRow bestBid={bestBid} bestAsk={bestAsk} />
          )}

          {/* Bids & asks — order book depth disclosure */}
          {!orderBookError && orderBook ? (
            <>
              <CommerceDetailDisclosureRow
                label={orderBookExpanded ? 'Hide bids & asks' : 'Bids & asks'}
                summary={`${orderBook.bids.length + orderBook.asks.length} offers`}
                onPress={onToggleOrderBook}
                leadingIcon="bar-chart-outline"
              />
              {orderBookExpanded ? (
                <>
                  <View style={styles.marketLegendRow}>
                    <View style={styles.marketLegendItem}>
                      <View style={[styles.marketLegendDot, { backgroundColor: colors.coownUp }]} />
                      <Text style={[styles.marketLegendText, { color: colors.textMuted }]}>Bid (buy)</Text>
                    </View>
                    <View style={styles.marketLegendItem}>
                      <View style={[styles.marketLegendDot, { backgroundColor: colors.coownDown }]} />
                      <Text style={[styles.marketLegendText, { color: colors.textMuted }]}>Ask (sell)</Text>
                    </View>
                  </View>
                  <CoOwnOrderBook
                    embedded
                    bids={orderBook.bids.map((level) => ({
                      price: level.unitPriceGbp,
                      size: level.units,
                      orderCount: level.orderCount,
                    }))}
                    asks={orderBook.asks.map((level) => ({
                      price: level.unitPriceGbp,
                      size: level.units,
                      orderCount: level.orderCount,
                    }))}
                    visibleLevels={5}
                    lastPrice={marketSnapshot?.lastExecutionPriceGbp ?? undefined}
                    lastAgeSeconds={undefined}
                    mode={asset.isOpen ? 'continuous' : 'closed'}
                    onSelectLevel={onSelectOrderBookLevel}
                  />
                </>
              ) : null}
            </>
          ) : null}

          {/* Price alert */}
          <CommerceDetailDisclosureRow
            label="Price alert"
            summary="Get notified at a target price"
            onPress={onOpenPriceAlert}
            leadingIcon="notifications-outline"
            accessibilityLabel="Create price alert"
          />
        </CommerceDetailSection>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  marketStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: Space.xs,
  },
  marketStatusCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  marketStatusDot: {
    width: Space.sm,
    height: Space.sm,
    borderRadius: RadiusRoleValue.compactControl,
  },
  marketStatusText: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.semibold,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
  marketStatusStale: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.regular,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
  marketStatusRights: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.regular,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
  allocationIndicatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: Space.lg,
    paddingTop: Space.lg,
  },
  allocationIndicatorText: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.medium,
    letterSpacing: TypographyV2.meta.letterSpacing,
    flexShrink: 1,
    fontVariant: ['tabular-nums'] as ['tabular-nums'],
  },
  allocationBar: {
    height: Space.sm,
    borderRadius: RadiusRoleValue.pillAvatar,
    overflow: 'hidden',
  },
  allocationFill: {
    height: '100%',
    borderRadius: RadiusRoleValue.pillAvatar,
  },
  marketLegendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingVertical: Space.xs,
  },
  marketLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  marketLegendDot: {
    width: 8,
    height: 8,
    borderRadius: Radius.full,
  },
  marketLegendText: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.regular,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
});
