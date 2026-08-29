import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { BottomSheet } from './BottomSheet';
import { AppButton } from './ui/AppButton';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { Space, Radius } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';

export type ConfirmationSheetVariant = 'default' | 'danger';

interface ConfirmationSheetProps {
  visible: boolean;
  onDismiss: () => void;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel?: () => void;
  variant?: ConfirmationSheetVariant;
}

/**
 * ConfirmationSheet — a semantic wrapper around BottomSheet that renders a
 * standard confirm/cancel layout. Used to replace native Alert.alert dialogs
 * with the app's bottom-sheet material language.
 *
 * The sheet uses the `transaction` BottomSheet variant — restrained, no
 * decorative blur — which matches its role as a consequence-clarifying
 * confirmation surface (see BottomSheet variant docs).
 */
export function ConfirmationSheet({
  visible,
  onDismiss,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  variant = 'default' }: ConfirmationSheetProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  const handleConfirm = () => {
    onConfirm();
  };

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    } else {
      onDismiss();
    }
  };

  return (
    <BottomSheet
      visible={visible}
      onDismiss={onDismiss}
      variant="transaction"
      snapPoint={0.42}
    >
      <View
        style={styles.container}
        accessibilityRole="alert"
        accessibilityLabel={title}
        accessibilityLiveRegion="assertive"
      >
        <Text style={styles.title} accessibilityRole="header">
          {title}
        </Text>
        {message ? (
          <Text style={styles.message}>{message}</Text>
        ) : null}
        <View style={styles.actions}>
          <AppButton
            title={confirmLabel}
            onPress={handleConfirm}
            variant={variant === 'danger' ? 'danger' : 'primary'}
            size="lg"
            style={styles.confirmButton}
            accessibilityLabel={confirmLabel}
            accessibilityHint={
              variant === 'danger'
                ? 'Confirms this destructive action'
                : 'Confirms this action'
            }
          />
          <AppButton
            title={cancelLabel}
            onPress={handleCancel}
            variant="ghost"
            size="md"
            accessibilityLabel={cancelLabel}
            accessibilityHint="Cancels this action and dismisses the dialog"
          />
        </View>
      </View>
    </BottomSheet>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      justifyContent: 'center',
      paddingBottom: Space.lg },
    title: {
      fontSize: TypographyV2.sectionTitle.size,
      lineHeight: TypographyV2.sectionTitle.lineHeight,
      fontFamily: TypographyV2.sectionTitle.fontFamily,
      letterSpacing: TypographyV2.sectionTitle.letterSpacing,
      color: colors.textPrimary,
      marginBottom: Space.sm },
    message: {
      fontSize: TypographyV2.body.size,
      lineHeight: TypographyV2.body.lineHeight,
      fontFamily: TypographyV2.body.fontFamily,
      letterSpacing: TypographyV2.body.letterSpacing,
      color: colors.textSecondary,
      marginBottom: Space.lg },
    actions: {
      gap: Space.sm },
    confirmButton: {
      borderRadius: Radius.lg,
      marginBottom: Space.xs } });
