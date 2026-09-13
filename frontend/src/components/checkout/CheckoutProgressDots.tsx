import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, FontFamily, Stroke } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';

interface Props {
  deliveryComplete: boolean;
  paymentComplete: boolean;
  reviewComplete: boolean;
}

// Compact 3-dot indicator showing the logical checkout sections. Each dot
// fills when its section is complete, reducing anxiety by showing the user
// what's involved and where they are in the flow (2026 UX research:
// "Progress indicator = reduces anxiety").
function CheckoutProgressDotsBase({ deliveryComplete, paymentComplete, reviewComplete }: Props) {
  const { colors } = useAppTheme();

  return (
    <View style={styles.progressRow} accessibilityRole="progressbar" accessibilityLabel={`Checkout progress: Delivery ${deliveryComplete ? 'complete' : 'pending'}, Payment ${paymentComplete ? 'complete' : 'pending'}, Review ${reviewComplete ? 'ready' : 'pending'}`}>
      <View style={styles.progressStep}>
        <View style={[styles.progressDot, { backgroundColor: deliveryComplete ? colors.brand : colors.surfaceAlt, borderColor: deliveryComplete ? colors.brand : colors.border }]} />
        <Text style={[styles.progressLabel, { color: deliveryComplete ? colors.textPrimary : colors.textMuted }]} maxFontSizeMultiplier={2}>Delivery</Text>
      </View>
      <View style={[styles.progressConnector, { backgroundColor: deliveryComplete ? colors.brand : colors.border }]} />
      <View style={styles.progressStep}>
        <View style={[styles.progressDot, { backgroundColor: paymentComplete ? colors.brand : colors.surfaceAlt, borderColor: paymentComplete ? colors.brand : colors.border }]} />
        <Text style={[styles.progressLabel, { color: paymentComplete ? colors.textPrimary : colors.textMuted }]} maxFontSizeMultiplier={2}>Payment</Text>
      </View>
      <View style={[styles.progressConnector, { backgroundColor: paymentComplete ? colors.brand : colors.border }]} />
      <View style={styles.progressStep}>
        <View style={[styles.progressDot, { backgroundColor: reviewComplete ? colors.brand : colors.surfaceAlt, borderColor: reviewComplete ? colors.brand : colors.border }]} />
        <Text style={[styles.progressLabel, { color: reviewComplete ? colors.textPrimary : colors.textMuted }]} maxFontSizeMultiplier={2}>Review</Text>
      </View>
    </View>
  );
}

const CheckoutProgressDots = React.memo(CheckoutProgressDotsBase);
CheckoutProgressDots.displayName = 'CheckoutProgressDots';
export { CheckoutProgressDots };

const styles = StyleSheet.create({
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Space.sm,
    paddingHorizontal: Space.md,
    gap: Space.xs,
  },
  progressStep: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: Space.xs - 2,
  },
  progressDot: {
    width: Space.sm,
    height: Space.sm,
    borderRadius: Space.sm / 2,
    borderWidth: Stroke.standard,
  },
  progressLabel: {
    fontSize: TypographyV2.meta.size - 1,
    fontFamily: FontFamily.medium,
    lineHeight: TypographyV2.meta.lineHeight,
  },
  progressConnector: {
    height: Stroke.hairline,
    flex: 1,
    maxWidth: Space.xl,
    marginBottom: Space.sm + 2,
  },
});

