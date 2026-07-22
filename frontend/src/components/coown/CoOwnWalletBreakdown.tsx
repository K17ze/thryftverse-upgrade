/**
 * CoOwnWalletBreakdown — the 1ZE settlement balance breakdown.
 *
 * Shows spendable-now hero, settled claim sub-balances (available,
 * reserved, redemption pending, other holds), pending section (deposits,
 * unsettled proceeds), withdrawable, and safeguarding partner.
 *
 * Strict invariant: withdrawable ≤ available ≤ settledCustomerClaim.
 * No sub-balance may ever be negative (audit blocker 1).
 *
 * See docs/coown/flagship-exchange-upgrade/06 §2.1 + 04 §A9.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Radius, Type, Typography } from '../../theme/designTokens';
import { CoOwnNumericText } from '../ui/CoOwnNumericText';
import type { CoOwn1ZeBalance as CanonicalCoOwn1ZeBalance, CoOwnReconciliationState } from '../../data/coOwnModels';

/**
 * The 1ZE balance — aligned to the canonical model in coOwnModels.ts.
 * The sequencing/trust fields are optional so the component works both
 * with the full canonical type (when the backend exposes it) and with
 * the narrow 6-bucket version (during migration).
 */
export type CoOwn1ZeBalance = Omit<
  CanonicalCoOwn1ZeBalance,
  'settledCustomerClaim' | 'withdrawable' | 'safeguarded' | 'snapshotSequence' | 'serverTimestamp' | 'reconciliationState'
> & {
  settledCustomerClaim?: number;
  withdrawable?: number;
  safeguarded?: boolean;
  snapshotSequence?: number;
  serverTimestamp?: string;
  reconciliationState?: CoOwnReconciliationState;
};

export interface CoOwnWalletBreakdownProps {
  balance: CoOwn1ZeBalance;
  /** Safeguarding partner name. */
  safeguardingPartner?: string;
  /** Local-fiat indication for spendable now. */
  localFiatLabel?: string;
  localFiatSource?: string;
  /** Number of open buy orders (for the reserved row caption). */
  openBuyOrderCount?: number;
  /** Redemption ETA label. */
  redemptionEta?: string;
  /** Pending deposit ETA label. */
  pendingDepositEta?: string;
  /** Unsettled proceeds settlement label (e.g. "T+1"). */
  unsettledProceedsEta?: string;
}

export function CoOwnWalletBreakdown({
  balance,
  safeguardingPartner,
  localFiatLabel,
  localFiatSource,
  openBuyOrderCount,
  redemptionEta,
  pendingDepositEta,
  unsettledProceedsEta,
}: CoOwnWalletBreakdownProps) {
  const { colors } = useAppTheme();

  const settledClaim =
    balance.settledCustomerClaim ??
    (balance.available + balance.reservedForOrders + balance.redemptionInProgress + balance.otherHolds);

  const withdrawable = balance.withdrawable ?? balance.available; // capped to available

  return (
    <View
      style={styles.container}
      accessibilityRole="summary"
      accessibilityLabel={`Wallet breakdown. Spendable now ${balance.available} 1ZE. Settled customer claim ${settledClaim} 1ZE. Withdrawable ${withdrawable} 1ZE.`}
    >
      {/* ── Spendable now hero ── */}
      <View style={[styles.heroCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.heroLabel, { color: colors.textMuted }]}>Spendable now</Text>
        <CoOwnNumericText
          value={balance.available}
          unit="1ZE"
          size="priceLarge"
          align="left"
        />
        {localFiatLabel && (
          <View style={styles.localFiatRow}>
            <Ionicons name="cash-outline" size={12} color={colors.textMuted} />
            <Text style={[styles.localFiatText, { color: colors.textMuted }]} numberOfLines={1}>
              {localFiatLabel}
              {localFiatSource ? ` · ${localFiatSource}` : ''}
            </Text>
          </View>
        )}
      </View>

      {/* ── Settled claim section ── */}
      <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>
            Settled claim
          </Text>
          {safeguardingPartner && (
            <View style={[styles.safeguardChip, { backgroundColor: colors.brand + '12' }]}>
              <Ionicons name="shield-checkmark-outline" size={11} color={colors.brand} />
              <Text style={[styles.safeguardChipText, { color: colors.brand }]} numberOfLines={1}>
                Safeguarded at {safeguardingPartner}
              </Text>
            </View>
          )}
        </View>

        {settledClaim === 0 ? (
          <Text style={[styles.emptyClaimText, { color: colors.textMuted }]}>
            No settled 1ZE yet. Add 1ZE to start trading Co-Own units.
          </Text>
        ) : (
          <>
            <BalanceRow
              label="Available"
              value={balance.available}
              caption="← spendable now"
              colors={colors}
              emphasis
            />
            {balance.reservedForOrders > 0 && (
              <BalanceRow
                label="Reserved for orders"
                value={balance.reservedForOrders}
                caption={openBuyOrderCount ? `${openBuyOrderCount} open ${openBuyOrderCount === 1 ? 'order' : 'orders'}` : undefined}
                colors={colors}
              />
            )}
            {balance.redemptionInProgress > 0 && (
              <BalanceRow
                label="Redemption pending"
                value={balance.redemptionInProgress}
                caption={redemptionEta ? `to GBP · ETA ${redemptionEta}` : undefined}
                colors={colors}
              />
            )}
            {balance.otherHolds > 0 && (
              <BalanceRow
                label="Other holds"
                value={balance.otherHolds}
                colors={colors}
              />
            )}
          </>
        )}

        {/* Total settled claim */}
        <View style={[styles.totalRow, { borderColor: colors.border }]}>
          <Text style={[styles.totalLabel, { color: colors.textPrimary }]}>
            Settled customer claim
          </Text>
          <CoOwnNumericText
            value={settledClaim}
            unit="1ZE"
            size="price"
            align="right"
          />
        </View>
      </View>

      {/* ── Pending section (not yet settled — separate) ── */}
      {(balance.pendingDeposit > 0 || balance.unsettledSaleProceeds > 0) && (
        <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>
            Pending
          </Text>
          <Text style={[styles.pendingNote, { color: colors.textMuted }]}>
            Not yet settled — separate from your settled claim.
          </Text>
          <BalanceRow
            label="Pending deposit"
            value={balance.pendingDeposit}
            caption={pendingDepositEta ? `settling ${pendingDepositEta}` : undefined}
            colors={colors}
          />
          <BalanceRow
            label="Unsettled sale proceeds"
            value={balance.unsettledSaleProceeds}
            caption={unsettledProceedsEta}
            colors={colors}
          />
        </View>
      )}

      {/* ── Withdrawable ── */}
      <View style={[styles.withdrawableRow, { borderColor: colors.border }]}>
        <View style={styles.withdrawableLeft}>
          <Ionicons name="arrow-down-circle-outline" size={15} color={colors.textSecondary} />
          <Text style={[styles.withdrawableLabel, { color: colors.textSecondary }]}>
            Withdrawable
          </Text>
        </View>
        <CoOwnNumericText
          value={withdrawable}
          unit="1ZE"
          size="price"
          align="right"
        />
      </View>

      {/* ── Safeguarding & redemption info ── */}
      {safeguardingPartner && (
        <View style={styles.safeguardInfo}>
          <Ionicons name="information-circle-outline" size={13} color={colors.textMuted} />
          <Text style={[styles.safeguardInfoText, { color: colors.textMuted }]}>
            Customer 1ZE is safeguarded at {safeguardingPartner}. Redemption to GBP
            settlement timing depends on your bank and amount.
          </Text>
        </View>
      )}
    </View>
  );
}

