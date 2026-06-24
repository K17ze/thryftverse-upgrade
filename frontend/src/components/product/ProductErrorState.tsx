import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { Typography, Space, Radius } from '../../theme/designTokens';
import { AnimatedPressable } from '../AnimatedPressable';
import { PressPresets } from '../../hooks/usePremiumPressFeedback';

export interface ProductErrorStateProps {
  onRetry?: () => void;
  message?: string;
}

export function ProductErrorState({ onRetry, message }: ProductErrorStateProps) {
  return (
    <View style={styles.container}>
      <Ionicons name="alert-circle-outline" size={56} color={Colors.textMuted} />
      <Text style={styles.title}>Something went wrong</Text>
      <Text style={styles.message}>
        {message ?? 'We could not load this listing. Please try again.'}
      </Text>
      {onRetry && (
        <AnimatedPressable
          style={styles.retryBtn}
          onPress={onRetry}
          {...PressPresets.primaryButton}
          accessibilityLabel="Retry loading listing"
          accessibilityRole="button"
        >
          <Text style={styles.retryText}>Retry</Text>
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
    fontSize: 18,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
    marginTop: Space.md,
  },
  message: {
    fontSize: 14,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
  retryBtn: {
    marginTop: Space.md,
    paddingHorizontal: Space.lg,
    paddingVertical: 12,
    backgroundColor: Colors.brand,
    borderRadius: Radius.md,
  },
  retryText: {
    fontSize: 15,
    fontFamily: Typography.family.semibold,
    color: Colors.textInverse,
  },
});
