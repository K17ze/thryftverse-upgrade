import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Space, Radius } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
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
      <Ionicons name="alert-circle-outline" size={56} color={colors.danger} />
      <Text style={[styles.title, { color: colors.textPrimary }]}>Something went wrong</Text>
      <Text style={[styles.message, { color: colors.textMuted }]}>
        {message ?? 'We could not load this listing. Try again.'}
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
    gap: Space.sm },
  title: {
    fontSize: TypographyV2.sectionTitle.size,
    lineHeight: TypographyV2.sectionTitle.lineHeight,
    fontFamily: TypographyV2.sectionTitle.fontFamily,
    letterSpacing: TypographyV2.sectionTitle.letterSpacing,
    marginTop: Space.md },
  message: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight + 2,
    fontFamily: TypographyV2.body.fontFamily,
    textAlign: 'center' },
  retryBtn: {
    marginTop: Space.md,
    paddingHorizontal: Space.lg,
    paddingVertical: Space.md,
    borderRadius: Radius.md,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center' },
  retryText: {
    fontSize: TypographyV2.bodyStrong.size,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
    fontFamily: TypographyV2.bodyStrong.fontFamily } });