/** A balance row — label on left, value on right, optional caption. */
function BalanceRow({
  label,
  value,
  caption,
  colors,
  emphasis,
}: {
  label: string;
  value: number;
  caption?: string;
  colors: ReturnType<typeof useAppTheme>['colors'];
  emphasis?: boolean;
}) {
  return (
    <View style={styles.balanceRow} accessibilityRole="text" accessibilityLabel={`${label}: ${value} 1ZE${caption ? `, ${caption}` : ''}`}>
      <View style={styles.balanceLabelCol}>
        <Text
          style={[
            styles.balanceLabel,
            { color: emphasis ? colors.textPrimary : colors.textSecondary },
            emphasis && { fontFamily: Typography.family.semibold },
          ]}
          numberOfLines={1}
        >
          {label}
        </Text>
        {caption && (
          <Text style={[styles.balanceCaption, { color: colors.textMuted }]} numberOfLines={1}>
            {caption}
          </Text>
        )}
      </View>
      <CoOwnNumericText
        value={value}
        unit="1ZE"
        size={emphasis ? 'price' : 'price'}
        align="right"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Space.md,
  },
  heroCard: {
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Space.md,
    gap: Space.xs,
  },
  heroLabel: {
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: Typography.family.medium,
    letterSpacing: Type.metaElevated.letterSpacing,
    textTransform: 'uppercase',
  },
  localFiatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    marginTop: Space.xs,
  },
  localFiatText: {
    flex: 1,
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.meta.letterSpacing,
  },
  sectionCard: {
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Space.md,
    gap: Space.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Space.sm,
    flexWrap: 'wrap',
  },
  sectionTitle: {
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.metaElevated.letterSpacing,
    textTransform: 'uppercase',
  },
  safeguardChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Space.sm,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  safeguardChipText: {
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: Typography.family.medium,
    letterSpacing: Type.meta.letterSpacing,
  },
  pendingNote: {
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.meta.letterSpacing,
    fontStyle: 'italic',
  },
  emptyClaimText: {
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
    fontFamily: Typography.family.regular,
    paddingVertical: Space.sm,
  },
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Space.md,
    minHeight: 24,
  },
  balanceLabelCol: {
    flex: 1,
    gap: 1,
  },
  balanceLabel: {
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.body.letterSpacing,
  },
  balanceCaption: {
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.meta.letterSpacing,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: Space.md,
  },
  totalLabel: {
    fontSize: Type.bodyEmphasis.size,
    lineHeight: Type.bodyEmphasis.lineHeight,
    fontFamily: Typography.family.bold,
    letterSpacing: Type.bodyEmphasis.letterSpacing,
  },
  withdrawableRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm + 2,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: Space.md,
  },
  withdrawableLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  withdrawableLabel: {
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
    fontFamily: Typography.family.medium,
    letterSpacing: Type.body.letterSpacing,
  },
  safeguardInfo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.xs,
    paddingHorizontal: Space.xs,
  },
  safeguardInfoText: {
    flex: 1,
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight + 2,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.caption.letterSpacing,
  },
});

export default CoOwnWalletBreakdown;
