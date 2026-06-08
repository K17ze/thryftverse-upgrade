import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { Space, Radius, Typography } from '../../theme/designTokens';
import { AnimatedPressable } from '../AnimatedPressable';

interface PremiumSelectRowProps {
  label: string;
  value?: string;
  placeholder?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  helperText?: string;
  errorText?: string;
  disabled?: boolean;
  onPress?: () => void;
}

export function PremiumSelectRow({
  label,
  value,
  placeholder = 'Select',
  icon,
  helperText,
  errorText,
  disabled = false,
  onPress,
}: PremiumSelectRowProps) {
  const hasError = Boolean(errorText);
  const isEmpty = !value || value.length === 0;

  const borderColor = hasError
    ? Colors.danger
    : Colors.border;

  return (
    <View style={styles.container}>
      <Text style={[styles.label, hasError && styles.labelError]}>
        {label}
      </Text>

      <AnimatedPressable
        style={[
          styles.row,
          { borderColor },
          disabled && styles.rowDisabled,
        ]}
        onPress={disabled ? undefined : onPress}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${isEmpty ? placeholder : value}`}
      >
        {icon ? (
          <Ionicons
            name={icon}
            size={18}
            color={hasError ? Colors.danger : Colors.textMuted}
            style={styles.icon}
          />
        ) : null}

        <Text
          style={[
            styles.valueText,
            isEmpty && styles.placeholderText,
          ]}
          numberOfLines={1}
        >
          {isEmpty ? placeholder : value}
        </Text>

        <Ionicons
          name="chevron-forward"
          size={16}
          color={disabled ? Colors.border : Colors.textMuted}
        />
      </AnimatedPressable>

      {hasError ? (
        <Text style={styles.errorText}>{errorText}</Text>
      ) : helperText ? (
        <Text style={styles.helperText}>{helperText}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: Space.md,
  },
  label: {
    fontSize: 13,
    fontFamily: Typography.family.semibold,
    color: Colors.textSecondary,
    marginBottom: Space.sm,
    letterSpacing: 0.2,
  },
  labelError: {
    color: Colors.danger,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.lg,
    borderWidth: 1,
    backgroundColor: Colors.surfaceAlt,
    paddingHorizontal: Space.md,
    minHeight: 52,
    gap: Space.sm,
  },
  rowDisabled: {
    opacity: 0.5,
  },
  icon: {
    marginRight: 2,
  },
  valueText: {
    flex: 1,
    fontSize: 15,
    fontFamily: Typography.family.medium,
    color: Colors.textPrimary,
  },
  placeholderText: {
    color: Colors.textMuted,
  },
  helperText: {
    marginTop: Space.sm,
    fontSize: 12,
    fontFamily: Typography.family.medium,
    color: Colors.textMuted,
    lineHeight: 17,
  },
  errorText: {
    marginTop: Space.sm,
    fontSize: 12,
    fontFamily: Typography.family.semibold,
    color: Colors.danger,
    lineHeight: 17,
  },
});
