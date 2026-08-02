import React from 'react';
import { StyleSheet, View, Text, Pressable } from 'react-native';
import { Controller, Control, FieldError, RegisterOptions } from 'react-hook-form';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Typography } from '../../theme/designTokens';
import { NativePicker, type NativePickerOption } from '../native/NativePicker';

export interface ControlledSelectProps {
  name: string;
  control: Control<any>;
  label?: string;
  error?: FieldError;
  rules?: RegisterOptions;
  options: NativePickerOption[];
  placeholder?: string;
}

export function ControlledSelect({
  name,
  control,
  label,
  error,
  rules,
  options,
}: ControlledSelectProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <Controller
        name={name}
        control={control}
        rules={rules}
        render={({ field: { onChange, value } }) => (
          <NativePicker
            selectedValue={value ?? ''}
            onValueChange={onChange}
            options={options}
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
    fontSize: 13,
    fontFamily: Typography.family.medium,
    color: colors.textSecondary,
    marginBottom: 6,
  },
  errorText: {
    fontSize: 12,
    color: colors.danger,
    marginTop: 4,
    fontFamily: Typography.family.regular,
  },
  });
}
