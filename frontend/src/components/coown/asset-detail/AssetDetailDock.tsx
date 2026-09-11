/**
 * AssetDetailDock — sticky bottom action dock for the Co-Own asset detail screen.
 *
 * Extracted from AssetDetailScreen to reduce screen size and isolate the
 * 7-state dock decision tree. The dock always renders exactly one
 * CommerceDetailStateDock variant:
 *
 *   1. Position unavailable  — holdings error, non-issuer
 *   2. Market updating/unavailable — order book error or reconciliation
 *   3. Trading unavailable   — rights review required
 *   4. Issuer view           — issuer-only actions
 *   5. Trading paused        — asset closed
 *   6. Fully allocated       — no units, non-holder
 *   7. Default               — Buy / Sell with current price
 *
 * The default variant passes the dominant price and label into the dock's
 * value cluster so the left side is never empty.
 */

import React from 'react';
import { Text, View, Pressable, StyleSheet } from 'react-native';
import { CommerceDetailStateDock } from '../../commerce/detail/CommerceDetailStateDock';
import { useAppTheme } from '../../../theme/ThemeContext';
import { TypographyV2 } from '../../../theme/typography.v2';
import { FontFamily } from '../../../theme/fontFamily';
import { Space, Radius } from '../../../theme/designTokens';

export interface AssetDetailDockProps {
  /** True when the viewer is the issuer of this asset. */
  isIssuer: boolean;
  /** True when the viewer holds units of this asset. */
  isHolder: boolean;
  /** True when the asset is in the initial offering phase. */
  isInitialOffering: boolean;
  /** True when the asset is open for trading. */
  assetIsOpen: boolean;
  /** Holdings fetch failed. */
  holdingsError: boolean;
  /** Viewer's unit count — null when anonymous or not yet loaded. */
  yourUnits: number | null;
  /** Order book fetch failed. */
  orderBookError: boolean;
  /** Reconciliation in progress (balances settling). */
  reconciliationActive: boolean;
  /** Rights disclosure not yet accepted. */
  hasIncompleteRights: boolean;
  /** Available units for purchase. */
  availableUnits: number;
  /** Dominant price label: "Offering price" or "Last trade". */
  priceLabel: string;
  /** Dominant price value in GBP (formatted string). */
  priceValue: string;
  /** Buyer protection available. */
  showProtectionStrip: boolean;
  /** Retry holdings fetch. */
  onRetryHoldings: () => void;
  /** Retry order book fetch. */
  onRetryOrderBook: () => void;
  /** Open a bottom sheet by key. */
  onOpenSheet: (sheet: 'rights') => void;
  /** Navigate to order history. */
  onNavigateOrderHistory: () => void;
  /** Handle a trade button press. */
  onTradePress: (side: 'buy' | 'sell') => void;
  /** Count of the viewer's open orders for this asset. When provided and
   *  greater than zero (with onSwitchToMarket), the dock surfaces a subtle
   *  "N open" chip above the primary action. Optional — the parent passes
   *  it when the data is available. */
  openOrderCount?: number;
  /** True when the viewer has an unclaimed distribution for this asset.
   *  When true (with onSwitchToOwnership), the dock surfaces a subtle
   *  "Distribution pending" chip above the primary action. Optional. */
  hasUnclaimedDistribution?: boolean;
  /** Switch to the Market tab (open-orders chip tap). */
  onSwitchToMarket?: () => void;
  /** Switch to the Ownership tab (distribution chip tap). */
  onSwitchToOwnership?: () => void;
}

