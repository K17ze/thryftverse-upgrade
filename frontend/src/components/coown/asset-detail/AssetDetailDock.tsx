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
import { Text, StyleSheet } from 'react-native';
import { CommerceDetailStateDock } from '../../commerce/detail/CommerceDetailStateDock';
import { useAppTheme } from '../../../theme/ThemeContext';
import { TypographyV2 } from '../../../theme/typography.v2';
import { FontFamily } from '../../../theme/fontFamily';

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
  return (
    <CommerceDetailStateDock
      value={priceValue}
      valueLabel={priceLabel}
      showProtectionStrip={showProtectionStrip}
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
});
