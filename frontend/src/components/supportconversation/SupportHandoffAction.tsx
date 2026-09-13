import React, { useMemo } from 'react';
import {
  Text,
  StyleSheet,
  ActivityIndicator } from 'react-native';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Control, FontFamily } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { AnimatedPressable } from '../AnimatedPressable';

export interface SupportHandoffActionProps {
  isHandingOff: boolean;
  onPress: () => void;
}

// Header right action: "Talk to a person"
export function SupportHandoffAction({ isHandingOff, onPress }: SupportHandoffActionProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <AnimatedPressable
      onPress={onPress}
      style={styles.handoffBtn}
      hapticFeedback="light"
      accessibilityRole="button"
      accessibilityLabel="Talk to a person"
      accessibilityHint="Request to speak with a human support specialist"
      disabled={isHandingOff}
    >
      {isHandingOff ? (
        <ActivityIndicator size="small" color={colors.textSecondary} />
      ) : (
        <Text style={styles.handoffText}>Talk to a person</Text>
      )}
    </AnimatedPressable>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    handoffBtn: {
      minHeight: Control.hit,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: Space.xs },
    handoffText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: FontFamily.semibold,
      color: colors.textSecondary,
      letterSpacing: TypographyV2.meta.letterSpacing } });
}
