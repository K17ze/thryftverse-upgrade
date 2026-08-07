import React from 'react';
import { StyleSheet, View, Text, ScrollView } from 'react-native';
import { FieldErrors } from 'react-hook-form';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Typography, Radius, Type } from '../../theme/designTokens';

export interface FormErrorSummaryProps {
  errors: FieldErrors<any>;
  title?: string;
}

export function FormErrorSummary({ errors, title = 'Please fix the following:' }: FormErrorSummaryProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  const errorMessages = Object.entries(errors)
    .filter(([, err]) => err?.message)
    .map(([field, err]) => ({ field, message: err!.message as string }));

  if (errorMessages.length === 0) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      {errorMessages.map(({ field, message }) => (
        <Text key={field} style={styles.errorItem}>
          {'\u2022'} {message}
        </Text>
      ))}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  container: {
    backgroundColor: `${colors.danger}10`,
    borderRadius: Radius.lg,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: `${colors.danger}30`,
  },
  title: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    color: colors.danger,
    marginBottom: 6,
  },
  errorItem: {
    fontSize: Type.captionElevated.size,
    fontFamily: Typography.family.regular,
    color: colors.danger,
    marginBottom: 2,
  },
  });
}
