import React from 'react';
import { StyleProp, StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Radius, Space, Stroke } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';

/**
 * Unified status pill taxonomy. The former `PremiumStatusPill` is now
 * `AppStatusPill` with `variant="block"`; the original `AppStatusPill`
 * behaviour is `variant="pill"` (the default).
 */
export type AppStatusTone =
  | 'neutral'
  | 'accent'
  | 'positive'
  | 'negative'
  | 'warning'
  // Domain-specific tones (formerly PremiumStatusPill)
  | 'active'
  | 'sold'
  | 'paid'
  | 'shipped'
  | 'delivered'
  | 'refunded'
  | 'pending'
  | 'error'
  | 'success';

export type AppStatusVariant = 'pill' | 'block';
export type AppStatusSize = 'sm' | 'md';

interface AppStatusPillProps {
  label: string;
  tone?: AppStatusTone;
  size?: AppStatusSize;
  variant?: AppStatusVariant;
  /** Leading icon. `iconName` is the original App* alias; `icon` is the
   * former Premium* alias. Both are accepted for compatibility. */
  iconName?: keyof typeof Ionicons.glyphMap;
  icon?: keyof typeof Ionicons.glyphMap;
  /** Block-variant only: renders a smaller pill. Maps to size="sm". */
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}

type ToneTokens = {
  backgroundColor: string;
  borderColor: string;
  textColor: string;
  dotColor: string;
};

function resolveTone(tone: AppStatusTone, colors: ThemeColors, variant: AppStatusVariant): ToneTokens {
  switch (tone) {
    // Domain-specific tones (formerly PremiumStatusPill)
    case 'active':
    case 'paid':
      return {
        backgroundColor: colors.brandSubtle,
        borderColor: colors.brandBorder,
        textColor: colors.brand,
        dotColor: colors.brand };
    case 'sold':
    case 'delivered':
    case 'success':
      return {
        backgroundColor: colors.successSubtle,
        borderColor: colors.successBorder,
        textColor: colors.success,
        dotColor: colors.success };
    case 'shipped':
      return {
        backgroundColor: colors.brandSubtle,
        borderColor: colors.brandBorder,
        textColor: colors.textPrimary,
        dotColor: colors.brand };
    case 'refunded':
    case 'error':
      return {
        backgroundColor: colors.dangerSubtle,
        borderColor: colors.dangerBorder,
        textColor: colors.danger,
        dotColor: colors.danger };
    case 'pending':
      return {
        backgroundColor: colors.surfaceAlt,
        borderColor: colors.border,
        textColor: colors.textSecondary,
        dotColor: colors.textMuted };
    // Core tones
    case 'accent':
      return {
        backgroundColor: colors.brandSubtle,
        borderColor: colors.borderSubtle,
        textColor: colors.brand,
        dotColor: colors.brand };
    case 'positive':
      return {
        backgroundColor: colors.successSubtle,
        borderColor: colors.successBorder,
        textColor: colors.success,
        dotColor: colors.success };
    case 'negative':
      return {
        backgroundColor: colors.dangerSubtle,
        borderColor: colors.dangerBorder,
        textColor: colors.danger,
        dotColor: colors.danger };
    case 'warning':
      return {
        backgroundColor: colors.warningSubtle,
        borderColor: colors.warningBorder,
        textColor: colors.warning,
        dotColor: colors.warning };
    case 'neutral':
    default:
      // The block variant (formerly PremiumStatusPill) uses a muted neutral
      // palette; the pill variant uses the original App* neutral palette.
      if (variant === 'block') {
        return {
          backgroundColor: colors.surfaceAlt,
          borderColor: colors.borderSubtle,
          textColor: colors.textMuted,
          dotColor: colors.textMuted };
      }
      return {
        backgroundColor: colors.surfaceAlt,
        borderColor: colors.border,
        textColor: colors.textSecondary,
        dotColor: colors.textMuted };
  }
}

export function AppStatusPill({
  label,
  tone = 'neutral',
  size = 'sm',
  variant = 'pill',
  iconName,
  icon,
  compact = false,
  style,
  textStyle }: AppStatusPillProps) {
  const { colors } = useAppTheme();
  const tokens = resolveTone(tone, colors, variant);
  const resolvedIcon = icon ?? iconName;
  // compact prop maps to size="sm" for the block variant
  const resolvedSize = compact ? 'sm' : size;
  const iconSize = resolvedSize === 'sm' ? 12 : 14;

  if (variant === 'block') {
    return (
      <View
        style={[
          styles.blockBase,
          resolvedSize === 'md' ? styles.blockSizeMd : styles.blockSizeSm,
          {
            backgroundColor: tokens.backgroundColor,
            borderColor: tokens.borderColor },
          style,
        ]}
      >
        {resolvedIcon ? (
          <Ionicons name={resolvedIcon} size={iconSize} color={tokens.textColor} style={styles.blockIcon} />
        ) : (
          <View style={[styles.dot, { backgroundColor: tokens.dotColor }]} />
        )}
        <Text
          style={[
            styles.blockLabel,
            resolvedSize === 'sm' && styles.blockLabelSm,
            { color: tokens.textColor },
            textStyle,
          ]}
        >
          {label}
        </Text>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.pillBase,
        resolvedSize === 'md' ? styles.pillSizeMd : styles.pillSizeSm,
        {
          backgroundColor: tokens.backgroundColor,
          borderColor: tokens.borderColor },
        style,
      ]}
    >
      {resolvedIcon ? <Ionicons name={resolvedIcon} size={iconSize} color={tokens.textColor} /> : null}
      <Text
        style={[
          styles.pillLabel,
          resolvedSize === 'md' && styles.pillLabelMd,
          { color: tokens.textColor },
          textStyle,
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // ── Pill variant (original AppStatusPill) ──────────────────────────
  pillBase: {
    borderRadius: Radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4 },
  pillSizeSm: {
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs },
  pillSizeMd: {
    paddingHorizontal: 10,
    paddingVertical: 6 },
  pillLabel: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: 0.25 },
  pillLabelMd: {
    fontSize: TypographyV2.meta.size },
  // ── Block variant (formerly PremiumStatusPill) ─────────────────────
  blockBase: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.md,
    borderWidth: Stroke.standard,
    alignSelf: 'flex-start' },
  blockSizeSm: {
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs,
    borderRadius: Radius.sm },
  blockSizeMd: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.md },
  dot: {
    width: 6,
    height: 6,
    borderRadius: Radius.sm },
  blockIcon: {
    marginRight: 0 },
  blockLabel: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: 0.3,
    textTransform: 'capitalize' },
  blockLabelSm: {
    fontSize: TypographyV2.meta.size,
    letterSpacing: 0.2 } });
