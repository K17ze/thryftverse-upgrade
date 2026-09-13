import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, FontFamily, Stroke, Control } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { RadiusRoleValue } from '../../theme/surfaceRadiusRules';

interface Props {
  message: string;
  onRetry: () => void;
}

function CheckoutCapabilityErrorBase({ message, onRetry }: Props) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.capabilityErrorRow}>
      <Text style={styles.hintText} maxFontSizeMultiplier={2}>
        {message}
      </Text>
      <Pressable
        style={styles.capabilityRetryBtn}
        onPress={onRetry}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel="Try again"
        accessibilityHint="Retry loading checkout details"
      >
        <Text style={styles.capabilityRetryText} maxFontSizeMultiplier={2}>Try again</Text>
      </Pressable>
    </View>
  );
}

const CheckoutCapabilityError = React.memo(CheckoutCapabilityErrorBase);
CheckoutCapabilityError.displayName = 'CheckoutCapabilityError';
export { CheckoutCapabilityError };

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  capabilityErrorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.xs,
  },
  hintText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.regular,
    paddingVertical: Space.xs,
    flex: 1,
    color: colors.textMuted,
  },
  capabilityRetryBtn: {
    paddingHorizontal: Space.sm + 2,
    paddingVertical: Space.xs + 1,
    borderRadius: RadiusRoleValue.compactControl,
    borderWidth: Stroke.standard,
    minHeight: Control.chromeCompact,
    justifyContent: 'center',
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  capabilityRetryText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.semibold,
    color: colors.textPrimary,
  },
});
