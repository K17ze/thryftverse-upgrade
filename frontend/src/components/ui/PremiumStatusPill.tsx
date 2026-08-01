import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius, Typography } from '../../theme/designTokens';

export type StatusPillTone =
  | 'active'
  | 'sold'
  | 'paid'
  | 'shipped'
  | 'delivered'
  | 'refunded'
  | 'pending'
  | 'error'
  | 'success'
  | 'neutral';

interface PremiumStatusPillProps {
  tone: StatusPillTone;
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  compact?: boolean;
}

function resolveTone(tone: StatusPillTone, colors: ThemeColors) {
  switch (tone) {
    case 'active':
    case 'paid':
      return {
        bg: colors.brand + '12',
        border: colors.brand + '28',
        text: colors.brand,
        dot: colors.brand,
      };
    case 'sold':
    case 'delivered':
    case 'success':
      return {
        bg: colors.success + '12',
        border: colors.success + '28',
        text: colors.success,
        dot: colors.success,
      };
    case 'shipped':
      return {
        bg: colors.brand + '0A',
        border: colors.brand + '1A',
        text: colors.textPrimary,
        dot: colors.brand,
      };
    case 'refunded':
    case 'error':
      return {
        bg: colors.danger + '10',
        border: colors.danger + '25',
        text: colors.danger,
        dot: colors.danger,
      };
    case 'pending':
      return {
        bg: colors.surfaceAlt,
        border: colors.border,
        text: colors.textSecondary,
        dot: colors.textMuted,
      };
    case 'neutral':
    default:
      return {
        bg: colors.surfaceAlt,
        border: colors.borderSubtle,
        text: colors.textMuted,
        dot: colors.textMuted,
      };
  }
}

export function PremiumStatusPill({ tone, label, icon, compact = false }: PremiumStatusPillProps) {
  const { colors } = useAppTheme();
  const toneColors = resolveTone(tone, colors);

  return (
    <View
      style={[
        styles.pill,
        compact && styles.pillCompact,
        {
          backgroundColor: toneColors.bg,
          borderColor: toneColors.border,
        },
      ]}
    >
      {icon ? (
        <Ionicons name={icon} size={compact ? 12 : 14} color={toneColors.text} style={styles.icon} />
      ) : (
        <View style={[styles.dot, { backgroundColor: toneColors.dot }]} />
      )}
      <Text style={[styles.label, compact && styles.labelCompact, { color: toneColors.text }]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.md,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  pillCompact: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.sm,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  icon: {
    marginRight: 0,
  },
  label: {
    fontSize: 12,
    fontFamily: Typography.family.semibold,
    letterSpacing: 0.3,
    textTransform: 'capitalize',
  },
  labelCompact: {
    fontSize: 11,
    letterSpacing: 0.2,
  },
});
