import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { IconGrammar } from '../../theme/designTokens';
import { haptics } from '../../utils/haptics';
import { t } from '../../i18n';
import { formatWalletBalance } from './walletViewModels';
import { walletScreenStyles as styles } from './walletScreenStyles';

export interface WalletBalanceHeroProps {
  /** Spendable 1ZE balance (available bucket). */
  available: number;
  /** Privacy eye state (spec 17 viewport 1). */
  balanceHidden: boolean;
  /** At-par USD equivalent label — rendered only when balance is shown. */
  usdLabel?: string;
  onTogglePrivacy: () => void;
}

/**
 * WalletBalanceHero — flat, largest text on screen (spec 17 viewport 1):
 * "Spendable now" label, privacy eye toggle, the 1ZE figure (or mask),
 * and the at-par USD equivalent. Markup and a11y strings are lifted
 * verbatim from WalletScreen.
 */
export function WalletBalanceHero({
  available,
  balanceHidden,
  usdLabel,
  onTogglePrivacy }: WalletBalanceHeroProps) {
  const { colors } = useAppTheme();

  return (
    <View style={styles.balanceHero}>
      <View style={styles.balanceHeader}>
        <Text style={[styles.balanceLabel, { color: colors.textMuted }]}>{t('commerce.wallet.spendableNow')}</Text>
        <Pressable
          onPress={() => { haptics.tap(); onTogglePrivacy(); }}
          style={styles.eyeToggle}
          accessibilityRole="button"
          accessibilityLabel={balanceHidden ? t('commerce.wallet.showBalance') : t('commerce.wallet.hideBalance')}
          accessibilityHint={t('commerce.wallet.a11y.togglesPrivacy')}
        >
          <Ionicons
            name={balanceHidden ? 'eye-off-outline' : 'eye-outline'}
            size={IconGrammar.standard}
            color={colors.textSecondary}
          />
        </Pressable>
      </View>
      {balanceHidden ? (
        <Text
          style={[styles.balanceMasked, { color: colors.textMuted }]}
          accessibilityLabel={t('commerce.wallet.balanceHidden')}
          accessibilityHint={t('commerce.wallet.a11y.activateEyeToReveal')}
         maxFontSizeMultiplier={2}>
          ••••••
        </Text>
      ) : (
        <Text
          style={[styles.balanceValue, { color: colors.textPrimary }]}
          accessibilityLabel={`${formatWalletBalance(available)} 1ZE`}
         maxFontSizeMultiplier={2}>
          {formatWalletBalance(available)}
          <Text style={[styles.balanceUnit, { color: colors.textSecondary }]}> 1ZE</Text>
        </Text>
      )}
      {usdLabel && !balanceHidden && (
        <View style={styles.localFiatRow}>
          <Ionicons name="cash-outline" size={IconGrammar.badge} color={colors.textMuted} />
          <Text style={[styles.localFiatText, { color: colors.textMuted }]} numberOfLines={1} accessibilityLabel={`${usdLabel} USD at par`} maxFontSizeMultiplier={2}>
            {usdLabel}
            <Text style={styles.localFiatSuffix}> USD · at par</Text>
          </Text>
        </View>
      )}
    </View>
  );
}
