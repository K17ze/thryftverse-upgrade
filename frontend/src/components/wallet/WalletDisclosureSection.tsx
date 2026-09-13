import React from 'react';
import { View, Text, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { IconGrammar } from '../../theme/designTokens';
import { AnimatedPressable } from '../AnimatedPressable';
import type { CoOwn1ZeBalance } from '../coown';
import { t } from '../../i18n';
import { walletScreenStyles as styles } from './walletScreenStyles';

export interface WalletDisclosureSectionProps {
  balance: CoOwn1ZeBalance;
  currencyCode: string;
}

/**
 * WalletDisclosureSection — safeguarding status, WS4 evidence/terms links
 * and the 1ZE disclosure. Flat canvas with a hairline divider (spec 17).
 * Lifted verbatim from WalletScreen.
 */
export function WalletDisclosureSection({ balance, currencyCode }: WalletDisclosureSectionProps) {
  const { colors } = useAppTheme();

  return (
    <View style={styles.disclosureSection}>
      <View style={styles.infoHeader}>
        <Ionicons name="checkmark-circle-outline" size={IconGrammar.metadata} color={colors.brand} />
        <Text style={[styles.infoTitle, { color: colors.textPrimary }]} maxFontSizeMultiplier={2}>
          {balance.safeguarded
            ? balance.safeguardingPartner
              ? t('commerce.wallet.safeguardedAt', { partner: balance.safeguardingPartner })
              : t('commerce.wallet.safeguarded')
            : t('commerce.wallet.safeguardingPending')}
        </Text>
      </View>
      <Text style={[styles.infoBody, { color: colors.textMuted }]} maxFontSizeMultiplier={2}>
        {balance.safeguarded
          ? t('commerce.wallet.safeguardedBody', { currency: currencyCode })
          : t('commerce.wallet.safeguardingPendingBody', { currency: currencyCode })}
      </Text>
      {/* WS4: substantiate the safeguarding badge with evidence/terms links. */}
      {balance.safeguarded && (balance.safeguardingEvidenceUrl || balance.safeguardingTermsUrl) ? (
        <View style={styles.safeguardingLinksRow}>
          {balance.safeguardingEvidenceUrl ? (
            <AnimatedPressable
              onPress={() => Linking.openURL(balance.safeguardingEvidenceUrl!)}
              accessibilityRole="link"
              accessibilityLabel={t('commerce.wallet.a11y.viewSafeguardingEvidence')}
              accessibilityHint={t('commerce.wallet.a11y.opensExternalBrowser')}
            >
              <Text style={[styles.safeguardingLink, { color: colors.brand }]}>{t('commerce.wallet.evidence')}</Text>
            </AnimatedPressable>
          ) : null}
          {balance.safeguardingTermsUrl ? (
            <AnimatedPressable
              onPress={() => Linking.openURL(balance.safeguardingTermsUrl!)}
              accessibilityRole="link"
              accessibilityLabel={t('commerce.wallet.a11y.viewSafeguardingTerms')}
              accessibilityHint={t('commerce.wallet.a11y.opensExternalBrowser')}
            >
              <Text style={[styles.safeguardingLink, { color: colors.brand }]}>{t('commerce.wallet.terms')}</Text>
            </AnimatedPressable>
          ) : null}
        </View>
      ) : null}

      <View style={[styles.infoDivider, { borderColor: colors.border }]} />

      <Text style={[styles.infoBody, { color: colors.textMuted }]} maxFontSizeMultiplier={2}>
        {t('commerce.wallet.1zeDisclosure')}
      </Text>
    </View>
  );
}
