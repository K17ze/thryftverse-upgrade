import React from 'react';
import { AccessibilityRole, ActivityIndicator, StyleProp, StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';
import { Radius, Space, Stroke } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { useAppTheme } from '../../theme/ThemeContext';
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
};

function resolveVariantTokens(variant: AppButtonVariant, colors: any): VariantTokens {
  switch (variant) {
    case 'secondary':
      return {
        backgroundColor: colors.surface,
        borderColor: colors.border,
        titleColor: colors.textPrimary,
        subtitleColor: colors.textSecondary };
    case 'ghost':
      return {
        backgroundColor: 'transparent',
        borderColor: 'transparent',
        titleColor: colors.textPrimary,
        subtitleColor: colors.textSecondary };
    case 'danger':
      return {
        backgroundColor: colors.danger,
        borderColor: colors.danger,
        titleColor: colors.background,
        subtitleColor: colors.background };
    case 'primary':
    default:
      return {
        backgroundColor: colors.brand,
        borderColor: colors.brand,
        titleColor: colors.background,
        subtitleColor: colors.background };
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
  hapticFeedback,
  accessibilityLabel,
  accessibilityHint,
  accessibilityRole }: AppButtonProps) {
  const { colors } = useAppTheme();
  const tokens = resolveVariantTokens(variant, colors);
  const resolvedAlign = align ?? (subtitle ? 'start' : 'center');
  // Haptic default — primary actions get a medium impact, all other variants
  // get a light impact. Most call sites don't opt in, so this ensures every
  // button communicates its press natively without each caller repeating the
  // prop. Explicit `hapticFeedback` overrides still win.
  const resolvedHaptic = hapticFeedback ?? (variant === 'primary' ? 'medium' : 'light');

  return (
    <AnimatedPressable
      style={[
        styles.base,
        resolveSizeStyle(size),
        {
          backgroundColor: tokens.backgroundColor,
          borderColor: tokens.borderColor },
        resolvedAlign === 'start' && styles.alignStart,
        disabled && styles.disabled,
        style,
      ]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={activeOpacity}
      disableAnimation={false}
      scaleValue={0.985}
      hapticFeedback={resolvedHaptic}
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
              <View style={[styles.iconWrap, iconContainerStyle]}>
                {icon}
              </View>
            ) : null}
            <View style={[styles.textCol, resolvedAlign === 'center' && styles.textColCentered]}>
              <Text maxFontSizeMultiplier={1.4} style={[styles.title, { color: tokens.titleColor }, titleStyle]}>{title}</Text>
              {subtitle ? (
                <Text style={[styles.subtitle, { color: tokens.subtitleColor }, subtitleStyle]}>{subtitle}</Text>
              ) : null}
            </View>
            {trailingIcon ? (
              <View style={[styles.iconWrap, trailingIconContainerStyle]}>
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
    borderWidth: Stroke.standard,
    overflow: 'hidden',
    justifyContent: 'center',
    minWidth: 0 },
  alignStart: {
    alignItems: 'flex-start' },
  disabled: {
    opacity: 0.52 },
  sizeSm: {
    minHeight: 44,
    borderRadius: Radius.md,
    paddingHorizontal: Space.sm + 2 },
  sizeMd: {
    minHeight: 52,
    borderRadius: Radius.lg,
    paddingHorizontal: Space.md },
  sizeLg: {
    minHeight: 56,
    borderRadius: Radius.xl,
    paddingHorizontal: Space.md },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm + 2 },
  contentCentered: {
    justifyContent: 'center' },
  // Icon wrapper — transparent centering only. Per AGENTS.md §4, do not
  // render a visible grey circle around the glyph; the icon renders directly
  // with transparent background. The 44pt hit target is the button itself.
  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center' },
  textCol: {
    flex: 1,
    flexShrink: 1,
    justifyContent: 'center' },
  textColCentered: {
    alignItems: 'center',
    flex: 0,
    flexShrink: 1 },
  title: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: TypographyV2.body.fontFamily,
    letterSpacing: TypographyV2.body.letterSpacing },
  subtitle: {
    marginTop: 1,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing } });
