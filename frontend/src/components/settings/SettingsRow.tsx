import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Type , Typography  } from '../../theme/designTokens';
import { AnimatedPressable } from '../AnimatedPressable';
import { PremiumToggle } from './PremiumToggle';

export interface SettingsRowProps {
  title: string;
  subtitle?: string;
  value?: string;
  icon?: string;
  iconColor?: string;
  danger?: boolean;
  disabled?: boolean;
  onPress?: () => void;
  toggleValue?: boolean;
  onToggle?: (v: boolean) => void;
  isFirst?: boolean;
  isLast?: boolean;
  children?: React.ReactNode;
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
}: SettingsRowProps) {
  const { colors } = useAppTheme();
  const hasAction = !!onPress || !!onToggle;
  const showChevron = !!onPress && !onToggle && toggleValue === undefined;

  return (
    <AnimatedPressable
      onPress={onPress}
      activeOpacity={0.7}
      scaleValue={0.995}
      hapticFeedback="light"
      disabled={!hasAction || disabled}
    >
      <View style={[styles.root, !isLast && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
        {icon ? (
          <View style={styles.iconWrap}>
            <Ionicons
              name={icon as any}
              size={22}
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
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
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
    paddingVertical: 16,
    paddingHorizontal: Space.md,
    minHeight: 60,
    gap: Space.sm + 4,
  },
  iconWrap: {
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textWrap: {
    flex: 1,
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
    marginTop: 2,
    letterSpacing: Type.caption.letterSpacing,
    lineHeight: Type.caption.lineHeight,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  value: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
    maxWidth: 140,
    letterSpacing: Type.body.letterSpacing,
  },
});
