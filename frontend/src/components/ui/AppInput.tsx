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
import { Radius, Stroke, Typography } from '../../theme/designTokens';
import { useAppTheme } from '../../theme/ThemeContext';

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
    ...rest
  },
  ref
) {
  const { colors } = useAppTheme();
  const [isFocused, setIsFocused] = useState(false);
  const hasError = Boolean(errorText);

  return (
    <View style={containerStyle}>
      {label ? <Text style={[styles.label, { color: colors.textSecondary }, labelStyle]}>{label}</Text> : null}
      <View
        style={[
          styles.inputWrap,
          { backgroundColor: colors.input, borderColor: colors.border },
          isFocused && !hasError && { backgroundColor: colors.background, borderColor: colors.brand, borderWidth: Stroke.emphasis },
          hasError && { backgroundColor: colors.background, borderColor: colors.danger },
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
    fontSize: 13,
    lineHeight: 18,
    fontFamily: Typography.family.semibold,
    letterSpacing: 0,
  },
  inputWrap: {
    borderRadius: Radius.xl,
    borderWidth: Stroke.standard,
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
    fontSize: 12,
    fontFamily: Typography.family.bold,
  },
  prefixNode: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    fontSize: 15,
    fontFamily: Typography.family.medium,
    paddingVertical: 10,
  },
  helperText: {
    marginTop: 7,
    fontSize: 11,
    lineHeight: 16,
    fontFamily: Typography.family.medium,
  },
  errorText: {
    marginTop: 7,
    fontSize: 11,
    lineHeight: 16,
    fontFamily: Typography.family.semibold,
  },
});
