import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { IconGrammar } from '../../theme/designTokens';
import { AnimatedPressable } from '../AnimatedPressable';
import { t } from '../../i18n';
import { walletScreenStyles as styles } from './walletScreenStyles';

export interface WalletActionRowProps {
  /** False while reconciling or offline — mutes Add money / Withdraw /
   *  Convert and removes their press affordance. */
  isWalletOperational: boolean;
  /** Spendable 1ZE — Convert stays disabled at zero balance. */
  available: number;
  onAddMoney: () => void;
  onWithdraw: () => void;
  onConvert: () => void;
}

/**
 * WalletActionRow — 3 equal-width buttons in a row (spec 17 viewport 1):
 * Add money (primary), Withdraw (secondary), Convert (secondary, needs a
 * positive spendable balance). Markup, disabled logic and a11y strings are
 * lifted verbatim from WalletScreen.
 */
export function WalletActionRow({
  isWalletOperational,
  available,
  onAddMoney,
  onWithdraw,
  onConvert }: WalletActionRowProps) {
  const { colors } = useAppTheme();

  return (
    <View style={styles.actionRow}>
      <AnimatedPressable
        style={[
          styles.actionBtn,
          styles.actionBtnPrimary,
          { backgroundColor: colors.brand },
          !isWalletOperational && { opacity: 0.5 },
        ]}
        onPress={onAddMoney}
        disabled={!isWalletOperational}
        accessibilityRole="button"
        accessibilityLabel={t('commerce.wallet.a11y.addMoneyToWallet')}
        accessibilityHint={t('commerce.wallet.a11y.opensAddMoneyFlow')}
      >
        <Ionicons name="add-circle-outline" size={IconGrammar.standard} color={colors.background} />
        <Text style={[styles.actionBtnLabel, { color: colors.background }]}>{t('commerce.wallet.addMoney')}</Text>
      </AnimatedPressable>
      <AnimatedPressable
        style={[
          styles.actionBtn,
          styles.actionBtnSecondary,
          { borderColor: colors.border },
          !isWalletOperational && { opacity: 0.5 },
        ]}
        onPress={onWithdraw}
        disabled={!isWalletOperational}
        accessibilityRole="button"
        accessibilityLabel={t('commerce.wallet.a11y.withdrawFromWallet')}
        accessibilityHint={t('commerce.wallet.a11y.opensWithdrawFlow')}
      >
        <Ionicons name="arrow-down-circle-outline" size={IconGrammar.standard} color={colors.textPrimary} />
        <Text style={[styles.actionBtnLabel, { color: colors.textPrimary }]}>{t('commerce.wallet.withdraw')}</Text>
      </AnimatedPressable>
      <AnimatedPressable
        style={[
          styles.actionBtn,
          styles.actionBtnSecondary,
          { borderColor: colors.border },
          (available <= 0 || !isWalletOperational) && { opacity: 0.5 },
        ]}
        onPress={onConvert}
        disabled={available <= 0 || !isWalletOperational}
        accessibilityRole="button"
        accessibilityLabel={t('commerce.wallet.a11y.convert1zeToFiat')}
        accessibilityHint={t('commerce.wallet.a11y.opensConvertScreen')}
      >
        <Ionicons name="swap-horizontal-outline" size={IconGrammar.standard} color={colors.textPrimary} />
        <Text style={[styles.actionBtnLabel, { color: colors.textPrimary }]}>{t('commerce.wallet.convert')}</Text>
      </AnimatedPressable>
    </View>
  );
}
