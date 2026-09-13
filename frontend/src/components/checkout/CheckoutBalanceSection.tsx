import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, FontFamily, Radius, Stroke, Control } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { RadiusRoleValue } from '../../theme/surfaceRadiusRules';

interface Props {
  /** Whether the toggle row renders (wallet has credit, balance loaded,
   *  and 1ZE is not the payment source). */
  visible: boolean;
  useBalance: boolean;
  /** Formatted available balance, e.g. "£12.00". */
  balanceLabel: string;
  /** Formatted applied credit — when set, the savings badge renders. */
  savingsAmount?: string;
  onToggle: () => void;
}

// Balance-at-checkout toggle — kept inline so the user can apply wallet
// credit before reviewing the compact total in the sticky footer. Hidden
// when 1ZE payment is selected (1ZE is the full payment source, no
// split-tender needed).
function CheckoutBalanceSectionBase({ visible, useBalance, balanceLabel, savingsAmount, onToggle }: Props) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  return (
    <>
      {visible && (
        <View style={styles.balanceRow}>
          <Pressable
            style={({ pressed }) => [styles.balanceToggle, pressed && styles.balanceTogglePressed]}
            onPress={onToggle}
            accessibilityRole="switch"
            accessibilityLabel="Use wallet balance"
            accessibilityHint="Apply wallet credit to reduce the total"
            accessibilityState={{ checked: useBalance }}
          >
            <View style={[styles.balanceSwitch, useBalance && styles.balanceSwitchOn]}>
              <View style={[styles.balanceKnob, useBalance && styles.balanceKnobOn]} />
            </View>
            <View style={styles.balanceTextCol}>
              <Text style={styles.balanceLabel} maxFontSizeMultiplier={2}>Use wallet balance</Text>
              <Text style={styles.balanceAmount} numberOfLines={1} maxFontSizeMultiplier={2} accessibilityLabel={`${balanceLabel} available`}>
                {balanceLabel} available
              </Text>
            </View>
          </Pressable>
        </View>
      )}

      {savingsAmount ? (
        <View style={styles.savingsBadge}>
          <Ionicons name="wallet-outline" size={12} color={colors.success} importantForAccessibility="no" />
          <Text style={styles.savingsText} maxFontSizeMultiplier={2}>
            Saving {savingsAmount} with wallet balance
          </Text>
        </View>
      ) : null}
    </>
  );
}

const CheckoutBalanceSection = React.memo(CheckoutBalanceSectionBase);
CheckoutBalanceSection.displayName = 'CheckoutBalanceSection';
export { CheckoutBalanceSection };

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  balanceRow: {
    marginTop: Space.sm,
  },
  balanceToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm + 2,
    paddingVertical: Space.sm + 2,
    paddingHorizontal: Space.md,
    borderRadius: Radius.none,
    borderWidth: 0,
    borderColor: colors.border,
  },
  balanceTogglePressed: {
    opacity: 0.7,
  },
  balanceSwitch: {
    width: Space.xxl - Space.sm,
    height: Space.lg,
    borderRadius: RadiusRoleValue.pillAvatar,
    borderWidth: Stroke.standard,
    justifyContent: 'center',
    padding: Space.xs,
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
  },
  balanceSwitchOn: {
    backgroundColor: colors.success,
    borderColor: colors.success,
  },
  balanceKnob: {
    width: Control.iconCompact,
    height: Control.iconCompact,
    borderRadius: RadiusRoleValue.pillAvatar,
    alignSelf: 'flex-start',
    backgroundColor: colors.textMuted,
  },
  balanceKnobOn: {
    backgroundColor: colors.textInverse,
  },
  balanceTextCol: {
    flex: 1,
    gap: Space.xs - 3,
  },
  balanceLabel: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.semibold,
    color: colors.textPrimary,
  },
  balanceAmount: {
    fontSize: TypographyV2.body.size,
    fontFamily: FontFamily.regular,
    fontVariant: ['tabular-nums'],
    color: colors.textMuted,
  },
  savingsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    marginTop: Space.xs,
    paddingVertical: Space.xs,
    paddingHorizontal: Space.sm,
    borderRadius: RadiusRoleValue.compactControl,
    alignSelf: 'flex-start',
    backgroundColor: colors.successSubtle,
  },
  savingsText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.semibold,
    fontVariant: ['tabular-nums'],
    color: colors.success,
  },
});
