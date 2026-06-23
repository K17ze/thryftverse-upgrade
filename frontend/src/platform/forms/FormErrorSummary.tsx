import React from 'react';
import { StyleSheet, View, Text, ScrollView } from 'react-native';
import { FieldErrors } from 'react-hook-form';
import { Colors } from '../../constants/colors';
import { Typography } from '../../theme/designTokens';

export interface FormErrorSummaryProps {
  errors: FieldErrors<any>;
  title?: string;
}

export function FormErrorSummary({ errors, title = 'Please fix the following:' }: FormErrorSummaryProps) {
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

const styles = StyleSheet.create({
  container: {
    backgroundColor: `${Colors.danger}10`,
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: `${Colors.danger}30`,
  },
  title: {
    fontSize: 14,
    fontFamily: Typography.family.semibold,
    color: Colors.danger,
    marginBottom: 6,
  },
  errorItem: {
    fontSize: 13,
    fontFamily: Typography.family.regular,
    color: Colors.danger,
    marginBottom: 2,
  },
});
