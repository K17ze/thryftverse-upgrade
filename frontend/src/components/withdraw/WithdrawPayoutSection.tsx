import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AnimatedPressable } from '../AnimatedPressable';
import { FlagshipFormSection, FlagshipNavigationRow } from '../flagship';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { t } from '../../i18n';

interface Props {
  bankName: string;
  bankDetails: string;
  /** payoutAccount?.status === 'active' — drives icon, CTA copy and a11y. */
  hasActivePayoutAccount: boolean;
  allowBankAccounts: boolean;
  isConnectingPayout: boolean;
  onConnectPayout: () => void;
}

// "Transfer to" section — connected payout profile row plus the
// connect/refresh CTA, or the region-policy disabled hint.
export function WithdrawPayoutSection({
  bankName,
  bankDetails,
  hasActivePayoutAccount,
  allowBankAccounts,
  isConnectingPayout,
  onConnectPayout,
}: Props) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  return (
    <View>
    <FlagshipFormSection variant="flat" title="Transfer to">
      <FlagshipNavigationRow
        title={bankName}
        subtitle={bankDetails}
        icon="business"
        onPress={onConnectPayout}
        disabled={!allowBankAccounts || isConnectingPayout}
        separator={false}
        accessibilityLabel={
          hasActivePayoutAccount
            ? 'Refresh verified payout profile'
            : t('withdraw.form.connectVerifiedPayoutProfile')
        }
        accessibilityHint="Opens secure payout onboarding when verification is required"
      />

      {allowBankAccounts ? (
        <AnimatedPressable
          style={styles.addBankBtn}
          onPress={onConnectPayout}
          disabled={isConnectingPayout}
          accessibilityRole="button"
          accessibilityLabel={
            hasActivePayoutAccount
              ? 'Refresh payout profile'
              : t('withdraw.form.connectPayoutProfileLabel')
          }
          accessibilityHint="Checks payout verification and opens any required onboarding steps"
        >
          <Ionicons
            name={hasActivePayoutAccount ? 'refresh' : 'open-outline'}
            size={18}
            color={colors.brand}
          />
          <Text style={styles.addBankText}>
            {isConnectingPayout
              ? 'Checking payout profile…'
              : hasActivePayoutAccount
                ? 'Refresh payout profile'
                : 'Set up payouts'}
          </Text>
        </AnimatedPressable>
      ) : (
        <Text style={styles.railHintText}>Bank account setup is currently disabled for this region policy.</Text>
      )}
    </FlagshipFormSection>
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  addBankBtn: { flexDirection: 'row', alignItems: 'center', gap: Space.sm, paddingHorizontal: Space.md, paddingVertical: Space.sm + Space.xs },
  addBankText: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
    color: colors.brand },
  railHintText: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
    color: colors.textMuted,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm + Space.xs },
});
