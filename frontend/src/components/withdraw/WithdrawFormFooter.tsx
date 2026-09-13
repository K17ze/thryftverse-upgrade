import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppButton } from '../ui/AppButton';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';

interface Props {
  /** Formatted GBP amount — drives the review CTA accessibility label. */
  amountLabel: string;
  canWithdraw: boolean;
  onReview: () => void;
}

// Sticky form footer — estimated-arrival disclosure + fee note + the
// "Review withdrawal" primary CTA.
export function WithdrawFormFooter({ amountLabel, canWithdraw, onReview }: Props) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  return (
    <>
      {/* Estimated arrival — honest, non-decorative disclosure */}
      <View style={[styles.arrivalRow, { borderColor: colors.border }]}>
        <View style={styles.arrivalLeft}>
          <Ionicons name="time-outline" size={16} color={colors.textSecondary} />
          <Text style={[styles.arrivalLabel, { color: colors.textSecondary }]}>
            Estimated arrival
          </Text>
        </View>
        <Text style={[styles.arrivalValue, { color: colors.textPrimary }]}>
          1–3 business days
        </Text>
      </View>
      <Text style={styles.feeText}>
        Transfers to your bank typically arrive in 1–3 business days. Status updates when the bank confirms.
      </Text>
      <AppButton
        title={`Review withdrawal`}
        onPress={onReview}
        disabled={!canWithdraw}
        variant="primary"
        style={[styles.primaryBtn, !canWithdraw && styles.primaryBtnDisabled]}
        titleStyle={styles.primaryText}
        accessibilityLabel={
          `Review withdrawal of ${amountLabel}`
        }
        accessibilityHint="Proceeds to the confirmation step"
      />
    </>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  // Estimated arrival row — clear disclosure per spec
  arrivalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Space.sm + 2,
    marginBottom: Space.xs,
    borderBottomWidth: StyleSheet.hairlineWidth },
  arrivalLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2 },
  arrivalLabel: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing },
  arrivalValue: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
    fontVariant: ['tabular-nums'] },
  feeText: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: Space.md },
  primaryBtn: { backgroundColor: colors.textPrimary, height: Space.xl + Space.xl + 8, borderRadius: Space.lg + 4, alignItems: 'center', justifyContent: 'center' },
  primaryBtnDisabled: { opacity: 0.45 },
  primaryText: { color: colors.background, fontSize: TypographyV2.body.size, fontFamily: TypographyV2.body.fontFamily, fontVariant: ['tabular-nums'] },
});
