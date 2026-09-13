import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, FontFamily } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';

// Secure payment trust signal — placed inline near the payment method
// row where card-security anxiety peaks. Per 2026 UX research:
// "A 'Secure checkout' message next to the card number field is more
// effective than security badges in the footer."
function CheckoutTrustClusterBase() {
  const { colors } = useAppTheme();

  return (
    <View style={styles.trustCluster}>
      <View style={styles.trustRow}>
        <Ionicons name="shield-checkmark-outline" size={13} color={colors.success} importantForAccessibility="no" />
        <Text style={[styles.trustText, { color: colors.success }]} maxFontSizeMultiplier={2}>
          Buyer protection included
        </Text>
      </View>
      <View style={styles.trustRow}>
        <Ionicons name="lock-closed" size={13} color={colors.textMuted} importantForAccessibility="no" />
        <Text style={[styles.trustText, { color: colors.textMuted }]} maxFontSizeMultiplier={2}>
          Secure payment · encrypted
        </Text>
      </View>
      <View style={styles.trustRow}>
        <Ionicons name="return-down-back-outline" size={13} color={colors.textMuted} importantForAccessibility="no" />
        <Text style={[styles.trustText, { color: colors.textMuted }]} maxFontSizeMultiplier={2}>
          14-day returns
        </Text>
      </View>
    </View>
  );
}

const CheckoutTrustCluster = React.memo(CheckoutTrustClusterBase);
CheckoutTrustCluster.displayName = 'CheckoutTrustCluster';
export { CheckoutTrustCluster };

const styles = StyleSheet.create({
  trustCluster: {
    flexDirection: 'column',
    gap: Space.xs - 1,
    paddingVertical: Space.xs,
    paddingHorizontal: Space.xs,
  },
  trustRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  trustText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.medium,
    lineHeight: TypographyV2.meta.lineHeight,
  },
});
