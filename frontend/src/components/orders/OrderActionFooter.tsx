import React from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
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
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

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
              <ActivityIndicator size="small" color={colors.danger} />
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
              <ActivityIndicator size="small" color={colors.textInverse} />
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

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
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
    backgroundColor: colors.brand,
  },
  btnSecondary: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  btnDestructive: {
    borderColor: colors.danger,
  },
  btnDisabled: {
    opacity: 0.5,
  },
  btnText: {
    fontSize: 15,
    fontFamily: Typography.family.semibold,
  },
  btnTextPrimary: {
    color: colors.textInverse,
  },
  btnTextSecondary: {
    color: colors.textPrimary,
  },
  btnTextDestructive: {
    color: colors.danger,
  },
});
