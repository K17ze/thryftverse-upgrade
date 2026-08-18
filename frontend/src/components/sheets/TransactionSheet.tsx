import React from 'react';
import { View, StyleSheet, Pressable, Text } from 'react-native';
import { BottomSheet } from '../BottomSheet';
import { useAppTheme } from '../../theme/ThemeContext';
import { FontFamily, Space, Type } from '../../theme/designTokens';

/**
 * TransactionSheet — clear total/consequence, restrained material.
 *
 * Standard radius (16px), no blur. A pinned footer renders a primary
 * confirmation action and an optional secondary/cancel action with a
 * built-in primary/destructive hierarchy so the user always understands the
 * consequence before committing. Used for payment confirmation, offer
 * submission, and bid confirmation.
 */
export interface TransactionSheetProps {
  visible: boolean;
  onDismiss: () => void;
  children: React.ReactNode;
  /** Primary confirmation action (e.g. "Confirm payment"). */
  confirmAction: {
    label: string;
    onPress: () => void;
    /** When true, renders the confirm action in the danger color. */
    destructive?: boolean;
    /** When true, disables the confirm action (truthful disabled state). */
    disabled?: boolean;
  };
  /** Optional secondary action (e.g. "Cancel"). */
  secondaryAction?: {
    label: string;
    onPress: () => void;
  };
  /** Fraction of screen height. Defaults to 0.6. */
  snapPoint?: number;
}

export function TransactionSheet({
  visible,
  onDismiss,
  children,
  confirmAction,
  secondaryAction,
  snapPoint = 0.6,
}: TransactionSheetProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const confirmColor = confirmAction.destructive ? colors.danger : colors.brand;
  const confirmTextColor = confirmAction.destructive ? colors.textInverse : colors.textInverse;

  return (
    <BottomSheet
      visible={visible}
      onDismiss={onDismiss}
      snapPoint={snapPoint}
      variant="transaction"
    >
      {children}

      {/* Pinned action footer — clear consequence before commit. */}
      <View style={styles.footer}>
        {secondaryAction && (
          <Pressable
            style={[styles.secondaryButton, secondaryAction ? styles.secondaryButtonFlex : null]}
            onPress={secondaryAction.onPress}
            accessibilityRole="button"
            accessibilityLabel={secondaryAction.label}
          >
            <Text style={styles.secondaryText}>{secondaryAction.label}</Text>
          </Pressable>
        )}

        <Pressable
          style={[
            styles.primaryButton,
            secondaryAction ? styles.primaryButtonFlex : null,
            { backgroundColor: confirmColor },
            confirmAction.disabled ? styles.primaryButtonDisabled : null,
          ]}
          onPress={confirmAction.disabled ? undefined : confirmAction.onPress}
          disabled={confirmAction.disabled}
          accessibilityRole="button"
          accessibilityLabel={confirmAction.label}
          accessibilityState={{ disabled: !!confirmAction.disabled }}
        >
          <Text style={[styles.primaryText, { color: confirmTextColor }]}>
            {confirmAction.label}
          </Text>
        </Pressable>
      </View>
    </BottomSheet>
  );
}

const createStyles = (colors: ReturnType<typeof useAppTheme>['colors']) =>
  StyleSheet.create({
    footer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      paddingTop: Space.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.borderSubtle,
    },
    primaryButton: {
      flex: 1,
      height: 52,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryButtonFlex: {
      flex: 1,
    },
    primaryButtonDisabled: {
      opacity: 0.4,
    },
    primaryText: {
      fontFamily: FontFamily.semibold,
      fontSize: Type.bodyEmphasis.size,
      letterSpacing: Type.bodyEmphasis.letterSpacing,
    },
    secondaryButton: {
      height: 52,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    secondaryButtonFlex: {
      flex: 1,
    },
    secondaryText: {
      fontFamily: FontFamily.regular,
      fontSize: Type.body.size,
      color: colors.textSecondary,
    },
  });
