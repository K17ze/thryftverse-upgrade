import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Type, Typography, Control } from '../../theme/designTokens';
import { AnimatedPressable } from '../AnimatedPressable';
import { PremiumToggle } from './PremiumToggle';

export interface SettingsRowProps {
  title: string;
  subtitle?: string;
  value?: string;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  iconColor?: string;
  danger?: boolean;
  disabled?: boolean;
  onPress?: () => void;
  toggleValue?: boolean;
  onToggle?: (v: boolean) => void;
  isFirst?: boolean;
  isLast?: boolean;
  children?: React.ReactNode;
  /** Explicit accessibility label. Defaults to the row title. */
  accessibilityLabel?: string;
  /** Accessibility hint describing the action. */
  accessibilityHint?: string;
}

export function SettingsRow({
  title,
  subtitle,
  value,
  icon,
  iconColor,
  danger,
  disabled,
  onPress,
  toggleValue,
  onToggle,
  isFirst,
  isLast,
  children,
  accessibilityLabel,
  accessibilityHint,
}: SettingsRowProps) {
  const { colors } = useAppTheme();
  const hasAction = !!onPress || !!onToggle;
  const showChevron = !!onPress && !onToggle && toggleValue === undefined;

  // Compose a truthful accessibility label from the visible text so screen
  // readers announce the row's identity without duplicating the title.
  const resolvedLabel = accessibilityLabel ?? title;
  const resolvedHint =
    accessibilityHint ??
    (onToggle
      ? `Toggle ${title}`
      : onPress
        ? `Open ${title}`
        : undefined);

  return (
    <AnimatedPressable
      onPress={onPress}
      activeOpacity={0.7}
      scaleValue={0.995}
      hapticFeedback="light"
      disabled={!hasAction || disabled}
      accessibilityRole="button"
      accessibilityLabel={resolvedLabel}
      accessibilityHint={resolvedHint}
    >
      <View style={[styles.root, !isLast && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
        {icon ? (
          // 44pt transparent hit target wrapping a 20pt glyph so the icon
          // meets the AGENTS.md §13 touch-target minimum without visible chrome.
          <View style={styles.iconTarget}>
            <Ionicons
              name={icon}
              size={20}
              color={iconColor ?? (danger ? colors.danger : colors.textPrimary)}
            />
          </View>
        ) : null}

        <View style={styles.textWrap}>
          <Text
            style={[
              styles.title,
              { color: disabled ? colors.textMuted : danger ? colors.danger : colors.textPrimary },
            ]}
            numberOfLines={1}
          >
            {title}
          </Text>
          {subtitle ? (
            <Text style={[styles.subtitle, { color: colors.textMuted }]} numberOfLines={2}>
              {subtitle}
            </Text>
          ) : null}
        </View>

        <View style={styles.right}>
          {value ? (
            <Text style={[styles.value, { color: colors.textMuted }]} numberOfLines={1}>
              {value}
            </Text>
          ) : null}
          {onToggle !== undefined ? (
            <PremiumToggle value={!!toggleValue} onValueChange={onToggle} disabled={disabled} />
          ) : showChevron ? (
            <Ionicons name="chevron-forward" size={Control.iconCompact} color={colors.textMuted} />
          ) : null}
          {children}
        </View>
      </View>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Space.sm + Space.xs,
    paddingHorizontal: Space.md,
    minHeight: Control.hit,
    gap: Space.sm,
  },
  // 44pt transparent hit target — no visible chrome, just the touch area.
  iconTarget: {
    width: Control.hit,
    height: Control.hit,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -Space.xs,
  },
  textWrap: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  title: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.body.letterSpacing,
    lineHeight: Type.body.lineHeight,
  },
  subtitle: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    marginTop: Space.xs * 0.5,
    letterSpacing: Type.caption.letterSpacing,
    lineHeight: Type.caption.lineHeight,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
    flexShrink: 1,
    justifyContent: 'flex-end',
    gap: Space.xs,
  },
  value: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    flexShrink: 1,
    maxWidth: '100%',
    textAlign: 'right',
    letterSpacing: Type.caption.letterSpacing,
  },
});
