import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  StyleProp,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../../constants/colors';
import { Space, Radius, Typography } from '../../theme/designTokens';
import { AnimatedPressable } from '../AnimatedPressable';

interface PremiumActionBarProps {
  primaryLabel: string;
  onPrimaryPress: () => void;
  primaryLoading?: boolean;
  primaryDisabled?: boolean;
  secondaryLabel?: string;
  onSecondaryPress?: () => void;
  secondaryDisabled?: boolean;
  errorText?: string;
  style?: StyleProp<ViewStyle>;
}

export function PremiumActionBar({
  primaryLabel,
  onPrimaryPress,
  primaryLoading = false,
  primaryDisabled = false,
  secondaryLabel,
  onSecondaryPress,
  secondaryDisabled = false,
  errorText,
  style,
}: PremiumActionBarProps) {
  const isPrimaryDisabled = primaryDisabled || primaryLoading;

  return (
    <SafeAreaView style={[styles.container, style]} edges={['bottom']}>
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
        scaleValue={isPrimaryDisabled ? 1 : 0.985}
        hapticFeedback="medium"
        accessibilityRole="button"
        accessibilityLabel={primaryLabel}
        accessibilityState={{ disabled: isPrimaryDisabled }}
      >
        {primaryLoading ? (
          <ActivityIndicator size="small" color={Colors.background} />
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
          scaleValue={secondaryDisabled ? 1 : 0.985}
          hapticFeedback="light"
          accessibilityRole="button"
          accessibilityLabel={secondaryLabel}
        >
          <Text style={styles.secondaryText}>{secondaryLabel}</Text>
        </AnimatedPressable>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
    paddingHorizontal: Space.md,
    paddingTop: Space.md,
    paddingBottom: Space.sm,
    gap: Space.sm,
  },
  errorBanner: {
    backgroundColor: Colors.danger + '10',
    borderRadius: Radius.md,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    marginBottom: Space.sm,
  },
  errorBannerText: {
    fontSize: 13,
    fontFamily: Typography.family.semibold,
    color: Colors.danger,
    textAlign: 'center',
  },
  primaryBtn: {
    backgroundColor: Colors.brand,
    borderRadius: Radius.lg,
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnDisabled: {
    opacity: 0.4,
  },
  primaryText: {
    color: Colors.textInverse,
    fontSize: 16,
    fontFamily: Typography.family.bold,
  },
  secondaryBtn: {
    borderRadius: Radius.lg,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  secondaryBtnDisabled: {
    opacity: 0.35,
  },
  secondaryText: {
    color: Colors.textPrimary,
    fontSize: 15,
    fontFamily: Typography.family.semibold,
  },
});