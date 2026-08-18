import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Typography, Type } from '../../theme/designTokens';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

interface Props {
  label: string;
  title: string;
  subtitle?: string;
  actionLabel: string;
  onPress?: () => void;
  errorText?: string;
  warningText?: string;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  rightElement?: React.ReactNode;
  /** Icon name from Ionicons — displayed as a direct glyph (no decorative
   *  circle). Brand-tinted when filled, muted when empty. */
  icon?: IoniconName;
  /** Whether the row has a value selected (affects icon tint and action style) */
  isFilled?: boolean;
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
  icon,
  isFilled = true,
  testID,
}: Props) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.wrapper}>
      <Pressable
        onPress={onPress ?? (() => {})}
        disabled={!onPress}
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
        accessibilityRole={onPress ? 'button' : undefined}
        accessibilityLabel={accessibilityLabel ?? `${label}: ${title}`}
        accessibilityHint={accessibilityHint}
        testID={testID}
      >
        <View style={styles.left}>
          {icon && (
            <View style={styles.iconSlot}>
              <Ionicons
                name={icon}
                size={20}
                color={isFilled ? colors.brand : colors.textMuted}
              />
            </View>
          )}
          <View style={styles.textCol}>
            <Text style={styles.label}>{label}</Text>
            <Text style={[styles.title, !isFilled && styles.titleEmpty]}>{title}</Text>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
            {warningText ? (
              <View style={styles.alertRow}>
                <Ionicons name="warning-outline" size={12} color={colors.warning} />
                <Text style={styles.warningText}>{warningText}</Text>
              </View>
            ) : null}
            {errorText ? (
              <View style={styles.alertRow}>
                <Ionicons name="alert-circle-outline" size={12} color={colors.danger} />
                <Text style={styles.errorText}>{errorText}</Text>
              </View>
            ) : null}
          </View>
        </View>
        <View style={styles.right}>
          {rightElement}
          <View style={styles.actionRow}>
            <Text style={[styles.actionLabel, !isFilled && styles.actionLabelAdd]}>
              {actionLabel}
            </Text>
            <Ionicons
              name="chevron-forward"
              size={14}
              color={isFilled ? colors.textMuted : colors.brand}
            />
          </View>
        </View>
      </Pressable>
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  wrapper: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: Space.md,
    minHeight: 56,
  },
  rowPressed: {
    opacity: 0.6,
  },
  left: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.sm + 2,
  },
  iconSlot: {
    width: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 3,
  },
  textCol: {
    flex: 1,
    gap: 2,
  },
  label: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.semibold,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  title: {
    fontSize: Type.bodyLarge.size,
    fontFamily: Typography.family.semibold,
    color: colors.textPrimary,
  },
  titleEmpty: {
    fontFamily: Typography.family.regular,
    color: colors.textSecondary,
  },
  subtitle: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
    color: colors.textSecondary,
    lineHeight: 19,
  },
  alertRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 3,
  },
  warningText: {
    fontSize: Type.captionElevated.size,
    fontFamily: Typography.family.medium,
    color: colors.warning,
  },
  errorText: {
    fontSize: Type.captionElevated.size,
    fontFamily: Typography.family.medium,
    color: colors.danger,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingTop: Space.xs,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  actionLabel: {
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.semibold,
    color: colors.textPrimary,
  },
  actionLabelAdd: {
    color: colors.brand,
  },
});
