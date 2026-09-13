import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { IconGrammar } from '../../theme/designTokens';
import type { CoOwn1ZeBalance } from '../coown';
import { t } from '../../i18n';
import { formatWalletBalance, hasWalletSubBalances } from './walletViewModels';
import { walletScreenStyles as styles } from './walletScreenStyles';

export interface WalletSubBalanceSectionProps {
  balance: CoOwn1ZeBalance;
  withdrawable: number;
}

/**
 * WalletSubBalanceSection — the flat hairline-separated sub-balance rows
 * (spec 17 viewport 2). When any non-available bucket is present it renders
 * the full breakdown ending in an emphasised Withdrawable row; otherwise it
 * renders the standalone withdrawable row. Markup and a11y labels are
 * lifted verbatim from WalletScreen.
 */
export function WalletSubBalanceSection({ balance, withdrawable }: WalletSubBalanceSectionProps) {
  const { colors } = useAppTheme();

  if (hasWalletSubBalances(balance)) {
    return (
      <View style={[styles.breakdownSection, { borderTopColor: colors.border }]}>
        {balance.reservedForOrders > 0 && (
          <SubBalanceRow label={t('commerce.wallet.reservedForOrders')} value={balance.reservedForOrders} colors={colors} />
        )}
        {balance.redemptionInProgress > 0 && (
          <SubBalanceRow label={t('commerce.wallet.redemptionPending')} value={balance.redemptionInProgress} colors={colors} />
        )}
        {balance.otherHolds > 0 && (
          <SubBalanceRow label={t('commerce.wallet.otherHolds')} value={balance.otherHolds} colors={colors} />
        )}
        {balance.pendingDeposit > 0 && (
          <SubBalanceRow label={t('commerce.wallet.pendingDeposit')} value={balance.pendingDeposit} colors={colors} />
        )}
        {balance.unsettledSaleProceeds > 0 && (
          <SubBalanceRow label={t('commerce.wallet.unsettledSaleProceeds')} value={balance.unsettledSaleProceeds} colors={colors} />
        )}
        <SubBalanceRow label={t('commerce.wallet.withdrawable')} value={withdrawable} colors={colors} emphasize />
      </View>
    );
  }

  // ── Withdrawable-only (no other sub-balances) ──
  return (
    <View style={[styles.withdrawableRow, { borderTopColor: colors.border, borderBottomColor: colors.border }]}>
      <View style={styles.withdrawableLeft}>
        <Ionicons name="arrow-down-circle-outline" size={IconGrammar.metadata} color={colors.textMuted} />
        <Text style={[styles.withdrawableLabel, { color: colors.textMuted }]}>{t('commerce.wallet.withdrawable')}</Text>
      </View>
      <Text style={[styles.withdrawableValue, { color: colors.textSecondary }]} maxFontSizeMultiplier={2}>
        {formatWalletBalance(withdrawable)}
        <Text style={[styles.subBalanceUnit, { color: colors.textMuted }]}> 1ZE</Text>
      </Text>
    </View>
  );
}

/** Flat sub-balance row — muted label left, tabular-nums value right. */
function SubBalanceRow({
  label,
  value,
  colors,
  emphasize = false }: {
  label: string;
  value: number;
  colors: ThemeColors;
  emphasize?: boolean;
}) {
  return (
    <View
      style={[styles.subBalanceRow, { borderBottomColor: colors.border }]}
      accessibilityRole="text"
      accessibilityLabel={`${label}: ${formatWalletBalance(value)} 1ZE`}
    >
      <Text
        style={[styles.subBalanceLabel, { color: emphasize ? colors.textSecondary : colors.textMuted }]}
        numberOfLines={1}
       maxFontSizeMultiplier={2}>
        {label}
      </Text>
      <Text
        style={[styles.subBalanceValue, { color: emphasize ? colors.textPrimary : colors.textSecondary }]}
       maxFontSizeMultiplier={2}>
        {formatWalletBalance(value)}
        <Text style={[styles.subBalanceUnit, { color: colors.textMuted }]}> 1ZE</Text>
      </Text>
    </View>
  );
}
