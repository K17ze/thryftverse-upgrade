import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Typography, Space, Radius, Type } from '../../theme/designTokens';
import { useAppTheme } from '../../theme/ThemeContext';
import { AnimatedPressable } from '../AnimatedPressable';
import { PressPresets } from '../../hooks/usePremiumPressFeedback';

export interface ProductErrorStateProps {
  onRetry?: () => void;
  message?: string;
}

export function ProductErrorState({ onRetry, message }: ProductErrorStateProps) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.container}>
      <Ionicons name="alert-circle-outline" size={56} color={colors.textMuted} />
      <Text style={[styles.title, { color: colors.textPrimary }]}>Something went wrong</Text>
      <Text style={[styles.message, { color: colors.textMuted }]}>
        {message ?? 'We could not load this listing. Please try again.'}
      </Text>
      {onRetry && (
        <AnimatedPressable
          style={[styles.retryBtn, { backgroundColor: colors.brand }]}
          onPress={onRetry}
          {...PressPresets.primaryButton}
          accessibilityLabel="Retry loading listing"
          accessibilityRole="button"
        >
          <Text style={[styles.retryText, { color: colors.textInverse }]}>Retry</Text>
        </AnimatedPressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Space.xl,
    paddingVertical: Space.xxl,
    gap: Space.sm,
  },
  title: {
    fontSize: Type.subtitle.size,
    lineHeight: Type.subtitle.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.subtitle.letterSpacing,
    marginTop: Space.md,
  },
  message: {
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight + 2,
    fontFamily: Typography.family.regular,
    textAlign: 'center',
  },
  retryBtn: {
    marginTop: Space.md,
    paddingHorizontal: Space.lg,
    paddingVertical: Space.md,
    borderRadius: Radius.md,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryText: {
    fontSize: Type.bodyEmphasis.size,
    lineHeight: Type.bodyEmphasis.lineHeight,
    fontFamily: Typography.family.semibold,
  },
});
