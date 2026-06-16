import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
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

function resolveTone(tone: StatusPillTone) {
  switch (tone) {
    case 'active':
    case 'paid':
      return {
        bg: Colors.brand + '12',
        border: Colors.brand + '28',
        text: Colors.brand,
        dot: Colors.brand,
      };
    case 'sold':
    case 'delivered':
    case 'success':
      return {
        bg: Colors.success + '12',
        border: Colors.success + '28',
        text: Colors.success,
        dot: Colors.success,
      };
    case 'shipped':
      return {
        bg: Colors.brand + '0A',
        border: Colors.brand + '1A',
        text: Colors.textPrimary,
        dot: Colors.brand,
      };
    case 'refunded':
    case 'error':
      return {
        bg: Colors.danger + '10',
        border: Colors.danger + '25',
        text: Colors.danger,
        dot: Colors.danger,
      };
    case 'pending':
      return {
        bg: Colors.surfaceAlt,
        border: Colors.border,
        text: Colors.textSecondary,
        dot: Colors.textMuted,
      };
    case 'neutral':
    default:
      return {
        bg: Colors.surfaceAlt,
        border: Colors.borderLight,
        text: Colors.textMuted,
        dot: Colors.textMuted,
      };
  }
}

export function PremiumStatusPill({ tone, label, icon, compact = false }: PremiumStatusPillProps) {
  const colors = resolveTone(tone);

  return (
    <View
      style={[
        styles.pill,
        compact && styles.pillCompact,
        {
          backgroundColor: colors.bg,
          borderColor: colors.border,
        },
      ]}
    >
      {icon ? (
        <Ionicons name={icon} size={compact ? 12 : 14} color={colors.text} style={styles.icon} />
      ) : (
        <View style={[styles.dot, { backgroundColor: colors.dot }]} />
      )}
      <Text style={[styles.label, compact && styles.labelCompact, { color: colors.text }]}>
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