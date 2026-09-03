import React from 'react';
import { View, StyleSheet, Pressable, Text } from 'react-native';
import { BottomSheet } from '../BottomSheet';
import { useAppTheme } from '../../theme/ThemeContext';
import { FontFamily, Space } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';

/**
 * FormSheet — keyboard-aware, stable title/action, no decorative blur.
 *
 * Standard radius (16px), subtle shadow. A pinned title bar with optional
 * left/right actions stays stable above the scrolling content so the user
 * always knows what they are editing and how to escape. Used for forms,
 * editors, and settings panels.
 */
export interface FormSheetProps {
  visible: boolean;
  onDismiss: () => void;
  children: React.ReactNode;
  /** Title shown in the pinned title bar. */
  title?: string;
  /** Optional left action (e.g. a Cancel button). */
  leftAction?: {
    label: string;
    onPress: () => void;
  };
  /** Optional right action (e.g. a Save / Done button). */
  rightAction?: {
    label: string;
    onPress: () => void;
    /** When true, renders the right action in the danger color. */
    destructive?: boolean;
  };
  /** Fraction of screen height. Defaults to 0.6. */
  snapPoint?: number;
}

export function FormSheet({
  visible,
  onDismiss,
  children,
  title,
  leftAction,
  rightAction,
  snapPoint = 0.6 }: FormSheetProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  return (
    <BottomSheet
      visible={visible}
      onDismiss={onDismiss}
      snapPoint={snapPoint}
      variant="form"
    >
      {(title || leftAction || rightAction) && (
        <View style={styles.titleBar}>
          {/* Left action slot — keeps the title bar balanced. */}
          <View style={styles.actionSlot}>
            {leftAction && (
              <Pressable
                style={styles.actionButton}
                onPress={leftAction.onPress}
                accessibilityRole="button"
                accessibilityLabel={leftAction.label}
              >
                <Text style={styles.actionText}>{leftAction.label}</Text>
              </Pressable>
            )}
          </View>

          {/* Centered title — stable identity for the form. */}
          {title && <Text style={styles.title} numberOfLines={1}>{title}</Text>}

          {/* Right action slot — primary or destructive. */}
          <View style={styles.actionSlot}>
            {rightAction && (
              <Pressable
                style={styles.actionButton}
                onPress={rightAction.onPress}
                accessibilityRole="button"
                accessibilityLabel={rightAction.label}
              >
                <Text
                  style={[
                    styles.actionText,
                    rightAction.destructive
                      ? styles.actionTextDestructive
                      : styles.actionTextEmphasis,
                  ]}
                >
                  {rightAction.label}
                </Text>
              </Pressable>
            )}
          </View>
        </View>
      )}

      {children}
    </BottomSheet>
  );
}

const createStyles = (colors: ReturnType<typeof useAppTheme>['colors']) =>
  StyleSheet.create({
    titleBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      minHeight: 44,
      marginBottom: Space.sm },
    actionSlot: {
      minWidth: 64,
      alignItems: 'flex-start' },
    actionButton: {
      minHeight: 44,
      justifyContent: 'center',
      paddingHorizontal: Space.xs },
    actionText: {
      fontFamily: FontFamily.regular,
      fontSize: TypographyV2.body.size,
      color: colors.textSecondary },
    actionTextEmphasis: {
      fontFamily: FontFamily.semibold,
      color: colors.textPrimary },
    actionTextDestructive: {
      fontFamily: FontFamily.semibold,
      color: colors.danger },
    title: {
      flex: 1,
      textAlign: 'center',
      fontFamily: FontFamily.semibold,
      fontSize: TypographyV2.sectionTitle.size,
      lineHeight: TypographyV2.sectionTitle.lineHeight,
      letterSpacing: TypographyV2.sectionTitle.letterSpacing,
      color: colors.textPrimary } });
