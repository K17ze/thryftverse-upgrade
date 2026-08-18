import React from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { Controller, Control, FieldError, RegisterOptions } from 'react-hook-form';
import { Switch } from '@expo/ui';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Typography, Type } from '../../theme/designTokens';

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
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

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

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  label: {
    fontSize: Type.bodyStrong.size,
    fontFamily: Typography.family.medium,
    color: colors.textPrimary,
    flex: 1,
  },
  });
}
