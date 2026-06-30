import React from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { Controller, Control, FieldError, RegisterOptions } from 'react-hook-form';
import { Switch } from '@expo/ui';
import { Colors } from '../../constants/colors';
import { Typography } from '../../theme/designTokens';

export interface ControlledToggleProps {
  name: string;
  control: Control<any>;
  label?: string;
  error?: FieldError;
  rules?: RegisterOptions;
}

export function ControlledToggle({
  name,
  control,
  label,
  rules,
}: ControlledToggleProps) {
  return (
    <Controller
      name={name}
      control={control}
      rules={rules}
      render={({ field: { onChange, value } }) => (
        <View style={styles.container}>
          {label ? <Text style={styles.label}>{label}</Text> : null}
          <Switch value={value ?? false} onValueChange={onChange} />
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  label: {
    fontSize: 15,
    fontFamily: Typography.family.medium,
    color: Colors.textPrimary,
    flex: 1,
  },
});
