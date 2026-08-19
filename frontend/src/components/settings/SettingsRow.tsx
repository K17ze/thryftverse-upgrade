import React from 'react';
import { View, Text, StyleSheet, type TextStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Type, Control, FontFamily, FontSize } from '../../theme/designTokens';
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
  /** Explicit accessibility labels. Defaults to the row title. */
  accessibilityLabel?: string;
  /** Accessibility hint describing the action. */
  accessibilityHint?: string;
  /** Optional style override for the title text. */
  titleStyle?: TextStyle;
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
  titleStyle,
}: SettingsRowProps) {
  const { colors } = useAppTheme();
  const hasAction = !!onPress || !!onToggle;
  const showChevron = !!onPress && !onToggle && toggleValue === undefined;
  const isToggle = onToggle !== undefined;

  // Compose a truthful accessibility label from the visible text so screen
  // readers announce the row's identity without duplicating the title.
  const resolvedLabel = accessibilityLabel ?? title;
  const resolvedHint =
    accessibilityHint ??
    (isToggle
      ? `Toggle ${title}`
      : onPress
        ? `Open ${title}`
        : undefined);

  // For toggle rows, the switch itself needs a label that includes the
  // setting name and current state per accessibility best practices.
  const toggleA11yLabel = accessibilityLabel
    ? `${accessibilityLabel}, ${toggleValue ? 'on' : 'off'}`
    : `${title}, ${toggleValue ? 'on' : 'off'}`;

  return (
    <AnimatedPressable
      onPress={onPress}
      activeOpacity={0.7}
      scaleValue={0.995}
      hapticFeedback="light"
      disabled={!hasAction || disabled}
      accessibilityRole={isToggle ? 'switch' : 'button'}
      accessibilityLabel={isToggle ? toggleA11yLabel : resolvedLabel}
      accessibilityHint={resolvedHint}
      accessibilityState={isToggle ? { checked: !!toggleValue } : undefined}
    >
      <View style={[styles.root, !isLast && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
        {icon ? (
          // 44pt transparent hit target wrapping a 24pt glyph so the icon
          // meets the AGENTS.md §13 touch-target minimum without visible chrome.
          <View style={styles.iconTarget}>
            <Ionicons
              name={icon}
              size={24}
              color={iconColor ?? (danger ? colors.danger : colors.textSecondary)}
            />
          </View>
        ) : null}

        <View style={styles.textWrap}>
          <Text
            style={[
              styles.title,
              { color: disabled ? colors.textMuted : danger ? colors.danger : colors.textPrimary },
              titleStyle,
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
          {isToggle ? (
            <PremiumToggle
              value={!!toggleValue}
              onValueChange={onToggle}
              disabled={disabled}
              accessibilityLabel={toggleA11yLabel}
            />
          ) : showChevron ? (
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
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
    minHeight: 50,
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
    gap: Space.xs / 4,
  },
  // Label: 16sp regular weight per 2026 mobile UX spec.
  title: {
    fontSize: FontSize.bodyLarge,
    fontFamily: FontFamily.regular,
    letterSpacing: Type.body.letterSpacing,
    lineHeight: 22,
  },
  subtitle: {
    fontSize: Type.caption.size,
    fontFamily: FontFamily.regular,
    marginTop: 0,
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
  // Value/status: 14sp muted per spec.
  value: {
    fontSize: Type.body.size,
    fontFamily: FontFamily.regular,
    flexShrink: 1,
    maxWidth: '100%',
    textAlign: 'right',
    letterSpacing: Type.body.letterSpacing,
    fontVariant: ['tabular-nums'] as ['tabular-nums'],
  },
});
