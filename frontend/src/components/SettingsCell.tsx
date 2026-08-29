import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { haptics } from '../utils/haptics';
import { AnimatedPressable } from './AnimatedPressable';
import { PremiumToggle } from './PremiumToggle';

import { Type, Space, Radius, Typography } from '../theme/designTokens';
export type SettingsCellVariant = 'default' | 'value' | 'toggle' | 'button' | 'destructive' | 'custom';

interface SettingsCellProps {
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  iconColor?: string;
  title: string;
  subtitle?: string;
  value?: string;
  variant?: SettingsCellVariant;
  onPress?: () => void;
  toggleValue?: boolean;
  onToggle?: (value: boolean) => void;
  customContent?: React.ReactNode;
  badge?: string | number;
  disabled?: boolean;
  isFirst?: boolean;
  isLast?: boolean;
  style?: ViewStyle;
  accessibilityHint?: string;
}

export function SettingsCell({
  icon,
  iconColor,
  title,
  subtitle,
  value,
  variant = 'default',
  onPress,
  toggleValue,
  onToggle,
  customContent,
  badge,
  disabled = false,
  isFirst = false,
  isLast = false,
  style,
  accessibilityHint,
}: SettingsCellProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const showChevron = variant === 'default' || variant === 'value';
  const isInteractive = variant !== 'toggle' && variant !== 'custom';

  const renderContent = () => (
    <View style={[styles.container, !isLast && styles.rowBorder, style]}>
      {/* Icon — fixed-width monochrome column */}
      {icon && (
        <View style={styles.iconCol}>
          <Ionicons
            name={icon}
            size={20}
            color={iconColor ? `${iconColor}cc` /* TODO: replace with subtle token once iconColor is resolved */ : colors.textMuted}
          />
        </View>
      )}

      {/* Title and Subtitle */}
      <View style={styles.textContainer}>
        <Text
          style={[
            styles.title,
            variant === 'destructive' && styles.destructiveTitle,
            variant === 'button' && styles.buttonTitle,
          ]}
          numberOfLines={1}
        >
          {title}
        </Text>
        {subtitle && (
          <Text style={styles.subtitle} numberOfLines={2}>
            {subtitle}
          </Text>
        )}
      </View>

      {/* Value / Custom Content */}
      <View style={styles.rightContainer}>
        {variant === 'value' && value && (
          <Text style={styles.valueText} numberOfLines={1}>
            {value}
          </Text>
        )}

        {variant === 'toggle' && (
          <PremiumToggle
            value={toggleValue ?? false}
            onValueChange={(value) => {
              haptics.tap();
              onToggle?.(value);
            }}
          />
        )}

        {variant === 'custom' && customContent}

        {badge !== undefined && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badge}</Text>
          </View>
        )}

        {showChevron && (
          <Ionicons
            name="chevron-forward"
            size={16}
            color={colors.textMuted}
            style={styles.chevron}
          />
        )}
      </View>
    </View>
  );

  if (!isInteractive) {
    return renderContent();
  }

  return (
    <AnimatedPressable
      onPress={onPress}
      disabled={disabled || !onPress}
      activeOpacity={0.7}
      scaleValue={0.99}
      hapticFeedback='light'
    >
      {renderContent()}
    </AnimatedPressable>
  );
}

// Section Header Component
interface SettingsSectionHeaderProps {
  title: string;
  importance?: 'high' | 'medium' | 'low' | 'lowest';
}

export function SettingsSectionHeader({ title, importance = 'medium' }: SettingsSectionHeaderProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  return (
    <Text style={[styles.sectionHeader, styles[`sectionHeader_${importance}` as keyof typeof styles]]}>
      {title.toUpperCase()}
    </Text>
  );
}

// Section Footer Component
interface SettingsSectionFooterProps {
  text: string;
}

export function SettingsSectionFooter({ text }: SettingsSectionFooterProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  return (
    <Text style={styles.sectionFooter}>{text}</Text>
  );
}

// Grouped Container - use with explicit isFirst/isLast on children
interface SettingsGroupProps {
  children: React.ReactNode;
  style?: ViewStyle;
}

export function SettingsGroup({ children, style }: SettingsGroupProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={[styles.group, style]}>
      {children}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    group: {
      marginBottom: Space.md,
      backgroundColor: colors.surface,
      borderRadius: Radius.xl,
      overflow: 'hidden',
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.06,
      shadowRadius: 10,
      elevation: 3,
    },
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: Space.sm + 6,
      paddingHorizontal: Space.md,
      minHeight: 52,
      backgroundColor: colors.surface,
    },
    rowBorder: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    iconCol: {
      width: 28,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: Space.sm + 2,
    },
    textContainer: {
      flex: 1,
      justifyContent: 'center',
    },
    title: {
      fontSize: Type.body.size,
      fontFamily: Typography.family.medium,
      color: colors.textPrimary,
      letterSpacing: Type.body.letterSpacing,
      lineHeight: Type.body.lineHeight,
    },
    destructiveTitle: {
      color: colors.danger,
      textAlign: 'center',
    },
    buttonTitle: {
      color: colors.brand,
      textAlign: 'center',
    },
    subtitle: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      color: colors.textMuted,
      marginTop: 2,
      lineHeight: Type.caption.lineHeight,
      letterSpacing: Type.caption.letterSpacing,
    },
    rightContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
    },
    valueText: {
      fontSize: Type.body.size,
      fontFamily: Typography.family.regular,
      color: colors.textMuted,
      maxWidth: 150,
      letterSpacing: Type.body.letterSpacing,
    },
    chevron: {
      marginLeft: 2,
    },
    badge: {
      backgroundColor: colors.brand,
      borderRadius: Radius.lg,
      minWidth: 20,
      height: 20,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 6,
    },
    badgeText: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.semibold,
      color: colors.surfaceElevated,
      letterSpacing: Type.caption.letterSpacing,
    },
    sectionHeader: {
      fontSize: Type.meta.size,
      fontFamily: Typography.family.semibold,
      color: colors.textMuted,
      marginHorizontal: Space.md,
      marginTop: Space.lg,
      marginBottom: Space.sm,
      letterSpacing: Type.meta.letterSpacing,
      textTransform: 'uppercase',
    },
    sectionHeader_high: {
      color: colors.textSecondary,
      fontSize: Type.caption.size,
      marginTop: Space.lg + Space.sm,
      marginBottom: Space.sm + 2,
    },
    sectionHeader_medium: {
      // defaults
    },
    sectionHeader_low: {
      fontFamily: Typography.family.medium,
      marginTop: Space.md,
    },
    sectionHeader_lowest: {
      fontFamily: Typography.family.medium,
      color: colors.textMuted,
      marginTop: Space.md,
    },
    sectionFooter: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      color: colors.textMuted,
      marginHorizontal: Space.md,
      marginTop: Space.sm,
      marginBottom: Space.md,
      lineHeight: Type.caption.lineHeight,
      letterSpacing: Type.caption.letterSpacing,
    },
  });
}
