import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import { Type, Space, Radius } from '../theme/designTokens';
import { haptics } from '../utils/haptics';
import { Typography } from '../constants/typography';
import { AnimatedPressable } from './AnimatedPressable';
import { PremiumToggle } from './settings/PremiumToggle';

export type SettingsCellVariant = 'default' | 'value' | 'toggle' | 'button' | 'destructive' | 'custom';

interface SettingsCellProps {
  icon?: string;
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
  // Determine border radius based on position in group
  const borderRadiusStyle = {
    borderTopLeftRadius: isFirst ? Radius.lg : 0,
    borderTopRightRadius: isFirst ? Radius.lg : 0,
    borderBottomLeftRadius: isLast ? Radius.lg : 0,
    borderBottomRightRadius: isLast ? Radius.lg : 0,
  };

  // Determine if we show chevron
  const showChevron = variant === 'default' || variant === 'value';

  const renderContent = () => (
    <View style={[styles.container, borderRadiusStyle, style]}>
      {/* Icon */}
      {icon && (
        <View style={[styles.iconContainer, { backgroundColor: iconColor ? `${iconColor}20` : Colors.surface }]}>
          <Ionicons
            name={icon as any}
            size={22}
            color={iconColor || Colors.textMuted}
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
            size={18}
            color={Colors.textMuted}
            style={styles.chevron}
          />
        )}
      </View>
    </View>
  );

  if (variant === 'toggle' || variant === 'custom') {
    return renderContent();
  }

  return (
    <AnimatedPressable
      onPress={onPress}
      disabled={disabled || !onPress}
      activeOpacity={0.7}
      scaleValue={0.985}
      hapticFeedback='light'
    >
      {renderContent()}
    </AnimatedPressable>
  );
}

// Section Header Component
interface SettingsSectionHeaderProps {
  title: string;
}

export function SettingsSectionHeader({ title }: SettingsSectionHeaderProps) {
  return (
    <Text style={styles.sectionHeader}>{title.toUpperCase()}</Text>
  );
}

// Section Footer Component
interface SettingsSectionFooterProps {
  text: string;
}

export function SettingsSectionFooter({ text }: SettingsSectionFooterProps) {
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
  return (
    <View style={[styles.group, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    marginHorizontal: Space.md,
    marginBottom: Space.md,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    overflow: 'hidden',
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Space.sm + Space.xs,
    paddingHorizontal: Space.md,
    minHeight: 52,
    backgroundColor: Colors.surface,
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: Radius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Space.sm,
  },
  textContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  title: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.medium,
    color: Colors.textPrimary,
    letterSpacing: Type.body.letterSpacing,
    lineHeight: Type.body.lineHeight,
  },
  destructiveTitle: {
    color: Colors.danger,
    textAlign: 'center',
  },
  buttonTitle: {
    color: Colors.brand,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    marginTop: 2,
    lineHeight: Type.caption.lineHeight,
    letterSpacing: Type.caption.letterSpacing,
  },
  rightContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + Space.xs,
  },
  valueText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    maxWidth: 150,
    letterSpacing: Type.body.letterSpacing,
  },
  chevron: {
    marginLeft: 4,
  },
  badge: {
    backgroundColor: Colors.brand,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  badgeText: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
    color: '#FFFFFF',
    letterSpacing: Type.caption.letterSpacing,
  },
  sectionHeader: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.semibold,
    color: Colors.textMuted,
    marginHorizontal: Space.md,
    marginTop: Space.lg + Space.sm,
    marginBottom: Space.xs + Space.xs,
    letterSpacing: Type.meta.letterSpacing,
  },
  sectionFooter: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    marginHorizontal: Space.md,
    marginTop: Space.xs + Space.xs,
    marginBottom: Space.md,
    lineHeight: Type.caption.lineHeight,
    letterSpacing: Type.caption.letterSpacing,
  },
});
