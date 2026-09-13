import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, FontFamily, Stroke, Control } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { RadiusRoleValue } from '../../theme/surfaceRadiusRules';
import { haptics } from '../../utils/haptics';

interface Props {
  message: string;
  /** Renders the inline retry button — shown when the stage is
   *  payment_failed so the user can resubmit without editing details. */
  showRetry: boolean;
  onRetry: () => void;
}

function CheckoutOrderErrorBase({ message, showRetry, onRetry }: Props) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.orderErrorContainer}>
      <Text style={styles.orderErrorText} accessibilityLiveRegion="polite" maxFontSizeMultiplier={2}>{message}</Text>
      {showRetry && (
        <Pressable
          style={({ pressed }) => [styles.retryBtn, pressed && { opacity: 0.7 }]}
          onPress={() => { haptics.tap(); onRetry(); }}
          accessibilityRole="button"
          accessibilityLabel="Retry payment"
        >
          <Text style={styles.retryBtnText} maxFontSizeMultiplier={2}>Retry payment</Text>
        </Pressable>
      )}
    </View>
  );
}

const CheckoutOrderError = React.memo(CheckoutOrderErrorBase);
CheckoutOrderError.displayName = 'CheckoutOrderError';
export { CheckoutOrderError };

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  orderErrorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.xs,
  },
  orderErrorText: {
    fontSize: TypographyV2.body.size,
    fontFamily: FontFamily.medium,
    paddingVertical: Space.sm,
    flex: 1,
    fontVariant: ['tabular-nums'],
    color: colors.danger,
  },
  retryBtn: {
    paddingHorizontal: Space.sm + 2,
    paddingVertical: Space.xs + 1,
    borderRadius: RadiusRoleValue.compactControl,
    borderWidth: Stroke.standard,
    minHeight: Control.chromeCompact,
    justifyContent: 'center',
    flexShrink: 0,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  retryBtnText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.semibold,
    color: colors.textPrimary,
  },
});
