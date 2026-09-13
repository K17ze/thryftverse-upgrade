import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { createVerificationScreenStyles } from './verificationScreenStyles';

export interface VerificationFlowCardProps {
  /** Step title rendered in the card header. */
  title: string;
  /** Close-button press — returns to the status surface. */
  onClose: () => void;
  closeAccessibilityLabel: string;
  closeAccessibilityHint: string;
  children: React.ReactNode;
}

/**
 * Shared card shell for the KYC and DAC7 in-screen flows: a titled header
 * with a close control above a padded body.
 */
export function VerificationFlowCard({
  title,
  onClose,
  closeAccessibilityLabel,
  closeAccessibilityHint,
  children }: VerificationFlowCardProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createVerificationScreenStyles(colors), [colors]);
  return (
    <View style={styles.flowCard}>
      <View style={styles.flowHeader}>
        <Text style={[styles.flowTitle, { color: colors.textPrimary }]}>
          {title}
        </Text>
        <Pressable
          onPress={onClose}
          accessibilityLabel={closeAccessibilityLabel}
          accessibilityHint={closeAccessibilityHint}
          accessibilityRole="button"
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
        >
          <Ionicons name="close-outline" size={22} color={colors.textMuted} />
        </Pressable>
      </View>
      <View style={styles.flowBody}>{children}</View>
    </View>
  );
}
