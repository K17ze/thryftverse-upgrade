import React from 'react';
import { TextInput, TextInputProps, StyleSheet, View, Text } from 'react-native';
import { Controller, Control, FieldError, RegisterOptions } from 'react-hook-form';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Typography, Radius, Type, Space, Stroke} from '../../theme/designTokens';

export interface ControlledAppInputProps {
  name: string;
  control: Control<any>;
  label?: string;
  error?: FieldError;
  rules?: RegisterOptions;
  inputProps?: Omit<TextInputProps, 'value' | 'onChangeText'>;
}

export function ControlledAppInput({
  name,
  control,
  label,
  error,
  rules,
  inputProps,
}: ControlledAppInputProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <Controller
        name={name}
        control={control}
        rules={rules}
        render={({ field: { onChange, onBlur, value } }) => (
          <TextInput
            style={[styles.input, error && styles.inputError]}
            onChangeText={onChange}
            onBlur={onBlur}
            value={value ?? ''}
            placeholderTextColor={colors.textMuted}
            {...inputProps}
          />
        )}
      />
      {error?.message ? <Text style={styles.errorText}>{error.message}</Text> : null}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  container: {
    marginBottom: 12,
  },
  label: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.medium,
    color: colors.textSecondary,
    marginBottom: 6,
  },
  input: {
    borderWidth: Stroke.standard,
    borderColor: colors.border,
    borderRadius: Radius.lg,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: Type.bodyStrong.size,
    color: colors.textPrimary,
    fontFamily: Typography.family.regular,
  },
  inputError: {
    borderColor: colors.danger,
  },
  errorText: {
    fontSize: Type.caption.size,
    color: colors.danger,
    marginTop: Space.xs,
    fontFamily: Typography.family.regular,
  },
  });
}
