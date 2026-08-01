import React, { useState, forwardRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TextInputProps,
  StyleSheet,
  KeyboardTypeOptions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius, Typography } from '../../theme/designTokens';

interface PremiumTextFieldProps extends Omit<TextInputProps, 'style'> {
  label?: string;
  helperText?: string;
  errorText?: string;
  leftIcon?: keyof typeof Ionicons.glyphMap;
  rightAction?: React.ReactNode;
  keyboardType?: KeyboardTypeOptions;
  multiline?: boolean;
  minHeight?: number;
  containerStyle?: import('react-native').ViewStyle;
}

export const PremiumTextField = forwardRef<TextInput, PremiumTextFieldProps>(
  function PremiumTextField(
    {
      label,
      helperText,
      errorText,
      leftIcon,
      rightAction,
      value,
      placeholder,
      placeholderTextColor,
      keyboardType,
      onChangeText,
      onFocus,
      onBlur,
      editable = true,
      multiline = false,
      minHeight,
      containerStyle,
      ...rest
    },
    ref
  ) {
    const { colors } = useAppTheme();
    const styles = React.useMemo(() => createStyles(colors), [colors]);
    const [isFocused, setIsFocused] = useState(false);
    const hasError = Boolean(errorText);
    const isFilled = Boolean(value && String(value).length > 0);

    const handleFocus = (e: any) => {
      setIsFocused(true);
      onFocus?.(e);
    };

    const handleBlur = (e: any) => {
      setIsFocused(false);
      onBlur?.(e);
    };

    const borderColor = hasError
      ? colors.danger
      : isFocused
      ? colors.brand
      : colors.border;

    return (
      <View style={[styles.container, containerStyle]}>
        {label ? (
          <Text
            style={[
              styles.label,
              hasError && styles.labelError,
              isFocused && !hasError && styles.labelFocused,
            ]}
          >
            {label}
          </Text>
        ) : null}

        <View
          style={[
            styles.inputRow,
            {
              borderColor,
              minHeight: minHeight ?? (multiline ? 120 : 52),
            },
            !editable && styles.inputRowDisabled,
          ]}
        >
          {leftIcon ? (
            <Ionicons
              name={leftIcon}
              size={18}
              color={hasError ? colors.danger : isFocused ? colors.brand : colors.textMuted}
              style={styles.leftIcon}
            />
          ) : null}

          <TextInput
            ref={ref}
            {...rest}
            value={value}
            editable={editable}
            onChangeText={onChangeText}
            keyboardType={keyboardType}
            placeholder={placeholder}
            placeholderTextColor={placeholderTextColor ?? colors.textMuted}
            multiline={multiline}
            onFocus={handleFocus}
            onBlur={handleBlur}
            style={[
              styles.input,
              multiline && styles.inputMultiline,
            ]}
          />

          {rightAction ? (
            <View style={styles.rightAction}>{rightAction}</View>
          ) : null}
        </View>

        {hasError ? (
          <Text style={styles.errorText}>{errorText}</Text>
        ) : helperText ? (
          <Text style={styles.helperText}>{helperText}</Text>
        ) : null}
      </View>
    );
  }
);

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    marginBottom: Space.md,
  },
  label: {
    fontSize: 13,
    fontFamily: Typography.family.semibold,
    color: colors.textSecondary,
    marginBottom: Space.sm,
    letterSpacing: 0.2,
  },
  labelFocused: {
    color: colors.brand,
  },
  labelError: {
    color: colors.danger,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.lg,
    borderWidth: 1,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: Space.md,
    gap: Space.sm,
  },
  inputRowDisabled: {
    opacity: 0.55,
  },
  leftIcon: {
    marginRight: 2,
  },
  input: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 15,
    fontFamily: Typography.family.medium,
    paddingVertical: 14,
    textAlignVertical: 'center',
  },
  inputMultiline: {
    textAlignVertical: 'top',
    paddingTop: 14,
    paddingBottom: 14,
  },
  rightAction: {
    marginLeft: 2,
  },
  helperText: {
    marginTop: Space.sm,
    fontSize: 12,
    fontFamily: Typography.family.medium,
    color: colors.textMuted,
    lineHeight: 17,
  },
  errorText: {
    marginTop: Space.sm,
    fontSize: 12,
    fontFamily: Typography.family.semibold,
    color: colors.danger,
    lineHeight: 17,
  },
});
