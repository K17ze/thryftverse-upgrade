import React from 'react';
import { StyleSheet, View, Text, Pressable } from 'react-native';
import { Controller, Control, FieldError, RegisterOptions } from 'react-hook-form';
import { Colors } from '../../constants/colors';
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

const styles = StyleSheet.create({
  container: {
    marginBottom: 12,
  },
  label: {
    fontSize: 13,
    fontFamily: Typography.family.medium,
    color: Colors.textSecondary,
    marginBottom: 6,
  },
  errorText: {
    fontSize: 12,
    color: Colors.danger,
    marginTop: 4,
    fontFamily: Typography.family.regular,
  },
});
