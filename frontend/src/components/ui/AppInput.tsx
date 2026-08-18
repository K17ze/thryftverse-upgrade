import React, { forwardRef, useState } from 'react';
import {
  KeyboardTypeOptions,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { Radius, Stroke, Typography, Type } from '../../theme/designTokens';
import { useAppTheme } from '../../theme/ThemeContext';

export type AppInputAppearance = 'filled' | 'outline' | 'underline';

interface AppInputProps extends Omit<TextInputProps, 'style'> {
  label?: string;
  helperText?: string;
  errorText?: string;
  containerStyle?: StyleProp<ViewStyle>;
  inputContainerStyle?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
  labelStyle?: StyleProp<TextStyle>;
  helperStyle?: StyleProp<TextStyle>;
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
  keyboardType?: KeyboardTypeOptions;
  /**
   * Visual appearance of the input boundary.
   * - filled: subtle background fill (default). Settings/utility.
   * - outline: 1px border, transparent background. Auth/standalone.
   * - underline: bottom border only. Dense authoring.
   */
  appearance?: AppInputAppearance;
}

export const AppInput = forwardRef<TextInput, AppInputProps>(function AppInput(
  {
    label,
    helperText,
    errorText,
    containerStyle,
    inputContainerStyle,
    inputStyle,
    labelStyle,
    helperStyle,
    prefix,
    suffix,
    value,
    placeholder,
    placeholderTextColor,
    keyboardType,
    onChangeText,
    editable = true,
    onFocus,
    onBlur,
    appearance = 'filled',
    ...rest
  },
  ref
) {
  const { colors } = useAppTheme();
  const [isFocused, setIsFocused] = useState(false);
  const hasError = Boolean(errorText);

  // Resolve appearance-specific styling
  const appearanceStyle = (() => {
    switch (appearance) {
      case 'outline':
        return {
          backgroundColor: 'transparent',
          borderWidth: Stroke.standard,
          borderRadius: Radius.lg,
        };
      case 'underline':
        return {
          backgroundColor: 'transparent',
          borderWidth: 0,
          borderBottomWidth: isFocused ? Stroke.emphasis : Stroke.standard,
          borderRadius: 0,
          paddingHorizontal: 0,
        };
      case 'filled':
      default:
        return {
          backgroundColor: colors.input,
          borderWidth: isFocused ? Stroke.emphasis : Stroke.standard,
          borderRadius: Radius.lg,
        };
    }
  })();

  const appearanceBorderColor = hasError
    ? colors.danger
    : isFocused
      ? colors.brand
      : colors.border;

  return (
    <View style={containerStyle}>
      {label ? <Text style={[styles.label, { color: colors.textSecondary }, labelStyle]}>{label}</Text> : null}
      <View
        style={[
          styles.inputWrap,
          appearanceStyle,
          { borderColor: appearanceBorderColor },
          !editable && styles.inputWrapDisabled,
          inputContainerStyle,
        ]}
      >
        {typeof prefix === 'string' ? <Text style={styles.prefixText}>{prefix}</Text> : null}
        {prefix && typeof prefix !== 'string' ? <View style={styles.prefixNode}>{prefix}</View> : null}
        <TextInput
          ref={ref}
          {...rest}
          value={value}
          editable={editable}
          onChangeText={onChangeText}
          keyboardType={keyboardType}
          placeholder={placeholder}
          placeholderTextColor={placeholderTextColor ?? colors.textMuted}
          style={[styles.input, { color: colors.textPrimary }, inputStyle]}
          onFocus={(e) => { setIsFocused(true); onFocus?.(e); }}
          onBlur={(e) => { setIsFocused(false); onBlur?.(e); }}
        />
        {suffix}
      </View>
      {errorText ? <Text style={[styles.errorText, { color: colors.danger }, helperStyle]}>{errorText}</Text> : null}
      {!errorText && helperText ? <Text style={[styles.helperText, { color: colors.textMuted }, helperStyle]}>{helperText}</Text> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  label: {
    marginBottom: 6,
    fontSize: Type.captionElevated.size,
    lineHeight: 18,
    fontFamily: Typography.family.semibold,
    letterSpacing: 0,
  },
  inputWrap: {
    paddingHorizontal: 14,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  inputWrapDisabled: {
    opacity: 0.6,
  },
  prefixText: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.bold,
  },
  prefixNode: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.medium,
    paddingVertical: 10,
  },
  helperText: {
    marginTop: 7,
    fontSize: Type.meta.size,
    lineHeight: 16,
    fontFamily: Typography.family.medium,
  },
  errorText: {
    marginTop: 7,
    fontSize: Type.meta.size,
    lineHeight: 16,
    fontFamily: Typography.family.semibold,
  },
});
