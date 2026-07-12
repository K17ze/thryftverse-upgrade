import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { Space, Typography, Radius } from '../../theme/designTokens';

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
  /** Icon name from Ionicons — displayed in a tinted circle to aid scanning */
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
            <View style={[styles.iconWrap, !isFilled && styles.iconWrapEmpty]}>
              <Ionicons
                name={icon}
                size={16}
                color={isFilled ? Colors.brand : Colors.textMuted}
              />
            </View>
          )}
          <View style={styles.textCol}>
            <Text style={styles.label}>{label}</Text>
            <Text style={[styles.title, !isFilled && styles.titleEmpty]}>{title}</Text>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
            {warningText ? (
              <View style={styles.alertRow}>
                <Ionicons name="warning-outline" size={12} color="#B8860B" />
                <Text style={styles.warningText}>{warningText}</Text>
              </View>
            ) : null}
            {errorText ? (
              <View style={styles.alertRow}>
                <Ionicons name="alert-circle-outline" size={12} color={Colors.danger} />
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
              color={isFilled ? Colors.textMuted : Colors.brand}
            />
          </View>
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
  rowPressed: {
    opacity: 0.6,
  },
  left: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.sm + 2,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: Radius.full,
    backgroundColor: `${Colors.brand}12`,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  iconWrapEmpty: {
    backgroundColor: Colors.surfaceAlt,
  },
  textCol: {
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
  titleEmpty: {
    fontFamily: Typography.family.regular,
    color: Colors.textSecondary,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: Typography.family.regular,
    color: Colors.textSecondary,
    lineHeight: 19,
  },
  alertRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 3,
  },
  warningText: {
    fontSize: 13,
    fontFamily: Typography.family.medium,
    color: '#B8860B',
  },
  errorText: {
    fontSize: 13,
    fontFamily: Typography.family.medium,
    color: Colors.danger,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingTop: 4,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  actionLabel: {
    fontSize: 15,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
  },
  actionLabelAdd: {
    color: Colors.brand,
  },
});
