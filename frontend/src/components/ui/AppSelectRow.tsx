import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius, Stroke } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { AnimatedPressable } from '../AnimatedPressable';

interface AppSelectRowProps {
  label: string;
  value?: string;
  placeholder?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  helperText?: string;
  errorText?: string;
  disabled?: boolean;
  onPress?: () => void;
  style?: import('react-native').ViewStyle;
}

export function AppSelectRow({
  label,
  value,
  placeholder = 'Select',
  icon,
  helperText,
  errorText,
  disabled = false,
  onPress }: AppSelectRowProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const hasError = Boolean(errorText);
  const isEmpty = !value || value.length === 0;

  const borderColor = hasError
    ? colors.danger
    : colors.border;

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
            color={hasError ? colors.danger : colors.textMuted}
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
          color={disabled ? colors.border : colors.textMuted}
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

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    marginBottom: Space.md },
  label: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textSecondary,
    marginBottom: Space.sm,
    letterSpacing: 0.2 },
  labelError: {
    color: colors.danger },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.lg,
    borderWidth: Stroke.standard,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: Space.md,
    minHeight: 52,
    gap: Space.sm },
  rowDisabled: {
    opacity: 0.5 },
  icon: {
    marginRight: 2 },
  valueText: {
    flex: 1,
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    color: colors.textPrimary },
  placeholderText: {
    color: colors.textMuted },
  helperText: {
    marginTop: Space.sm,
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textMuted,
    lineHeight: 17 },
  errorText: {
    marginTop: Space.sm,
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.danger,
    lineHeight: 17 } });
