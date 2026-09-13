import React from 'react';
import { ActivityIndicator, Pressable, Text } from 'react-native';
import type { ThemeColors } from '../../theme/ThemeContext';
import type { AgentStudioStyles } from './agentStudioStyles';

export function PrimaryButton({
  label,
  onPress,
  loading,
  disabled,
  colors,
  styles }: {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  colors: ThemeColors;
  styles: AgentStudioStyles;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.primaryBtn,
        { backgroundColor: disabled ? colors.surfaceAlt : colors.brand, opacity: pressed ? 0.85 : 1 },
      ]}
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
    >
      {loading ? (
        <ActivityIndicator size="small" color={colors.textInverse} />
      ) : (
        <Text
          style={[
            styles.primaryBtnText,
            { color: disabled ? colors.textMuted : colors.textInverse },
          ]}
          numberOfLines={1}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

export function SecondaryButton({
  label,
  onPress,
  danger,
  disabled,
  colors,
  styles }: {
  label: string;
  onPress: () => void;
  danger?: boolean;
  disabled?: boolean;
  colors: ThemeColors;
  styles: AgentStudioStyles;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.secondaryBtn,
        {
          borderColor: danger ? colors.danger : colors.border,
          opacity: disabled ? 0.5 : pressed ? 0.7 : 1 },
      ]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
    >
      <Text
        style={[styles.secondaryBtnText, { color: danger ? colors.danger : colors.textPrimary }]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}
