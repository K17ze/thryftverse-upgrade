import React from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { AnimatedPressable } from '../AnimatedPressable';
import { createVerificationScreenStyles } from './verificationScreenStyles';

export interface VerificationFlowNavProps {
  onBack: () => void;
  backLabel: string;
  backAccessibilityLabel: string;
  onPrimary: () => void;
  primaryLabel: string;
  primaryAccessibilityLabel: string;
  /** When true the primary button shows a spinner and is disabled. */
  primaryLoading?: boolean;
}

/**
 * Shared footer row for the verification flow steps: a secondary back/cancel
 * button beside a primary action (optionally loading).
 */
export function VerificationFlowNav({
  onBack,
  backLabel,
  backAccessibilityLabel,
  onPrimary,
  primaryLabel,
  primaryAccessibilityLabel,
  primaryLoading = false }: VerificationFlowNavProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createVerificationScreenStyles(colors), [colors]);
  return (
    <View style={styles.flowNavRow}>
      <AnimatedPressable
        style={styles.flowBackBtn}
        onPress={onBack}
        hapticFeedback="light"
        accessibilityRole="button"
        accessibilityLabel={backAccessibilityLabel}
      >
        <Text style={styles.flowBackBtnText}>{backLabel}</Text>
      </AnimatedPressable>
      <AnimatedPressable
        style={[styles.flowPrimaryBtn, primaryLoading && styles.flowPrimaryBtnDisabled]}
        onPress={onPrimary}
        disabled={primaryLoading}
        hapticFeedback="medium"
        accessibilityRole="button"
        accessibilityLabel={primaryAccessibilityLabel}
      >
        {primaryLoading ? (
          <ActivityIndicator size="small" color={colors.textInverse} />
        ) : (
          <Text style={styles.flowPrimaryBtnText}>{primaryLabel}</Text>
        )}
      </AnimatedPressable>
    </View>
  );
}