export function AssetDetailDock({
  isIssuer,
  isHolder,
  isInitialOffering,
  assetIsOpen,
  holdingsError,
  yourUnits,
  orderBookError,
  reconciliationActive,
  hasIncompleteRights,
  availableUnits,
  priceLabel,
  priceValue,
  showProtectionStrip,
  onRetryHoldings,
  onRetryOrderBook,
  onOpenSheet,
  onNavigateOrderHistory,
  onTradePress,
  openOrderCount,
  hasUnclaimedDistribution,
  onSwitchToMarket,
  onSwitchToOwnership,
}: AssetDetailDockProps) {
  const { colors } = useAppTheme();

  // 1. Position unavailable — holdings error, non-issuer
  if (!isIssuer && (holdingsError || yourUnits == null)) {
    return (
      <CommerceDetailStateDock
        stateBadge={
          <Text style={[styles.stateBadge, { color: colors.textPrimary }]}>
            Position unavailable
          </Text>
        }
        subtitle="Trading is disabled until your holdings are verified"
        primaryAction={{
          label: 'Retry position',
          onPress: onRetryHoldings,
        }}
      />
    );
  }

  // 2. Market updating / unavailable — order book error or reconciliation
  if (!isIssuer && (orderBookError || reconciliationActive)) {
    return (
      <CommerceDetailStateDock
        stateBadge={
          <Text style={[styles.stateBadge, { color: colors.textPrimary }]}>
            {reconciliationActive ? 'Market updating' : 'Market unavailable'}
          </Text>
        }
        subtitle={reconciliationActive ? 'Orders are paused while balances settle' : 'Live orders could not be verified'}
        primaryAction={{
          label: reconciliationActive ? 'Check status' : 'Try again',
          onPress: onRetryOrderBook,
          primary: false,
        }}
      />
    );
  }

  // 3. Trading unavailable — rights review required
  if (hasIncompleteRights && !isIssuer && assetIsOpen) {
    return (
      <CommerceDetailStateDock
        stateBadge={
          <Text style={[styles.stateBadge, { color: colors.textPrimary }]}>
            Trading unavailable
          </Text>
        }
        subtitle="Rights review required"
        primaryAction={{
          label: 'Review rights',
          onPress: () => onOpenSheet('rights'),
        }}
      />
    );
  }

  // 4. Issuer view
  if (isIssuer) {
    return (
      <CommerceDetailStateDock
        stateBadge={
          <Text style={[styles.stateBadge, { color: colors.textPrimary }]}>
            Issuer view
          </Text>
        }
        subtitle={`${availableUnits} units available`}
        primaryAction={{
          label: 'View orders',
          onPress: onNavigateOrderHistory,
          accessibilityLabel: 'View co-own order history',
        }}
      />
    );
  }

  // 5. Trading paused — asset closed
  if (!assetIsOpen) {
    return (
      <CommerceDetailStateDock
        stateBadge={
          <Text style={[styles.stateBadge, { color: colors.textSecondary }]}>
            Trading paused
          </Text>
        }
        subtitle="Temporarily unavailable"
        primaryAction={{
          label: 'View orders',
          onPress: onNavigateOrderHistory,
        }}
      />
    );
  }

  // 6. Fully allocated — no units, non-holder
  if (availableUnits === 0 && !isHolder) {
    return (
      <CommerceDetailStateDock
        stateBadge={
          <Text style={[styles.stateBadge, { color: colors.textSecondary }]}>
            Fully allocated
          </Text>
        }
        subtitle="Check the secondary market"
        primaryAction={{
          label: 'Browse secondary',
          onPress: () => onTradePress('buy'),
        }}
      />
    );
  }

  // 7. Default — Buy / Sell with current price in the value cluster
  const isSellPrimary = isHolder && !isInitialOffering;

  // ── Secondary indicators (open orders + unclaimed distributions) ──
  // Surfaced only in the tradable default state, where the primary action
  // is Buy/Sell. They ride in the dock's notice slot — a flat single-line
  // area directly above the action row — so they stay visible with the
  // commitment action without adding card chrome (AGENTS.md §4: flat
  // canvas, hairline separators, one coherent dock surface).
  //
  // Per AGENTS.md §4 "Separate hit area from visible shape": each chip is
  // a compact visible shape (meta 11pt text on a subtle fill) with
  // hitSlop extending the tappable area to a 44pt minimum, rather than
  // rendering a 44pt-tall pill.
  const showOpenOrdersChip =
    openOrderCount != null && openOrderCount > 0 && !!onSwitchToMarket;
  const showDistributionChip =
    !!hasUnclaimedDistribution && !!onSwitchToOwnership;
  const indicators =
    showOpenOrdersChip || showDistributionChip ? (
      <View style={styles.indicatorRow}>
        {showOpenOrdersChip ? (
          <Pressable
            onPress={onSwitchToMarket}
            hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
            style={({ pressed }) => pressed && styles.indicatorPressed}
            accessibilityRole="button"
            accessibilityLabel={`You have ${openOrderCount} open order${openOrderCount === 1 ? '' : 's'}`}
            accessibilityHint="Switch to the Market tab to view your orders"
          >
            <View style={[styles.chip, { backgroundColor: colors.surfaceAlt }]}>
              <Text
                style={[styles.chipText, { color: colors.textPrimary }]}
                numberOfLines={1}
              >
                {`${openOrderCount} open`}
              </Text>
            </View>
          </Pressable>
        ) : null}
        {showDistributionChip ? (
          <Pressable
            onPress={onSwitchToOwnership}
            hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
            style={({ pressed }) => pressed && styles.indicatorPressed}
            accessibilityRole="button"
            accessibilityLabel="You have a pending distribution"
            accessibilityHint="Switch to the Ownership tab to view distributions"
          >
            <View style={[styles.chip, { backgroundColor: colors.warningSubtle }]}>
              <Text
                style={[styles.chipText, { color: colors.warning }]}
                numberOfLines={1}
              >
                Distribution pending
              </Text>
            </View>
          </Pressable>
        ) : null}
      </View>
    ) : null;

  return (
    <CommerceDetailStateDock
      value={priceValue}
      valueLabel={priceLabel}
      showProtectionStrip={showProtectionStrip}
      notice={indicators}
      primaryAction={
        isSellPrimary
          ? { label: 'Sell', onPress: () => onTradePress('sell') }
          : { label: 'Buy units', onPress: () => onTradePress('buy') }
      }
      secondaryAction={
        isSellPrimary
          ? { label: 'Buy more', onPress: () => onTradePress('buy') }
          : undefined
      }
    />
  );
}

const styles = StyleSheet.create({
  stateBadge: {
    fontSize: TypographyV2.bodyStrong.size,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
    fontFamily: FontFamily.semibold,
    letterSpacing: TypographyV2.bodyStrong.letterSpacing,
  },
  // ── Secondary indicator chips (open orders + distributions) ──
  // Flat on the dock surface via the notice slot — no card chrome. The
  // row sits directly above the action row; left-aligned to match the
  // dock's existing protection-strip language (one coherent surface).
  indicatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    flexWrap: 'wrap',
  },
  // Compact visible chip — subtle fill, hairline-free (the fill is the
  // containment, per AGENTS.md "visible containment must have meaning":
  // status grouping qualifies). Radius.sm keeps one radius grammar with
  // the dock's compact controls.
  chip: {
    borderRadius: Radius.sm,
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs,
  },
  // meta (11/14/500) — the dock's smallest scale. Chips are quiet
  // secondary indicators and use the smallest type size so the dock
  // viewport stays within three type sizes (priceList 20, bodyStrong 15,
  // meta 11). Tabular figures keep the open-order count aligned.
  chipText: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
    fontVariant: ['tabular-nums'],
  },
  // Quiet opacity press feedback — secondary indicators, no scale bounce.
  indicatorPressed: {
    opacity: 0.7 },
});
