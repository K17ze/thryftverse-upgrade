import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius, Typography, Type } from '../../theme/designTokens';
import { AnimatedPressable } from '../AnimatedPressable';

interface PremiumActionFooterProps {
  primaryLabel: string;
  onPrimaryPress: () => void;
  primaryLoading?: boolean;
  primaryDisabled?: boolean;
  secondaryLabel?: string;
  onSecondaryPress?: () => void;
  secondaryDisabled?: boolean;
  errorText?: string;
}

export function PremiumActionFooter({
  primaryLabel,
  onPrimaryPress,
  primaryLoading = false,
  primaryDisabled = false,
  secondaryLabel,
  onSecondaryPress,
  secondaryDisabled = false,
  errorText,
}: PremiumActionFooterProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const isPrimaryDisabled = primaryDisabled || primaryLoading;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {errorText ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>{errorText}</Text>
        </View>
      ) : null}

      <AnimatedPressable
        style={[
          styles.primaryBtn,
          isPrimaryDisabled && styles.primaryBtnDisabled,
        ]}
        onPress={isPrimaryDisabled ? undefined : onPrimaryPress}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={primaryLabel}
        accessibilityState={{ disabled: isPrimaryDisabled }}
      >
        {primaryLoading ? (
          <ActivityIndicator size="small" color={colors.background} />
        ) : (
          <Text style={styles.primaryText}>{primaryLabel}</Text>
        )}
      </AnimatedPressable>

      {secondaryLabel ? (
        <AnimatedPressable
          style={[
            styles.secondaryBtn,
            secondaryDisabled && styles.secondaryBtnDisabled,
          ]}
          onPress={secondaryDisabled ? undefined : onSecondaryPress}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={secondaryLabel}
        >
          <Text style={styles.secondaryText}>{secondaryLabel}</Text>
        </AnimatedPressable>
      ) : null}
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: Space.md,
    paddingTop: Space.md,
    paddingBottom: Space.sm,
    gap: Space.sm,
  },
  errorBanner: {
    backgroundColor: colors.danger + '12',
    borderRadius: Radius.md,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    marginBottom: Space.sm,
  },
  errorBannerText: {
    fontSize: Type.captionElevated.size,
    fontFamily: Typography.family.semibold,
    color: colors.danger,
    textAlign: 'center',
  },
  primaryBtn: {
    backgroundColor: colors.textPrimary,
    borderRadius: Radius.lg,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnDisabled: {
    opacity: 0.45,
  },
  primaryText: {
    color: colors.background,
    fontSize: Type.bodyLarge.size,
    fontFamily: Typography.family.bold,
  },
  secondaryBtn: {
    borderRadius: Radius.lg,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnDisabled: {
    opacity: 0.4,
  },
  secondaryText: {
    color: colors.textSecondary,
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.semibold,
  },
});
