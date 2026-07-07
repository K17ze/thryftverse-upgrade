import React from 'react';
import { AccessibilityRole, ActivityIndicator, StyleProp, StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';
import { Colors } from '../../constants/colors';
import { Type, Typography } from '../../theme/designTokens';
import { AnimatedPressable } from '../AnimatedPressable';

// ============================================================================
// SIMPLIFIED BUTTON COMPONENT (Phase 0 Cleanup)
// 4 variants: primary | secondary | danger | ghost
// Uses 5-core color palette
// ============================================================================

export type AppButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
export type AppButtonSize = 'sm' | 'md' | 'lg';
type AppButtonHapticFeedback = 'none' | 'light' | 'medium' | 'heavy' | 'selection';

interface AppButtonProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  trailingIcon?: React.ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: AppButtonVariant;
  size?: AppButtonSize;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  titleStyle?: StyleProp<TextStyle>;
  subtitleStyle?: StyleProp<TextStyle>;
  iconContainerStyle?: StyleProp<ViewStyle>;
  trailingIconContainerStyle?: StyleProp<ViewStyle>;
  align?: 'start' | 'center';
  activeOpacity?: number;
  hapticFeedback?: AppButtonHapticFeedback;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityRole?: AccessibilityRole;
}

type VariantTokens = {
  backgroundColor: string;
  borderColor: string;
  titleColor: string;
  subtitleColor: string;
  iconBackgroundColor: string;
};

function resolveVariantTokens(variant: AppButtonVariant): VariantTokens {
  switch (variant) {
    case 'secondary':
      return {
        backgroundColor: Colors.surface,
        borderColor: Colors.border,
        titleColor: Colors.textPrimary,
        subtitleColor: Colors.textSecondary,
        iconBackgroundColor: 'transparent',
      };
    case 'ghost':
      return {
        backgroundColor: 'transparent',
        borderColor: 'transparent',
        titleColor: Colors.textPrimary,
        subtitleColor: Colors.textSecondary,
        iconBackgroundColor: 'transparent',
      };
    case 'danger':
      return {
        backgroundColor: Colors.danger,
        borderColor: Colors.danger,
        titleColor: Colors.background,
        subtitleColor: Colors.background,
        iconBackgroundColor: 'rgba(0,0,0,0.15)',
      };
    case 'primary':
    default:
      return {
        backgroundColor: Colors.brand,
        borderColor: Colors.brand,
        titleColor: Colors.background,
        subtitleColor: Colors.background,
        iconBackgroundColor: 'rgba(0,0,0,0.15)',
      };
  }
}

function resolveSizeStyle(size: AppButtonSize): ViewStyle {
  switch (size) {
    case 'sm':
      return styles.sizeSm;
    case 'lg':
      return styles.sizeLg;
    case 'md':
    default:
      return styles.sizeMd;
  }
}

export function AppButton({
  title,
  subtitle,
  icon,
  trailingIcon,
  onPress,
  disabled,
  loading,
  variant = 'primary',
  size = 'md',
  style,
  contentStyle,
  titleStyle,
  subtitleStyle,
  iconContainerStyle,
  trailingIconContainerStyle,
  align,
  activeOpacity = 0.9,
  hapticFeedback = 'none',
  accessibilityLabel,
  accessibilityHint,
  accessibilityRole,
}: AppButtonProps) {
  const tokens = resolveVariantTokens(variant);
  const resolvedAlign = align ?? (subtitle ? 'start' : 'center');

  return (
    <AnimatedPressable
      style={[
        styles.base,
        resolveSizeStyle(size),
        {
          backgroundColor: tokens.backgroundColor,
          borderColor: tokens.borderColor,
        },
        resolvedAlign === 'start' && styles.alignStart,
        disabled && styles.disabled,
        style,
      ]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={activeOpacity}
      disableAnimation={false}
      scaleValue={0.985}
      hapticFeedback={hapticFeedback}
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityHint={accessibilityHint}
      accessibilityRole={accessibilityRole}
    >
      <View style={[styles.contentRow, resolvedAlign === 'center' && styles.contentCentered, contentStyle]}>
        {loading ? (
          <ActivityIndicator size="small" color={tokens.titleColor} />
        ) : (
          <>
            {icon ? (
              <View
                style={[
                  styles.iconWrap,
                  {
                    backgroundColor: tokens.iconBackgroundColor,
                  },
                  iconContainerStyle,
                ]}
              >
                {icon}
              </View>
            ) : null}
            <View style={[styles.textCol, resolvedAlign === 'center' && styles.textColCentered]}>
              <Text style={[styles.title, { color: tokens.titleColor }, titleStyle]}>{title}</Text>
              {subtitle ? (
                <Text style={[styles.subtitle, { color: tokens.subtitleColor }, subtitleStyle]}>{subtitle}</Text>
              ) : null}
            </View>
            {trailingIcon ? (
              <View
                style={[
                  styles.iconWrap,
                  {
                    backgroundColor: tokens.iconBackgroundColor,
                  },
                  trailingIconContainerStyle,
                ]}
              >
                {trailingIcon}
              </View>
            ) : null}
          </>
        )}
      </View>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderWidth: 1,
    overflow: 'hidden',
    justifyContent: 'center',
    minWidth: 0,
  },
  alignStart: {
    alignItems: 'flex-start',
  },
  disabled: {
    opacity: 0.52,
  },
  sizeSm: {
    minHeight: 44,
    borderRadius: 14,
    paddingHorizontal: 10,
  },
  sizeMd: {
    minHeight: 56,
    borderRadius: 18,
    paddingHorizontal: 16,
  },
  sizeLg: {
    minHeight: 64,
    borderRadius: 24,
    paddingHorizontal: 16,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  contentCentered: {
    justifyContent: 'center',
  },
  iconWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textCol: {
    flex: 1,
    flexShrink: 1,
    justifyContent: 'center',
  },
  textColCentered: {
    alignItems: 'center',
    flex: 0,
    flexShrink: 1,
  },
  title: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.bold,
    letterSpacing: -0.1,
  },
  subtitle: {
    marginTop: 1,
    fontSize: Type.caption.size,
    fontFamily: Typography.family.medium,
    letterSpacing: 0.2,
  },
});