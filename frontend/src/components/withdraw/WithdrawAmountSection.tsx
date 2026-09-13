import React from 'react';
import { View, Text, StyleSheet, TextInput } from 'react-native';
import { FlagshipMetricLine } from '../flagship';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { useHaptic } from '../../hooks/useHaptic';
import { sanitizeDecimalInput } from '../../utils/currencyAuthoringFlows';
import { Space } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';

interface Props {
  /** Formatted available balance ("Available to withdraw" / "Available:"). */
  availableLabel: string;
  amount: string;
  currencySymbol: string;
  policyScopeLabel: string | null;
  payoutPolicyHint: string | null;
  exceedsBalance: boolean;
  onAmountChange: (value: string) => void;
}

// Available-balance metric + hero amount input with policy disclosures
// and the exceeds-balance inline error.
export function WithdrawAmountSection({
  availableLabel,
  amount,
  currencySymbol,
  policyScopeLabel,
  payoutPolicyHint,
  exceedsBalance,
  onAmountChange,
}: Props) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const haptic = useHaptic();

  return (
    <>
      {/* Available balance — flat metric line, no card */}
      <View style={{ marginTop: Space.md }}>
        <FlagshipMetricLine
          label="Available to withdraw"
          value={availableLabel}
          emphasis
        />
      </View>

      <View>
        <View style={styles.amountWrap}>
          <Text style={styles.currencySymbol}>{currencySymbol}</Text>
          <TextInput
            style={styles.amountInput}
            value={amount}
            onChangeText={(value) => { haptic.selection(); onAmountChange(sanitizeDecimalInput(value)); }}
            onFocus={() => haptic.light()}
            keyboardType="decimal-pad"
            autoFocus
            selectionColor={colors.brand}
            accessibilityLabel="Withdrawal amount"
            accessibilityHint="Enter the amount to withdraw from your available balance"
          />
        </View>
        <Text style={styles.availableText}>Available: {availableLabel}</Text>
        {policyScopeLabel ? <Text style={styles.policyLabel}>Policy scope: {policyScopeLabel}</Text> : null}
        {payoutPolicyHint ? <Text style={styles.policyHint}>{payoutPolicyHint}</Text> : null}
        {exceedsBalance ? <Text style={styles.balanceError}>Entered amount exceeds available balance.</Text> : null}
      </View>
    </>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  amountWrap: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: Space.md, marginTop: Space.xl + Space.xl - 8, marginBottom: Space.sm + Space.xs },
  currencySymbol: { fontSize: TypographyV2.priceHero.size + 16, fontFamily: TypographyV2.priceHero.fontFamily, color: colors.textPrimary, marginRight: Space.sm },
  amountInput: { fontSize: TypographyV2.priceHero.size + 28, fontFamily: TypographyV2.priceHero.fontFamily, color: colors.textPrimary, minWidth: Space.xxl * 3 + Space.xs + 2, fontVariant: ['tabular-nums'] },
  availableText: {
    textAlign: 'center',
    paddingHorizontal: Space.md,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
    color: colors.textSecondary,
    marginBottom: Space.sm,
    fontVariant: ['tabular-nums'] },
  policyLabel: {
    textAlign: 'center',
    paddingHorizontal: Space.md,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
    color: colors.textMuted,
    marginBottom: Space.xs },
  policyHint: {
    textAlign: 'center',
    paddingHorizontal: Space.md,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
    color: colors.textMuted,
    marginBottom: Space.lg + Space.xs },
  balanceError: {
    textAlign: 'center',
    paddingHorizontal: Space.md,
    marginTop: Space.xs,
    marginBottom: Space.md + 4,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
    color: colors.danger },
});
