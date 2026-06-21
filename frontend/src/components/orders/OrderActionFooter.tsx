import React from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { Colors } from '../../constants/colors';
import { Space, Typography } from '../../theme/designTokens';

export interface OrderActionConfig {
  label: string;
  onPress: () => void;
  variant: 'primary' | 'secondary' | 'destructive';
  loading?: boolean;
  disabled?: boolean;
  accessibilityLabel: string;
}

interface Props {
  primaryAction?: OrderActionConfig;
  secondaryAction?: OrderActionConfig;
  bottomInset?: number;
}

export function OrderActionFooter({
  primaryAction,
  secondaryAction,
  bottomInset,
}: Props) {
  if (!primaryAction && !secondaryAction) {
    return null;
  }

  return (
    <View
      style={[
        styles.footer,
        { paddingBottom: bottomInset && bottomInset > 0 ? bottomInset : Space.md },
      ]}
    >
      <View style={styles.row}>
        {secondaryAction ? (
          <Pressable
            style={[
              styles.btn,
              styles.btnSecondary,
              secondaryAction.variant === 'destructive' && styles.btnDestructive,
              (secondaryAction.disabled || secondaryAction.loading) && styles.btnDisabled,
            ]}
            onPress={secondaryAction.onPress}
            disabled={secondaryAction.disabled || secondaryAction.loading}
            accessibilityRole="button"
            accessibilityLabel={secondaryAction.accessibilityLabel}
            accessibilityState={{
              disabled: secondaryAction.disabled || secondaryAction.loading,
              busy: secondaryAction.loading,
            }}
          >
            {secondaryAction.loading ? (
              <ActivityIndicator size="small" color={Colors.danger} />
            ) : null}
            <Text
              style={[
                styles.btnText,
                styles.btnTextSecondary,
                secondaryAction.variant === 'destructive' && styles.btnTextDestructive,
              ]}
            >
              {secondaryAction.label}
            </Text>
          </Pressable>
        ) : null}
        {primaryAction ? (
          <Pressable
            style={[
              styles.btn,
              styles.btnPrimary,
              (primaryAction.disabled || primaryAction.loading) && styles.btnDisabled,
            ]}
            onPress={primaryAction.onPress}
            disabled={primaryAction.disabled || primaryAction.loading}
            accessibilityRole="button"
            accessibilityLabel={primaryAction.accessibilityLabel}
            accessibilityState={{
              disabled: primaryAction.disabled || primaryAction.loading,
              busy: primaryAction.loading,
            }}
          >
            {primaryAction.loading ? (
              <ActivityIndicator size="small" color={Colors.textInverse} />
            ) : null}
            <Text style={[styles.btnText, styles.btnTextPrimary]}>
              {primaryAction.label}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
    backgroundColor: Colors.background,
    paddingHorizontal: Space.md,
    paddingTop: Space.md,
  },
  row: {
    flexDirection: 'row',
    gap: Space.sm,
  },
  btn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.sm,
    minHeight: 48,
    borderRadius: 10,
    paddingHorizontal: Space.md,
  },
  btnPrimary: {
    backgroundColor: Colors.brand,
  },
  btnSecondary: {
    backgroundColor: Colors.surfaceAlt,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  btnDestructive: {
    borderColor: Colors.danger,
  },
  btnDisabled: {
    opacity: 0.5,
  },
  btnText: {
    fontSize: 15,
    fontFamily: Typography.family.semibold,
  },
  btnTextPrimary: {
    color: Colors.textInverse,
  },
  btnTextSecondary: {
    color: Colors.textPrimary,
  },
  btnTextDestructive: {
    color: Colors.danger,
  },
});
