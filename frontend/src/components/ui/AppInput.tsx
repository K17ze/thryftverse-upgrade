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
import { Colors } from '../../constants/colors';
import { Typography } from '../../theme/designTokens';

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
  const [isFocused, setIsFocused] = useState(false);
  const hasError = Boolean(errorText);

  return (
    <View style={containerStyle}>
      {label ? <Text style={[styles.label, labelStyle]}>{label}</Text> : null}
      <View
        style={[
          styles.inputWrap,
          isFocused && !hasError && styles.inputWrapFocused,
          hasError && styles.inputWrapError,
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
          placeholderTextColor={placeholderTextColor ?? Colors.textMuted}
          style={[styles.input, inputStyle]}
          onFocus={(e) => { setIsFocused(true); onFocus?.(e); }}
          onBlur={(e) => { setIsFocused(false); onBlur?.(e); }}
        />
        {suffix}
      </View>
      {errorText ? <Text style={[styles.errorText, helperStyle]}>{errorText}</Text> : null}
      {!errorText && helperText ? <Text style={[styles.helperText, helperStyle]}>{helperText}</Text> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  label: {
    marginBottom: 6,
    color: Colors.textSecondary,
    fontSize: 12,
    fontFamily: Typography.family.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  inputWrap: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceAlt,
    paddingHorizontal: 14,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  inputWrapFocused: {
    borderColor: Colors.textSecondary,
    backgroundColor: Colors.surface,
  },
  inputWrapError: {
    borderColor: Colors.danger,
    backgroundColor: Colors.background,
  },
  inputWrapDisabled: {
    opacity: 0.6,
  },
  prefixText: {
    color: Colors.textMuted,
    fontSize: 12,
    fontFamily: Typography.family.bold,
  },
  prefixNode: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: 15,
    fontFamily: Typography.family.medium,
    paddingVertical: 10,
  },
  helperText: {
    marginTop: 7,
    color: Colors.textMuted,
    fontSize: 11,
    lineHeight: 16,
    fontFamily: Typography.family.medium,
  },
  errorText: {
    marginTop: 7,
    color: Colors.danger,
    fontSize: 11,
    lineHeight: 16,
    fontFamily: Typography.family.semibold,
  },
});
