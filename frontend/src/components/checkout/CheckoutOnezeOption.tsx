import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, FontFamily, Stroke } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { RadiusRoleValue } from '../../theme/surfaceRadiusRules';

interface Props {
  onezeBalance: number;
  /** Gross order total — rendered as the 1ZE amount needed. */
  neededAmount: number;
  onPress: () => void;
}

// 1ZE wallet payment option — shown alongside card payment so the user
// sees both options side by side. Tapping switches the funding source
// between 1ZE wallet and card without changing any other checkout detail.
function CheckoutOnezeOptionBase({ onezeBalance, neededAmount, onPress }: Props) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Pay with 1ZE Wallet. ${onezeBalance.toLocaleString(undefined, { maximumFractionDigits: 0 })} 1ZE available. ${Math.ceil(neededAmount).toLocaleString()} 1ZE needed.`}
      accessibilityHint="Switch to paying with your 1ZE wallet balance"
    >
      <Ionicons name="wallet-outline" size={20} color={colors.brand} importantForAccessibility="no" />
      <View style={styles.textCol}>
        <Text style={styles.title} maxFontSizeMultiplier={2}>
          1ZE Wallet
        </Text>
        <Text style={styles.subtitle} numberOfLines={1} maxFontSizeMultiplier={2}>
          {onezeBalance.toLocaleString(undefined, { maximumFractionDigits: 0 })} 1ZE · {Math.ceil(neededAmount).toLocaleString()} 1ZE needed
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} importantForAccessibility="no" />
    </Pressable>
  );
}

const CheckoutOnezeOption = React.memo(CheckoutOnezeOptionBase);
CheckoutOnezeOption.displayName = 'CheckoutOnezeOption';
export { CheckoutOnezeOption };

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.sm,
    paddingHorizontal: Space.md,
    borderWidth: Stroke.standard,
    borderRadius: RadiusRoleValue.mediaThumbnail,
    marginTop: Space.xs,
    borderColor: colors.border,
  },
  textCol: {
    flex: 1,
    flexDirection: 'column',
    gap: 2,
  },
  title: {
    fontSize: TypographyV2.body.size,
    fontFamily: FontFamily.semibold,
    lineHeight: TypographyV2.body.lineHeight,
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.regular,
    lineHeight: TypographyV2.meta.lineHeight,
    color: colors.textMuted,
  },
});
