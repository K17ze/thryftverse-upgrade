import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../../constants/colors';
import { Typography, Space, Radius } from '../../theme/designTokens';

export interface ProductPolicySheetProps {
  title: string;
  body: string;
}

export function ProductPolicySheet({ title, body }: ProductPolicySheetProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: Space.md,
  },
  title: {
    fontSize: 18,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
    marginBottom: Space.sm,
  },
  body: {
    fontSize: 14,
    fontFamily: Typography.family.regular,
    color: Colors.textSecondary,
    lineHeight: 22,
  },
});
