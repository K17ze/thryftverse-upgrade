import React, { forwardRef } from 'react';
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
    ...rest
  },
  ref
) {
  const hasError = Boolean(errorText);

  return (
    <View style={containerStyle}>
      {label ? <Text style={[styles.label, labelStyle]}>{label}</Text> : null}
      <View
        style={[
          styles.inputWrap,
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
    fontFamily: 'Inter_700Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  inputWrap: {
    borderRadius: 10,
    borderWidth: 0.5,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceAlt,
    paddingHorizontal: 12,
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
    fontFamily: 'Inter_700Bold',
  },
  prefixNode: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
    paddingVertical: 10,
  },
  helperText: {
    marginTop: 7,
    color: Colors.textMuted,
    fontSize: 11,
    lineHeight: 16,
    fontFamily: 'Inter_500Medium',
  },
  errorText: {
    marginTop: 7,
    color: Colors.danger,
    fontSize: 11,
    lineHeight: 16,
    fontFamily: 'Inter_600SemiBold',
  },
});
