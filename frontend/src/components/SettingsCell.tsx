import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Switch,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import { haptics } from '../utils/haptics';

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
}: SettingsCellProps) {
  // Determine border radius based on position in group
  const borderRadiusStyle = {
    borderTopLeftRadius: isFirst ? 12 : 0,
    borderTopRightRadius: isFirst ? 12 : 0,
    borderBottomLeftRadius: isLast ? 12 : 0,
    borderBottomRightRadius: isLast ? 12 : 0,
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
          <Switch
            value={toggleValue}
            onValueChange={(value) => {
              haptics.tap();
              onToggle?.(value);
            }}
            trackColor={{ false: Colors.border, true: Colors.brand }}
            thumbColor={toggleValue ? '#FFFFFF' : '#FFFFFF'}
            ios_backgroundColor={Colors.border}
            disabled={disabled}
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
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || !onPress}
      activeOpacity={0.7}
    >
      {renderContent()}
    </TouchableOpacity>
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
    marginHorizontal: 16,
    marginBottom: 24,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    overflow: 'hidden',
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    minHeight: 52,
    backgroundColor: Colors.surface,
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  textContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  title: {
    fontSize: 16,
    fontWeight: '400',
    color: Colors.textPrimary,
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
    fontSize: 13,
    color: Colors.textMuted,
    marginTop: 2,
    lineHeight: 18,
  },
  rightContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  valueText: {
    fontSize: 16,
    color: Colors.textMuted,
    maxWidth: 150,
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
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '500',
    color: Colors.textMuted,
    marginHorizontal: 32,
    marginTop: 32,
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  sectionFooter: {
    fontSize: 13,
    color: Colors.textMuted,
    marginHorizontal: 32,
    marginTop: 8,
    marginBottom: 24,
    lineHeight: 18,
  },
});
