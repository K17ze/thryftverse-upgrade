import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { Space, Typography } from '../../theme/designTokens';

interface Props {
  label: string;
  title: string;
  subtitle?: string;
  actionLabel: string;
  onPress: () => void;
  errorText?: string;
  warningText?: string;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  rightElement?: React.ReactNode;
  testID?: string;
}

export function CheckoutSelectionRow({
  label,
  title,
  subtitle,
  actionLabel,
  onPress,
  errorText,
  warningText,
  accessibilityLabel,
  accessibilityHint,
  rightElement,
  testID,
}: Props) {
  return (
    <View style={styles.wrapper}>
      <Pressable
        onPress={onPress}
        style={styles.row}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? `${label}: ${title}`}
        accessibilityHint={accessibilityHint}
        testID={testID}
      >
        <View style={styles.left}>
          <Text style={styles.label}>{label}</Text>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          {warningText ? (
            <Text style={styles.warningText}>{warningText}</Text>
          ) : null}
          {errorText ? (
            <Text style={styles.errorText}>{errorText}</Text>
          ) : null}
        </View>
        <View style={styles.right}>
          {rightElement}
          <Text style={styles.actionLabel}>{actionLabel}</Text>
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: Space.md,
    minHeight: 56,
  },
  left: {
    flex: 1,
    gap: 2,
  },
  label: {
    fontSize: 11,
    fontFamily: Typography.family.semibold,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  title: {
    fontSize: 16,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: Typography.family.regular,
    color: Colors.textSecondary,
    lineHeight: 19,
  },
  warningText: {
    fontSize: 13,
    fontFamily: Typography.family.medium,
    color: '#B8860B',
    marginTop: 2,
  },
  errorText: {
    fontSize: 13,
    fontFamily: Typography.family.medium,
    color: Colors.danger,
    marginTop: 2,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  actionLabel: {
    fontSize: 15,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
  },
});
